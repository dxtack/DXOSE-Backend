'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    countStatusForPendingStep,
    inferLegacyCountApprovalState,
    submitApprovalProjection,
} = require('./acc-workflow-count.runtime');

const STOCK_COUNT_CHAIN = {
    versionId: 'wfv-count-1',
    roleCodes: ['COST_CONTROL', 'DEPT_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER'],
    steps: [
        { stepOrder: 1, roleCode: 'COST_CONTROL', statusKey: 'PENDING_COST_CONTROL' },
        { stepOrder: 2, roleCode: 'DEPT_MANAGER', statusKey: 'PENDING_DEPT' },
        { stepOrder: 3, roleCode: 'FINANCE_MANAGER', statusKey: 'PENDING_FINANCE' },
        { stepOrder: 4, roleCode: 'GENERAL_MANAGER', statusKey: 'PENDING_GM' },
    ],
};

test('countStatusForPendingStep — CC step 1 → PENDING_COST_CONTROL', () => {
    assert.equal(countStatusForPendingStep(STOCK_COUNT_CHAIN, 1), 'PENDING_COST_CONTROL');
});

test('countStatusForPendingStep — GM step 4 → PENDING_GM', () => {
    assert.equal(countStatusForPendingStep(STOCK_COUNT_CHAIN, 4), 'PENDING_GM');
});

test('submitApprovalProjection — first live approver is Department Manager', () => {
    const result = submitApprovalProjection(STOCK_COUNT_CHAIN);
    assert.equal(result.status, 'PENDING_DEPT');
    assert.equal(result.pendingStepNumber, 2);
    assert.deepEqual(result.autoApproveStepNumbers, [1]);
});

test('inferLegacyCountApprovalState — PENDING_FINANCE on 4-step chain', () => {
    assert.equal(inferLegacyCountApprovalState('PENDING_FINANCE', STOCK_COUNT_CHAIN).approvedCount, 2);
    assert.equal(inferLegacyCountApprovalState('PENDING_FINANCE', STOCK_COUNT_CHAIN).pendingStep, 3);
});
