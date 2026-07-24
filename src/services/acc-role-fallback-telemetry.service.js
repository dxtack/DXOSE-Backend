'use strict';

/**
 * ACC Zero-Legacy — shadow telemetry when legacy authorization fallback would apply.
 * Does NOT change authorization decisions.
 */

const crypto = require('crypto');

function _safeCount(arr) {
  return Array.isArray(arr) ? arr.length : 0;
}

/**
 * @param {object} params
 * @param {import('express').Request} [params.req]
 * @param {object} [params.user]
 * @param {string} params.requestedPermission
 * @param {string} params.fallbackKind — 'static_matrix' | 'legacy_db_resolution'
 * @param {number} [params.accPermissionCount]
 * @param {number} [params.legacyPermissionCount]
 * @param {string} [params.resolutionSource]
 */
function logAccRoleFallbackHit({
  req,
  user,
  requestedPermission,
  fallbackKind,
  accPermissionCount = 0,
  legacyPermissionCount = 0,
  resolutionSource = 'unknown',
}) {
  const payload = {
    event: 'ACC_ROLE_FALLBACK_HIT',
    correlationId: req?.headers?.['x-request-id'] || crypto.randomUUID(),
    userId: user?.id ?? null,
    tenantId: user?.tenantId ?? null,
    role: user?.role ?? null,
    requestedPermission,
    route: req?.originalUrl ?? req?.url ?? null,
    method: req?.method ?? null,
    accPermissionCount: _safeCount(user?.permissions) || accPermissionCount,
    legacyPermissionCount,
    fallbackKind,
    resolutionSource,
    permissionVersion: user?.permissionVersion ?? null,
    timestamp: new Date().toISOString(),
  };

  process.stderr.write(`${JSON.stringify(payload)}\n`);
}

module.exports = {
  logAccRoleFallbackHit,
};
