'use strict';

/**
 * Inventory Count Workflow Context — SSOT Template v1.1
 */

const COUNT_CREATE_ACTOR_ROLES = Object.freeze([
    'STOREKEEPER',
    'COST_CONTROL',
    'RECEIVING',
    'ORG_MANAGER',
    'SUPER_ADMIN',
]);

const STEP_KEY_BY_STATUS = Object.freeze({
    DRAFT: 'PREPARE',
    COUNTING: 'EXECUTE',
    RECOUNTING: 'EXECUTE',
    REVEAL_REVIEW: 'REVEAL',
    PENDING_COST_CONTROL: 'COST_CONTROL_CERTIFY',
    PENDING_DEPT: 'DEPT_APPROVAL',
    PENDING_FINANCE: 'FINANCE_APPROVAL',
    PENDING_GM: 'GM_APPROVAL',
    PENDING_APPROVAL: 'FINANCE_APPROVAL',
    FINANCE_APPROVED: 'GM_APPROVAL',
    POSTED: 'POSTED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
    VOID: 'VOID',
});

function normalizeRole(code) {
    return String(code || '')
        .trim()
        .toUpperCase();
}

function isInventoryCountCreateActorRole(roleCode) {
    return COUNT_CREATE_ACTOR_ROLES.includes(normalizeRole(roleCode));
}

function pendingStepFromApproval(approvalRequest) {
    if (!approvalRequest?.steps?.length) return null;
    const cur = Number(approvalRequest.currentStep);
    if (Number.isFinite(cur) && cur > 0) {
        const at = approvalRequest.steps.find((s) => Number(s.stepNumber) === cur && s.status === 'PENDING');
        if (at) return at;
    }
    return approvalRequest.steps.find((s) => s.status === 'PENDING') || null;
}

function buildInventoryCountWorkflowContext(session, chain = null) {
    const status = String(session.status || '').toUpperCase();
    const workflowVersion =
        session.accWorkflowVersionId ||
        session.approvalRequest?.accWorkflowVersionId ||
        chain?.versionId ||
        null;
    const stepKey = STEP_KEY_BY_STATUS[status] || null;

    if (['POSTED', 'REJECTED', 'CANCELLED', 'VOID'].includes(status)) {
        return {
            currentStepKey: stepKey || status,
            stepType: 'TERMINAL',
            sourceOfTruth: 'Static System Rule',
            actorResolution: null,
            requiredPermission: 'STOCK_COUNT_VIEW',
            requiredRoleCode: null,
            allowedActionKeys: ['VIEW'],
            workflowVersion,
            currentStepNumber: null,
            awaitingStatus: status,
        };
    }

    if (status === 'DRAFT') {
        return {
            currentStepKey: 'PREPARE',
            stepType: 'PRE_WORKFLOW',
            sourceOfTruth: 'Static System Rule',
            actorResolution: 'Creator',
            requiredPermission: 'STOCK_COUNT_CREATE',
            requiredRoleCode: null,
            allowedActionKeys: ['START', 'CANCEL'],
            workflowVersion,
            currentStepNumber: null,
            awaitingStatus: status,
        };
    }

    if (status === 'COUNTING' || status === 'RECOUNTING') {
        return {
            currentStepKey: 'EXECUTE',
            stepType: 'PRE_WORKFLOW',
            sourceOfTruth: 'Static System Rule',
            actorResolution: 'Creator / STOCK_COUNT_EXECUTE',
            requiredPermission: 'STOCK_COUNT_EXECUTE',
            requiredRoleCode: null,
            allowedActionKeys: ['SUBMIT_COUNTS', 'CANCEL'],
            workflowVersion,
            currentStepNumber: null,
            awaitingStatus: status,
        };
    }

    if (status === 'REVEAL_REVIEW') {
        return {
            currentStepKey: 'REVEAL',
            stepType: 'PRE_WORKFLOW',
            sourceOfTruth: 'Static System Rule',
            actorResolution: 'Creator / STOCK_COUNT_SUBMIT',
            requiredPermission: 'STOCK_COUNT_SUBMIT',
            requiredRoleCode: null,
            allowedActionKeys: ['SUBMIT_APPROVAL', 'RECOUNT'],
            workflowVersion,
            currentStepNumber: null,
            awaitingStatus: status,
        };
    }

    const pending = pendingStepFromApproval(session.approvalRequest || session.approvalRequests?.[0]);
    const stepNumber = pending ? Number(pending.stepNumber) : null;
    const roleCode =
        pending?.requiredRole?.code ||
        pending?.requiredRole ||
        chain?.steps?.find((s) => Number(s.stepOrder) === stepNumber)?.roleCode ||
        null;
    const isFinal =
        status === 'PENDING_GM' ||
        status === 'FINANCE_APPROVED' ||
        (stepNumber != null &&
            session.approvalRequest?.totalSteps &&
            stepNumber >= Number(session.approvalRequest.totalSteps));

    return {
        currentStepKey: stepKey || 'COST_CONTROL_CERTIFY',
        stepType: isFinal ? 'POSTING' : 'APPROVAL',
        sourceOfTruth: 'Published ACC',
        actorResolution: stepNumber != null ? `ACC.Step(${stepNumber})` : null,
        requiredPermission: 'APPROVE_INVENTORY_COUNT',
        requiredRoleCode: roleCode ? normalizeRole(roleCode) : null,
        allowedActionKeys: isFinal
            ? ['APPROVE_POST', 'REJECT', 'SEND_BACK']
            : ['APPROVE', 'REJECT', 'SEND_BACK'],
        workflowVersion,
        currentStepNumber: stepNumber,
        awaitingStatus: status,
    };
}

module.exports = {
    COUNT_CREATE_ACTOR_ROLES,
    isInventoryCountCreateActorRole,
    buildInventoryCountWorkflowContext,
};
