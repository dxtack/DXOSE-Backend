'use strict';

/**
 * Transfer Workflow Context — SSOT Template v1.1
 */

const TRANSFER_CREATE_ACTOR_ROLES = Object.freeze([
    'DEPT_MANAGER',
    'STOREKEEPER',
    'ORG_MANAGER',
    'SUPER_ADMIN',
]);

function normalizeRole(code) {
    return String(code || '')
        .trim()
        .toUpperCase();
}

function isTransferCreateActorRole(roleCode) {
    return TRANSFER_CREATE_ACTOR_ROLES.includes(normalizeRole(roleCode));
}

function buildTransferWorkflowContext(trf, chain = null) {
    const status = String(trf.status || '').toUpperCase();
    const workflowVersion =
        trf.accWorkflowVersionId ||
        trf.approvalRequest?.accWorkflowVersionId ||
        chain?.versionId ||
        null;

    if (status === 'POSTED' || status === 'REJECTED' || status === 'CLOSED' || status === 'RECEIVED') {
        return {
            currentStepKey: status === 'REJECTED' ? 'REJECTED' : 'POSTED',
            stepType: 'TERMINAL',
            sourceOfTruth: 'Static System Rule',
            actorResolution: null,
            requiredPermission: 'TRANSFER_VIEW',
            requiredRoleCode: null,
            allowedActionKeys: ['VIEW'],
            workflowVersion,
            currentStepNumber: null,
            awaitingStatus: status,
        };
    }

    if (status === 'DRAFT') {
        const { isSendBackReturned } = require('../platform/lifecyclePresentation.service');
        const returnedToCreator =
            isSendBackReturned(status, trf.notes) ||
            Number(trf.approvalRequest?.currentStep) === 0;
        return {
            currentStepKey: 'SUBMIT',
            stepType: 'PRE_WORKFLOW',
            sourceOfTruth: 'Static System Rule',
            actorResolution: 'Creator',
            requiredPermission: 'TRANSFER_CREATE',
            requiredRoleCode: null,
            // Returned: creator may resubmit or reject — never approve / send-back.
            allowedActionKeys: returnedToCreator ? ['SUBMIT', 'REJECT'] : ['SUBMIT'],
            workflowVersion,
            currentStepNumber: returnedToCreator ? 0 : null,
            awaitingStatus: status,
        };
    }

    if (status === 'PENDING_DEPT' || status === 'PENDING_FINANCE') {
        const ar = trf.approvalRequest;
        const stepNumber = ar?.currentStep != null ? Number(ar.currentStep) : status === 'PENDING_DEPT' ? 1 : 2;
        const step = ar?.steps?.find((s) => Number(s.stepNumber) === stepNumber);
        const chainStep = chain?.steps?.find((s) => Number(s.stepOrder) === stepNumber);
        const isFinance = status === 'PENDING_FINANCE';
        return {
            currentStepKey: isFinance ? 'FINANCE_POST' : 'DEPT_APPROVAL',
            stepType: isFinance ? 'POSTING' : 'APPROVAL',
            sourceOfTruth: 'Published ACC',
            actorResolution: `ACC.Step(${stepNumber})`,
            requiredPermission: chainStep?.permissionCode || 'TRANSFER_APPROVE',
            requiredRoleCode:
                normalizeRole(step?.requiredRole?.code || chainStep?.roleCode || trf.pendingRoleCode) || null,
            allowedActionKeys: isFinance
                ? ['APPROVE_POST', 'REJECT', 'SEND_BACK']
                : ['APPROVE', 'REJECT', 'SEND_BACK'],
            workflowVersion,
            currentStepNumber: stepNumber,
            awaitingStatus: status,
        };
    }

    return {
        currentStepKey: status,
        stepType: 'TERMINAL',
        sourceOfTruth: 'Static System Rule',
        actorResolution: null,
        requiredPermission: 'TRANSFER_VIEW',
        requiredRoleCode: null,
        allowedActionKeys: ['VIEW'],
        workflowVersion,
        currentStepNumber: null,
        awaitingStatus: status,
    };
}

module.exports = {
    TRANSFER_CREATE_ACTOR_ROLES,
    isTransferCreateActorRole,
    buildTransferWorkflowContext,
};
