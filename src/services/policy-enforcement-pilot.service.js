'use strict';

/**
 * ACC Big Bang S16 — controlled advanced policy enforcement pilot helpers.
 */

const prisma = require('../config/database');
const {
  isAccEnforceAdvancedPoliciesEnabled,
  isAccEnforceAdvancedPoliciesPilotEnabled,
  isAccHardCutoverEnabled,
  isAccPolicyDriftSafeFallbackEnabled,
  getAccEnforceAdvancedPoliciesPilotTenantSlugs,
  isAccEnforceAdvancedPoliciesActiveForTenant,
} = require('../acc-runtime/featureFlags');
const {
  evaluateAdvancedPolicyEnforcement,
  buildLegacyPolicyBaseline,
  _isLegacyEquivalentOutcome,
} = require('../engines/policy-evaluation.engine');

function _normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

async function _resolveTenantSlug(tenantId, tenantSlug) {
  if (tenantSlug) return _normalizeSlug(tenantSlug);
  if (!tenantId) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  return tenant?.slug ? _normalizeSlug(tenant.slug) : null;
}

function getPolicyEnforcementMode({ tenantId = null, tenantSlug = null } = {}) {
  if (isAccEnforceAdvancedPoliciesEnabled()) {
    const explicitGlobal = process.env.ACC_ENFORCE_ADVANCED_POLICIES === 'true';
    const viaHardCutover = isAccHardCutoverEnabled()
      && process.env.ACC_ENFORCE_ADVANCED_POLICIES !== 'false';
    return {
      active: true,
      mode: viaHardCutover && !explicitGlobal ? 'hard-cutover' : 'global',
      tenantSlug: _normalizeSlug(tenantSlug) || null,
      tenantId: tenantId ?? null,
    };
  }

  if (!isAccEnforceAdvancedPoliciesPilotEnabled()) {
    return {
      active: false,
      mode: 'legacy',
      tenantSlug: _normalizeSlug(tenantSlug) || null,
      tenantId: tenantId ?? null,
    };
  }

  const slug = _normalizeSlug(tenantSlug);
  const inPilot = slug && getAccEnforceAdvancedPoliciesPilotTenantSlugs().includes(slug);

  return {
    active: !!inPilot,
    mode: inPilot ? 'pilot' : 'legacy',
    tenantSlug: slug || null,
    tenantId: tenantId ?? null,
  };
}

async function resolveAdvancedPolicyEvaluation({
  userId,
  tenantId = null,
  tenantSlug = null,
  roleId = null,
  resourceCode = null,
  fieldKey = null,
  at = new Date(),
}) {
  const resolvedSlug = await _resolveTenantSlug(tenantId, tenantSlug);
  const enforcement = getPolicyEnforcementMode({
    tenantId,
    tenantSlug: resolvedSlug,
  });
  const legacy = buildLegacyPolicyBaseline();

  if (!enforcement.active) {
    return {
      ...legacy,
      enforcement,
      at: at.toISOString(),
      userId,
      tenantId,
      tenantSlug: resolvedSlug,
      roleId,
      resourceCode,
      fieldKey,
    };
  }

  const evaluation = await evaluateAdvancedPolicyEnforcement({
    userId,
    tenantId,
    tenantSlug: resolvedSlug,
    roleId,
    resourceCode,
    fieldKey,
    at,
  });

  return {
    ...evaluation,
    enforcement,
    legacyEquivalent: _isLegacyEquivalentOutcome(evaluation, fieldKey),
  };
}

function getPolicyEnforcementStatus({ tenantId = null, tenantSlug = null } = {}) {
  const enforcement = getPolicyEnforcementMode({ tenantId, tenantSlug });
  return {
    accHardCutover: isAccHardCutoverEnabled(),
    accEnforceAdvancedPolicies: isAccEnforceAdvancedPoliciesEnabled(),
    accEnforceAdvancedPoliciesPilot: isAccEnforceAdvancedPoliciesPilotEnabled(),
    accPolicyDriftSafeFallback: isAccPolicyDriftSafeFallbackEnabled(),
    accPolicyObserve: process.env.ENABLE_ACC_POLICY_OBSERVE === 'true',
    pilotTenantSlugs: getAccEnforceAdvancedPoliciesPilotTenantSlugs(),
    enforcement,
    runtimePhase: 'P14',
    primarySource: enforcement.active ? 'acc-advanced-policies' : 'legacy-transitional',
    rollback: {
      disableHardCutover: 'ACC_HARD_CUTOVER=false',
      disableGlobal: 'ACC_ENFORCE_ADVANCED_POLICIES=false',
      disablePilot: 'ACC_ENFORCE_ADVANCED_POLICIES_PILOT=false',
      disableDriftSafeFallback: 'ACC_POLICY_DRIFT_SAFE_FALLBACK=false',
    },
  };
}

module.exports = {
  getPolicyEnforcementMode,
  resolveAdvancedPolicyEvaluation,
  getPolicyEnforcementStatus,
  isAccEnforceAdvancedPoliciesActiveForTenant,
};
