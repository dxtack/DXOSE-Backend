'use strict';

/**
 * P19 — Feature flags read from ACC Runtime Config (DB SSOT).
 */

const {
  getRuntimeBoolean,
  getRuntimeStringList,
  getAccRuntimeConfigSnapshot,
  ensureAccRuntimeConfigLoaded,
  DEFAULT_GLOBAL_SETTINGS,
} = require('../services/acc-runtime-config.service');

function isAccHardCutoverEnabled() {
  return getRuntimeBoolean('accHardCutover');
}

function _resolveEnforceFlag(settingKey) {
  return getRuntimeBoolean(settingKey);
}

function isAccEnforcePermissionsEnabled() {
  return _resolveEnforceFlag('accEnforcePermissions');
}

function isAccEnforcePermissionsPilotEnabled() {
  return getRuntimeBoolean('accEnforcePermissionsPilot');
}

function getAccEnforcePermissionsPilotTenantSlugs() {
  return getRuntimeStringList('accEnforcePermissionsPilotTenants');
}

function isAccEnforcePermissionsActiveForTenant({
  tenantId = null,
  tenantSlug = null,
  membership = null,
} = {}) {
  if (isAccEnforcePermissionsEnabled()) return true;
  if (!isAccEnforcePermissionsPilotEnabled()) return false;
  const slug = String(tenantSlug ?? membership?.tenant?.slug ?? '').trim().toLowerCase();
  if (!slug) return false;
  return getAccEnforcePermissionsPilotTenantSlugs().includes(slug);
}

function isShadowModeEnabled() {
  return getRuntimeBoolean('shadowMode');
}

function isNewPolicyEngineEnabled() {
  return getRuntimeBoolean('newPolicyEngine');
}

function isAccWorkflowShadowEnabled() {
  return getRuntimeBoolean('accWorkflowShadow');
}

function isAccEnforceWorkflowsEnabled() {
  return _resolveEnforceFlag('accEnforceWorkflows');
}

function isAccEnforceWorkflowsPilotEnabled() {
  return getRuntimeBoolean('accEnforceWorkflowsPilot');
}

function getAccEnforceWorkflowsPilotTenantSlugs() {
  return getRuntimeStringList('accEnforceWorkflowsPilotTenants');
}

function isAccEnforceWorkflowsActiveForTenant({
  tenantId = null,
  tenantSlug = null,
  membership = null,
} = {}) {
  if (isAccEnforceWorkflowsEnabled()) return true;
  if (!isAccEnforceWorkflowsPilotEnabled()) return false;
  const slug = String(tenantSlug ?? membership?.tenant?.slug ?? '').trim().toLowerCase();
  if (!slug) return false;
  return getAccEnforceWorkflowsPilotTenantSlugs().includes(slug);
}

function isAccWorkflowDriftSafeFallbackEnabled() {
  return getRuntimeBoolean('accWorkflowDriftSafeFallback');
}

function isAccPolicyObserveEnabled() {
  return getRuntimeBoolean('accPolicyObserve');
}

function isAccEnforceAdvancedPoliciesEnabled() {
  return _resolveEnforceFlag('accEnforceAdvancedPolicies');
}

function isAccEnforceAdvancedPoliciesPilotEnabled() {
  return getRuntimeBoolean('accEnforceAdvancedPoliciesPilot');
}

function getAccEnforceAdvancedPoliciesPilotTenantSlugs() {
  return getRuntimeStringList('accEnforceAdvancedPoliciesPilotTenants');
}

function isAccEnforceAdvancedPoliciesActiveForTenant({
  tenantId = null,
  tenantSlug = null,
  membership = null,
} = {}) {
  if (isAccEnforceAdvancedPoliciesEnabled()) return true;
  if (!isAccEnforceAdvancedPoliciesPilotEnabled()) return false;
  const slug = String(tenantSlug ?? membership?.tenant?.slug ?? '').trim().toLowerCase();
  if (!slug) return false;
  return getAccEnforceAdvancedPoliciesPilotTenantSlugs().includes(slug);
}

