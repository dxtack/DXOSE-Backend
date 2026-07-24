'use strict';

/**
 * GRN Workflow Context builder — SSOT Template v1.1
 * Pre-workflow steps are static; ACC steps resolve from published/pinned chain.
 */

const STEP_KEYS = Object.freeze({
    CREATE: 'CREATE',
    VALIDATE: 'VALIDATE',
    SUBMIT: 'SUBMIT',
    COST_REVIEW: 'COST_REVIEW',
    FINANCE_POST: 'FINANCE_POST',
    POSTED: 'POSTED',
    REJECTED: 'REJECTED',
});

/** Static create-actor roles (hotel receiving). Governance overrides allowed. */
const GRN_CREATE_ACTOR_ROLES = Object.freeze(['STOREKEEPER', 'ORG_MANAGER', 'SUPER_ADMIN']);

function normalizeRole(code) {
    return String(code || '')
        .trim()
        .toUpperCase();
}

function isGrnCreateActorRole(roleCode) {
    return GRN_CREATE_ACTOR_ROLES.includes(normalizeRole(roleCode));
}

function resolveChainStep(chain, stepNumber) {
    if (!chain?.steps?.length || !stepNumber) return null;
    return (
        chain.steps.find((s) => Number(s.stepOrder) === Number(stepNumber)) ||
        chain.steps[stepNumber - 1] ||
        null
    );
}

function pendingApprovalStepNumber(grn) {
    const ar = grn.approvalRequest;
    if (ar && Number(ar.currentStep) > 0) return Number(ar.currentStep);
    if (grn.status === 'PENDING_FINANCE') return 2;
    if (grn.status === 'PENDING_APPROVAL') return 1;
    return null;
}

/**
 * @param {object} grn - prisma grnImport (+ approvalRequest)
 * @param {object|null} chain - resolveWorkflow* result
 * @returns {object} workflow context for detail API
 */
function buildGrnWorkflowContext(grn, chain = null) {
    const status = String(grn.status || '').toUpperCase();
    const workflowVersion =
        grn.accWorkflowVersionId || chain?.versionId || chain?.versionNumber || null;

    if (status === 'POSTED') {
        return {
            currentStepKey: STEP_KEYS.POSTED,
            stepType: 'TERMINAL',
            sourceOfTruth: 'Static System Rule',
            actorResolution: null,
            requiredPermission: 'GRN_VIEW',
            requiredRoleCode: null,
            allowedActionKeys: ['VIEW', 'EVIDENCE'],
            workflowVersion,
            currentStepNumber: null,
        };
    }

    if (status === 'REJECTED') {
        return {
            currentStepKey: STEP_KEYS.REJECTED,
            stepType: 'TERMINAL',
            sourceOfTruth: 'Static System Rule',
            actorResolution: 'Creator',
            requiredPermission: 'GRN_MANAGE',
            requiredRoleCode: null,
            allowedActionKeys: ['VIEW'],
            workflowVersion,
            currentStepNumber: null,
        };
    }

    if (status === 'DRAFT') {
        const { isSendBackReturned } = require('../platform/lifecyclePresentation.service');
        const returnedToCreator =
            isSendBackReturned(status, grn.notes) ||
            Number(grn.approvalRequest?.currentStep) === 0;
        return {
            currentStepKey: returnedToCreator ? STEP_KEYS.SUBMIT : STEP_KEYS.VALIDATE,
            stepType: 'PRE_WORKFLOW',
            sourceOfTruth: 'Static System Rule',
            actorResolution: 'Creator',
            requiredPermission: 'GRN_MANAGE',
            requiredRoleCode: null,
            // Returned: creator may resubmit or reject — not Validate / Approve / Send Back.
            allowedActionKeys: returnedToCreator ? ['SUBMIT', 'REJECT'] : ['VALIDATE'],
            workflowVersion,
            currentStepNumber: returnedToCreator ? 0 : null,
        };
    }

    if (status === 'VALIDATED') {
        return {
            currentStepKey: STEP_KEYS.SUBMIT,
            stepType: 'PRE_WORKFLOW',
            sourceOfTruth: 'Static System Rule',
            actorResolution: 'Creator',
            requiredPermission: 'GRN_MANAGE',
            requiredRoleCode: null,
            allowedActionKeys: ['SUBMIT'],
            workflowVersion,
            currentStepNumber: null,
        };
    }

    if (status === 'PENDING_APPROVAL' || status === 'PENDING_FINANCE') {
        const stepNumber = pendingApprovalStepNumber(grn);
        const chainStep = resolveChainStep(chain, stepNumber);
        const totalSteps = Number(grn.approvalRequest?.totalSteps) || chain?.steps?.length || 2;
        const isFinal =
            status === 'PENDING_FINANCE' ||
            (stepNumber != null && stepNumber >= totalSteps);

        const currentStepKey = isFinal ? STEP_KEYS.FINANCE_POST : STEP_KEYS.COST_REVIEW;
        const stepType = isFinal ? 'POSTING' : 'APPROVAL';
        const roleFromApproval = grn.approvalRequest?.steps?.find(
            (s) => Number(s.stepNumber) === Number(stepNumber),
        )?.requiredRole?.code;

        return {
            currentStepKey,
            stepType,
            sourceOfTruth: 'Published ACC',
            actorResolution: stepNumber != null ? `ACC.Step(${stepNumber})` : null,
            requiredPermission: chainStep?.permissionCode || 'GRN_MANAGE',
            requiredRoleCode: chainStep?.roleCode || roleFromApproval || null,
            allowedActionKeys: isFinal
                ? ['APPROVE_POST', 'REJECT', 'SEND_BACK']
                : ['APPROVE', 'REJECT', 'SEND_BACK'],
            workflowVersion,
            currentStepNumber: stepNumber,
        };
    }

    return {
        currentStepKey: null,
        stepType: 'TERMINAL',
        sourceOfTruth: 'Static System Rule',
        actorResolution: null,
        requiredPermission: 'GRN_VIEW',
        requiredRoleCode: null,
        allowedActionKeys: ['VIEW'],
        workflowVersion,
        currentStepNumber: null,
    };
}

module.exports = {
    STEP_KEYS,
    GRN_CREATE_ACTOR_ROLES,
    isGrnCreateActorRole,
    buildGrnWorkflowContext,
};
