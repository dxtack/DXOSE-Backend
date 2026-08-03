/**
 * Demote hotel/branch TenantMember rows wrongly stored as ORG_MANAGER to GENERAL_MANAGER.
 *
 * Keeps ORG_MANAGER when the user is an active ORG_MANAGER on the parent organization
 * (inherited org-manager visibility / root ownership).
 *
 * Also re-syncs ACC dual-write assignments from the updated membership.
 *
 * Usage:
 *   node scripts/fix-branch-admin-roles.js --dry-run
 *   node scripts/fix-branch-admin-roles.js
 *   node scripts/fix-branch-admin-roles.js --email=nelly@adminhotel.com
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { syncMembershipToAssignment } = require('../src/services/acc-membership-assignment-sync.service');
const { connectRole } = require('../src/services/rbac.service');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const emailArg = process.argv.find((a) => a.startsWith('--email='));
const EMAIL_FILTER = emailArg ? emailArg.slice('--email='.length).trim().toLowerCase() : null;

async function main() {
  const mode = DRY_RUN ? '[DRY RUN]' : '[LIVE]';
  console.log(`\nFix branch admin roles ${mode}`);
  console.log('='.repeat(60));

  const gmRole = await prisma.role.findUnique({
    where: { code: 'GENERAL_MANAGER' },
    select: { id: true, code: true },
  });
  if (!gmRole) {
    throw new Error('GENERAL_MANAGER role not found in roles table.');
  }

  const candidates = await prisma.tenantMember.findMany({
    where: {
      isActive: true,
      role: { code: 'ORG_MANAGER' },
      tenant: { parentId: { not: null } },
      ...(EMAIL_FILTER ? { user: { email: EMAIL_FILTER } } : {}),
    },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      tenant: { select: { id: true, name: true, slug: true, parentId: true } },
      role: { select: { code: true } },
    },
  });

  console.log(`Candidates (branch ORG_MANAGER): ${candidates.length}`);

  let demoted = 0;
  let skippedOrgOwner = 0;
  let synced = 0;

  for (const row of candidates) {
    const parentOm = await prisma.tenantMember.findFirst({
      where: {
        userId: row.userId,
        tenantId: row.tenant.parentId,
        isActive: true,
        role: { code: 'ORG_MANAGER' },
      },
      select: { id: true },
    });

    if (parentOm) {
      skippedOrgOwner += 1;
      console.log(
        `  skip (parent ORG_MANAGER): ${row.user.email} @ ${row.tenant.slug}`,
      );
      continue;
    }

    console.log(
      `  demote → GENERAL_MANAGER: ${row.user.email} @ ${row.tenant.slug} (${row.tenant.name})`,
    );

    if (!DRY_RUN) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.tenantMember.update({
          where: { id: row.id },
          data: { role: connectRole('GENERAL_MANAGER') },
          include: { role: true },
        });
        await syncMembershipToAssignment(tx, updated);
      });
      synced += 1;
    }
    demoted += 1;
  }

  console.log('-'.repeat(60));
  console.log(`Demoted: ${demoted}`);
  console.log(`Skipped (parent org managers): ${skippedOrgOwner}`);
  if (!DRY_RUN) console.log(`ACC re-synced: ${synced}`);
  console.log('Done.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
