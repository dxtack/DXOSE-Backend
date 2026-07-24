'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    countStatusForPendingStep,
    inferLegacyCountApprovalState,
    submitApprovalProjection,
    LEGACY_COUNT_APPROVAL_MATRIX_4,
} = require('./acc-workflow-count.runtime');
const {
    isCountPrepareRole,
    isCountExecuteRole,
    sendBackPlanForActor,
    buildApprovalStepCreates,
} = require('./inventory-count-workflow.helpers');

const CHAIN_4 = {
    versionId: 'wfv-4',
    roleCodes: ['COST_CONTROL', 'DEPT_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER'],
    steps: [
        { stepOrder: 1, roleCode: 'COST_CONTROL', statusKey: 'PENDING_COST_CONTROL' },
        { stepOrder: 2, roleCode: 'DEPT_MANAGER', statusKey: 'PENDING_DEPT' },
        { stepOrder: 3, roleCode: 'FINANCE_MANAGER', statusKey: 'PENDING_FINANCE' },
        { stepOrder: 4, roleCode: 'GENERAL_MANAGER', statusKey: 'PENDING_GM' },
    ],
};

test('submitApprovalProjection — Cost Control auto-approved; Dept Manager is first live step', () => {
    const projection = submitApprovalProjection(CHAIN_4);
    assert.equal(projection.pendingStepNumber, 2);
    assert.equal(projection.status, 'PENDING_DEPT');
    assert.deepEqual(projection.autoApproveStepNumbers, [1]);
});

test('countStatusForPendingStep — 4-step ACC chain', () => {
    assert.equal(countStatusForPendingStep(CHAIN_4, 1), 'PENDING_COST_CONTROL');
    assert.equal(countStatusForPendingStep(CHAIN_4, 2), 'PENDING_DEPT');
    assert.equal(countStatusForPendingStep(CHAIN_4, 3), 'PENDING_FINANCE');
    assert.equal(countStatusForPendingStep(CHAIN_4, 4), 'PENDING_GM');
});

test('inferLegacyCountApprovalState — 4-step matrix', () => {
    assert.equal(inferLegacyCountApprovalState('PENDING_DEPT', CHAIN_4).approvedCount, 1);
    assert.equal(inferLegacyCountApprovalState('PENDING_FINANCE', CHAIN_4).pendingStep, 3);
    assert.equal(inferLegacyCountApprovalState('PENDING_GM', CHAIN_4).approvedCount, 3);
});

test('role gates — Storekeeper/Receiving prepare only; Cost Control executes', () => {
    assert.equal(isCountPrepareRole('STOREKEEPER'), true);
    assert.equal(isCountPrepareRole('RECEIVER'), false); // retired P1 #22
    assert.equal(isCountPrepareRole('RECEIVING'), true);
    assert.equal(isCountPrepareRole('COST_CONTROL'), true);
    assert.equal(isCountPrepareRole('DEPT_MANAGER'), false);
    assert.equal(isCountExecuteRole('COST_CONTROL'), true);
    assert.equal(isCountExecuteRole('STOREKEEPER'), true);
    assert.equal(isCountExecuteRole('RECEIVER'), false);
});

test('sendBackPlanForActor — Dept→CC, Finance→Dept, GM→Finance', () => {
    assert.equal(sendBackPlanForActor('DEPT_MANAGER').returnStatus, 'REVEAL_REVIEW');
    assert.equal(sendBackPlanForActor('FINANCE_MANAGER').returnStatus, 'PENDING_DEPT');
    assert.equal(sendBackPlanForActor('GENERAL_MANAGER').returnStatus, 'PENDING_FINANCE');
});

test('buildApprovalStepCreates — auto-approves Cost Control on submit', () => {
    const steps = buildApprovalStepCreates(CHAIN_4.roleCodes, {
        autoApproveStepNumbers: [1],
        autoApprovedBy: 'user-cc',
    });
    assert.equal(steps[0].status, 'APPROVED');
    assert.equal(steps[1].status, 'PENDING');
    assert.deepEqual(steps[0].actedByUser, { connect: { id: 'user-cc' } });
});

test('LEGACY_COUNT_APPROVAL_MATRIX_4 — explicit entries', () => {
    assert.ok(LEGACY_COUNT_APPROVAL_MATRIX_4.PENDING_DEPT);
    assert.ok(LEGACY_COUNT_APPROVAL_MATRIX_4.PENDING_FINANCE);
});
