'use strict';

/**
 * P28 — ACC workflow presentation (pipeline, PDF, reports).
 * No hardcoded STEP_ROLE / APPROVAL_CHAIN maps.
 */

const {
  resolveWorkflowForDocument,
} = require('./acc-workflow-runtime.service');
const { loadWorkflowVersionChain } = require('./acc-workflow-step-resolver.service');
const { defaultStepsForModule } = require('./acc-workflow-default-chains');

function approvalChainDefinitionFromAcc(chain) {
  return (chain?.steps || []).map((step) => ({
    step: step.stepOrder,
    role: step.roleCode,
    label: step.label || step.roleCode || '—',
    statusKey: step.statusKey || null,
    permissionCode: step.permissionCode || null,
  }));
}

function waitingRoleFromApprovalRequest(approval) {
  if (!approval || approval.status !== 'PENDING') return null;
  const step = (approval.steps || []).find(
    (s) => s.stepNumber === approval.currentStep && s.status === 'PENDING',
  );
  return step?.requiredRole?.code ?? null;
}

function waitingRoleFromAccStatus(chain, status) {
  if (!chain?.steps?.length || !status) return null;
  const key = String(status).trim().toUpperCase();
  const match = chain.steps.find((s) => s.statusKey === key);
  return match?.roleCode ?? null;
}

function stepLabelFromAccChain(chain, stepNumber) {
  const step = chain?.steps?.find((s) => s.stepOrder === stepNumber);
  return step?.label || step?.roleCode || null;
}

function defaultPresentationChain(moduleKey) {
  const key = String(moduleKey || '').trim().toUpperCase();
  const steps = defaultStepsForModule(key);
  if (!steps.length) return null;
  return {
    moduleKey: key,
    roleCodes: steps.map((s) => s.roleCode).filter(Boolean),
    steps,
    source: 'default-chain',
    versionId: null,
  };
}

/**
 * Resolve ACC chain for pipeline/PDF presentation.
 * Soft-fails to the seeded default chain when a module has no published workflow —
 * collectors must never abort the entire Workflow Pipeline for one missing publish.
 */
async function resolvePresentationChain({ moduleKey, tenantId, versionId = null }) {
  if (versionId) {
    try {
      const pinned = await loadWorkflowVersionChain(versionId);
      if (pinned) return pinned;
    } catch (_) {
      // Pinned version missing/corrupt — fall through to live/default.
    }
  }
  if (moduleKey) {
    const key = String(moduleKey).trim().toUpperCase();
    try {
      return await resolveWorkflowForDocument({ moduleKey: key, tenantId });
    } catch (_) {
      return defaultPresentationChain(key);
    }
  }
  return null;
}

function createPresentationChainCache(tenantId) {
  const cache = new Map();
  return {
    async getChain({ moduleKey, versionId = null }) {
      const mod = String(moduleKey || '').trim().toUpperCase();
      const key = versionId ? `v:${versionId}` : `m:${mod}`;
      if (cache.has(key)) return cache.get(key);
      const chain = await resolvePresentationChain({ moduleKey: mod, tenantId, versionId });
      cache.set(key, chain);
      return chain;
    },
  };
}

module.exports = {
  approvalChainDefinitionFromAcc,
  waitingRoleFromApprovalRequest,
  waitingRoleFromAccStatus,
  stepLabelFromAccChain,
  defaultPresentationChain,
  resolvePresentationChain,
  createPresentationChainCache,
};
