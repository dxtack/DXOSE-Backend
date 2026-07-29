'use strict';

/**
 * P29 — ACC-only workflow runtime (ZERO LEGACY).
 */

const prisma = require('../config/database');
const workflowResolutionEngine = require('../engines/workflow-resolution.engine');
const {
  loadWorkflowVersionChain,
} = require('./acc-workflow-step-resolver.service');
const { validateWorkflowChainForRuntime } = require('./acc-workflow-status-key-guard.service');
const { defaultStepsForModule } = require('./acc-workflow-default-chains');

const CUTOVER_MODULE_KEYS = Object.freeze(new Set([
  'BREAKAGE', 'TRANSFER', 'GET_PASS', 'GRN', 'STOCK_COUNT', 'STOCK_REPORT',
]));

function isCutoverModule(moduleKey) {
  return CUTOVER_MODULE_KEYS.has(String(moduleKey || '').trim().toUpperCase());
}

function isCutoverWave1Module(moduleKey) {
  return ['BREAKAGE', 'TRANSFER'].includes(String(moduleKey || '').trim().toUpperCase());
}

function isCutoverWave2Module(moduleKey) {
  return ['GET_PASS', 'GRN'].includes(String(moduleKey || '').trim().toUpperCase());
}

function isCutoverWave3Module(moduleKey) {
  return ['STOCK_COUNT', 'STOCK_REPORT'].includes(String(moduleKey || '').trim().toUpperCase());
}

async function resolveWorkflowForDocument({ moduleKey, tenantId = null }) {
  const normalizedModuleKey = String(moduleKey || '').trim().toUpperCase();
  if (!isCutoverModule(normalizedModuleKey)) {
    const err = new Error(`Unknown ACC workflow module: ${normalizedModuleKey}`);
    err.statusCode = 422;
    throw err;
  }

  const accResolution = await workflowResolutionEngine.resolvePublishedWorkflowChain(
    normalizedModuleKey,
    tenantId,
  );
  if (!accResolution?.roleCodes?.length) {
    const FALLBACK_MODULES = ['TRANSFER', 'STOCK_COUNT'];
    if (FALLBACK_MODULES.includes(normalizedModuleKey)) {
      const steps = defaultStepsForModule(normalizedModuleKey);
      const roleCodes = steps.map((s) => s.roleCode).filter(Boolean);
      if (!roleCodes.length) {
        const err = new Error(`${normalizedModuleKey} default approval chain is not configured.`);
        err.statusCode = 500;
        throw err;
      }
      const fallback = {
        moduleKey: normalizedModuleKey,
        roleCodes,
        steps,
        source: 'default-chain',
        legacyFallback: false,
        drift: false,
        versionId: null,
        accResolution: null,
      };
      validateWorkflowChainForRuntime(fallback, normalizedModuleKey);
      return fallback;
    }

    const err = new Error(
      `ACC published workflow is required for ${normalizedModuleKey}. Publish in Workflow Builder.`,
    );
    err.statusCode = 422;
    throw err;
  }

  const result = {
    moduleKey: normalizedModuleKey,
    roleCodes: accResolution.roleCodes,
    steps: accResolution.steps,
    source: 'acc',
    legacyFallback: false,
    drift: false,
    versionId: accResolution.versionId ?? null,
    accResolution,
  };
  validateWorkflowChainForRuntime(result, normalizedModuleKey);
  return result;
}

async function resolveWorkflowByVersionId(versionId) {
  const chain = await loadWorkflowVersionChain(versionId);
  if (!chain?.roleCodes?.length) {
    const err = new Error('Pinned ACC workflow version not found or has no steps.');
    err.statusCode = 422;
    throw err;
  }
  const result = {
    moduleKey: chain.moduleKey,
    roleCodes: chain.roleCodes,
    steps: chain.steps,
    source: 'acc-pinned',
    legacyFallback: false,
    versionId: chain.versionId,
  };
  validateWorkflowChainForRuntime(result, chain.moduleKey);
  return result;
}

function approvalRequestVersionPin(chain) {
  if (chain?.versionId) {
    return { accWorkflowVersionId: chain.versionId };
  }
  return {};
}

async function getModuleRuntimeReadPath(moduleKey, tenantId = null) {
  const key = String(moduleKey || '').trim().toUpperCase();
  const published = await workflowResolutionEngine.resolvePublishedWorkflowChain(key, tenantId);
  const resolved = await resolveWorkflowForDocument({ moduleKey: key, tenantId });
  return {
    moduleKey: key,
    cutover: true,
    hasPublishedWorkflow: !!published,
    publishedVersionId: published?.versionId ?? null,
    publishedVersionNumber: published?.versionNumber ?? null,
    runtimeSource: resolved.source,
    runtimeRoleCodes: resolved.roleCodes,
    runtimeVersionId: resolved.versionId,
    legacyFallback: false,
  };
}

async function listAllModulesRuntimeReadPath(tenantId = null) {
  const modules = await prisma.accModule.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    select: { key: true },
  });
  const rows = [];
  for (const mod of modules) {
    if (isCutoverModule(mod.key)) {
      rows.push(await getModuleRuntimeReadPath(mod.key, tenantId));
    }
  }
  return rows;
}

function getWorkflowEnforcementStatus() {
  return {
    runtimePhase: 'P30',
    primarySource: 'acc-only',
    accWorkflowLegacyRetired: true,
    accZeroLegacy: true,
    cutoverModules: [...CUTOVER_MODULE_KEYS],
    enforcement: { active: true, mode: 'acc-database' },
  };
}

function getWorkflowEnforcementMode() {
  return getWorkflowEnforcementStatus().enforcement;
}

async function evaluateWorkflowEnforcement({ moduleKey, tenantId }) {
  return resolveWorkflowForDocument({ moduleKey, tenantId });
}

module.exports = {
  CUTOVER_MODULE_KEYS,
  isCutoverModule,
  isCutoverWave1Module,
  isCutoverWave2Module,
  isCutoverWave3Module,
  getWorkflowEnforcementMode,
  resolveWorkflowForDocument,
  resolveWorkflowByVersionId,
  resolveWorkflowChainForDocument: resolveWorkflowForDocument,
  approvalRequestVersionPin,
  getModuleRuntimeReadPath,
  listAllModulesRuntimeReadPath,
  getWorkflowEnforcementStatus,
  evaluateWorkflowEnforcement,
};
