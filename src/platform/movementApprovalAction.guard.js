'use strict';

/**
 * Workflow action guard for Breakage / Lost approval steps (Ch.2.5 / Ch.2.7).
 * Distinct from assertDocumentEditableByLifecycle — in-flight documents are "In Review"
 * but must still accept approve/reject on the current approval step.
 */

const TERMINAL_DOC_STATUSES = Object.freeze(new Set(['APPROVED', 'VOID', 'REJECTED']));

/** Internal statuses that may receive approve/reject while approvalRequest is PENDING. */
const MOVEMENT_APPROVAL_PIPELINE_STATUSES = Object.freeze(
    new Set(['PENDING_DEPT', 'DEPT_APPROVED', 'COST_CONTROL_APPROVED', 'FINANCE_APPROVED']),
);

function approvalActionError(message, statusCode = 423, code = 'APPROVAL_ACTION_BLOCKED') {
    return Object.assign(new Error(message), { statusCode, code });
}

/**
 * Returns stepNumber of the first PENDING step, or null if none.
 * @param {Array<{ stepNumber: number, status?: string }>} steps
 */
function resolveFirstPendingApprovalStepNumber(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return null;
    // Prisma may return steps unordered — always pick lowest pending stepNumber.
    const pending = [...steps]
        .filter((s) => String(s.status || '').trim().toUpperCase() === 'PENDING')
        .sort((a, b) => Number(a.stepNumber) - Number(b.stepNumber));
    return pending.length ? pending[0].stepNumber : null;
}

/**
 * @param {object} approvalRequest — must include steps[]
 * @returns {{ currentStep: number, pendingStep: object|null, stepStatuses: Array<{ stepNumber: number, status: string }> }}
 */
function describeApprovalStepState(approvalRequest) {
    const steps = [...(approvalRequest?.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);
    const stepStatuses = steps.map((s) => ({
        stepNumber: s.stepNumber,
        status: String(s.status || '').trim().toUpperCase(),
    }));
    const pendingStep = steps.find((s) => String(s.status || '').trim().toUpperCase() === 'PENDING') ?? null;
    return {
        currentStep: approvalRequest?.currentStep ?? null,
        pendingStep,
        stepStatuses,
    };
}

/**
 * @param {object} params
 * @param {'BREAKAGE'|'LOST'} params.moduleKey
 * @param {string} params.documentStatus — movementDocument.status
 * @param {object|null} params.approvalRequest
 * @param {'APPROVE'|'REJECT'|string} params.action
 * @param {object|null} params.currentStep — approval step at approvalRequest.currentStep
 */
function assertMovementApprovalActionAllowed({
    moduleKey,
    documentStatus,
    approvalRequest,
    action,
    currentStep,
}) {
    const actionNorm = String(action || '').trim().toUpperCase();
    if (actionNorm !== 'APPROVE' && actionNorm !== 'REJECT') {
        throw approvalActionError(`Invalid approval action: ${action}`, 400, 'INVALID_APPROVAL_ACTION');
    }

    const docStatus = String(documentStatus || '').trim().toUpperCase();
    if (TERMINAL_DOC_STATUSES.has(docStatus)) {
        const label = docStatus === 'APPROVED' ? 'APPROVED and locked' : docStatus;
        throw approvalActionError(
            `Document is ${label}. No further approval actions allowed (Ch.2.7).`,
            docStatus === 'REJECTED' ? 400 : 423,
        );
    }

    if (!approvalRequest) {
        throw approvalActionError(
            `${moduleKey} document has no approval request for workflow actions.`,
            404,
            'APPROVAL_REQUEST_MISSING',
        );
    }

    const requestStatus = String(approvalRequest.status || '').trim().toUpperCase();
    if (requestStatus !== 'PENDING') {
        throw approvalActionError(
            `Approval request is ${requestStatus || 'unknown'}; only active PENDING requests accept actions.`,
            423,
            'APPROVAL_REQUEST_NOT_ACTIVE',
        );
    }

    if (!MOVEMENT_APPROVAL_PIPELINE_STATUSES.has(docStatus)) {
        throw approvalActionError(
            `Document status ${docStatus || 'unknown'} does not allow approval workflow actions. Submit or advance the document first.`,
            423,
            'DOCUMENT_STATUS_NOT_IN_APPROVAL_PIPELINE',
        );
    }

    const currentStepNo = approvalRequest.currentStep;
    if (!currentStep) {
        throw approvalActionError(`Step ${currentStepNo} not found in approval chain.`, 404);
    }

    if (currentStep.stepNumber !== currentStepNo) {
        throw approvalActionError(
            `Step ${currentStep.stepNumber} is not the current approval step (${currentStepNo}).`,
            400,
            'APPROVAL_STEP_NOT_CURRENT',
        );
    }

    const stepStatus = String(currentStep.status || '').trim().toUpperCase();
    if (stepStatus !== 'PENDING') {
        throw approvalActionError(
            `Step ${currentStepNo} has already been ${stepStatus}.`,
            400,
            'APPROVAL_STEP_NOT_PENDING',
        );
    }
}

module.exports = {
    assertMovementApprovalActionAllowed,
    resolveFirstPendingApprovalStepNumber,
    describeApprovalStepState,
    TERMINAL_DOC_STATUSES,
    MOVEMENT_APPROVAL_PIPELINE_STATUSES,
};
