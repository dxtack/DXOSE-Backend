/**
 * FY 01 P1 — Edit Governance Lockdown verification.
 *
 * Usage:
 *   node scripts/verify-fy01-p1-edit-governance.js
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const {
  validateEditAssignment,
  ValidationError,
} = require('../src/engines/assignment.validators');
const { addProperty, removeProperty, PROPERTY_IMMUTABLE_MESSAGE } = require('../src/engines/assignment-property.service');
const { editAssignment } = require('../src/engines/assignment.service');
const { extractLegacyTag } = require('../src/services/acc-membership-assignment-sync.service');

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
    return;
  }
  failed++;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function findTestAssignment() {
  const legacy = await prisma.urUserAssignment.findFirst({
    where: {
      isActive: true,
      notes: { startsWith: 'legacy:' },
      properties: { some: {} },
      role: { code: { notIn: ['SUPER_ADMIN'] } },
    },
    include: {
      role: { select: { code: true, id: true } },
      user: { select: { id: true, email: true } },
      properties: { select: { propertyId: true, property: { select: { name: true } } } },
      departments: { include: { department: { select: { id: true, name: true } } } },
    },
  });
  if (legacy) return legacy;

  return prisma.urUserAssignment.findFirst({
    where: {
      isActive: true,
      properties: { some: {} },
      role: { code: { notIn: ['SUPER_ADMIN'] } },
    },
    include: {
      role: { select: { code: true, id: true } },
      user: { select: { id: true, email: true } },
      properties: { select: { propertyId: true, property: { select: { name: true } } } },
      departments: { include: { department: { select: { id: true, name: true } } } },
    },
  });
}

async function main() {
  console.log('\nFY 01 P1 — Edit Governance Verification');
  console.log('='.repeat(60));

  console.log('\n── Validator ──');
  try {
    validateEditAssignment({ roleId: '00000000-0000-4000-8000-000000000001' });
    assert('roleId rejected', false);
  } catch (e) {
    assert('roleId rejected', e instanceof ValidationError && /Role cannot be changed/.test(e.message));
  }

  try {
    validateEditAssignment({ isActive: false });
    assert('isActive rejected', false);
  } catch (e) {
    assert('isActive rejected', e instanceof ValidationError);
  }

  try {
    validateEditAssignment({ propertyIds: [] });
    assert('propertyIds rejected', false);
  } catch (e) {
    assert('propertyIds rejected', e instanceof ValidationError && /Property cannot be changed/.test(e.message));
  }

  const notesOnly = validateEditAssignment({ notes: 'P1 test note' });
  assert('notes allowed', notesOnly.notes === 'P1 test note');

  const assignment = await findTestAssignment();
  if (!assignment) {
    console.log('\nNo suitable active assignment found — skipping integration tests.');
    process.exit(failed > 0 ? 1 : 0);
  }

  const actor = await prisma.user.findFirst({
    where: { email: 'superadmin@ose.cloud', isActive: true },
    select: { id: true },
  });
  const actorId = actor?.id ?? assignment.userId;
  const propertyId = assignment.properties[0].propertyId;

  console.log(`\n── Integration (${assignment.user.email} / ${assignment.properties[0].property?.name}) ──`);

  try {
    await addProperty(actorId, assignment.id, propertyId);
    assert('addProperty blocked', false);
  } catch (e) {
    assert('addProperty blocked', e.statusCode === 409 && e.message === PROPERTY_IMMUTABLE_MESSAGE);
  }

  try {
    await removeProperty(actorId, assignment.id, propertyId);
    assert('removeProperty blocked', false);
  } catch (e) {
    assert('removeProperty blocked', e.statusCode === 409 && e.message === PROPERTY_IMMUTABLE_MESSAGE);
  }

  const propCountBefore = await prisma.urAssignmentProperty.count({
    where: { assignmentId: assignment.id },
  });
  assert('assignment still single property', propCountBefore === 1);

  const testNotes = `P1 verify ${Date.now()}`;
  const legacyNotes = extractLegacyTag(assignment.notes);
  if (!legacyNotes) {
    await editAssignment(actorId, assignment.id, { notes: testNotes }, { actorRoleCode: 'SUPER_ADMIN' });
    const afterNotes = await prisma.urUserAssignment.findUnique({
      where: { id: assignment.id },
      select: { notes: true },
    });
    assert('notes edit works', afterNotes?.notes === testNotes);

    const notesAudit = await prisma.urAuditEvent.findFirst({
      where: {
        action: 'ASSIGNMENT_NOTES_UPDATED',
        targetEntityId: assignment.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert('notes audit logged', !!notesAudit);
    assert('notes audit has property', !!(notesAudit?.newValue)?.propertyName);
  } else {
    const beforeTag = assignment.notes;
    await editAssignment(actorId, assignment.id, { notes: 'should not erase legacy tag' }, { actorRoleCode: 'SUPER_ADMIN' });
    const afterLegacy = await prisma.urUserAssignment.findUnique({
      where: { id: assignment.id },
      select: { notes: true },
    });
    assert('legacy tag preserved on notes edit', extractLegacyTag(afterLegacy?.notes) === extractLegacyTag(beforeTag));
    console.log('  (notes write test used legacy-tag preservation path)');
  }

  const memberBefore = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId: propertyId, userId: assignment.userId } },
    select: { departmentId: true },
  });

  const dept = await prisma.department.findFirst({
    where: { tenantId: propertyId, isActive: true },
    select: { id: true, name: true },
  });

  if (dept) {
    await editAssignment(actorId, assignment.id, { departmentIds: [dept.id] }, { actorRoleCode: 'SUPER_ADMIN' });
    const deptRows = await prisma.urAssignmentDepartment.count({ where: { assignmentId: assignment.id } });
    assert('department edit works', deptRows === 1);

    const memberAfter = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: propertyId, userId: assignment.userId } },
      select: { departmentId: true },
    });
    assert('TenantMember department synced', memberAfter?.departmentId === dept.id);

    const deptAudit = await prisma.urAuditEvent.findFirst({
      where: {
        action: 'ASSIGNMENT_DEPARTMENTS_UPDATED',
        targetEntityId: assignment.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert('department audit logged', !!deptAudit);

    if (memberBefore?.departmentId && memberBefore.departmentId !== dept.id) {
      await editAssignment(
        actorId,
        assignment.id,
        { departmentIds: memberBefore.departmentId ? [memberBefore.departmentId] : [] },
        { actorRoleCode: 'SUPER_ADMIN' },
      );
    }
  } else {
    console.log('  (skipped department sync test — no department on property)');
  }

  console.log('\n── Summary ──');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('='.repeat(60) + '\n');

  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
