/**
 * Assignment Validators & DTOs
 * ────────────────────────────
 * Input validation and DTO shape definitions for Assignment Infrastructure.
 *
 * Design decision — All Properties / All Departments:
 *
 *   RECOMMENDATION: No rows = All (implicit broadest scope).
 *
 *   • propertyIds = [] or omitted → User has access to ALL Properties for this Role.
 *   • departmentIds = [] or omitted → User has access to ALL Departments in scope.
 *
 *   Reasoning:
 *   1. Consistency with how enterprise IAM works (Azure RBAC: no scope restriction
 *      = subscription-wide; AWS IAM: no condition = all resources).
 *   2. Natural onboarding UX: create an assignment with Role only; add scope
 *      restrictions progressively as the organisation matures.
 *   3. Avoids a boolean flag that would need to stay in sync with rows — a single
 *      source of truth (row count) is cleaner.
 *   4. Easier to query: SELECT COUNT(*) FROM ur_assignment_properties WHERE
 *      assignmentId = ? → 0 means global; > 0 means restricted.
 *
 *   Callers MUST document the interpretation explicitly:
 *     "Empty properties array = All Properties (unrestricted)"
 *     "Empty departments array = All Departments within the scoped Properties"
 */

'use strict';

// ─── UUID validation regex ────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function assertUuid(value, fieldName) {
  if (!isUuid(value)) {
    throw new ValidationError(`${fieldName} must be a valid UUID, got: ${JSON.stringify(value)}`);
  }
}

function assertUuidArray(arr, fieldName) {
  if (!Array.isArray(arr)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }
  for (const item of arr) {
    if (!isUuid(item)) {
      throw new ValidationError(`${fieldName} contains an invalid UUID: ${JSON.stringify(item)}`);
    }
  }
}

// ─── Custom error ─────────────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

// ─── DTO validators ──────────────────────────────────────────────────────────

/**
 * Validate a CreateAssignment input.
 *
 * @typedef {Object} CreateAssignmentDTO
 * @property {string}   userId        - UUID of the user receiving the assignment.
 * @property {string}   roleId        - UUID of the Global Role being assigned.
 * @property {string[]} [propertyIds] - UUIDs of Tenants in scope. Empty = ALL.
 * @property {string[]} [departmentIds] - UUIDs of Departments in scope. Empty = ALL.
 * @property {string}   [notes]       - Optional human-readable notes.
 *
 * @param {CreateAssignmentDTO} dto
 * @returns {CreateAssignmentDTO}  Normalised and validated DTO
 */
function validateCreateAssignment(dto) {
  if (!dto || typeof dto !== 'object') throw new ValidationError('CreateAssignment: body is required');

  assertUuid(dto.userId,  'userId');
  assertUuid(dto.roleId,  'roleId');

  const propertyIds   = dto.propertyIds   ?? [];
  const departmentIds = dto.departmentIds ?? [];

  assertUuidArray(propertyIds,   'propertyIds');
  assertUuidArray(departmentIds, 'departmentIds');

  if (propertyIds.length > 1) {
    throw Object.assign(
      new ValidationError('Each assignment may include at most one property.'),
      { statusCode: 400, code: 'ASSIGNMENT_SINGLE_PROPERTY_ONLY' },
    );
  }

  return {
    userId:       dto.userId,
    roleId:       dto.roleId,
    notes:        typeof dto.notes === 'string' ? dto.notes.trim() || null : null,
    propertyIds,
    departmentIds,
  };
}

const EDIT_ASSIGNMENT_ALLOWED_FIELDS = new Set(['notes', 'departmentIds', 'roleId', 'propertyIds']);
const EDIT_ASSIGNMENT_FORBIDDEN_FIELDS = Object.freeze({
  isActive:     'Assignment status cannot be changed via Edit Assignment. Use deactivate or reactivate endpoints.',
});

/**
 * Validate Edit Assignment input (FY 01 P1 — notes and departments only).
 *
 * @typedef {Object} EditAssignmentDTO
 * @property {string}   [notes]
 * @property {string[]} [departmentIds] - Replace department scope. Empty = All Departments.
 *
 * @param {EditAssignmentDTO} dto
 * @returns {EditAssignmentDTO}
 */
function validateEditAssignment(dto) {
  if (!dto || typeof dto !== 'object') {
    throw new ValidationError('EditAssignment: body is required');
  }

  for (const [field, message] of Object.entries(EDIT_ASSIGNMENT_FORBIDDEN_FIELDS)) {
    if (dto[field] !== undefined) {
      throw Object.assign(new ValidationError(message), {
        statusCode: 400,
        code: 'ASSIGNMENT_EDIT_FORBIDDEN_FIELD',
      });
    }
  }

  const unknown = Object.keys(dto).filter((k) => !EDIT_ASSIGNMENT_ALLOWED_FIELDS.has(k));
  if (unknown.length > 0) {
    throw new ValidationError(
      `EditAssignment: unsupported field(s): ${unknown.join(', ')}`,
    );
  }

  const result = {};

  if (dto.roleId !== undefined) {
    assertUuid(dto.roleId, 'roleId');
    result.roleId = dto.roleId;
  }

  if (dto.propertyIds !== undefined) {
    const propertyIds = dto.propertyIds ?? [];
    assertUuidArray(propertyIds, 'propertyIds');
    if (propertyIds.length > 1) {
      throw Object.assign(
        new ValidationError('Each assignment may include at most one property.'),
        { statusCode: 400, code: 'ASSIGNMENT_SINGLE_PROPERTY_ONLY' },
      );
    }
    result.propertyIds = propertyIds;
  }

  if (dto.notes !== undefined) {
    result.notes = typeof dto.notes === 'string' ? dto.notes.trim() || null : null;
  }

  if (dto.departmentIds !== undefined) {
    const departmentIds = dto.departmentIds ?? [];
    assertUuidArray(departmentIds, 'departmentIds');
    result.departmentIds = departmentIds;
  }

  if (Object.keys(result).length === 0) {
    throw new ValidationError('EditAssignment: at least one editable field must be provided');
  }

  return result;
}

/** @deprecated Use validateEditAssignment for PATCH /assignments/:id */
function validateUpdateAssignment(dto) {
  return validateEditAssignment(dto);
}

/**
 * Validate a single UUID parameter (used for assignmentId, propertyId, departmentId).
 *
 * @param {string} value
 * @param {string} fieldName
 * @returns {string}
 */
function validateUuid(value, fieldName) {
  assertUuid(value, fieldName);
  return value;
}

module.exports = {
  ValidationError,
  validateCreateAssignment,
  validateEditAssignment,
  validateUpdateAssignment,
  validateUuid,
  isUuid,
  EDIT_ASSIGNMENT_FORBIDDEN_FIELDS,
};
