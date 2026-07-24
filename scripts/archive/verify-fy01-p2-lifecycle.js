/**
 * FY 01 P2 — Assignment lifecycle verification.
 *
 * Usage:
 *   node scripts/verify-fy01-p2-lifecycle.js
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const {
  deactivateAssignmentWithMembership,
  reactivateAssignmentWithMembership,
  deleteAssignmentWithGovernance,
} = require('../src/services/acc-assignment-lifecycle.service');
const { evaluateAssignmentOperationalHistory } = require('../src/services/assignment-operational-history.service');
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

async function findLifecycleTestAssignment() {
  return prisma.urUserAssignment.findFirst({
    where: {
      isActive: true,
      notes: { startsWith: 'legacy:' },
      properties: { some: {} },
      role: { code: { notIn: ['SUPER_ADMIN', 'ORG_MANAGER'] } },
    },
    include: {
      role: { select: { code: true } },
      user: { select: { email: true } },
      properties: { include: { property: { select: { name: true, id: true } } } },
    },
  });
}

async function main() {
  console.log('\nFY 01 P2 — Assignment Lifecycle Verification');
  console.log('='.repeat(60));

  const actor = await prisma.user.findFirst({
    where: { email: 'superadmin@ose.cloud', isActive: true },
    select: { id: true },
  });
  if (!actor) {
    console.error('superadmin@ose.cloud not found');
    process.exit(1);
  }

  const assignment = await findLifecycleTestAssignment();
  if (!assignment) {
    console.log('No suitable assignment for lifecycle test.');
    process.exit(1);
  }

  const propertyId = assignment.properties[0].propertyId;
  const userId = assignment.userId;
  console.log(`\n── Lifecycle (${assignment.user.email} / ${assignment.properties[0].property?.name} / ${assignment.role.code}) ──`);

  const memberBefore = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId: propertyId, userId } },
    select: { id: true, isActive: true },
  });
  assert('active membership before test', memberBefore?.isActive === true);

  await deactivateAssignmentWithMembership(actor.id, assignment.id, { actorRoleCode: 'SUPER_ADMIN' });
  const afterDeactivate = await prisma.urUserAssignment.findUnique({
    where: { id: assignment.id },
    select: { isActive: true },
  });
  const memberAfterDeactivate = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId: propertyId, userId } },
    select: { isActive: true },
  });
  assert('deactivate sets assignment inactive', afterDeactivate?.isActive === false);
  assert('deactivate retires membership', memberAfterDeactivate?.isActive === false);

  const deactivateAudit = await prisma.urAuditEvent.findFirst({
    where: { action: 'ASSIGNMENT_DEACTIVATED', targetEntityId: assignment.id },
    orderBy: { createdAt: 'desc' },
  });
  assert('deactivate audit logged', !!deactivateAudit);
  assert('deactivate audit has property', !!(deactivateAudit?.newValue)?.propertyName);

  const activeDup = await prisma.urUserAssignment.count({
    where: {
      userId,
      roleId: assignment.roleId,
      isActive: true,
      properties: { some: { propertyId } },
    },
  });
  assert('no duplicate active assignment after deactivate', activeDup === 0);

  await reactivateAssignmentWithMembership(actor.id, assignment.id, { actorRoleCode: 'SUPER_ADMIN' });
  const afterReactivate = await prisma.urUserAssignment.findUnique({
    where: { id: assignment.id },
    select: { isActive: true, notes: true },
  });
  const memberAfterReactivate = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId: propertyId, userId } },
    select: { isActive: true },
  });
  assert('reactivate restores assignment active', afterReactivate?.isActive === true);
  assert('reactivate restores membership', memberAfterReactivate?.isActive === true);
  assert('legacy tag preserved', !!extractLegacyTag(afterReactivate?.notes));

  const reactivateAudit = await prisma.urAuditEvent.findFirst({
    where: { action: 'ASSIGNMENT_REACTIVATED', targetEntityId: assignment.id },
    orderBy: { createdAt: 'desc' },
  });
  assert('reactivate audit logged', !!reactivateAudit);

  const activeDupAfter = await prisma.urUserAssignment.count({
    where: {
      userId,
      roleId: assignment.roleId,
      isActive: true,
      properties: { some: { propertyId } },
    },
  });
  assert('single active assignment after reactivate', activeDupAfter === 1);

  const history = await evaluateAssignmentOperationalHistory(
    await prisma.urUserAssignment.findUnique({
      where: { id: assignment.id },
      include: { properties: { select: { propertyId: true } } },
    }),
  );
  if (history.hasHistory) {
    let blocked = false;
    try {
      await deleteAssignmentWithGovernance(actor.id, assignment.id, { actorRoleCode: 'SUPER_ADMIN' });
    } catch (e) {
      blocked = e.code === 'ASSIGNMENT_HAS_HISTORY';
    }
    assert('delete blocked when history exists', blocked);
  } else {
    console.log('  (assignment has no operational history — skip delete-block test)');
  }

  const role = await prisma.role.findFirst({
    where: { code: 'SECURITY', isActive: true },
    select: { id: true },
  });
  const property = await prisma.tenant.findFirst({
    where: { id: propertyId },
    select: { id: true },
  });
  if (role && property) {
    const disposable = await prisma.urUserAssignment.create({
      data: {
        userId,
        roleId: role.id,
        isActive: true,
        notes: 'P2 disposable lifecycle test',
        properties: { create: [{ propertyId: property.id }] },
      },
      include: { properties: { select: { propertyId: true } } },
    });
    const disposableHistory = await evaluateAssignmentOperationalHistory(disposable);
    assert('disposable assignment has no operational history', !disposableHistory.hasHistory);
    if (!disposableHistory.hasHistory) {
      await deleteAssignmentWithGovernance(actor.id, disposable.id, { actorRoleCode: 'SUPER_ADMIN' });
      const gone = await prisma.urUserAssignment.findUnique({ where: { id: disposable.id } });
      assert('delete allowed without history', gone === null);
      const deleteAudit = await prisma.urAuditEvent.findFirst({
        where: { action: 'ASSIGNMENT_DELETED', targetEntityId: disposable.id },
        orderBy: { createdAt: 'desc' },
      });
      assert('delete audit logged', !!deleteAudit);
    } else {
      await prisma.urUserAssignment.delete({ where: { id: disposable.id } });
    }
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
