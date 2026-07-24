'use strict';

/**
 * P19 — ACC Runtime Config (DB SSOT).
 * Env vars are bootstrap-only when ACC_BOOTSTRAP_ONLY=true or DB empty on first load.
 */

const prisma = require('../config/database');

const RUNTIME_PHASE = 'P19';

/** Global runtime keys (tenantId = null). */
const DEFAULT_GLOBAL_SETTINGS = Object.freeze({
  accHardCutover: true,
  accEnforcePermissions: true,
  accEnforcePermissionsPilot: false,
  accEnforcePermissionsPilotTenants: [],
  accPermissionDriftSafeFallback: false,
  accLegacyDualWrite: false,
  shadowMode: false,
  newPolicyEngine: true,
  accWorkflowShadow: false,
  accEnforceWorkflows: true,
  accEnforceWorkflowsPilot: false,
  accEnforceWorkflowsPilotTenants: [],
  accWorkflowDriftSafeFallback: false,
  accWorkflowLegacyRetired: true,
  accPolicyObserve: false,
  accEnforceAdvancedPolicies: true,
  accEnforceAdvancedPoliciesPilot: false,
  accEnforceAdvancedPoliciesPilotTenants: [],
  accPolicyDriftSafeFallback: false,
  accZeroLegacy: true,
});

const _cache = {
  loaded: false,
  global: { ...DEFAULT_GLOBAL_SETTINGS },
  tenants: Object.create(null),
};

function _isBootstrapOnly() {
  return process.env.ACC_BOOTSTRAP_ONLY === 'true';
}

function _envBool(key, defaultValue) {
  const raw = process.env[key];
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return defaultValue;
}

function _envStringList(key) {
  const raw = process.env[key] || '';
  return [...new Set(
    raw.split(',').map((v) => String(v || '').trim().toLowerCase()).filter(Boolean),
  )];
}

/** One-time seed from env when DB has no rows (cold start). */
function _bootstrapFromEnv() {
  const hard = _envBool('ACC_HARD_CUTOVER', true);
  return {
    accHardCutover: hard,
    accEnforcePermissions: _envBool('ACC_ENFORCE_PERMISSIONS', hard),
    accEnforcePermissionsPilot: _envBool('ACC_ENFORCE_PERMISSIONS_PILOT', false),
    accEnforcePermissionsPilotTenants: _envStringList('ACC_ENFORCE_PERMISSIONS_PILOT_TENANTS'),
    accPermissionDriftSafeFallback: _envBool('ACC_PERMISSION_DRIFT_SAFE_FALLBACK', false),
    accLegacyDualWrite: _envBool('ACC_LEGACY_DUAL_WRITE', false),
    shadowMode: _envBool('ENABLE_UR_SHADOW_MODE', false),
    newPolicyEngine: _envBool('USE_NEW_POLICY_ENGINE', hard),
    accWorkflowShadow: _envBool('ENABLE_ACC_WORKFLOW_SHADOW', false),
    accEnforceWorkflows: _envBool('ACC_ENFORCE_WORKFLOWS', hard),
    accEnforceWorkflowsPilot: _envBool('ACC_ENFORCE_WORKFLOWS_PILOT', false),
    accEnforceWorkflowsPilotTenants: _envStringList('ACC_ENFORCE_WORKFLOWS_PILOT_TENANTS'),
    accWorkflowDriftSafeFallback: _envBool('ACC_WORKFLOW_DRIFT_SAFE_FALLBACK', false),
    accWorkflowLegacyRetired: _envBool('ACC_WORKFLOW_LEGACY_RETIRED', hard),
    accPolicyObserve: _envBool('ENABLE_ACC_POLICY_OBSERVE', false),
    accEnforceAdvancedPolicies: _envBool('ACC_ENFORCE_ADVANCED_POLICIES', hard),
    accEnforceAdvancedPoliciesPilot: _envBool('ACC_ENFORCE_ADVANCED_POLICIES_PILOT', false),
    accEnforceAdvancedPoliciesPilotTenants: _envStringList('ACC_ENFORCE_ADVANCED_POLICIES_PILOT_TENANTS'),
    accPolicyDriftSafeFallback: _envBool('ACC_POLICY_DRIFT_SAFE_FALLBACK', false),
    accZeroLegacy: true,
  };
}

