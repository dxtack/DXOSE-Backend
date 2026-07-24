/**
 * UrAuditLogger
 * ─────────────
 * Append-only logger that writes to ur_audit_events (UrAuditEvent).
 *
 * All writes are INSERT-only. No UPDATE. No DELETE.
 * This guarantees an immutable audit trail.
 *
 * Supported event actions:
 *
 *   Assignment events:
 *     ASSIGNMENT_CREATED
 *     ASSIGNMENT_UPDATED
 *     ASSIGNMENT_DEACTIVATED
 *
 *   Override events:
 *     OVERRIDE_GRANTED
 *     OVERRIDE_DENIED
 *     OVERRIDE_RESET
 *
 *   Scope events (reserved for future waves):
 *     SCOPE_PROPERTY_ADDED
 *     SCOPE_PROPERTY_REMOVED
 *     SCOPE_DEPARTMENT_ADDED
 *     SCOPE_DEPARTMENT_REMOVED
 *
 * IMPORTANT — Wave 2 Status:
 *   This logger is STANDALONE. It is not wired into any route or middleware.
 *   No existing behaviour is changed.
 *   It will be called by the UserOverrideEngine and future AssignmentService
 *   once those are wired up in later waves.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Event action constants (single source of truth) ─────────────────────────

const AuditAction = Object.freeze({
  // Assignment
  ASSIGNMENT_CREATED:      'ASSIGNMENT_CREATED',
  ASSIGNMENT_UPDATED:      'ASSIGNMENT_UPDATED',
  ASSIGNMENT_NOTES_UPDATED: 'ASSIGNMENT_NOTES_UPDATED',
  ASSIGNMENT_DEPARTMENTS_UPDATED: 'ASSIGNMENT_DEPARTMENTS_UPDATED',
  ASSIGNMENT_DEACTIVATED:  'ASSIGNMENT_DEACTIVATED',
  ASSIGNMENT_REACTIVATED:  'ASSIGNMENT_REACTIVATED',
  ASSIGNMENT_DELETED:      'ASSIGNMENT_DELETED',

  // Override
  OVERRIDE_GRANTED:        'OVERRIDE_GRANTED',
  OVERRIDE_DENIED:         'OVERRIDE_DENIED',
  OVERRIDE_RESET:          'OVERRIDE_RESET',

  // Shadow mode (ACC S8 — observability only, never enforces)
  SHADOW_MISMATCH:         'SHADOW_MISMATCH',

  // Workflow shadow (ACC S11 — observability only, never enforces)
  WORKFLOW_SHADOW_MISMATCH:'WORKFLOW_SHADOW_MISMATCH',

  // Advanced policies (ACC S12 — configuration + observe only)
  FIELD_SECURITY_CONFIGURED: 'FIELD_SECURITY_CONFIGURED',
  USER_EXCEPTION_CONFIGURED:   'USER_EXCEPTION_CONFIGURED',
  SCHEDULED_ACCESS_CONFIGURED: 'SCHEDULED_ACCESS_CONFIGURED',
  POLICY_OBSERVATION:          'POLICY_OBSERVATION',

  // Scope — reserved
  SCOPE_PROPERTY_ADDED:    'SCOPE_PROPERTY_ADDED',
  SCOPE_PROPERTY_REMOVED:  'SCOPE_PROPERTY_REMOVED',
  SCOPE_DEPARTMENT_ADDED:  'SCOPE_DEPARTMENT_ADDED',
  SCOPE_DEPARTMENT_REMOVED:'SCOPE_DEPARTMENT_REMOVED',

  // Role registry (ACC P1)
  ROLE_CREATED:            'ROLE_CREATED',
  ROLE_CLONED:             'ROLE_CLONED',
  ROLE_METADATA_UPDATED:     'ROLE_METADATA_UPDATED',
  ROLE_PERMISSIONS_UPDATED:  'ROLE_PERMISSIONS_UPDATED',
  ROLE_RETIRED:              'ROLE_RETIRED',
  ROLE_REACTIVATED:          'ROLE_REACTIVATED',

  // Workflow Builder (ACC S10+ governance)
  WORKFLOW_VERSION_CREATED:       'WORKFLOW_VERSION_CREATED',
  WORKFLOW_VERSION_STEPS_UPDATED: 'WORKFLOW_VERSION_STEPS_UPDATED',
  WORKFLOW_VERSION_PUBLISHED:     'WORKFLOW_VERSION_PUBLISHED',
  WORKFLOW_VERSION_ARCHIVED:      'WORKFLOW_VERSION_ARCHIVED',
  WORKFLOW_VERSION_DELETED:       'WORKFLOW_VERSION_DELETED',
  WORKFLOW_VERSION_CLONED:        'WORKFLOW_VERSION_CLONED',
  WORKFLOW_VERSION_RESTORED:      'WORKFLOW_VERSION_RESTORED',
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generic log entry — used by all specific helpers below.
 *
 * @param {AuditEventInput} input
 * @param {import('@prisma/client').Prisma.TransactionClient} [client] — optional
 *        transaction client. When provided (SF-007), the audit INSERT participates in the
 *        caller's transaction so the state mutation and its audit record commit or roll back
 *        together. Defaults to the module Prisma client for standalone (post-commit) callers.
 * @returns {Promise<import('@prisma/client').UrAuditEvent>}
 */
