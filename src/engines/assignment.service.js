/**
 * AssignmentService
 * ─────────────────
 * Manages UrUserAssignment records: create, edit, deactivate, list, get.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const {
  validateCreateAssignment,
  validateEditAssignment,
  validateUuid,
} = require('./assignment.validators');
const auditLogger = require('./ur-audit.logger');
const {
  syncTenantMemberDepartmentFromAssignment,
} = require('../services/acc-assignment-membership-provision.service');
const {
  resolveAssignmentNotesForSave,
  userNotesFromAssignmentNotes,
} = require('../services/acc-membership-assignment-sync.service');

const prisma = new PrismaClient();

const ASSIGNMENT_INCLUDE = {
  role: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  properties: {
    select: {
      id: true,
      propertyId: true,
      property: { select: { id: true, name: true, slug: true } },
    },
  },
  departments: {
    select: {
      id: true,
      departmentId: true,
      department: { select: { id: true, name: true, code: true } },
    },
  },
};

async function createAssignment(actorId, dto) {
  validateUuid(actorId, 'actorId');
  const validated = validateCreateAssignment(dto);

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.urUserAssignment.create({
      data: {
        userId: validated.userId,
        roleId: validated.roleId,
        notes:  validated.notes,
        isActive: true,
      },
      include: ASSIGNMENT_INCLUDE,
    });

    if (validated.propertyIds.length > 0) {
      await tx.urAssignmentProperty.createMany({
        data: validated.propertyIds.map((pid) => ({
          assignmentId: created.id,
          propertyId:   pid,
        })),
        skipDuplicates: true,
      });
    }

    if (validated.departmentIds.length > 0) {
      await tx.urAssignmentDepartment.createMany({
        data: validated.departmentIds.map((did) => ({
          assignmentId:  created.id,
          departmentId:  did,
        })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  const full = await _getById(assignment.id);
  _audit(() => auditLogger.logAssignmentCreated(actorId, _sanitize(full)));
  return full;
}

/**
 * FY 01 P1 — Edit assignment notes and/or department scope only.
 *
 * @param {string} actorId
 * @param {string} assignmentId
 * @param {import('./assignment.validators').EditAssignmentDTO} dto
 * @param {{ actorRoleCode?: string|null }} [options]
 */
async function editAssignment(actorId, assignmentId, dto, options = {}) {
  validateUuid(actorId, 'actorId');
  validateUuid(assignmentId, 'assignmentId');
  const validated = validateEditAssignment(dto);
  const actorRoleCode = options.actorRoleCode ?? null;

  const before = await _getById(assignmentId);
  if (!before.isActive) {
    const err = new Error('Cannot edit an inactive assignment.');
    err.statusCode = 409;
    err.code = 'ASSIGNMENT_INACTIVE';
    throw err;
  }

  const notesChanged = validated.notes !== undefined
    && resolveAssignmentNotesForSave(before.notes, validated.notes) !== before.notes;
  const deptChanged = validated.departmentIds !== undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (validated.notes !== undefined) {
      const notesToSave = resolveAssignmentNotesForSave(before.notes, validated.notes);
      await tx.urUserAssignment.update({
        where: { id: assignmentId },
        data:  { notes: notesToSave },
      });
    }

    if (deptChanged) {
      await tx.urAssignmentDepartment.deleteMany({ where: { assignmentId } });
      if (validated.departmentIds.length > 0) {
        await tx.urAssignmentDepartment.createMany({
          data: validated.departmentIds.map((departmentId) => ({
            assignmentId,
            departmentId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const full = await tx.urUserAssignment.findUnique({
      where: { id: assignmentId },
      include: ASSIGNMENT_INCLUDE,
    });

    if (deptChanged) {
      await syncTenantMemberDepartmentFromAssignment(tx, full);
    }

    return full;
  });

  const auditContext = _auditContext(updated, actorRoleCode);

  if (notesChanged) {
    await _auditAwait(() => auditLogger.logAssignmentNotesUpdated(actorId, {
      ...auditContext,
      oldNotes: userNotesFromAssignmentNotes(before.notes) ?? before.notes,
      newNotes: userNotesFromAssignmentNotes(updated.notes) ?? updated.notes,
    }));
  }

  if (deptChanged) {
    await _auditAwait(() => auditLogger.logAssignmentDepartmentsUpdated(actorId, {
      ...auditContext,
      oldDepartments: _departmentSnapshot(before),
      newDepartments: _departmentSnapshot(updated),
    }));
  }

  return updated;
}

/** @deprecated Use editAssignment */
async function updateAssignment(actorId, assignmentId, dto, options = {}) {
  return editAssignment(actorId, assignmentId, dto, options);
}

async function deactivateAssignment(actorId, assignmentId) {
  validateUuid(actorId, 'actorId');
  validateUuid(assignmentId, 'assignmentId');

  const before = await _getById(assignmentId);
  if (!before.isActive) return before;

  const updated = await prisma.urUserAssignment.update({
    where: { id: assignmentId },
    data:  { isActive: false },
    include: ASSIGNMENT_INCLUDE,
  });

  _audit(() => auditLogger.logAssignmentDeactivated(actorId, _sanitize(before)));
  return updated;
}

async function listAssignments(userId, options = {}) {
  validateUuid(userId, 'userId');
  const { includeInactive = false } = options;

  return prisma.urUserAssignment.findMany({
    where: {
      userId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: ASSIGNMENT_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
}

async function getAssignment(assignmentId) {
  validateUuid(assignmentId, 'assignmentId');
  return _getById(assignmentId);
}

async function _getById(assignmentId) {
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

function _sanitize(obj) {
  if (!obj) return null;
  const { role, properties, departments, user, ...rest } = obj;
  return {
    ...rest,
    roleCode: role?.code,
    propertyCount:   properties?.length  ?? 0,
    departmentCount: departments?.length ?? 0,
  };
}

function _auditAwait(fn) {
  return Promise.resolve()
    .then(fn)
    .catch((e) => {
      console.error('[AssignmentService] Audit log failed (non-fatal):', e.message);
    });
}

function _audit(fn) {
  _auditAwait(fn);
}

module.exports = {
  createAssignment,
  editAssignment,
  updateAssignment,
  deactivateAssignment,
  listAssignments,
  getAssignment,
  ASSIGNMENT_INCLUDE,
};
