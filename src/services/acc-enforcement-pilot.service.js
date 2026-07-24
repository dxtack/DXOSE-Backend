'use strict';

/**
 * ACC Big Bang S14 — controlled permission enforcement pilot helpers.
 * Global and tenant-scoped activation with read-only status for operators.
 */

const {
  isAccEnforcePermissionsEnabled,
  isAccEnforcePermissionsPilotEnabled,
  isAccHardCutoverEnabled,
  isAccPermissionDriftSafeFallbackEnabled,
  getAccEnforcePermissionsPilotTenantSlugs,
  isAccEnforcePermissionsActiveForTenant,
} = require('../acc-runtime/featureFlags');
const {
  resolvePermissionsForMembership,
  resolveAccPermissionsForMembership,
  _setsEqual,
} = require('../acc-runtime/resolvePermissions');
const { getPermissionsForMembership } = require('./rbac.service');

function _normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function getPermissionEnforcementMode({ tenantId = null, tenantSlug = null, membership = null } = {}) {
  if (isAccEnforcePermissionsEnabled()) {
    const explicitGlobal = process.env.ACC_ENFORCE_PERMISSIONS === 'true';
    const viaHardCutover = isAccHardCutoverEnabled()
      && process.env.ACC_ENFORCE_PERMISSIONS !== 'false';
    return {
      active: true,
      mode: viaHardCutover && !explicitGlobal ? 'hard-cutover' : 'global',
      tenantSlug: _normalizeSlug(tenantSlug ?? membership?.tenant?.slug) || null,
      tenantId: tenantId ?? membership?.tenantId ?? membership?.tenant?.id ?? null,
    };
  }

  if (!isAccEnforcePermissionsPilotEnabled()) {
    return {
      active: false,
      mode: 'legacy',
      tenantSlug: _normalizeSlug(tenantSlug ?? membership?.tenant?.slug) || null,
      tenantId: tenantId ?? membership?.tenantId ?? membership?.tenant?.id ?? null,
    };
  }

  const slug = _normalizeSlug(tenantSlug ?? membership?.tenant?.slug);
  const id = tenantId ?? membership?.tenantId ?? membership?.tenant?.id ?? null;
  const pilotSlugs = getAccEnforcePermissionsPilotTenantSlugs();
  const inPilot = (slug && pilotSlugs.includes(slug)) || false;

  return {
    active: inPilot,
    mode: inPilot ? 'pilot' : 'legacy',
    tenantSlug: slug || null,
    tenantId: id,
  };
}

async function evaluatePermissionResolution({
  userId,
  membership = null,
  roleId,
  roleCode,
  tenantId = null,
  tenantSlug = null,
}) {
  const enforcement = getPermissionEnforcementMode({ tenantId, tenantSlug, membership });
  const legacy = await getPermissionsForMembership({ roleId, roleCode });
  let acc = null;
  let drift = false;
  let source = 'legacy';

  if (enforcement.active) {
    try {
      acc = await resolveAccPermissionsForMembership({
        userId,
        membership,
        roleId,
        roleCode,
      });
      if (Array.isArray(acc) && acc.length > 0) {
        drift = !_setsEqual(acc, legacy);
        if (drift && isAccPermissionDriftSafeFallbackEnabled()) {
          source = 'legacy-drift-fallback';
        } else {
          source = 'acc';
        }
      } else {
        source = 'legacy-fallback';
      }
    } catch {
      source = 'legacy-fallback';
    }
  }

  const enforced = await resolvePermissionsForMembership({
    userId,
    membership,
    roleId,
    roleCode,
    tenantId,
    tenantSlug,
  });

  return {
    enforcement,
    legacyCount: legacy.length,
    accCount: Array.isArray(acc) ? acc.length : 0,
    enforcedCount: enforced.length,
    drift,
    source,
    setsEqual: _setsEqual(enforced, legacy),
  };
}

function getPermissionEnforcementStatus({ tenantId = null, tenantSlug = null } = {}) {
  const enforcement = getPermissionEnforcementMode({ tenantId, tenantSlug });
  return {
    accHardCutover: isAccHardCutoverEnabled(),
    accEnforcePermissions: isAccEnforcePermissionsEnabled(),
    accEnforcePermissionsPilot: isAccEnforcePermissionsPilotEnabled(),
    accPermissionDriftSafeFallback: isAccPermissionDriftSafeFallbackEnabled(),
    pilotTenantSlugs: getAccEnforcePermissionsPilotTenantSlugs(),
    enforcement,
    rollback: {
      disableHardCutover: 'ACC_HARD_CUTOVER=false',
      disableGlobal: 'ACC_ENFORCE_PERMISSIONS=false',
      disablePilot: 'ACC_ENFORCE_PERMISSIONS_PILOT=false',
      disableDriftSafeFallback: 'ACC_PERMISSION_DRIFT_SAFE_FALLBACK=false',
    },
  };
}

module.exports = {
  getPermissionEnforcementMode,
  evaluatePermissionResolution,
  getPermissionEnforcementStatus,
  isAccEnforcePermissionsActiveForTenant,
};
