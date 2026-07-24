/**
 * PermissionResolutionEngine
 * ──────────────────────────
 * Calculates the effective (final) set of permission codes for a given user
 * by evaluating:
 *
 *   1. Active Assignments  (UrUserAssignment where userId=? AND isActive=true)
 *   2. Role Permissions    (UrRolePermission for each assigned role → UNION)
 *   3. User Overrides      (UrUserOverride — DENY beats GRANT)
 *   4. Final effective set of legacyCodes
 *
 * IMPORTANT — Wave 2 Status:
 *   This engine is STANDALONE and INACTIVE. It does NOT enforce anything.
 *   It is not wired into any middleware, route, or guard.
 *   No existing behaviour is changed. Shadow evaluation only (not yet called).
 *
 * Resolution Rules:
 *   • Multiple assignments → UNION their role permissions.
 *   • isGranted = true  (GRANT override) → permission added even if role omits it.
 *   • isGranted = false (DENY  override) → permission removed even if role grants it.
 *   • DENY wins: if a user has one assignment granting P and another denying P
 *     via override, P is DENIED in the final set.
 *   • Expired overrides (expiresAt < now) are ignored.
 *
 * NOT handled yet (future waves):
 *   • Property / Department scope filtering.
 *   • UrUserPermissionOverride (Phase 1 legacy model — see note at bottom).
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve the effective permission legacy-codes for a user.
 *
 * @param {string} userId  - UUID of the user
 * @returns {Promise<EffectivePermissions>}
 */
async function resolveEffectivePermissions(userId) {
  if (!userId) throw new Error('resolveEffectivePermissions: userId is required');

  // ── Step 1: Active assignments ────────────────────────────────────────────
  const assignments = await prisma.urUserAssignment.findMany({
    where: { userId, isActive: true },
    select: { id: true, roleId: true },
  });

  const roleIds = [...new Set(assignments.map((a) => a.roleId))];

  // ── Step 2: UNION of role permissions ─────────────────────────────────────
  let roleGrantedCodes = new Set();

  if (roleIds.length > 0) {
    const rolePerms = await prisma.urRolePermission.findMany({
      where: { roleId: { in: roleIds } },
      select: {
        permission: { select: { legacyCode: true } },
      },
    });
    for (const rp of rolePerms) {
      roleGrantedCodes.add(rp.permission.legacyCode);
    }
  }

  // ── Step 3: User overrides ─────────────────────────────────────────────────
  const assignmentIds = assignments.map((a) => a.id);
  const now = new Date();

  const overrides = await prisma.urUserOverride.findMany({
    where: {
      userId,
      AND: [
        {
          OR: [
            ...(assignmentIds.length > 0 ? [{ assignmentId: { in: assignmentIds } }] : []),
            { assignmentId: null },
          ],
        },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
      ],
    },
    select: {
      isGranted: true,
      permission: { select: { legacyCode: true } },
    },
  });

  // Separate explicit grants and denies
  const explicitGrants = new Set();
  const explicitDenies = new Set();

  for (const o of overrides) {
    if (o.isGranted) {
      explicitGrants.add(o.permission.legacyCode);
    } else {
      explicitDenies.add(o.permission.legacyCode);
    }
  }

  // ── Step 4: Build final effective set ─────────────────────────────────────
  const effective = new Set(roleGrantedCodes);

  for (const code of explicitGrants) {
    effective.add(code);
  }

  for (const code of explicitDenies) {
    effective.delete(code);
  }

  return {
    userId,
    resolutionMode: 'global-union',
    sessionAligned: false,
    assignmentCount: assignments.length,
    sessionAssignmentId: null,
    roleIds,
    effectiveCodes: [...effective],
    explicitGrantCodes: [...explicitGrants],
    explicitDenyCodes: [...explicitDenies],
    roleGrantedCodes: [...roleGrantedCodes],
  };
}

/**
 * Session-scoped effective permissions — aligns with acc-runtime session assignment selection.
 * Falls back to global union when no session assignment is linked.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {object|null} [params.membership] — active TenantMember for session tenant
 * @param {string|null} [params.roleId]
 * @param {string|null} [params.roleCode]
 */
