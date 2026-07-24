'use strict';

/**
 * P28 — ACC workflow presentation (pipeline, PDF, reports).
 * No hardcoded STEP_ROLE / APPROVAL_CHAIN maps.
 */

const {
  resolveWorkflowForDocument,
  resolveWorkflowByVersionId,
} = require('./acc-workflow-runtime.service');
const { loadWorkflowVersionChain } = require('./acc-workflow-step-resolver.service');

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

async function resolvePresentationChain({ moduleKey, tenantId, versionId = null }) {
  if (versionId) {
    const pinned = await loadWorkflowVersionChain(versionId);
    if (pinned) return pinned;
  }
  if (moduleKey) {
    return resolveWorkflowForDocument({ moduleKey: String(moduleKey).trim().toUpperCase(), tenantId });
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
  resolvePresentationChain,
  createPresentationChainCache,
};
