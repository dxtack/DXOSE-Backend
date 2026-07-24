/**
 * AssignmentDepartmentService
 * ───────────────────────────
 * Manages UrAssignmentDepartment rows for UrUserAssignment scope.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const { validateUuid } = require('./assignment.validators');
const auditLogger = require('./ur-audit.logger');
const {
  syncTenantMemberDepartmentFromAssignment,
  ASSIGNMENT_INCLUDE,
} = require('../services/acc-assignment-membership-provision.service');
const { assertDepartmentsBelongToProperties } = require('../services/acc-assignment-department-scope');

const prisma = new PrismaClient();

async function addDepartment(actorId, assignmentId, departmentId, options = {}) {
  validateUuid(actorId, 'actorId');
  validateUuid(assignmentId, 'assignmentId');
  validateUuid(departmentId, 'departmentId');

  const before = await _getAssignment(assignmentId);
  const propertyIds = (before?.properties ?? []).map((p) => p.propertyId).filter(Boolean);
  await assertDepartmentsBelongToProperties([departmentId], propertyIds);

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.urAssignmentDepartment.upsert({
      where: {
        assignmentId_departmentId: { assignmentId, departmentId },
      },
      create: { assignmentId, departmentId },
      update: {},
      include: { department: { select: { id: true, name: true, code: true } } },
    });

    const after = await tx.urUserAssignment.findUnique({
      where: { id: assignmentId },
      include: ASSIGNMENT_INCLUDE,
    });
    await syncTenantMemberDepartmentFromAssignment(tx, after);
    return { created, after };
  });

  _auditDepartmentsChanged(actorId, before, row.after, options.actorRoleCode);
  return row.created;
}

async function removeDepartment(actorId, assignmentId, departmentId, options = {}) {
  validateUuid(actorId, 'actorId');
  validateUuid(assignmentId, 'assignmentId');
  validateUuid(departmentId, 'departmentId');

  const before = await _getAssignment(assignmentId);

  const existing = await prisma.urAssignmentDepartment.findUnique({
    where: { assignmentId_departmentId: { assignmentId, departmentId } },
  });
  if (!existing) return { removed: false };

  const after = await prisma.$transaction(async (tx) => {
    await tx.urAssignmentDepartment.delete({
      where: { assignmentId_departmentId: { assignmentId, departmentId } },
    });
    const full = await tx.urUserAssignment.findUnique({
      where: { id: assignmentId },
      include: ASSIGNMENT_INCLUDE,
    });
    await syncTenantMemberDepartmentFromAssignment(tx, full);
    return full;
  });

  _auditDepartmentsChanged(actorId, before, after, options.actorRoleCode);
  return { removed: true };
}

async function listDepartments(assignmentId) {
  validateUuid(assignmentId, 'assignmentId');

  return prisma.urAssignmentDepartment.findMany({
    where: { assignmentId },
    include: { department: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

async function _getAssignment(assignmentId) {
  const assignment = await prisma.urUserAssignment.findUnique({
    where: { id: assignmentId },
    include: ASSIGNMENT_INCLUDE,
  });
  if (!assignment) {
    const err = new Error(`Assignment not found: ${assignmentId}`);
    err.statusCode = 404;
    throw err;
  }
  return assignment;
}

function _departmentSnapshot(assignment) {
  if (!assignment.departments?.length) {
    return [{ id: null, name: 'All Departments' }];
  }
  return assignment.departments.map((d) => ({
    id:   d.departmentId,
    name: d.department?.name ?? d.departmentId,
  }));
}

function _auditContext(assignment, actorRoleCode) {
  const prop = assignment.properties?.[0]?.property ?? null;
  return {
    assignmentId: assignment.id,
    userId:         assignment.userId,
    userEmail:      assignment.user?.email ?? null,
    userName:       assignment.user
      ? `${assignment.user.firstName ?? ''} ${assignment.user.lastName ?? ''}`.trim()
      : null,
    roleId:         assignment.roleId,
    roleCode:       assignment.role?.code ?? null,
    roleName:       assignment.role?.name ?? null,
    propertyId:     prop?.id ?? null,
    propertyName:   prop?.name ?? (assignment.properties?.length === 0 ? 'All Properties' : null),
    actorRoleCode:  actorRoleCode ?? null,
  };
}

function _auditDepartmentsChanged(actorId, before, after, actorRoleCode) {
  const beforeDepts = _departmentSnapshot(before);
  const afterDepts = _departmentSnapshot(after);
  const same = JSON.stringify(beforeDepts) === JSON.stringify(afterDepts);
  if (same) return;

  _audit(() => auditLogger.logAssignmentDepartmentsUpdated(actorId, {
    ..._auditContext(after, actorRoleCode),
    oldDepartments: beforeDepts,
    newDepartments: afterDepts,
  }));
}

function _audit(fn) {
  Promise.resolve().then(fn).catch((e) => {
    console.error('[AssignmentDepartmentService] Audit log failed (non-fatal):', e.message);
  });
}

module.exports = { addDepartment, removeDepartment, listDepartments };