async function resolveEffectivePermissionsForSession({
  userId,
  membership = null,
  roleId = null,
  roleCode = null,
}) {
  const {
    resolveAccPermissionsForMembership,
    _findSessionAssignment,
  } = require('../acc-runtime/resolvePermissions');

  const global = await resolveEffectivePermissions(userId);

  if (!userId || !membership) {
    return {
      ...global,
      knownLimitation: 'No session membership — showing global assignment union.',
    };
  }

  const assignment = await _findSessionAssignment(userId, membership, roleId ?? membership.roleId);
  const accCodes = await resolveAccPermissionsForMembership({
    userId,
    membership,
    roleId: roleId ?? membership.roleId,
    roleCode,
  });

  if (!assignment || !accCodes || accCodes.length === 0) {
    return {
      ...global,
      sessionAligned: false,
      knownLimitation: assignment
        ? 'Session assignment found but ACC permission path empty — global union shown.'
        : 'No UrUserAssignment linked to TenantMember — run assignment backfill.',
    };
  }

  return {
    userId,
    resolutionMode: 'session-scoped',
    sessionAligned: true,
    assignmentCount: global.assignmentCount,
    sessionAssignmentId: assignment.id,
    roleIds: [assignment.roleId],
    effectiveCodes: accCodes,
    explicitGrantCodes: global.explicitGrantCodes,
    explicitDenyCodes: global.explicitDenyCodes,
    roleGrantedCodes: accCodes,
    knownLimitation: 'Session preview uses acc-runtime path; JWT may still drift until P3.',
  };
}

/**
 * Check whether a user has a specific permission (by legacyCode).
 *
 * @param {string} userId
 * @param {string} permissionCode  - e.g. 'GRN_CREATE'
 * @returns {Promise<boolean>}
 */
async function hasPermission(userId, permissionCode) {
  const result = await resolveEffectivePermissions(userId);
  return result.effectiveCodes.includes(permissionCode);
}

// ─── JSDoc Types ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} EffectivePermissions
 * @property {string}   userId
 * @property {string}   resolutionMode
 * @property {boolean}  sessionAligned
 * @property {number}   assignmentCount
 * @property {string|null} sessionAssignmentId
 * @property {string[]} roleIds
 * @property {string[]} effectiveCodes      - Final allowed legacy codes
 * @property {string[]} explicitGrantCodes  - Override GRANTs applied
 * @property {string[]} explicitDenyCodes   - Override DENYs applied
 * @property {string[]} roleGrantedCodes    - Union from roles (before overrides)
 * @property {string|null} [knownLimitation]
 */

module.exports = {
  resolveEffectivePermissions,
  resolveEffectivePermissionsForSession,
  hasPermission,
};

// ─── Architecture Note: UrUserPermissionOverride vs UrUserOverride ────────────
//
// UrUserPermissionOverride  (Phase 1 — ur_user_permission_overrides)
//   Created in Phase 1 as a silent foundation placeholder.
//   Shape: User + Tenant + Permission → isAllowed (Boolean)
//   Scope: Single-tenant (tenantId is required).
//   Status: NOT read by this engine. Preserved for backward compatibility.
//
// UrUserOverride  (Wave 1 — ur_user_overrides)
//   Created in Wave 1 as part of the Assignment-based identity model.
//   Shape: User + Assignment? + Permission → isGranted (Boolean)
//   Scope: Global (assignmentId null) or Assignment-scoped.
//   Status: READ by this engine. Source of truth for Wave 2+.
//
// Migration Strategy (future waves):
//   When the Access Control Center UI becomes the control center,
//   UrUserPermissionOverride rows will be migrated into UrUserOverride
//   and UrUserPermissionOverride will be retired. Until then, both co-exist.
//   DO NOT delete UrUserPermissionOverride.
//
// ─── Architecture Note: UrUserScope vs UrAssignmentProperty / UrAssignmentDepartment
//
// UrUserScope  (Phase 1 — ur_user_scopes)
//   Generic scope model: User + Tenant + scopeType (string) + targetId (UUID).
//   Flexible but weakly typed — no referential integrity to specific tables.
//   Status: Preserved. Not read by this engine yet.
//
// UrAssignmentProperty / UrAssignmentDepartment  (Wave 1)
//   Strongly typed junction tables tied to UrUserAssignment.
//   Enforce referential integrity (→ Tenant, → Department).
//   Status: SOURCE OF TRUTH for scope in Wave 2+.
//
// Migration Strategy (future waves):
//   UrUserScope rows will be migrated into UrAssignmentProperty /
//   UrAssignmentDepartment once Assignments are created for existing users.
//   UrUserScope will then be retired. Until then, both co-exist.
//   DO NOT delete UrUserScope.