function isAccPolicyDriftSafeFallbackEnabled() {
  return getRuntimeBoolean('accPolicyDriftSafeFallback');
}

function isAccPermissionDriftSafeFallbackEnabled() {
  return getRuntimeBoolean('accPermissionDriftSafeFallback');
}

function isAccLegacyDualWriteEnabled() {
  return getRuntimeBoolean('accLegacyDualWrite');
}

function isAccWorkflowLegacyRetired() {
  return getRuntimeBoolean('accWorkflowLegacyRetired');
}

function isAccZeroLegacyEnabled() {
  return getRuntimeBoolean('accZeroLegacy');
}

function getAccFeatureFlagStatus() {
  return {
    ...DEFAULT_GLOBAL_SETTINGS,
    accHardCutover: isAccHardCutoverEnabled(),
    accEnforcePermissions: isAccEnforcePermissionsEnabled(),
    accEnforcePermissionsPilot: isAccEnforcePermissionsPilotEnabled(),
    accEnforcePermissionsPilotTenants: getAccEnforcePermissionsPilotTenantSlugs(),
    accPermissionDriftSafeFallback: isAccPermissionDriftSafeFallbackEnabled(),
    accLegacyDualWrite: isAccLegacyDualWriteEnabled(),
    shadowMode: isShadowModeEnabled(),
    newPolicyEngine: isNewPolicyEngineEnabled(),
    accWorkflowShadow: isAccWorkflowShadowEnabled(),
    accEnforceWorkflows: isAccEnforceWorkflowsEnabled(),
    accEnforceWorkflowsPilot: isAccEnforceWorkflowsPilotEnabled(),
    accEnforceWorkflowsPilotTenants: getAccEnforceWorkflowsPilotTenantSlugs(),
    accWorkflowDriftSafeFallback: isAccWorkflowDriftSafeFallbackEnabled(),
    accWorkflowLegacyRetired: isAccWorkflowLegacyRetired(),
    accPolicyObserve: isAccPolicyObserveEnabled(),
    accEnforceAdvancedPolicies: isAccEnforceAdvancedPoliciesEnabled(),
    accEnforceAdvancedPoliciesPilot: isAccEnforceAdvancedPoliciesPilotEnabled(),
    accEnforceAdvancedPoliciesPilotTenants: getAccEnforceAdvancedPoliciesPilotTenantSlugs(),
    accPolicyDriftSafeFallback: isAccPolicyDriftSafeFallbackEnabled(),
    accZeroLegacy: isAccZeroLegacyEnabled(),
    configSource: getAccRuntimeConfigSnapshot().source,
  };
}

module.exports = {
  ensureAccRuntimeConfigLoaded,
  getAccRuntimeConfigSnapshot,
  isAccHardCutoverEnabled,
  isAccEnforcePermissionsEnabled,
  isAccEnforcePermissionsPilotEnabled,
  getAccEnforcePermissionsPilotTenantSlugs,
  isAccEnforcePermissionsActiveForTenant,
  isShadowModeEnabled,
  isNewPolicyEngineEnabled,
  isAccWorkflowShadowEnabled,
  isAccEnforceWorkflowsEnabled,
  isAccEnforceWorkflowsPilotEnabled,
  getAccEnforceWorkflowsPilotTenantSlugs,
  isAccEnforceWorkflowsActiveForTenant,
  isAccWorkflowDriftSafeFallbackEnabled,
  isAccWorkflowLegacyRetired,
  isAccZeroLegacyEnabled,
  isAccPolicyObserveEnabled,
  isAccEnforceAdvancedPoliciesEnabled,
  isAccEnforceAdvancedPoliciesPilotEnabled,
  getAccEnforceAdvancedPoliciesPilotTenantSlugs,
  isAccEnforceAdvancedPoliciesActiveForTenant,
  isAccPolicyDriftSafeFallbackEnabled,
  isAccPermissionDriftSafeFallbackEnabled,
  isAccLegacyDualWriteEnabled,
  getAccFeatureFlagStatus,
};
