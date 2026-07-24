'use strict';

/**
 * ACC Big Bang S7 — shared assignment backfill core.
 * Maps active TenantMember rows → ur_user_assignments (+ property/department scope).
 * Idempotent via notes tag `legacy:<tenantMemberId>`.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ dryRun?: boolean, log?: (msg: string) => void }} [opts]
 */
async function runAccAssignmentBackfill(prisma, opts = {}) {
  const dryRun = !!opts.dryRun;
  const log = opts.log ?? ((msg) => console.log(msg));

  const stats = {
    membersScanned: 0,
    skipped: 0,
    assignmentsCreated: 0,
    assignmentsExisting: 0,
    propertiesLinked: 0,
    departmentsLinked: 0,
    warnings: [],
  };

  const members = await prisma.tenantMember.findMany({
    where: { isActive: true },
    include: {
      role: { select: { id: true, code: true, name: true } },
      tenant: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  stats.membersScanned = members.length;

  for (const member of members) {
    await processMember(prisma, member, { dryRun, log, stats });
  }

  return stats;
}

async function processMember(prisma, member, { dryRun, log, stats }) {
  const tag = `legacy:${member.id}`;

  const existing = await prisma.urUserAssignment.findFirst({
    where: { notes: tag },
    select: { id: true },
  });

  if (existing) {
    stats.assignmentsExisting++;
    stats.skipped++;
    log(`  SKIP  [${member.role.code}] User ${member.userId} — assignment exists (${existing.id})`);
    return;
  }

  const hasPropertyScope = member.tenantId != null;
  const hasDepartmentScope = member.departmentId != null && !member.canViewAllDepartments;

  const scopeDesc = [
    hasPropertyScope ? `Property: ${member.tenant?.name ?? member.tenantId}` : 'Property: ALL',
    hasDepartmentScope ? `Dept: ${member.department?.name ?? member.departmentId}` : 'Dept: ALL',
  ].join(' | ');

  log(`  ${dryRun ? 'PLAN' : 'CREATE'} [${member.role.code}] User ${member.userId} — ${scopeDesc}`);

  if (dryRun) {
    stats.assignmentsCreated++;
    if (hasPropertyScope) stats.propertiesLinked++;
    if (hasDepartmentScope) stats.departmentsLinked++;
    return;
  }

  const assignment = await prisma.urUserAssignment.create({
    data: {
      userId: member.userId,
      roleId: member.roleId,
      isActive: member.isActive,
      notes: tag,
    },
  });

  stats.assignmentsCreated++;

  if (hasPropertyScope) {
    try {
      await prisma.urAssignmentProperty.upsert({
        where: {
          assignmentId_propertyId: {
            assignmentId: assignment.id,
            propertyId: member.tenantId,
          },
        },
        create: { assignmentId: assignment.id, propertyId: member.tenantId },
        update: {},
      });
      stats.propertiesLinked++;
    } catch (e) {
      const msg = `Property upsert failed for assignment ${assignment.id} / property ${member.tenantId}: ${e.message}`;
      stats.warnings.push(msg);
      console.warn('  WARN:', msg);
    }
  }

  if (hasDepartmentScope) {
    try {
      await prisma.urAssignmentDepartment.upsert({
        where: {
          assignmentId_departmentId: {
            assignmentId: assignment.id,
            departmentId: member.departmentId,
          },
        },
        create: { assignmentId: assignment.id, departmentId: member.departmentId },
        update: {},
      });
      stats.departmentsLinked++;
    } catch (e) {
      const msg = `Department upsert failed for assignment ${assignment.id} / dept ${member.departmentId}: ${e.message}`;
      stats.warnings.push(msg);
      console.warn('  WARN:', msg);
    }
  }
}

function printBackfillReport(stats, dryRun) {
  console.log('\n' + '='.repeat(60));
  console.log(`ACC Assignment Backfill Report ${dryRun ? '[DRY RUN]' : '[LIVE]'}`);
  console.log('='.repeat(60));
  console.log(`  Members scanned:            ${stats.membersScanned}`);
  console.log(`  Already backfilled (skip):  ${stats.assignmentsExisting}`);
  console.log(`  Assignments ${dryRun ? 'to create' : 'created'}:    ${stats.assignmentsCreated}`);
  console.log(`  Properties ${dryRun ? 'to link' : 'linked'}:        ${stats.propertiesLinked}`);
  console.log(`  Departments ${dryRun ? 'to link' : 'linked'}:       ${stats.departmentsLinked}`);
  console.log(
    `  Assignments w/o property:   ${stats.assignmentsCreated - stats.propertiesLinked} (All Properties)`,
  );
  console.log(
    `  Assignments w/o dept:       ${stats.assignmentsCreated - stats.departmentsLinked} (All Departments)`,
  );

  if (stats.warnings.length > 0) {
    console.log(`\n  Warnings (${stats.warnings.length}):`);
    stats.warnings.forEach((w) => console.log(`    ⚠ ${w}`));
  } else {
    console.log('\n  No warnings.');
  }

  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\nDry run complete — no data written.\n');
  } else {
    console.log('\nBackfill complete.\n');
  }
}

module.exports = {
  runAccAssignmentBackfill,
  printBackfillReport,
};