async function log(input, client = prisma) {
  const {
    actorId,
    action,
    targetUserId   = null,
    targetRoleId   = null,
    targetEntityId = null,
    entityType     = null,
    oldValue       = null,
    newValue       = null,
  } = input;

  if (!actorId) throw new Error('UrAuditLogger: actorId is required');
  if (!action)  throw new Error('UrAuditLogger: action is required');

  return (client || prisma).urAuditEvent.create({
    data: {
      actorId,
      action,
      targetUserId,
      targetRoleId,
      targetEntityId,
      entityType,
      oldValue:  oldValue  ? JSON.parse(JSON.stringify(oldValue))  : null,
      newValue:  newValue  ? JSON.parse(JSON.stringify(newValue))  : null,
    },
  });
}

// ── Assignment helpers ────────────────────────────────────────────────────────

/**
 * @param {string} actorId
 * @param {object} assignment  - UrUserAssignment row
 */
async function logAssignmentCreated(actorId, payload) {
  return log({
    actorId,
    action:         AuditAction.ASSIGNMENT_CREATED,
    targetUserId:   payload.userId,
    targetRoleId:   payload.roleId,
    targetEntityId: payload.assignmentId ?? payload.id,
    entityType:     'UrUserAssignment',
    newValue:       payload,
  });
}

/**
 * @param {string} actorId
 * @param {object} oldAssignment
 * @param {object} newAssignment
 */
async function logAssignmentUpdated(actorId, oldAssignment, newAssignment) {
  return log({
    actorId,
    action:         AuditAction.ASSIGNMENT_UPDATED,
    targetUserId:   newAssignment.userId,
    targetRoleId:   newAssignment.roleId,
    targetEntityId: newAssignment.id,
    entityType:     'UrUserAssignment',
    oldValue:       oldAssignment,
    newValue:       newAssignment,
  });
}

/**
 * @param {string} actorId
 * @param {object} assignment
 */
async function logAssignmentDeactivated(actorId, payload, client) {
  return log({
    actorId,
    action:         AuditAction.ASSIGNMENT_DEACTIVATED,
    targetUserId:   payload.userId,
    targetRoleId:   payload.roleId,
    targetEntityId: payload.assignmentId,
    entityType:     'UrUserAssignment',
    oldValue:       {
      isActive:      true,
      roleCode:      payload.roleCode,
      roleName:      payload.roleName,
      propertyId:    payload.propertyId,
      propertyName:  payload.propertyName,
      departments:   payload.departments,
      actorRoleCode: payload.actorRoleCode,
      userEmail:     payload.userEmail,
      userName:      payload.userName,
    },
    newValue:       {
      isActive:      false,
      roleCode:      payload.roleCode,
      roleName:      payload.roleName,
      propertyId:    payload.propertyId,
      propertyName:  payload.propertyName,
      departments:   payload.departments,
      actorRoleCode: payload.actorRoleCode,
      userEmail:     payload.userEmail,
      userName:      payload.userName,
    },
  }, client);
}

async function logAssignmentReactivated(actorId, payload, client) {
  return log({
    actorId,
    action:         AuditAction.ASSIGNMENT_REACTIVATED,
    targetUserId:   payload.userId,
    targetRoleId:   payload.roleId,
    targetEntityId: payload.assignmentId,
    entityType:     'UrUserAssignment',
    oldValue:       { isActive: false },
    newValue:       {
      isActive:      true,
      roleCode:      payload.roleCode,
      roleName:      payload.roleName,
      propertyId:    payload.propertyId,
      propertyName:  payload.propertyName,
      departments:   payload.departments,
      actorRoleCode: payload.actorRoleCode,
      userEmail:     payload.userEmail,
      userName:      payload.userName,
    },
  }, client);
}

