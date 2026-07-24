'use strict';

/**
 * Get Pass Workflow Context — SSOT Template v1.1
 */

const { resolveGetPassPermission } = require('../acc-authority/workflow-step-permissions');
const { isSendBackReturned } = require('../platform/lifecyclePresentation.service');

const STEP_KEY_BY_STATUS = Object.freeze({
    DRAFT: 'SUBMIT',
    PENDING_DEPT: 'DEPT_APPROVAL',
    PENDING_COST_CONTROL: 'COST_CONTROL_VERIFY',
    PENDING_FINANCE: 'FINANCE_SIGN',
    PENDING_GM: 'GM_AUTHORIZE',
    PENDING_SECURITY: 'SECURITY_EXIT',
    OUT: 'OUT',
    PARTIALLY_RETURNED: 'OUT',
    RECEIVED_AT_DESTINATION: 'OUT',
    RETURNING: 'OUT',
    RETURN_RECEIVED_AT_GATE: 'OUT',
    RETURNED: 'CLOSED',
    CLOSED: 'CLOSED',
    REJECTED: 'REJECTED',
    PENDING_FORCE_CLOSE_SETTLEMENT: 'FORCE_CLOSE',
});

/** Hotel create actors — Dept Manager / Storekeeper (+ governance). */
const GET_PASS_CREATE_ACTOR_ROLES = Object.freeze([
    'DEPT_MANAGER',
    'STOREKEEPER',
    'ORG_MANAGER',
    'SUPER_ADMIN',
]);

const ACC_PENDING = new Set([
    'PENDING_DEPT',
    'PENDING_COST_CONTROL',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_SECURITY',
]);

function normalizeRole(code) {
    return String(code || '')
        .trim()
        .toUpperCase();
}

function isGetPassCreateActorRole(roleCode) {
    return GET_PASS_CREATE_ACTOR_ROLES.includes(normalizeRole(roleCode));
}

function stepNumberForStatus(chain, status) {
    const s = String(status || '').toUpperCase();
    if (!chain?.steps?.length) return null;
    const idx = chain.steps.findIndex(
        (step) => String(step.statusKey || '').toUpperCase() === s,
    );
    return idx >= 0 ? idx + 1 : null;
}

function chainStepForStatus(chain, status) {
    const n = stepNumberForStatus(chain, status);
    if (!n || !chain?.steps) return null;
    return chain.steps[n - 1] || null;
}

/**
 * @param {object} getPass
 * @param {object|null} chain - resolveWorkflow* result
 */
function buildGetPassWorkflowContext(getPass, chain = null) {
    const status = String(getPass.status || '').toUpperCase();
    const workflowVersion =
        getPass.accWorkflowVersionId || chain?.versionId || chain?.versionNumber || null;
    const stepKey = STEP_KEY_BY_STATUS[status] || null;
    const isInternal = getPass.isInternalTransfer === true;

    if (status === 'CLOSED' || status === 'RETURNED' || status === 'REJECTED') {
        return {
            currentStepKey: status === 'REJECTED' ? 'REJECTED' : 'CLOSED',
            stepType: 'TERMINAL',
            sourceOfTruth: 'Static System Rule',
            actorResolution: null,
            requiredPermission: 'GET_PASS_VIEW',
            requiredRoleCode: null,
            allowedActionKeys: ['VIEW'],
            workflowVersion,
            currentStepNumber: null,
            awaitingStatus: status,
        };
    }

    if (status === 'DRAFT') {
        const returnedToCreator = isSendBackReturned(status, getPass.notes);
        return {
            currentStepKey: 'SUBMIT',
            stepType: 'PRE_WORKFLOW',
            sourceOfTruth: 'Static System Rule',
            actorResolution: 'Creator',
            requiredPermission: 'GET_PASS_CREATE',
            requiredRoleCode: null,
            // Returned: creator may resubmit or reject — never send-back (no prior step).
            allowedActionKeys: returnedToCreator ? ['SUBMIT', 'REJECT'] : ['SUBMIT'],
            workflowVersion,
            currentStepNumber: null,
            awaitingStatus: status,
        };
    }

    if (ACC_PENDING.has(status)) {
        const stepNumber = stepNumberForStatus(chain, status);
        const chainStep = chainStepForStatus(chain, status);
        const requiredPermission =
            chainStep?.permissionCode ||
            resolveGetPassPermission(status, chainStep?.roleCode || null, { isInternalTransfer: isInternal });
        const isSecurity = status === 'PENDING_SECURITY';
        const stepType = isSecurity ? 'POSTING' : 'APPROVAL';

        return {
            currentStepKey: stepKey,
            stepType,
            sourceOfTruth: 'Published ACC',
            actorResolution: stepNumber != null ? `ACC.Step(${stepNumber})` : null,
            requiredPermission,
            requiredRoleCode: chainStep?.roleCode || null,
            allowedActionKeys: ['APPROVE', 'REJECT', 'SEND_BACK'],
            workflowVersion,
            currentStepNumber: stepNumber,
            awaitingStatus: status,
        };
    }

    if (status === 'PENDING_FORCE_CLOSE_SETTLEMENT') {
        return {
            currentStepKey: 'FORCE_CLOSE',
            stepType: 'APPROVAL',
            sourceOfTruth: 'Static System Rule',
            actorResolution: null,
            requiredPermission: 'GET_PASS_FORCE_CLOSE_APPROVE',
            requiredRoleCode: null,
            allowedActionKeys: ['FORCE_CLOSE', 'VIEW'],
            workflowVersion,
            currentStepNumber: null,
            awaitingStatus: status,
        };
    }

    // OUT / return lifecycle — ops keys (FE keeps specialized gates)
    return {
        currentStepKey: stepKey || 'OUT',
        stepType: 'PRE_WORKFLOW',
        sourceOfTruth: 'Static System Rule',
        actorResolution: null,
        requiredPermission: resolveGetPassPermission(status, null, { isInternalTransfer: isInternal }),
        requiredRoleCode: null,
        allowedActionKeys: ['VIEW', 'RETURN', 'CONFIRM_DESTINATION'],
        workflowVersion,
        currentStepNumber: null,
        awaitingStatus: status,
    };
}

module.exports = {
    STEP_KEY_BY_STATUS,
    GET_PASS_CREATE_ACTOR_ROLES,
    isGetPassCreateActorRole,
    buildGetPassWorkflowContext,
};
