'use strict';

/**
 * ACC Zero-Legacy — permission resolution: ACC canonical data only (fail closed).
 */

const prisma = require('../config/database');
const {
  getRoleIdByCode,
  normalizeRole,
  applyRolePermissionPolicy,
  roleHasUrPermissions,
} = require('../services/rbac.service');
const { isAccEnforcePermissionsActiveForTenant } = require('./featureFlags');
const { logAccRoleFallbackHit } = require('../services/acc-role-fallback-telemetry.service');

const _sortedSet = (codes) => [...new Set(codes || [])].sort();

const _setsEqual = (a, b) => {
  const sa = _sortedSet(a);
  const sb = _sortedSet(b);
  if (sa.length !== sb.length) return false;
  return sa.every((c, i) => c === sb[i]);
};

async function _loadOverridesForAssignment(userId, assignmentId) {
  const now = new Date();
  return prisma.urUserOverride.findMany({
    where: {
      userId,
      AND: [
        {
          OR: [{ assignmentId }, { assignmentId: null }],
        },
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      ],
    },
    select: {
      isGranted: true,
      permission: { select: { legacyCode: true } },
    },
  });
}

async function _applyOverrides(baseCodes, overrides) {
  const effective = new Set(baseCodes);
  for (const o of overrides) {
    if (o.isGranted) effective.add(o.permission.legacyCode);
    else effective.delete(o.permission.legacyCode);
  }
  return [...effective];
}

async function _loadUrRolePermissionCodes(roleId) {
  if (!roleId) return [];
  const rows = await prisma.urRolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { legacyCode: true } } },
  });
  return rows.map((r) => r.permission.legacyCode);
}

async function _loadRolePermissionCodes(roleId, roleCode) {
  if (!roleId) return [];
  const rc = normalizeRole(roleCode);
  const urConfigured = await roleHasUrPermissions(roleId);
  if (urConfigured) {
    return applyRolePermissionPolicy(rc, await _loadUrRolePermissionCodes(roleId));
  }

  // P1 #23 / Phase 3 P9 — no legacy role_permissions fallback for any role
  // (active or inactive). Authority is UR-only when UR is configured; otherwise [].
  return applyRolePermissionPolicy(rc, []);
}

async function _findSessionAssignment(userId, membership, roleId) {
  if (membership?.id) {
    const byTag = await prisma.urUserAssignment.findFirst({
      where: {
        userId,
        isActive: true,
        notes: { startsWith: `legacy:${membership.id}` },
      },
      select: { id: true, roleId: true },
    });
    if (byTag) return byTag;
  }

  if (roleId) {
    const where = { userId, roleId, isActive: true };
    if (membership?.tenantId) {
      where.properties = { some: { propertyId: membership.tenantId } };
    }
    const byRole = await prisma.urUserAssignment.findFirst({
      where,
      select: { id: true, roleId: true },
    });
    if (byRole) return byRole;
  }

  return null;
}

/**
 * ACC assignment path for the active session membership.
 * @returns {Promise<string[]>} canonical permission codes (may be empty)
 */
async function resolveAccPermissionsForMembership({ userId, membership, roleId, roleCode }) {
  if (!userId) return [];

  const rc = normalizeRole(roleCode);
  const assignment = await _findSessionAssignment(userId, membership, roleId);
  if (!assignment) return [];

  let codes = await _loadRolePermissionCodes(assignment.roleId, rc);
  if (codes.length === 0) return [];

  const overrides = await _loadOverridesForAssignment(userId, assignment.id);
  codes = await _applyOverrides(codes, overrides);
  return applyRolePermissionPolicy(rc, codes);
}

/**
 * Resolve permissions — ACC canonical only; empty on miss/error (no legacy fallback).
 */
async function resolvePermissionsForMembership({
  userId,
  membership = null,
  roleId,
  roleCode,
  tenantId = null,
  tenantSlug = null,
  telemetryContext = null,
}) {
  const enforceActive = isAccEnforcePermissionsActiveForTenant({
    tenantId: tenantId ?? membership?.tenantId ?? membership?.tenant?.id ?? null,
    tenantSlug: tenantSlug ?? membership?.tenant?.slug ?? null,
    membership,
  });

  if (!enforceActive) {
    process.stderr.write(
      `[ACC_ENFORCE_INACTIVE] userId=${userId} tenantSlug=${tenantSlug ?? membership?.tenant?.slug ?? 'unknown'} — returning []\n`,
    );
    return [];
  }

  try {
    const acc = await resolveAccPermissionsForMembership({
      userId,
      membership,
      roleId,
      roleCode,
    });
    return Array.isArray(acc) ? acc : [];
  } catch (err) {
    process.stderr.write(
      `[ACC_RESOLVE_ERROR] userId=${userId} reason=${err?.message ?? err}\n`,
    );
    if (telemetryContext) {
      logAccRoleFallbackHit({
        req: telemetryContext,
        user: telemetryContext?.user,
        requestedPermission: 'session_resolution',
        fallbackKind: 'legacy_db_resolution',
        accPermissionCount: 0,
        resolutionSource: 'resolvePermissions.error',
      });
    }
    return [];
  }
}

module.exports = {
  resolvePermissionsForMembership,
  resolveAccPermissionsForMembership,
  _findSessionAssignment,
  _setsEqual,
};
