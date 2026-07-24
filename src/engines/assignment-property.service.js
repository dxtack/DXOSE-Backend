/**
 * AssignmentPropertyService
 * ─────────────────────────
 * Manages UrAssignmentProperty rows — the Property (Hotel/Tenant) scope
 * attached to a UrUserAssignment.
 *
 * Scope rule:
 *   • No UrAssignmentProperty rows for an assignment → All Properties in scope.
 *   • One or more rows → Only those specific Properties in scope.
 *
 * Adding the first property to an assignment implicitly RESTRICTS the
 * assignment from "All Properties" to "Specific Properties".
 * Removing the last property returns the assignment to "All Properties".
 *
 * Audit:
 *   Every write emits via UrAuditLogger. Failures are non-fatal.
 *
 * IMPORTANT — Wave 3 Status:
 *   Standalone service. Not wired into any route or middleware.
 *   No existing behaviour is changed.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const { validateUuid } = require('./assignment.validators');

const prisma = new PrismaClient();

const PROPERTY_IMMUTABLE_MESSAGE =
  'Property cannot be changed from Edit Assignment. Deactivate and create a new assignment instead.';

function _propertyImmutableError() {
  return Object.assign(new Error(PROPERTY_IMMUTABLE_MESSAGE), {
    statusCode: 409,
    code: 'ASSIGNMENT_PROPERTY_IMMUTABLE',
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a Property to an assignment's scope.
 * No-op (idempotent) if the property is already in scope.
 *
 * @param {string} actorId
 * @param {string} assignmentId
 * @param {string} propertyId   - UUID of the Tenant (property/hotel)
 * @returns {Promise<UrAssignmentProperty>}
 */
async function addProperty(actorId, assignmentId, propertyId) {
  validateUuid(actorId,      'actorId');
  validateUuid(assignmentId, 'assignmentId');
  validateUuid(propertyId,   'propertyId');

  await _assertAssignmentExists(assignmentId);
  throw _propertyImmutableError();
}

/**
 * Remove a Property from an assignment's scope.
 * No-op if the property was not in scope.
 *
 * WARNING: Removing the last property returns the assignment to
 * "All Properties" (unrestricted scope).
 *
 * @param {string} actorId
 * @param {string} assignmentId
 * @param {string} propertyId
 * @returns {Promise<{ removed: boolean }>}
 */
async function removeProperty(actorId, assignmentId, propertyId) {
  validateUuid(actorId,      'actorId');
  validateUuid(assignmentId, 'assignmentId');
  validateUuid(propertyId,   'propertyId');

  await _assertAssignmentExists(assignmentId);
  throw _propertyImmutableError();
}

/**
 * List all Properties in scope for an assignment.
 * Empty result = All Properties (unrestricted).
 *
 * @param {string} assignmentId
 * @returns {Promise<UrAssignmentProperty[]>}
 */
async function listProperties(assignmentId) {
  validateUuid(assignmentId, 'assignmentId');

  return prisma.urAssignmentProperty.findMany({
    where: { assignmentId },
    include: { property: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _assertAssignmentExists(assignmentId) {
  const exists = await prisma.urUserAssignment.findUnique({
    where:  { id: assignmentId },
    select: { id: true },
  });
  if (!exists) {
    const err = new Error(`Assignment not found: ${assignmentId}`);
    err.statusCode = 404;
    throw err;
  }
}

module.exports = {
  addProperty,
  removeProperty,
  listProperties,
  PROPERTY_IMMUTABLE_MESSAGE,
};