function _coerceValue(key, value) {
  if (key.endsWith('Tenants')) {
    if (Array.isArray(value)) return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
    if (typeof value === 'string') return _envStringListFromRaw(value);
    return [];
  }
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function _envStringListFromRaw(raw) {
  return [...new Set(String(raw).split(',').map((v) => v.trim().toLowerCase()).filter(Boolean))];
}

async function refreshAccRuntimeConfigCache() {
  if (_isBootstrapOnly()) {
    _cache.global = _bootstrapFromEnv();
    _cache.tenants = Object.create(null);
    _cache.loaded = true;
    return { source: 'bootstrap-env', global: _cache.global };
  }

  const rows = await prisma.accRuntimeSetting.findMany();
  if (rows.length === 0) {
    const seeded = _bootstrapFromEnv();
    for (const [key, value] of Object.entries(seeded)) {
      await prisma.accRuntimeSetting.upsert({
        where: { tenantId_key: { tenantId: null, key } },
        create: { tenantId: null, key, value },
        update: { value },
      });
    }
    _cache.global = { ...DEFAULT_GLOBAL_SETTINGS, ...seeded };
    _cache.tenants = Object.create(null);
    _cache.loaded = true;
    return { source: 'seeded-defaults', global: _cache.global };
  }

  const global = { ...DEFAULT_GLOBAL_SETTINGS };
  const tenants = Object.create(null);

  for (const row of rows) {
    const val = _coerceValue(row.key, row.value);
    if (row.tenantId) {
      if (!tenants[row.tenantId]) tenants[row.tenantId] = Object.create(null);
      tenants[row.tenantId][row.key] = val;
    } else {
      global[row.key] = val;
    }
  }

  _cache.global = global;
  _cache.tenants = tenants;
  _cache.loaded = true;
  return { source: 'database', global };
}

async function ensureAccRuntimeConfigLoaded() {
  if (!_cache.loaded) {
    await refreshAccRuntimeConfigCache();
  }
}

function _getRaw(key, tenantId = null) {
  if (!_cache.loaded) {
    if (_isBootstrapOnly()) return _bootstrapFromEnv()[key];
    return DEFAULT_GLOBAL_SETTINGS[key];
  }
  if (tenantId && _cache.tenants[tenantId]?.[key] !== undefined) {
    return _cache.tenants[tenantId][key];
  }
  if (_cache.global[key] !== undefined) return _cache.global[key];
  return DEFAULT_GLOBAL_SETTINGS[key];
}

function getRuntimeBoolean(key, tenantId = null) {
  const val = _getRaw(key, tenantId);
  return val === true;
}

function getRuntimeStringList(key, tenantId = null) {
  const val = _getRaw(key, tenantId);
  return Array.isArray(val) ? val : [];
}

function getAccRuntimeConfigSnapshot(tenantId = null) {
  const global = { ..._cache.global };
  const tenantOverrides = tenantId && _cache.tenants[tenantId]
    ? { ..._cache.tenants[tenantId] }
    : null;
  return {
    runtimePhase: RUNTIME_PHASE,
    source: _isBootstrapOnly() ? 'bootstrap-env' : 'acc-database',
    global,
    tenantOverrides,
    effective: tenantId
      ? { ...global, ...(tenantOverrides || {}) }
      : global,
  };
}

async function listRuntimeSettings({ tenantId = null } = {}) {
  await ensureAccRuntimeConfigLoaded();
  const where = tenantId ? { OR: [{ tenantId: null }, { tenantId }] } : { tenantId: null };
  const rows = await prisma.accRuntimeSetting.findMany({
    where,
    orderBy: [{ tenantId: 'asc' }, { key: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    key: r.key,
    value: r.value,
    updatedAt: r.updatedAt,
  }));
}

async function upsertRuntimeSetting({ tenantId = null, key, value, updatedById = null }) {
  if (!key || typeof key !== 'string') {
    throw Object.assign(new Error('key is required'), { statusCode: 400 });
  }
  const normalizedKey = key.trim();
  const coerced = _coerceValue(normalizedKey, value);

  const row = await prisma.accRuntimeSetting.upsert({
    where: { tenantId_key: { tenantId: tenantId ?? null, key: normalizedKey } },
    create: {
      tenantId: tenantId ?? null,
      key: normalizedKey,
      value: coerced,
      updatedById,
    },
    update: {
      value: coerced,
      updatedById,
    },
  });

  await refreshAccRuntimeConfigCache();
  return row;
}

async function upsertRuntimeSettingsBatch({ settings, tenantId = null, updatedById = null }) {
  const results = [];
  for (const [key, value] of Object.entries(settings || {})) {
    results.push(await upsertRuntimeSetting({ tenantId, key, value, updatedById }));
  }
  return results;
}

module.exports = {
  RUNTIME_PHASE,
  DEFAULT_GLOBAL_SETTINGS,
  refreshAccRuntimeConfigCache,
  ensureAccRuntimeConfigLoaded,
  getRuntimeBoolean,
  getRuntimeStringList,
  getAccRuntimeConfigSnapshot,
  listRuntimeSettings,
  upsertRuntimeSetting,
  upsertRuntimeSettingsBatch,
};