async function logAssignmentDeleted(actorId, payload, client) {
  return log({
    actorId,
    action:         AuditAction.ASSIGNMENT_DELETED,
    targetUserId:   payload.userId,
    targetRoleId:   payload.roleId,
    targetEntityId: payload.assignmentId,
    entityType:     'UrUserAssignment',
    oldValue:       {
      roleCode:      payload.roleCode,
      roleName:      payload.roleName,
      propertyId:    payload.propertyId,
      propertyName:  payload.propertyName,
      departments:   payload.departments,
      actorRoleCode: payload.actorRoleCode,
      userEmail:     payload.userEmail,
      userName:      payload.userName,
    },
    newValue:       null,
  }, client);
}

/**
 * @param {string} actorId
 * @param {object} payload — enriched edit context
 */
async function logAssignmentNotesUpdated(actorId, payload) {
  return log({
    actorId,
    action:         AuditAction.ASSIGNMENT_NOTES_UPDATED,
    targetUserId:   payload.userId,
    targetRoleId:   payload.roleId,
    targetEntityId: payload.assignmentId,
    entityType:     'UrUserAssignment',
    oldValue:       {
      notes:         payload.oldNotes,
      roleCode:      payload.roleCode,
      roleName:      payload.roleName,
      propertyId:    payload.propertyId,
      propertyName:  payload.propertyName,
      actorRoleCode: payload.actorRoleCode,
      userEmail:     payload.userEmail,
      userName:      payload.userName,
    },
    newValue:       {
      notes:         payload.newNotes,
      roleCode:      payload.roleCode,
      roleName:      payload.roleName,
      propertyId:    payload.propertyId,
      propertyName:  payload.propertyName,
      actorRoleCode: payload.actorRoleCode,
      userEmail:     payload.userEmail,
      userName:      payload.userName,
    },
  });
}

/**
 * @param {string} actorId
 * @param {object} payload — enriched edit context with old/new department arrays
 */
async function logAssignmentDepartmentsUpdated(actorId, payload) {
  return log({
    actorId,
    action:         AuditAction.ASSIGNMENT_DEPARTMENTS_UPDATED,
    targetUserId:   payload.userId,
    targetRoleId:   payload.roleId,
    targetEntityId: payload.assignmentId,
    entityType:     'UrUserAssignment',
    oldValue:       {
      departments:   payload.oldDepartments,
      roleCode:      payload.roleCode,
      roleName:      payload.roleName,
      propertyId:    payload.propertyId,
      propertyName:  payload.propertyName,
      actorRoleCode: payload.actorRoleCode,
      userEmail:     payload.userEmail,
      userName:      payload.userName,
    },
    newValue:       {
      departments:   payload.newDepartments,
      roleCode:      payload.roleCode,
      roleName:      payload.roleName,
      propertyId:    payload.propertyId,
      propertyName:  payload.propertyName,
      actorRoleCode: payload.actorRoleCode,
      userEmail:     payload.userEmail,
      userName:      payload.userName,
    },
  });
}

// ── Override helpers ──────────────────────────────────────────────────────────

/**
 * @param {string} actorId
 * @param {object} override  - UrUserOverride row (isGranted = true)
 */
async function logOverrideGranted(actorId, override) {
  return log({
    actorId,
    action:         AuditAction.OVERRIDE_GRANTED,
    targetUserId:   override.userId,
    targetEntityId: override.id,
    entityType:     'UrUserOverride',
    newValue:       override,
  });
}

/**
 * @param {string} actorId
 * @param {object} override  - UrUserOverride row (isGranted = false)
 */
async function logOverrideDenied(actorId, override) {
  return log({
    actorId,
    action:         AuditAction.OVERRIDE_DENIED,
    targetUserId:   override.userId,
    targetEntityId: override.id,
    entityType:     'UrUserOverride',
    newValue:       override,
  });
}

/**
 * @param {string} actorId
 * @param {object} context  - { userId, permissionId, assignmentId }
 */
async function logOverrideReset(actorId, context) {
  return log({
    actorId,
    action:        AuditAction.OVERRIDE_RESET,
    targetUserId:  context.userId,
    entityType:    'UrUserOverride',
    oldValue:      context,
  });
}

// ── Scope helpers (reserved — Wave 3+) ───────────────────────────────────────

async function logScopePropertyAdded(actorId, assignmentProperty) {
  return log({ actorId, action: AuditAction.SCOPE_PROPERTY_ADDED, targetEntityId: assignmentProperty.id, entityType: 'UrAssignmentProperty', newValue: assignmentProperty });
}

