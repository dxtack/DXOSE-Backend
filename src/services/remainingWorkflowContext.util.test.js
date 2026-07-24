'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isInventoryCountCreateActorRole,
    buildInventoryCountWorkflowContext,
} = require('./inventoryCountWorkflowContext.util');
const {
    isTransferCreateActorRole,
    buildTransferWorkflowContext,
} = require('./transferWorkflowContext.util');
const {
    isMovementCreateActorRole,
    buildBreakageLostWorkflowContext,
} = require('./breakageLostWorkflowContext.util');

test('count create actors exclude finance', () => {
    assert.equal(isInventoryCountCreateActorRole('STOREKEEPER'), true);
    assert.equal(isInventoryCountCreateActorRole('COST_CONTROL'), true);
    assert.equal(isInventoryCountCreateActorRole('FINANCE_MANAGER'), false);
});

test('count PENDING_DEPT is ACC approval', () => {
    const wf = buildInventoryCountWorkflowContext({
        status: 'PENDING_DEPT',
        approvalRequest: {
            currentStep: 2,
            totalSteps: 4,
            steps: [
                { stepNumber: 1, status: 'APPROVED', requiredRole: { code: 'COST_CONTROL' } },
                { stepNumber: 2, status: 'PENDING', requiredRole: { code: 'DEPT_MANAGER' } },
            ],
        },
    });
    assert.equal(wf.currentStepKey, 'DEPT_APPROVAL');
    assert.equal(wf.requiredRoleCode, 'DEPT_MANAGER');
    assert.ok(wf.allowedActionKeys.includes('APPROVE'));
});

test('transfer create actors exclude finance', () => {
    assert.equal(isTransferCreateActorRole('DEPT_MANAGER'), true);
    assert.equal(isTransferCreateActorRole('FINANCE_MANAGER'), false);
});

test('transfer PENDING_FINANCE → FINANCE_POST', () => {
    const wf = buildTransferWorkflowContext({
        status: 'PENDING_FINANCE',
        approvalRequest: {
            currentStep: 2,
            steps: [{ stepNumber: 2, status: 'PENDING', requiredRole: { code: 'FINANCE_MANAGER' } }],
        },
        pendingRoleCode: 'FINANCE_MANAGER',
    });
    assert.equal(wf.currentStepKey, 'FINANCE_POST');
    assert.ok(wf.allowedActionKeys.includes('APPROVE_POST'));
});

test('breakage/lost create actors exclude finance and cost', () => {
    assert.equal(isMovementCreateActorRole('DEPT_MANAGER'), true);
    assert.equal(isMovementCreateActorRole('COST_CONTROL'), false);
    assert.equal(isMovementCreateActorRole('FINANCE_MANAGER'), false);
});

test('breakage DRAFT → SUBMIT', () => {
    const wf = buildBreakageLostWorkflowContext({ status: 'DRAFT' }, 'BREAKAGE');
    assert.equal(wf.currentStepKey, 'SUBMIT');
    assert.deepEqual(wf.allowedActionKeys, ['SUBMIT']);
});
