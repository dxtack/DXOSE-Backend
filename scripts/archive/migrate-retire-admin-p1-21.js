'use strict';

/**
 * P1 #21 — Migrate legacy ADMIN memberships on ose_inventory, then retire ADMIN.
 *
 * Order (strict):
 *   1) --migrate  : move all active ADMIN memberships + sync UR assignments
 *   2) --verify   : prove each migrated user resolves target-role UR permissions
 *   3) --retire   : deactivate ADMIN role and delete its 43 legacy RolePermission rows
 *
 * Usage:
 *   node scripts/migrate-retire-admin-p1-21.js --migrate --confirm-db=ose_inventory
 *   node scripts/migrate-retire-admin-p1-21.js --verify --confirm-db=ose_inventory
 *   node scripts/migrate-retire-admin-p1-21.js --retire --confirm-db=ose_inventory
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: true });

const REQUIRED_DB = 'ose_inventory';
// Force personal staging DB regardless of prior shell env / .env.test.local.
process.env.DATABASE_URL = 'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory?schema=public';
const databaseUrl = process.env.DATABASE_URL;

const parsed = new URL(databaseUrl);
const databaseName = parsed.pathname.replace(/^\//, '').split('?')[0];
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!localHosts.has(parsed.hostname) || databaseName !== REQUIRED_DB) {
  throw new Error(`Refusing to run outside local ${REQUIRED_DB} (got ${parsed.hostname}/${databaseName}).`);
}

const confirmation = process.argv.find((arg) => arg.startsWith('--confirm-db='));
if (confirmation !== `--confirm-db=${REQUIRED_DB}`) {
  throw new Error(`Requires --confirm-db=${REQUIRED_DB}.`);
}

const doMigrate = process.argv.includes('--migrate');
const doVerify = process.argv.includes('--verify');
const doRetire = process.argv.includes('--retire');
if ([doMigrate, doVerify, doRetire].filter(Boolean).length !== 1) {
  throw new Error('Specify exactly one of --migrate | --verify | --retire');
}

const { PrismaClient } = require('@prisma/client');
const { connectRole } = require('../src/services/rbac.service');
const { syncMembershipToAssignment } = require('../src/services/acc-membership-assignment-sync.service');
const prisma = new PrismaClient();

const GRAND_HORIZON_SLUG = 'grand-horizon';
const BRANCH_SLUGS = new Set([
  'voco',
  'hotel-test1',
  'voco-khobar',
  'rotana-1',
  'rotana-2',
  'dx-marina-hotel',
  'dx-executive-suites',
  'dx-airport-hotel',
]);

function targetRoleForMembership(member) {
  const slug = member.tenant?.slug;
  if (slug === GRAND_HORIZON_SLUG) return 'GENERAL_MANAGER';
  if (BRANCH_SLUGS.has(slug)) return 'ORG_MANAGER';
  // Remaining hotel-like ADMIN (e.g. E2E fixture hotel) → GENERAL_MANAGER
  if (member.tenant?.parentId) return 'GENERAL_MANAGER';
  return 'GENERAL_MANAGER';
}

async function assertDb() {
  const rows = await prisma.$queryRaw`SELECT current_database() AS name`;
  if (rows[0]?.name !== REQUIRED_DB) {
    throw new Error(`Connected database is ${rows[0]?.name}; expected ${REQUIRED_DB}.`);
  }
}

async function loadAdminMemberships() {
  return prisma.tenantMember.findMany({
    where: { isActive: true, role: { code: 'ADMIN' } },
    include: {
      user: { select: { id: true, email: true, isActive: true } },
      tenant: { select: { id: true, name: true, slug: true, parentId: true } },
      role: { select: { id: true, code: true } },
    },
    orderBy: [{ tenant: { slug: 'asc' } }, { user: { email: 'asc' } }],
  });
}

async function loadMigratedCandidates() {
  // After migrate, members are no longer ADMIN — verify by known map of (tenant slug + email)
  // captured during migrate proof file, or reconstruct by checking non-ADMIN on mapped tenants.
  // Prefer reading proof artifact written by --migrate.
  const fs = require('fs');
  const proofPath = path.resolve(__dirname, '..', 'tmp', 'p1-21-admin-migrate-proof.json');
  if (!fs.existsSync(proofPath)) {
    throw new Error(`Missing migrate proof at ${proofPath}. Run --migrate first.`);
  }
  return JSON.parse(fs.readFileSync(proofPath, 'utf8'));
}

function writeProof(payload) {
  const fs = require('fs');
  const dir = path.resolve(__dirname, '..', 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  const proofPath = path.join(dir, 'p1-21-admin-migrate-proof.json');
  fs.writeFileSync(proofPath, JSON.stringify(payload, null, 2));
  return proofPath;
}

async function migrate() {
  const members = await loadAdminMemberships();
  if (members.length !== 10) {
    throw new Error(`Expected exactly 10 active ADMIN memberships; found ${members.length}. Stopping.`);
  }

  const targets = await prisma.role.findMany({
    where: { code: { in: ['ORG_MANAGER', 'GENERAL_MANAGER'] } },
    select: {
      id: true,
      code: true,
      isActive: true,
      _count: { select: { urRolePermissions: true } },
    },
  });
  const byCode = Object.fromEntries(targets.map((r) => [r.code, r]));
  if (!byCode.ORG_MANAGER?.isActive || !byCode.GENERAL_MANAGER?.isActive) {
    throw new Error('ORG_MANAGER / GENERAL_MANAGER roles must exist and be active.');
  }
  if (byCode.ORG_MANAGER._count.urRolePermissions < 1 || byCode.GENERAL_MANAGER._count.urRolePermissions < 1) {
    throw new Error('Target roles must already have UR role permissions before migrate.');
  }

  const proofs = [];
  await prisma.$transaction(async (tx) => {
    for (const member of members) {
      const targetCode = targetRoleForMembership(member);
      const targetRole = byCode[targetCode];
      if (!targetRole) throw new Error(`Missing target role ${targetCode}`);

      await tx.tenantMember.update({
        where: { id: member.id },
        data: { role: connectRole(targetCode) },
      });

      const refreshed = await tx.tenantMember.findUnique({
        where: { id: member.id },
        include: { role: true },
      });
      if (!refreshed || refreshed.role.code !== targetCode) {
        throw new Error(`Membership role update failed for ${member.user.email}`);
      }

      const sync = await syncMembershipToAssignment(tx, refreshed);
      const assignment = await tx.urUserAssignment.findFirst({
        where: { notes: { startsWith: `legacy:${member.id}` }, isActive: true },
        select: { id: true, roleId: true, isActive: true },
      });
      if (!assignment || assignment.roleId !== targetRole.id) {
        throw new Error(
          `UR assignment missing/wrong for ${member.user.email} @ ${member.tenant.slug} (sync=${JSON.stringify(sync)})`,
        );
      }

      await tx.user.update({
        where: { id: member.userId },
        data: { permissionVersion: { increment: 1 } },
      });

        const urCodes = (
        await tx.urRolePermission.findMany({
          where: { roleId: targetRole.id },
          select: { permission: { select: { legacyCode: true } } },
        })
      )
        .map((r) => r.permission.legacyCode)
        .filter(Boolean)
        .sort();

      proofs.push({
        memberId: member.id,
        userId: member.userId,
        email: member.user.email,
        tenantId: member.tenantId,
        tenantName: member.tenant.name,
        slug: member.tenant.slug,
        parentId: member.tenant.parentId,
        fromRole: 'ADMIN',
        toRole: targetCode,
        urAssignmentId: assignment.id,
        urRoleId: assignment.roleId,
        expectedPermissionCount: urCodes.length,
        expectedPermissions: urCodes,
      });
    }
  });

  const remaining = await loadAdminMemberships();
  if (remaining.length !== 0) {
    throw new Error(`Migrate incomplete: ${remaining.length} ADMIN membership(s) remain.`);
  }

  const proofPath = writeProof({
    database: REQUIRED_DB,
    migratedAt: new Date().toISOString(),
    count: proofs.length,
    rows: proofs,
  });

  console.log(JSON.stringify({ mode: 'MIGRATE', count: proofs.length, proofPath, rows: proofs }, null, 2));
}

async function verify() {
  const proof = await loadMigratedCandidates();
  if (!proof.rows || proof.rows.length !== 10) {
    throw new Error(`Proof must contain 10 rows; found ${proof.rows?.length ?? 0}`);
  }

  const results = [];
  for (const row of proof.rows) {
    const member = await prisma.tenantMember.findUnique({
      where: { id: row.memberId },
      include: { role: true, tenant: { select: { id: true, slug: true } } },
    });
    if (!member || !member.isActive) {
      throw new Error(`Membership inactive/missing: ${row.email} @ ${row.slug}`);
    }
    if (member.role.code !== row.toRole) {
      throw new Error(`Role mismatch for ${row.email}: expected ${row.toRole}, got ${member.role.code}`);
    }
    if (member.role.code === 'ADMIN') {
      throw new Error(`Still ADMIN: ${row.email}`);
    }

    const assignment = await prisma.urUserAssignment.findFirst({
      where: { id: row.urAssignmentId, isActive: true },
      select: { id: true, roleId: true },
    });
    if (!assignment) throw new Error(`UR assignment missing for ${row.email}`);
    if (assignment.roleId !== member.roleId) {
      throw new Error(`UR roleId mismatch for ${row.email}`);
    }

    // Effective ops for the new role = live UR grants on that role (hotel-provisioning pattern).
    const urCodes = (
      await prisma.urRolePermission.findMany({
        where: { roleId: member.roleId },
        select: { permission: { select: { legacyCode: true } } },
      })
    )
      .map((r) => r.permission.legacyCode)
      .filter(Boolean)
      .sort();
    if (urCodes.length === 0) {
      throw new Error(`Target role ${row.toRole} has zero UR grants for ${row.email}`);
    }

    const expected = Array.isArray(row.expectedPermissions) ? [...row.expectedPermissions].sort() : urCodes;
    const missingFromLiveUr = expected.filter((code) => !urCodes.includes(code));
    if (missingFromLiveUr.length) {
      throw new Error(
        `UR grants shrank for ${row.email} @ ${row.slug}: missing ${missingFromLiveUr.join(', ')}`,
      );
    }

    // Simulate ACC role-permission load used when roleHasUrPermissions === true.
    const { roleHasUrPermissions } = require('../src/services/rbac.service');
    const urConfigured = await roleHasUrPermissions(member.roleId);
    if (!urConfigured) {
      throw new Error(`Role ${row.toRole} is not UR-configured; would fall back to legacy.`);
    }
    const effectiveViaUr = urCodes;
    const missingEffective = expected.filter((code) => !effectiveViaUr.includes(code));
    if (missingEffective.length) {
      throw new Error(
        `Effective UR permissions incomplete for ${row.email}: missing ${missingEffective.join(', ')}`,
      );
    }

    // Guard: user must not still resolve ADMIN legacy grant set via role id.
    const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' }, select: { id: true } });
    if (adminRole && member.roleId === adminRole.id) {
      throw new Error(`Still on ADMIN roleId: ${row.email}`);
    }

    results.push({
      email: row.email,
      slug: row.slug,
      role: row.toRole,
      urAssignmentId: assignment.id,
      expectedCount: expected.length,
      urRoleGrantCount: urCodes.length,
      effectiveUrCount: effectiveViaUr.length,
      canPerformNewRoleOps: missingEffective.length === 0,
      comparedToOldAdmin:
        row.toRole === 'ORG_MANAGER'
          ? 'ORG_MANAGER UR set (broader org/hotel ops pattern)'
          : 'GENERAL_MANAGER UR set (canonical hotel-admin pattern from provisioning)',
    });
  }

  const adminLeft = await loadAdminMemberships();
  console.log(
    JSON.stringify(
      {
        mode: 'VERIFY',
        ok: true,
        adminMembershipsRemaining: adminLeft.length,
        results,
      },
      null,
      2,
    ),
  );
}

async function retire() {
  const proof = await loadMigratedCandidates();
  if (proof.rows?.length !== 10) {
    throw new Error('Refuse retire: migrate proof incomplete.');
  }

  // Re-verify quickly before retire
  for (const row of proof.rows) {
    const member = await prisma.tenantMember.findUnique({
      where: { id: row.memberId },
      include: { role: true },
    });
    if (!member?.isActive || member.role.code === 'ADMIN' || member.role.code !== row.toRole) {
      throw new Error(`Refuse retire: ${row.email} is not on ${row.toRole}.`);
    }
    const assignment = await prisma.urUserAssignment.findFirst({
      where: { id: row.urAssignmentId, isActive: true },
    });
    if (!assignment) throw new Error(`Refuse retire: UR assignment missing for ${row.email}`);
  }

  const adminLeft = await loadAdminMemberships();
  if (adminLeft.length !== 0) {
    throw new Error(`Refuse retire: ${adminLeft.length} active ADMIN membership(s) remain.`);
  }

  const adminRole = await prisma.role.findUnique({
    where: { code: 'ADMIN' },
    include: { _count: { select: { rolePermissions: true, urRolePermissions: true, memberships: true, urAssignments: true } } },
  });
  if (!adminRole) throw new Error('ADMIN role not found.');

  const beforeGrants = adminRole._count.rolePermissions;
  if (beforeGrants !== 43) {
    throw new Error(`Expected exactly 43 legacy ADMIN RolePermission rows; found ${beforeGrants}. Stopping.`);
  }
  if (adminRole._count.urRolePermissions !== 0) {
    throw new Error(`Unexpected ADMIN UR grants: ${adminRole._count.urRolePermissions}`);
  }
  if (adminRole._count.memberships !== 0) {
    // may include inactive; check active only already done. Still refuse if any membership points to ADMIN.
    const anyMembers = await prisma.tenantMember.count({ where: { roleId: adminRole.id } });
    if (anyMembers !== 0) {
      throw new Error(`Refuse retire: ${anyMembers} TenantMember row(s) still point at ADMIN (active or inactive).`);
    }
  }

  const activeUrAssign = await prisma.urUserAssignment.count({
    where: { roleId: adminRole.id, isActive: true },
  });
  if (activeUrAssign !== 0) {
    throw new Error(`Refuse retire: ${activeUrAssign} active UR assignment(s) still on ADMIN.`);
  }

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
    if (deleted.count !== 43) {
      throw new Error(`Deleted ${deleted.count} RolePermission rows; expected 43.`);
    }
    await tx.role.update({
      where: { id: adminRole.id },
      data: { isActive: false },
    });
  });

  const after = await prisma.role.findUnique({
    where: { code: 'ADMIN' },
    include: { _count: { select: { rolePermissions: true, memberships: true, urAssignments: true } } },
  });

  console.log(
    JSON.stringify(
      {
        mode: 'RETIRE',
        ok: true,
        adminIsActive: after.isActive,
        rolePermissionsRemaining: after._count.rolePermissions,
        membershipsPointingAtAdmin: after._count.memberships,
        urAssignmentsPointingAtAdmin: after._count.urAssignments,
      },
      null,
      2,
    ),
  );
}

async function main() {
  await assertDb();
  if (doMigrate) await migrate();
  else if (doVerify) await verify();
  else if (doRetire) await retire();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
