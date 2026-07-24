/**
 * UserOverrideEngine
 * ──────────────────
 * Manages per-user permission overrides stored in ur_user_overrides.
 *
 * Supported operations:
 *   • grant  — Explicitly GRANT a permission to a user (isGranted = true).
 *              Adds access even when the user's Role does not include the permission.
 *   • deny   — Explicitly DENY a permission from a user (isGranted = false).
 *              Removes access even when the user's Role grants the permission.
 *   • reset  — Remove the override entirely, restoring Role Default behaviour.
 *
 * Override scope:
 *   • assignmentId = null   → Global override (applies across all assignments).
 *   • assignmentId = <uuid> → Assignment-scoped override (applies only when
 *                             the user is evaluated under that specific assignment).
 *
 * Conflict rule (enforced by PermissionResolutionEngine):
 *   DENY always wins over GRANT when the same user has conflicting overrides
 *   across assignments.
 *
 * IMPORTANT — Wave 2 Status:
 *   This engine is STANDALONE and INACTIVE. It does NOT enforce anything.
 *   It is not wired into any route, middleware, or guard.
 *   No existing behaviour is changed.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const {
  logOverrideGranted,
  logOverrideDenied,
  logOverrideReset,
} = require('./ur-audit.logger');

const prisma = new PrismaClient();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Explicitly GRANT a permission to a user.
 * If an override already exists for this (userId, assignmentId, permissionId)
 * triple it is updated to isGranted = true (upsert).
 *
 * @param {string}      userId
 * @param {string}      permissionId  - UUID of UrPermission
 * @param {OverrideOptions} [options]
 * @returns {Promise<import('@prisma/client').UrUserOverride>}
 */
async function grant(userId, permissionId, options = {}) {
  const { assignmentId = null, reason = null, expiresAt = null, actorId = null } = options;

  _validate({ userId, permissionId });

  const override = await prisma.urUserOverride.upsert({
    where: {
      userId_assignmentId_permissionId: { userId, assignmentId, permissionId },
    },
    create: { userId, permissionId, assignmentId, isGranted: true, reason, expiresAt },
    update: { isGranted: true, reason, expiresAt, updatedAt: new Date() },
  });

  if (actorId) {
    await logOverrideGranted(actorId, override).catch(() => {});
  }

  return override;
}

/**
 * Explicitly DENY a permission from a user.
 * If an override already exists it is updated to isGranted = false (upsert).
 *
 * @param {string}      userId
 * @param {string}      permissionId  - UUID of UrPermission
 * @param {OverrideOptions} [options]
 * @returns {Promise<import('@prisma/client').UrUserOverride>}
 */
async function deny(userId, permissionId, options = {}) {
  const { assignmentId = null, reason = null, expiresAt = null, actorId = null } = options;

  _validate({ userId, permissionId });

  const override = await prisma.urUserOverride.upsert({
    where: {
      userId_assignmentId_permissionId: { userId, assignmentId, permissionId },
    },
    create: { userId, permissionId, assignmentId, isGranted: false, reason, expiresAt },
    update: { isGranted: false, reason, expiresAt, updatedAt: new Date() },
  });

  if (actorId) {
    await logOverrideDenied(actorId, override).catch(() => {});
  }

  return override;
}

/**
 * Reset (remove) a user's override for a permission.
 * After reset the user inherits the permission from their Role Default.
 * If no override exists this is a no-op (does not throw).
 *
 * @param {string}  userId
 * @param {string}  permissionId
 * @param {string|null} [assignmentId]
 * @returns {Promise<{ deleted: boolean }>}
 */
async function reset(userId, permissionId, assignmentId = null, options = {}) {
  const { actorId = null } = options ?? {};

  _validate({ userId, permissionId });

  const deleted = await prisma.urUserOverride.deleteMany({
    where: { userId, permissionId, assignmentId },
  });

  if (actorId && deleted.count > 0) {
    await logOverrideReset(actorId, { userId, permissionId, assignmentId }).catch(() => {});
  }

  return { deleted: deleted.count > 0 };
}

/**
 * List all current overrides for a user.
 *
 * @param {string} userId
 * @param {string|null} [assignmentId]  - Filter by assignment (optional).
 * @returns {Promise<UrUserOverride[]>}
 */
async function listOverrides(userId, assignmentId = undefined) {
  _validate({ userId });

  const where = { userId };
  if (assignmentId !== undefined) {
    where.assignmentId = assignmentId;
  }

  return prisma.urUserOverride.findMany({
    where,
    include: {
      permission: {
        select: { legacyCode: true, name: true, resource: { select: { name: true } }, action: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _validate({ userId, permissionId } = {}) {
  if (userId !== undefined && !userId) throw new Error('UserOverrideEngine: userId is required');
  if (permissionId !== undefined && !permissionId) throw new Error('UserOverrideEngine: permissionId is required');
}

// ─── JSDoc Types ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} OverrideOptions
 * @property {string|null}   [assignmentId]  - Scope to a specific assignment (null = global).
 * @property {string|null}   [reason]        - Human-readable reason for the override.
 * @property {Date|null}     [expiresAt]     - Optional expiry; null = permanent.
 * @property {string|null}   [actorId]       - Admin performing the change (audit only).
 */

module.exports = { grant, deny, reset, listOverrides };
