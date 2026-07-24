'use strict';

/**
 * Breakage / Lost shared Workflow Context — SSOT Template v1.1
 * ACC module family = BREAKAGE for both document types.
 */

const MOVEMENT_CREATE_ACTOR_ROLES = Object.freeze([
    'DEPT_MANAGER',
    'STOREKEEPER',
    'ORG_MANAGER',
    'SUPER_ADMIN',
]);

const STEP_KEY_BY_STATUS = Object.freeze({
    DRAFT: 'SUBMIT',
    PENDING_DEPT: 'DEPT_APPROVAL',
    DEPT_APPROVED: 'COST_CONTROL_APPROVAL',
    COST_CONTROL_APPROVED: 'FINANCE_APPROVAL',
    FINANCE_APPROVED: 'GM_APPROVAL',
    APPROVED: 'GM_APPROVAL',
    POSTED: 'POSTED',
    REJECTED: 'REJECTED',
    VOID: 'VOID',
});

function normalizeRole(code) {
    return String(code || '')
        .trim()
        .toUpperCase();
}

function isMovementCreateActorRole(roleCode) {
    return MOVEMENT_CREATE_ACTOR_ROLES.includes(normalizeRole(roleCode));
}

/**
 * Prisma MovementDocument.approvalRequests is a 1:1 optional object (despite plural name).
 * List/API layers may also wrap it as a one-element array — accept both.
 */
function getApproval(doc) {
    if (!doc || typeof doc !== 'object') return null;
    if (doc.approvalRequest && typeof doc.approvalRequest === 'object') return doc.approvalRequest;
    const ar = doc.approvalRequests;
    if (Array.isArray(ar) && ar.length) return ar[0];
    if (ar && typeof ar === 'object' && ar.id) return ar;
    return null;
}

/** Always expose approvalRequests as an array for FE contracts. */
function asApprovalRequestsArray(doc) {
    const approval = getApproval(doc);
    return approval ? [approval] : [];
}

function pendingStep(approval) {
    if (!approval?.steps?.length) return null;
    const steps = [...approval.steps].sort((a, b) => Number(a.stepNumber) - Number(b.stepNumber));
    const cur = Number(approval.currentStep);
    if (Number.isFinite(cur) && cur > 0) {
        const at = steps.find((s) => Number(s.stepNumber) === cur && s.status === 'PENDING');
        if (at) return at;
    }
    return steps.find((s) => s.status === 'PENDING') || null;
}

/**
 * @param {object} doc movement document
 * @param {'BREAKAGE'|'LOST'} family
 * @param {object|null} chain
 */
function buildBreakageLostWorkflowContext(doc, family = 'BREAKAGE', chain = null) {
    const status = String(doc.status || '').toUpperCase();
    const approval = getApproval(doc);
    const workflowVersion =
        doc.accWorkflowVersionId || approval?.accWorkflowVersionId || chain?.versionId || null;
    const approvePerm = family === 'LOST' ? 'APPROVE_LOST' : 'APPROVE_BREAKAGE';
    const createPerm = family === 'LOST' ? 'BREAKAGE_CREATE' : 'BREAKAGE_CREATE';
    const stepKey = STEP_KEY_BY_STATUS[status] || null;

    if (status === 'POSTED' || status === 'APPROVED' || status === 'REJECTED' || status === 'VOID') {
        return {
            currentStepKey: status === 'REJECTED' ? 'REJECTED' : status === 'VOID' ? 'VOID' : 'POSTED',
            stepType: 'TERMINAL',
            sourceOfTruth: 'Static System Rule',
            actorResolution: null,
            requiredPermission: family === 'LOST' ? 'LOST_ITEMS_VIEW' : 'BREAKAGE_VIEW',
            requiredRoleCode: null,
            allowedActionKeys: ['VIEW'],
            workflowVersion,
            currentStepNumber: null,
            awaitingStatus: status,
        };
    }

    if (status === 'DRAFT') {
        const { isSendBackReturned } = require('../platform/lifecyclePresentation.service');
        const returnedToCreator = isSendBackReturned(status, doc.notes);
        return {
            currentStepKey: 'SUBMIT',
            stepType: 'PRE_WORKFLOW',
            sourceOfTruth: 'Static System Rule',
            actorResolution: 'Creator',
            requiredPermission: createPerm,
            requiredRoleCode: null,
            // Returned: creator may resubmit or reject — never send-back / approve.
            allowedActionKeys: returnedToCreator ? ['SUBMIT', 'REJECT'] : ['SUBMIT'],
            workflowVersion,
            currentStepNumber: returnedToCreator ? 0 : null,
            awaitingStatus: status,
        };
    }

    const step = pendingStep(approval);
    const stepNumber = step ? Number(step.stepNumber) : null;
    const roleCode = step?.requiredRole?.code || step?.requiredRole || null;
    const total = Number(approval?.totalSteps) || chain?.steps?.length || 4;
    const isFinal = stepNumber != null && stepNumber >= total;

    return {
        currentStepKey: stepKey || 'COST_CONTROL_APPROVAL',
        stepType: isFinal ? 'POSTING' : 'APPROVAL',
        sourceOfTruth: 'Published ACC',
        actorResolution: stepNumber != null ? `ACC.Step(${stepNumber})` : null,
        requiredPermission: approvePerm,
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
    MOVEMENT_CREATE_ACTOR_ROLES,
    isMovementCreateActorRole,
    getApproval,
    asApprovalRequestsArray,
    buildBreakageLostWorkflowContext,
};
