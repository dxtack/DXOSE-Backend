/**
 * ACC Big Bang Stage S7 — validate assignment backfill coverage (read-only).
 *
 * Usage:
 *   node scripts/validate-backfill-assignments.js
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { extractLegacyTag } = require('../src/services/acc-membership-assignment-sync.service');
const prisma = new PrismaClient();

async function main() {
  console.log('\nACC Big Bang S7 — Assignment Backfill Validation');
  console.log('='.repeat(60));

  const activeMembers = await prisma.tenantMember.count({ where: { isActive: true } });
  const totalAssignments = await prisma.urUserAssignment.count();
  const legacyTagged = await prisma.urUserAssignment.count({
    where: { notes: { startsWith: 'legacy:' } },
  });

  const members = await prisma.tenantMember.findMany({
    where: { isActive: true },
    select: { id: true, userId: true, role: { select: { code: true } }, tenantId: true },
  });

  const migratedTags = new Set(
    (
      await prisma.urUserAssignment.findMany({
        where: { notes: { startsWith: 'legacy:' } },
        select: { notes: true },
      })
    )
      .map((a) => extractLegacyTag(a.notes))
      .filter(Boolean),
  );

  const unmigrated = members.filter((m) => !migratedTags.has(`legacy:${m.id}`));

  const propertyRows = await prisma.urAssignmentProperty.count();
  const departmentRows = await prisma.urAssignmentDepartment.count();

  console.log(`  Active TenantMember rows:     ${activeMembers}`);
  console.log(`  ur_user_assignments rows:     ${totalAssignments}`);
  console.log(`  Legacy-tagged assignments:    ${legacyTagged}`);
  console.log(`  ur_assignment_properties:     ${propertyRows}`);
  console.log(`  ur_assignment_departments:    ${departmentRows}`);
  console.log(`  Unmigrated active members:    ${unmigrated.length}`);
  console.log(`  Coverage complete:            ${unmigrated.length === 0 ? 'YES ✓' : 'NO ✗'}`);
  console.log('='.repeat(60) + '\n');

  if (unmigrated.length > 0) {
    process.exit(1);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('VALIDATION FAILED:', e.message);
    prisma.$disconnect();
    process.exit(1);
  });
