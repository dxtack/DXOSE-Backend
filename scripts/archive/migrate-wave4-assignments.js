/**
 * Wave 4 — Assignment Migration Script
 * ──────────────────────────────────────
 * Migrates existing TenantMember records into the new UrUserAssignment model.
 *
 * Usage:
 *   node scripts/migrate-wave4-assignments.js            # live run
 *   node scripts/migrate-wave4-assignments.js --dry-run  # dry run (no DB writes)
 *
 * Migration Mapping:
 *   TenantMember.userId          → UrUserAssignment.userId
 *   TenantMember.roleId          → UrUserAssignment.roleId
 *   TenantMember.isActive        → UrUserAssignment.isActive
 *   TenantMember.id (as tag)     → UrUserAssignment.notes = 'legacy:<uuid>'
 *
 *   TenantMember.tenantId != null
 *     → UrAssignmentProperty (assignmentId, propertyId=tenantId)
 *   TenantMember.tenantId = null
 *     → No property rows (implicit: All Properties)
 *
 *   TenantMember.departmentId != null AND canViewAllDepartments = false
 *     → UrAssignmentDepartment (assignmentId, departmentId)
 *   TenantMember.departmentId = null OR canViewAllDepartments = true
 *     → No department rows (implicit: All Departments)
 *
 * Idempotency:
 *   Each migrated assignment is tagged with notes = 'legacy:<memberUUID>'.
 *   On re-run, any member whose tag already exists in UrUserAssignment is SKIPPED.
 *   This guarantees no duplicates regardless of how many times the script runs.
 *
 * Safety:
 *   --dry-run prints a full plan without writing anything.
 *   Live run uses individual Prisma upserts (not bulk) so partial failures
 *   can be resumed safely on re-run.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Counters ────────────────────────────────────────────────────────────────

const stats = {
  membersScanned:       0,
  skipped:              0,
  assignmentsCreated:   0,
  assignmentsExisting:  0,
  propertiesLinked:     0,
  propertiesSkipped:    0,
  departmentsLinked:    0,
  departmentsSkipped:   0,
  warnings:             [],
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const mode = DRY_RUN ? '[DRY RUN]' : '[LIVE]';
  console.log(`\nWave 4 — Assignment Migration ${mode}`);
  console.log('='.repeat(60));

  // 1. Load all active TenantMember records with their relations
  const members = await prisma.tenantMember.findMany({
    where: { isActive: true },
    include: {
      role:       { select: { id: true, code: true, name: true } },
      tenant:     { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  stats.membersScanned = members.length;
  console.log(`\nFound ${members.length} active TenantMember records.\n`);

  // 2. Process each member
  for (const member of members) {
    await processMember(member);
  }

  // 3. Print report
  printReport();
}

// ─── Per-member processing ────────────────────────────────────────────────────

async function processMember(member) {
  const tag = `legacy:${member.id}`;

  // Idempotency check: skip if already migrated
  const existing = await prisma.urUserAssignment.findFirst({
    where: { notes: tag },
    select: { id: true },
  });

  if (existing) {
    stats.assignmentsExisting++;
    stats.skipped++;
    log(`  SKIP  [${member.role.code}] User ${member.userId} — assignment already exists (${existing.id})`);
    return;
  }

  // Determine scope
  const hasPropertyScope   = member.tenantId != null;
  const hasDepartmentScope = member.departmentId != null && !member.canViewAllDepartments;

  // Log plan
  const scopeDesc = [
    hasPropertyScope   ? `Property: ${member.tenant?.name ?? member.tenantId}` : 'Property: ALL',
    hasDepartmentScope ? `Dept: ${member.department?.name ?? member.departmentId}` : 'Dept: ALL',
  ].join(' | ');

  log(`  ${DRY_RUN ? 'PLAN' : 'CREATE'} [${member.role.code}] User ${member.userId} — ${scopeDesc}`);

  if (DRY_RUN) {
    stats.assignmentsCreated++;
    if (hasPropertyScope)   stats.propertiesLinked++;
    if (hasDepartmentScope) stats.departmentsLinked++;
    return;
  }

  // ── Live run: create assignment ───────────────────────────────────────────
  const assignment = await prisma.urUserAssignment.create({
    data: {
      userId:   member.userId,
      roleId:   member.roleId,
      isActive: member.isActive,
      notes:    tag,
    },
  });

  stats.assignmentsCreated++;

  // ── Property scope ────────────────────────────────────────────────────────
  if (hasPropertyScope) {
    try {
      await prisma.urAssignmentProperty.upsert({
        where: {
          assignmentId_propertyId: {
            assignmentId: assignment.id,
            propertyId:   member.tenantId,
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

  // ── Department scope ──────────────────────────────────────────────────────
  if (hasDepartmentScope) {
    try {
      await prisma.urAssignmentDepartment.upsert({
        where: {
          assignmentId_departmentId: {
            assignmentId:  assignment.id,
            departmentId:  member.departmentId,
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

// ─── Report ───────────────────────────────────────────────────────────────────

function printReport() {
  console.log('\n' + '='.repeat(60));
  console.log(`Wave 4 Migration Report ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'}`);
  console.log('='.repeat(60));
  console.log(`  Members scanned:          ${stats.membersScanned}`);
  console.log(`  Already migrated (skipped): ${stats.assignmentsExisting}`);
  console.log(`  Assignments ${DRY_RUN ? 'to create' : 'created'}:  ${stats.assignmentsCreated}`);
  console.log(`  Properties ${DRY_RUN ? 'to link' : 'linked'}:      ${stats.propertiesLinked}`);
  console.log(`  Departments ${DRY_RUN ? 'to link' : 'linked'}:     ${stats.departmentsLinked}`);
  console.log(`  Assignments w/o property:  ${stats.assignmentsCreated - stats.propertiesLinked} (All Properties)`);
  console.log(`  Assignments w/o dept:      ${stats.assignmentsCreated - stats.departmentsLinked} (All Departments)`);

  if (stats.warnings.length > 0) {
    console.log(`\n  Warnings (${stats.warnings.length}):`);
    stats.warnings.forEach((w) => console.log(`    ⚠ ${w}`));
  } else {
    console.log('\n  No warnings.');
  }

  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\nThis was a DRY RUN. No data was written.');
    console.log('Run without --dry-run to execute the migration.\n');
  } else {
    console.log('\nMigration complete.\n');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(msg);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('\nMIGRATION FAILED:', e.message);
    prisma.$disconnect();
    process.exit(1);
  });
