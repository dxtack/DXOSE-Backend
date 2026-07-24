'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildGrnWorkflowContext,
    isGrnCreateActorRole,
} = require('./grnWorkflowContext.util');

test('isGrnCreateActorRole allows storekeeper and governance only', () => {
    assert.equal(isGrnCreateActorRole('STOREKEEPER'), true);
    assert.equal(isGrnCreateActorRole('ORG_MANAGER'), true);
    assert.equal(isGrnCreateActorRole('SUPER_ADMIN'), true);
    assert.equal(isGrnCreateActorRole('FINANCE_MANAGER'), false);
    assert.equal(isGrnCreateActorRole('COST_CONTROL'), false);
});

test('VALIDATED context is SUBMIT for Creator — no APPROVE', () => {
    const wf = buildGrnWorkflowContext({ status: 'VALIDATED', approvalRequestId: null });
    assert.equal(wf.currentStepKey, 'SUBMIT');
    assert.equal(wf.stepType, 'PRE_WORKFLOW');
    assert.deepEqual(wf.allowedActionKeys, ['SUBMIT']);
    assert.equal(wf.actorResolution, 'Creator');
});

test('PENDING_APPROVAL maps to COST_REVIEW with ACC actor', () => {
    const wf = buildGrnWorkflowContext(
        {
            status: 'PENDING_APPROVAL',
            approvalRequest: {
                currentStep: 1,
                totalSteps: 2,
                steps: [{ stepNumber: 1, requiredRole: { code: 'COST_CONTROL' } }],
            },
        },
        {
            versionId: 'ver-1',
            steps: [
                { stepOrder: 1, roleCode: 'COST_CONTROL', permissionCode: 'GRN_MANAGE', statusKey: 'PENDING_APPROVAL' },
                { stepOrder: 2, roleCode: 'FINANCE_MANAGER', permissionCode: 'GRN_MANAGE', statusKey: 'PENDING_FINANCE' },
            ],
        },
    );
    assert.equal(wf.currentStepKey, 'COST_REVIEW');
    assert.equal(wf.actorResolution, 'ACC.Step(1)');
    assert.equal(wf.requiredRoleCode, 'COST_CONTROL');
    assert.ok(wf.allowedActionKeys.includes('APPROVE'));
    assert.ok(!wf.allowedActionKeys.includes('APPROVE_POST'));
});

test('PENDING_FINANCE maps to FINANCE_POST with APPROVE_POST', () => {
    const wf = buildGrnWorkflowContext(
        {
            status: 'PENDING_FINANCE',
            approvalRequest: { currentStep: 2, totalSteps: 2, steps: [] },
        },
        {
            versionId: 'ver-1',
            steps: [
                { stepOrder: 1, roleCode: 'COST_CONTROL', permissionCode: 'GRN_MANAGE' },
                { stepOrder: 2, roleCode: 'FINANCE_MANAGER', permissionCode: 'GRN_MANAGE' },
            ],
        },
    );
    assert.equal(wf.currentStepKey, 'FINANCE_POST');
    assert.equal(wf.stepType, 'POSTING');
    assert.ok(wf.allowedActionKeys.includes('APPROVE_POST'));
});
