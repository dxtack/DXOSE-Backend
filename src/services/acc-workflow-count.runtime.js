'use strict';

/**
 * Inventory Count — ACC workflow status derivation (pinned version, no hardcoded Dept/Cost/Finance).
 */

const {
    resolveWorkflowForDocument,
    resolveWorkflowByVersionId,
    approvalRequestVersionPin,
} = require('./acc-workflow-runtime.service');
const { normalizeSteps } = require('./acc-workflow-movement.runtime');

/** Legacy lifecycle matrix for 4-step ACC chain (CC→Dept→Finance→GM). */
const LEGACY_COUNT_APPROVAL_MATRIX_4 = Object.freeze({
    PENDING_COST_CONTROL: { approvedCount: 0, pendingStep: 1 },
    PENDING_DEPT: { approvedCount: 1, pendingStep: 2 },
    PENDING_FINANCE: { approvedCount: 2, pendingStep: 3 },
    PENDING_GM: { approvedCount: 3, pendingStep: 4 },
    PENDING_APPROVAL: { approvedCount: 1, pendingStep: 2 },
    DEPT_APPROVED: { approvedCount: 1, pendingStep: 2 },
    COST_CONTROL_APPROVED: { approvedCount: 1, pendingStep: 2 },
    FINANCE_APPROVED: { approvedCount: 3, pendingStep: 4 },
});

/** Pinned 2-step legacy (Finance→GM) — do not remap in-flight documents. */
const LEGACY_COUNT_APPROVAL_MATRIX_2 = Object.freeze({
    PENDING_FINANCE: { approvedCount: 0, pendingStep: 1 },
    PENDING_GM: { approvedCount: 1, pendingStep: 2 },
    FINANCE_APPROVED: { approvedCount: 1, pendingStep: 2 },
    PENDING_APPROVAL: { approvedCount: 0, pendingStep: 1 },
    DEPT_APPROVED: { approvedCount: 0, pendingStep: 1 },
    COST_CONTROL_APPROVED: { approvedCount: 0, pendingStep: 1 },
});

const LEGACY_COUNT_APPROVAL_MATRIX = LEGACY_COUNT_APPROVAL_MATRIX_4;

/** Document status while `pendingStepNumber` is the first PENDING ACC step. */
function countStatusForPendingStep(chain, pendingStepNumber) {
    const steps = normalizeSteps(chain?.steps);
    const step = steps[(pendingStepNumber ?? 1) - 1];
    const key = step?.statusKey ? String(step.statusKey).trim().toUpperCase() : null;
    if (key) return key;
    const fallbacks = ['PENDING_COST_CONTROL', 'PENDING_DEPT', 'PENDING_FINANCE', 'PENDING_GM'];
    return fallbacks[(pendingStepNumber ?? 1) - 1] || 'PENDING_COST_CONTROL';
}

function inferLegacyCountApprovalState(documentStatus, chain = null) {
    const status = String(documentStatus || '').trim().toUpperCase();
    const stepCount = chain?.roleCodes?.length || normalizeSteps(chain?.steps).length || 4;
    const matrix = stepCount <= 2 ? LEGACY_COUNT_APPROVAL_MATRIX_2 : LEGACY_COUNT_APPROVAL_MATRIX_4;
    const mapped = matrix[status];
    if (mapped) return { ...mapped };
    return { approvedCount: 0, pendingStep: 1 };
}

async function resolveCountWorkflowChain(approval, tenantId) {
    if (approval?.accWorkflowVersionId) {
        return resolveWorkflowByVersionId(approval.accWorkflowVersionId);
    }
    return resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId });
}

function submitStatusFromChain(chain, pendingStepNumber = 1) {
    return {
        status: countStatusForPendingStep(chain, pendingStepNumber),
        pendingStepNumber,
    };
}

/** After Cost Control submit — step 1 auto-approved; first live approver is Dept Manager (step 2). */
function submitApprovalProjection(chain) {
    const total = chain?.roleCodes?.length || normalizeSteps(chain?.steps).length;
    const pendingStepNumber = Math.min(2, total);
    return {
        status: countStatusForPendingStep(chain, pendingStepNumber),
        pendingStepNumber,
        autoApproveStepNumbers: [1],
    };
}

module.exports = {
    LEGACY_COUNT_APPROVAL_MATRIX,
    LEGACY_COUNT_APPROVAL_MATRIX_2,
    LEGACY_COUNT_APPROVAL_MATRIX_4,
    countStatusForPendingStep,
    inferLegacyCountApprovalState,
    resolveCountWorkflowChain,
    submitStatusFromChain,
    submitApprovalProjection,
    approvalRequestVersionPin,
};
