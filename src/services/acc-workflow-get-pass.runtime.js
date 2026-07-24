'use strict';

/**
 * P24 — Get Pass workflow from pinned ACC version (ZERO LEGACY).
 */

const { normalizeRole } = require('./rbac.service');
const { resolveWorkflowByVersionId } = require('./acc-workflow-runtime.service');
const {
    assertAwaitingStatusKey,
} = require('./acc-workflow-status-key-guard.service');

const APPROVAL_FIELD_BY_STATUS = Object.freeze({
  PENDING_DEPT: { field: 'deptApprovedBy', atField: 'deptApprovedAt' },
  PENDING_COST_CONTROL: { field: 'costControlApprovedBy', atField: 'costControlApprovedAt' },
  PENDING_FINANCE: { field: 'financeApprovedBy', atField: 'financeApprovedAt' },
  PENDING_GM: { field: 'gmApprovedBy', atField: 'gmApprovedAt' },
  PENDING_SECURITY: { field: 'securityApprovedBy', atField: 'securityApprovedAt' },
});

function buildGetPassWorkflowMaps(steps) {
  const pendingStatuses = (steps || [])
    .map((s) => {
      const key = String(s.statusKey || '').trim().toUpperCase();
      if (key) assertAwaitingStatusKey(key, { moduleKey: 'GET_PASS', stepNumber: s.stepOrder });
      return key;
    })
    .filter(Boolean);
  const roleCodes = (steps || []).map((s) => normalizeRole(s.roleCode)).filter(Boolean);
  const stepRoleByStatus = {};
  pendingStatuses.forEach((status, i) => {
    if (roleCodes[i]) stepRoleByStatus[status] = roleCodes[i];
  });
  return { stepRoleByStatus, pendingStatuses, roleCodes, steps };
}

async function resolveGetPassWorkflowContext(getPassOrTenantId, tenantIdMaybe) {
  let versionId = null;
  let tenantId = tenantIdMaybe ?? null;

  if (getPassOrTenantId && typeof getPassOrTenantId === 'object') {
    versionId = getPassOrTenantId.accWorkflowVersionId;
    tenantId = getPassOrTenantId.tenantId ?? tenantId;
  } else if (typeof getPassOrTenantId === 'string' && getPassOrTenantId.includes('-')) {
    versionId = getPassOrTenantId;
  } else {
    tenantId = getPassOrTenantId;
  }

  if (!versionId) {
    const err = new Error('Get Pass has no pinned ACC workflow version.');
    err.statusCode = 422;
    throw err;
  }

  const chain = await resolveWorkflowByVersionId(versionId);
  const maps = buildGetPassWorkflowMaps(chain.steps);
  return { chain, ...maps };
}

function resolveStepRole(status, workflowContext) {
  const s = String(status || '').trim().toUpperCase();
  return workflowContext?.stepRoleByStatus?.[s] ?? null;
}

function resolveStepPermission(status, workflowContext) {
  const s = String(status || '').trim().toUpperCase();
  const idx = workflowContext.pendingStatuses.indexOf(s);
  if (idx < 0) return null;
  return workflowContext.steps[idx]?.permissionCode ?? null;
}

function getSubmitInitialWorkflowFromContext(workflowContext, role, userId) {
  const { pendingStatuses, roleCodes } = workflowContext;

  if (!pendingStatuses.length) {
    return { status: 'PENDING_DEPT' };
  }

  const normalized = normalizeRole(role);
  const firstStepRole = normalizeRole(roleCodes?.[0]);
  const submitterHoldsFirstStep =
    Boolean(firstStepRole) && Boolean(normalized) && normalized === firstStepRole;

  // Single motion: Dept Manager (ACC step 1) Submit also stamps Department and enters step 2.
  // Storekeeper / other creators still land on PENDING_DEPT for a live Department actor.
  if (!submitterHoldsFirstStep || pendingStatuses.length < 2 || !userId) {
    return {
      status: assertAwaitingStatusKey(pendingStatuses[0], {
        moduleKey: 'GET_PASS',
        stepNumber: 1,
      }),
    };
  }

  const stampStatus = pendingStatuses[0];
  const nextStatus = assertAwaitingStatusKey(pendingStatuses[1], {
    moduleKey: 'GET_PASS',
    stepNumber: 2,
  });
  const now = new Date();
  const approval = APPROVAL_FIELD_BY_STATUS[stampStatus];
  const data = { status: nextStatus };
  if (approval) {
    data[approval.field] = userId;
    data[approval.atField] = now;
  }
  return data;
}

function getApproveTransitionData(currentStatus, workflowContext, userId) {
  const statuses = workflowContext.pendingStatuses;
  const idx = statuses.indexOf(currentStatus);
  if (idx < 0) return null;
  const nextStatus = statuses[idx + 1];
  if (!nextStatus) return null;
  assertAwaitingStatusKey(nextStatus, { moduleKey: 'GET_PASS', stepNumber: idx + 2 });

  const now = new Date();
  const approval = APPROVAL_FIELD_BY_STATUS[currentStatus];
  const data = { status: nextStatus };
  if (approval) {
    data[approval.field] = userId;
    data[approval.atField] = now;
  }
  return data;
}

function getPassVersionPin(chain) {
  if (chain?.versionId) {
    return { accWorkflowVersionId: chain.versionId };
  }
  return {};
}

module.exports = {
  buildGetPassWorkflowMaps,
  resolveGetPassWorkflowContext,
  resolveStepRole,
  resolveStepPermission,
  getSubmitInitialWorkflowFromContext,
  getApproveTransitionData,
  getPassVersionPin,
};
