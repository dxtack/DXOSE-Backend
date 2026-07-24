'use strict';

/**
 * BREAKAGE / LOST — ACC workflow status derivation (pinned version, no manual flow).
 */

const { resolveWorkflowForDocument, resolveWorkflowByVersionId } = require('./acc-workflow-runtime.service');
const { resolveFirstPendingApprovalStepNumber } = require('../platform/movementApprovalAction.guard');

function normalizeSteps(steps) {
    return [...(steps || [])].sort(
        (a, b) => (a.stepOrder ?? a.stepNumber ?? 0) - (b.stepOrder ?? b.stepNumber ?? 0),
    );
}

function statusKeyForStep(chain, stepNumber) {
    const steps = normalizeSteps(chain?.steps);
    const step = steps[stepNumber - 1];
    return step?.statusKey ? String(step.statusKey).trim().toUpperCase() : null;
}

/**
 * Document status while a given approval step is the first PENDING step.
 * - Step 1 pending → `PENDING_DEPT` (awaiting first ACC actor; not yet DEPT_APPROVED)
 * - Step N>1 pending → previous step's ACC statusKey (e.g. step 2 pending → DEPT_APPROVED)
 */
function documentStatusForPendingStep(chain, pendingStepNumber) {
    const steps = normalizeSteps(chain?.steps);
    if (!steps.length) return 'DRAFT';
    const pending = pendingStepNumber ?? 1;
    if (pending <= 1) {
        return 'PENDING_DEPT';
    }
    return statusKeyForStep(chain, pending - 1) || statusKeyForStep(chain, 1) || 'DRAFT';
}

/** Document status immediately after approving step `approvedStepNumber`. */
function documentStatusAfterApprovingStep(chain, approvedStepNumber) {
    const key = statusKeyForStep(chain, approvedStepNumber);
    if (key) return key;
    const steps = normalizeSteps(chain?.steps);
    if (approvedStepNumber >= steps.length) return 'APPROVED';
    return 'DRAFT';
}

async function resolveMovementWorkflowChain(approval, moduleKey, tenantId) {
    if (approval?.accWorkflowVersionId) {
        return resolveWorkflowByVersionId(approval.accWorkflowVersionId);
    }
    return resolveWorkflowForDocument({ moduleKey, tenantId });
}

/**
 * @returns {{ status: string, pendingStepNumber: number|null }}
 */
function submitStatusFromApproval(chain, approvalSteps) {
    const pendingStepNumber = resolveFirstPendingApprovalStepNumber(approvalSteps);
    if (pendingStepNumber == null) {
        const err = new Error('No pending approval step found after submit.');
        err.statusCode = 422;
        throw err;
    }
    return {
        status: documentStatusForPendingStep(chain, pendingStepNumber),
        pendingStepNumber,
    };
}

/**
 * Infer how many steps are already approved from document pipeline status (backfill).
 */
function inferApprovedStepCountFromDocumentStatus(chain, documentStatus) {
    const status = String(documentStatus || '').trim().toUpperCase();
    const steps = normalizeSteps(chain?.steps);
    if (!status || status === 'DRAFT' || status === 'PENDING_DEPT') return 0;
    if (status === 'APPROVED' || status === 'POSTED') return steps.length;
    for (let i = 0; i < steps.length; i++) {
        const key = String(steps[i].statusKey || '').trim().toUpperCase();
        if (key === status) return i + 1;
    }
    return 0;
}

module.exports = {
    normalizeSteps,
    statusKeyForStep,
    documentStatusForPendingStep,
    documentStatusAfterApprovingStep,
    resolveMovementWorkflowChain,
    submitStatusFromApproval,
    inferApprovedStepCountFromDocumentStatus,
};
