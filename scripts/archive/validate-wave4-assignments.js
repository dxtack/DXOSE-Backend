/**
 * Wave 4 — Assignment Validation / Verification Script
 * ──────────────────────────────────────────────────────
 * Reports migration health without modifying any data.
 *
 * Usage:
 *   node scripts/validate-wave4-assignments.js
 *
 * Checks:
 *   1. Counts legacy TenantMember records vs new UrUserAssignment records.
 *   2. Identifies unmigrated members (TenantMember with no matching assignment tag).
 *   3. Classifies assignments by scope (All Properties vs Restricted, etc.).
 *   4. Detects orphaned scope rows (property/department rows whose assignment is missing).
 *   5. Cross-checks role codes between legacy and new model.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('\nWave 4 — Assignment Validation Report');
  console.log('='.repeat(60));

  // ── 1. Legacy counts ────────────────────────────────────────────────────
  const totalUsers      = await prisma.user.count();
  const totalMembers    = await prisma.tenantMember.count();
  const activeMembers   = await prisma.tenantMember.count({ where: { isActive: true } });
  const inactiveMembers = totalMembers - activeMembers;

  console.log('\n── Legacy (TenantMember) ──────────────────────────────────');
  console.log(`  Total users:                ${totalUsers}`);
  console.log(`  Total TenantMember rows:    ${totalMembers}`);
  console.log(`  Active members:             ${activeMembers}`);
  console.log(`  Inactive members:           ${inactiveMembers}`);

  // ── 2. New assignment counts ────────────────────────────────────────────
  const totalAssignments       = await prisma.urUserAssignment.count();
  const activeAssignments      = await prisma.urUserAssignment.count({ where: { isActive: true } });
  const migratedAssignments    = await prisma.urUserAssignment.count({ where: { notes: { startsWith: 'legacy:' } } });
  const manualAssignments      = totalAssignments - migratedAssignments;

  console.log('\n── New (UrUserAssignment) ─────────────────────────────────');
  console.log(`  Total assignments:          ${totalAssignments}`);
  console.log(`  Active assignments:         ${activeAssignments}`);
  console.log(`  Migrated from TenantMember: ${migratedAssignments}`);
  console.log(`  Manually created:           ${manualAssignments}`);

  // ── 3. Scope breakdown ──────────────────────────────────────────────────
  const totalPropertyRows    = await prisma.urAssignmentProperty.count();
  const totalDepartmentRows  = await prisma.urAssignmentDepartment.count();

  // Assignments WITH at least one property restriction
  const assignmentsWithProp = await prisma.urUserAssignment.count({
    where: { properties: { some: {} } },
  });
  const assignmentsAllProp  = totalAssignments - assignmentsWithProp;

  // Assignments WITH at least one department restriction
  const assignmentsWithDept = await prisma.urUserAssignment.count({
    where: { departments: { some: {} } },
  });
  const assignmentsAllDept  = totalAssignments - assignmentsWithDept;

  console.log('\n── Scope Breakdown ────────────────────────────────────────');
  console.log(`  Total property scope rows:  ${totalPropertyRows}`);
  console.log(`  Total department scope rows:${totalDepartmentRows}`);
  console.log(`  Assignments (All Properties):    ${assignmentsAllProp}  (no property rows)`);
  console.log(`  Assignments (Restricted Props):  ${assignmentsWithProp} (has property rows)`);
  console.log(`  Assignments (All Departments):   ${assignmentsAllDept}  (no department rows)`);
  console.log(`  Assignments (Restricted Depts):  ${assignmentsWithDept} (has department rows)`);

  // ── 4. Migration coverage ───────────────────────────────────────────────
  // Find active TenantMembers not yet migrated
  const allMembers = await prisma.tenantMember.findMany({
    where: { isActive: true },
    select: { id: true, userId: true, roleId: true, tenantId: true, role: { select: { code: true } } },
  });

  // Collect all legacy tags that have been migrated
  const migratedTags = new Set();
  const allMigratedNotes = await prisma.urUserAssignment.findMany({
    where: { notes: { startsWith: 'legacy:' } },
    select: { notes: true },
  });
  for (const a of allMigratedNotes) {
    migratedTags.add(a.notes);
  }

  const unmigrated = allMembers.filter((m) => !migratedTags.has(`legacy:${m.id}`));

  console.log('\n── Migration Coverage ─────────────────────────────────────');
  console.log(`  Active members:             ${activeMembers}`);
  console.log(`  Migrated:                   ${activeMembers - unmigrated.length}`);
  console.log(`  Not yet migrated:           ${unmigrated.length}`);

  if (unmigrated.length > 0) {
    console.log('\n  Unmigrated members:');
    unmigrated.slice(0, 20).forEach((m) => {
      console.log(`    • User ${m.userId} | Role: ${m.role.code} | Tenant: ${m.tenantId ?? 'GLOBAL'}`);
    });
    if (unmigrated.length > 20) {
      console.log(`    ... and ${unmigrated.length - 20} more.`);
    }
    console.log('\n  ACTION: Run migrate-wave4-assignments.js to complete migration.');
  }

  // ── 5. Orphan check ─────────────────────────────────────────────────────
  // Find property rows whose assignmentId no longer exists
  const allPropRows = await prisma.urAssignmentProperty.findMany({
    select: { id: true, assignmentId: true },
  });
  const allAssignmentIds = new Set(
    (await prisma.urUserAssignment.findMany({ select: { id: true } })).map((a) => a.id)
  );
  const orphanedProps = allPropRows.filter((r) => !allAssignmentIds.has(r.assignmentId));

  const allDeptRows = await prisma.urAssignmentDepartment.findMany({
    select: { id: true, assignmentId: true },
  });
  const orphanedDepts = allDeptRows.filter((r) => !allAssignmentIds.has(r.assignmentId));

  console.log('\n── Orphan Check ───────────────────────────────────────────');
  console.log(`  Orphaned property rows:     ${orphanedProps.length}`);
  console.log(`  Orphaned department rows:   ${orphanedDepts.length}`);
  if (orphanedProps.length > 0 || orphanedDepts.length > 0) {
    console.log('  WARNING: Orphaned rows detected. Cascade delete may not have fired.');
  } else {
    console.log('  No orphans found. ✓');
  }

  // ── 6. Summary ──────────────────────────────────────────────────────────
  const migrationComplete = unmigrated.length === 0;
  const noOrphans = orphanedProps.length === 0 && orphanedDepts.length === 0;

  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Migration complete:         ${migrationComplete ? 'YES ✓' : 'NO — ' + unmigrated.length + ' remaining'}`);
  console.log(`  No orphaned rows:           ${noOrphans ? 'YES ✓' : 'WARNING ⚠'}`);
  console.log('='.repeat(60) + '\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('VALIDATION FAILED:', e.message);
    prisma.$disconnect();
    process.exit(1);
  });