async function logScopePropertyRemoved(actorId, assignmentProperty) {
  return log({ actorId, action: AuditAction.SCOPE_PROPERTY_REMOVED, targetEntityId: assignmentProperty.id, entityType: 'UrAssignmentProperty', oldValue: assignmentProperty });
}

async function logScopeDepartmentAdded(actorId, assignmentDept) {
  return log({ actorId, action: AuditAction.SCOPE_DEPARTMENT_ADDED, targetEntityId: assignmentDept.id, entityType: 'UrAssignmentDepartment', newValue: assignmentDept });
}

async function logScopeDepartmentRemoved(actorId, assignmentDept) {
  return log({ actorId, action: AuditAction.SCOPE_DEPARTMENT_REMOVED, targetEntityId: assignmentDept.id, entityType: 'UrAssignmentDepartment', oldValue: assignmentDept });
}

// ── Role registry helpers (ACC P1) ───────────────────────────────────────────

async function logRoleCreated(actorId, role, extra = {}) {
  return log({
    actorId,
    action:       AuditAction.ROLE_CREATED,
    targetRoleId: role.id,
    entityType:   'ROLE',
    newValue:     { ...role, ...extra },
  });
}

async function logRoleCloned(actorId, sourceRole, newRole, extra = {}) {
  return log({
    actorId,
    action:       AuditAction.ROLE_CLONED,
    targetRoleId: newRole.id,
    entityType:   'ROLE',
    oldValue:     { sourceRoleCode: sourceRole.code, sourceRoleId: sourceRole.id },
    newValue:     { ...newRole, ...extra },
  });
}

async function logRoleMetadataUpdated(actorId, before, after) {
  return log({
    actorId,
    action:       AuditAction.ROLE_METADATA_UPDATED,
    targetRoleId: after.id,
    entityType:   'ROLE',
    oldValue:     { name: before.name, description: before.description ?? null },
    newValue:     { name: after.name, description: after.description ?? null },
  });
}

async function logRolePermissionsUpdated(actorId, roleId, oldValue, newValue) {
  return log({
    actorId,
    action:       AuditAction.ROLE_PERMISSIONS_UPDATED,
    targetRoleId: roleId,
    entityType:   'ROLE',
    oldValue,
    newValue,
  });
}

async function logRoleRetired(actorId, role, extra = {}) {
  return log({
    actorId,
    action:       AuditAction.ROLE_RETIRED,
    targetRoleId: role.id,
    entityType:   'ROLE',
    oldValue:     { isActive: true },
    newValue:     { isActive: false, ...extra },
  });
}

async function logRoleReactivated(actorId, before, after) {
  return log({
    actorId,
    action:       AuditAction.ROLE_REACTIVATED,
    targetRoleId: after.id,
    entityType:   'ROLE',
    oldValue:     { isActive: false },
    newValue:     { isActive: true },
  });
}

// ── Workflow Builder helpers (ACC governance) ───────────────────────────────

/**
 * @param {string} actorId
 * @param {string} action - One of WORKFLOW_VERSION_* AuditAction constants
 * @param {object} payload - { versionId, definitionId, versionNumber, status, ... }
 */
async function logWorkflowVersionEvent(actorId, action, payload) {
  return log({
    actorId,
    action,
    targetEntityId: payload.versionId ?? null,
    entityType:     'AccWorkflowVersion',
    newValue:       payload,
  });
}

// ─── JSDoc Types ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AuditEventInput
 * @property {string}      actorId
 * @property {string}      action          - One of AuditAction constants
 * @property {string|null} [targetUserId]
 * @property {string|null} [targetRoleId]
 * @property {string|null} [targetEntityId]
 * @property {string|null} [entityType]
 * @property {object|null} [oldValue]
 * @property {object|null} [newValue]
 */

module.exports = {
  AuditAction,
  log,
  logAssignmentCreated,
  logAssignmentUpdated,
  logAssignmentNotesUpdated,
  logAssignmentDepartmentsUpdated,
  logAssignmentDeactivated,
  logAssignmentReactivated,
  logAssignmentDeleted,
  logOverrideGranted,
  logOverrideDenied,
  logOverrideReset,
  logScopePropertyAdded,
  logScopePropertyRemoved,
  logScopeDepartmentAdded,
  logScopeDepartmentRemoved,
  logRoleCreated,
  logRoleCloned,
  logRoleMetadataUpdated,
  logRolePermissionsUpdated,
  logRoleRetired,
  logRoleReactivated,
  logWorkflowVersionEvent,
};
