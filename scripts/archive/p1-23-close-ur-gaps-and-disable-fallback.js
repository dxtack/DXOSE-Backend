'use strict';

/**
 * P1 #23 — Close UR catalog gaps for active roles, verify coverage, then disable
 * zero-UR legacy fallback for active roles only.
 *
 *   node scripts/p1-23-close-ur-gaps-and-disable-fallback.js --inventory --confirm-db=ose_inventory
 *   node scripts/p1-23-close-ur-gaps-and-disable-fallback.js --apply-gaps --confirm-db=ose_inventory
 *   node scripts/p1-23-close-ur-gaps-and-disable-fallback.js --verify --confirm-db=ose_inventory
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL_OVERRIDE ||
  'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory?schema=public';

const REQUIRED_DB = 'ose_inventory';
const confirmation = process.argv.find((a) => a.startsWith('--confirm-db='));
if (confirmation !== `--confirm-db=${REQUIRED_DB}`) {
  throw new Error(`Requires --confirm-db=${REQUIRED_DB}`);
}

const doInventory = process.argv.includes('--inventory');
const doApply = process.argv.includes('--apply-gaps');
const doVerify = process.argv.includes('--verify');
if ([doInventory, doApply, doVerify].filter(Boolean).length !== 1) {
  throw new Error('Specify exactly one of --inventory | --apply-gaps | --verify');
}

const { PrismaClient } = require('@prisma/client');
const {
  PERMISSION_MAP,
  RESOURCES,
  ACTIONS,
} = require('../src/acc-authority/catalog.constitution');
const {
  BASE_ROLE_PERMISSIONS,
  mergeAuthorityGrants,
  applyRolePermissionPolicy,
} = require('../src/acc-authority/base-role-permissions');

const prisma = new PrismaClient();
const CANONICAL = mergeAuthorityGrants(BASE_ROLE_PERMISSIONS);
const CANONICAL_CODES = new Set(PERMISSION_MAP.map((p) => p.legacyCode));

async function assertDb() {
  const rows = await prisma.$queryRaw`SELECT current_database() AS n`;
  if (rows[0].n !== REQUIRED_DB) throw new Error(`Connected ${rows[0].n}`);
}

async function ensureUrPermission(legacyCode) {
  const entry = PERMISSION_MAP.find((p) => p.legacyCode === legacyCode);
  if (!entry) {
    throw new Error(`Cannot create UR permission for non-constitution code: ${legacyCode}`);
  }
  const existing = await prisma.urPermission.findUnique({ where: { legacyCode } });
  if (existing) return existing;

  const resDef = RESOURCES.find((r) => r.code === entry.resource);
  const actDef = ACTIONS.find((a) => a.code === entry.action);
  if (!resDef || !actDef) {
    throw new Error(`Missing resource/action defs for ${legacyCode} (${entry.resource}/${entry.action})`);
  }

  const resource = await prisma.urResource.upsert({
    where: { code: resDef.code },
    update: { name: resDef.name, category: resDef.category, displayOrder: resDef.displayOrder },
    create: resDef,
  });
  const action = await prisma.urAction.upsert({
    where: { code: actDef.code },
    update: { name: actDef.name, displayOrder: actDef.displayOrder },
    create: actDef,
  });

  return prisma.urPermission.create({
    data: {
      legacyCode: entry.legacyCode,
      name: entry.name,
      resourceId: resource.id,
      actionId: action.id,
    },
  });
}

async function ensureLegacyPermission(code, name) {
  return prisma.permission.upsert({
    where: { code },
    update: name ? { name } : {},
    create: { code, name: name || code },
  });
}

async function inventoryActiveRoleGaps() {
  const activeRoles = await prisma.role.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  const report = [];
  const bridgeMissing = [];

  for (const role of activeRoles) {
    const [legacyRows, urRows] = await Promise.all([
      prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { code: true } } },
      }),
      prisma.urRolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { legacyCode: true } } },
      }),
    ]);
    const legacy = new Set(legacyRows.map((r) => r.permission.code).filter(Boolean));
    const ur = new Set(urRows.map((r) => r.permission.legacyCode).filter(Boolean));
    const canonical = new Set(applyRolePermissionPolicy(role.code, CANONICAL[role.code] || []));

    // Gaps that matter for "full UR representation":
    // 1) canonical matrix codes missing from UR grants
    // 2) legacy RolePermission codes that are constitution codes but missing from UR
    const missingCanonicalFromUr = [...canonical].filter((c) => !ur.has(c)).sort();
    const staleLegacyConstitutionNotInCanonical = [...legacy]
      .filter((c) => CANONICAL_CODES.has(c) && !canonical.has(c))
      .sort();

    // Zero-UR roles would still hit full legacy fallback
    const usesZeroUrFallback = ur.size === 0 && legacy.size > 0;

    report.push({
      code: role.code,
      roleId: role.id,
      urCount: ur.size,
      legacyCount: legacy.size,
      canonicalCount: canonical.size,
      // Only intended-matrix gaps must be sealed before fallback disable.
      missingFromUr: missingCanonicalFromUr,
      staleLegacyConstitutionNotInCanonical,
      usesZeroUrFallback,
      nonConstitutionLegacyOnly: [...legacy].filter((c) => !CANONICAL_CODES.has(c) && !ur.has(c)).sort(),
      nonConstitutionInUr: [...ur].filter((c) => !CANONICAL_CODES.has(c)).sort(),
    });
  }

  // Permission.code with no UrPermission.legacyCode bridge
  const allLegacyPerms = await prisma.permission.findMany({ select: { code: true } });
  const allUr = await prisma.urPermission.findMany({ select: { legacyCode: true } });
  const urSet = new Set(allUr.map((u) => u.legacyCode));
  for (const p of allLegacyPerms) {
    if (!urSet.has(p.code) && CANONICAL_CODES.has(p.code)) {
      bridgeMissing.push(p.code);
    }
  }

  return { activeRoles: report, bridgeMissing: bridgeMissing.sort() };
}

async function applyGaps() {
  const before = await inventoryActiveRoleGaps();
  const sealed = [];

  // Always ensure GET_PASS_VIEW_CLAIMS bridge + grants for the three roles
  const claimsTargets = ['COST_CONTROL', 'FINANCE_MANAGER', 'ORG_MANAGER'];
  const claimsEntry = PERMISSION_MAP.find((p) => p.legacyCode === 'GET_PASS_VIEW_CLAIMS');
  const urClaims = await ensureUrPermission('GET_PASS_VIEW_CLAIMS');
  await ensureLegacyPermission('GET_PASS_VIEW_CLAIMS', claimsEntry.name);
  for (const code of claimsTargets) {
    const role = await prisma.role.findUnique({ where: { code } });
    if (!role || !role.isActive) continue;
    await prisma.urRolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: urClaims.id } },
      update: {},
      create: { roleId: role.id, permissionId: urClaims.id },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: (await prisma.permission.findUnique({ where: { code: 'GET_PASS_VIEW_CLAIMS' } })).id,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: (await prisma.permission.findUnique({ where: { code: 'GET_PASS_VIEW_CLAIMS' } })).id,
      },
    });
    sealed.push({ role: code, permission: 'GET_PASS_VIEW_CLAIMS' });
  }

  // Close every other constitution gap for active roles
  for (const row of before.activeRoles) {
    for (const code of row.missingFromUr) {
      if (code === 'GET_PASS_VIEW_CLAIMS' && claimsTargets.includes(row.code)) continue;
      if (!CANONICAL_CODES.has(code)) {
        throw new Error(
          `Unexpected non-constitution gap for active role ${row.code}: ${code}. Stopping before fallback disable.`,
        );
      }
      const urPerm = await ensureUrPermission(code);
      const entry = PERMISSION_MAP.find((p) => p.legacyCode === code);
      await ensureLegacyPermission(code, entry?.name);
      await prisma.urRolePermission.upsert({
        where: { roleId_permissionId: { roleId: row.roleId, permissionId: urPerm.id } },
        update: {},
        create: { roleId: row.roleId, permissionId: urPerm.id },
      });
      sealed.push({ role: row.code, permission: code });
    }
  }

  // Also close bridge-only missing rows even if no role currently needs them
  for (const code of before.bridgeMissing) {
    await ensureUrPermission(code);
    const entry = PERMISSION_MAP.find((p) => p.legacyCode === code);
    await ensureLegacyPermission(code, entry?.name);
  }

  const after = await inventoryActiveRoleGaps();
  const remaining = after.activeRoles.filter((r) => r.missingFromUr.length || r.usesZeroUrFallback);
  if (remaining.length) {
    throw new Error(
      `Gaps remain after apply: ${JSON.stringify(remaining.map((r) => ({ code: r.code, missing: r.missingFromUr, zeroUr: r.usesZeroUrFallback })))}`,
    );
  }

  return { sealed, beforeGaps: before, afterGaps: after };
}

async function verify() {
  const inv = await inventoryActiveRoleGaps();
  const failures = [];
  for (const row of inv.activeRoles) {
    if (row.missingFromUr.length) {
      failures.push(`${row.code}: missing UR ${row.missingFromUr.join(',')}`);
    }
    if (row.usesZeroUrFallback) {
      failures.push(`${row.code}: still on zero-UR legacy fallback`);
    }
    // Active role with UR must not depend on legacy-only constitution codes
    if (row.urCount === 0 && row.canonicalCount > 0) {
      failures.push(`${row.code}: active canonical role with zero UR grants`);
    }
  }
  if (inv.bridgeMissing.length) {
    failures.push(`bridge missing: ${inv.bridgeMissing.join(',')}`);
  }
  if (failures.length) {
    throw new Error(`VERIFY FAILED:\n${failures.join('\n')}`);
  }
  return {
    ok: true,
    activeRoleCount: inv.activeRoles.length,
    roles: inv.activeRoles.map((r) => ({
      code: r.code,
      urCount: r.urCount,
      legacyCount: r.legacyCount,
      canonicalCount: r.canonicalCount,
      nonConstitutionInUr: r.nonConstitutionInUr,
    })),
  };
}

async function main() {
  await assertDb();
  if (doInventory) {
    const inv = await inventoryActiveRoleGaps();
    console.log(JSON.stringify({ mode: 'INVENTORY', ...inv }, null, 2));
    return;
  }
  if (doApply) {
    const result = await applyGaps();
    console.log(
      JSON.stringify(
        {
          mode: 'APPLY_GAPS',
          sealedCount: result.sealed.length,
          sealed: result.sealed,
          remainingActiveGaps: result.afterGaps.activeRoles.filter((r) => r.missingFromUr.length),
          bridgeMissingAfter: result.afterGaps.bridgeMissing,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (doVerify) {
    const result = await verify();
    console.log(JSON.stringify({ mode: 'VERIFY', ...result }, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
