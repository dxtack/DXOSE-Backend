'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    documentStatusForPendingStep,
    documentStatusAfterApprovingStep,
    submitStatusFromApproval,
    inferApprovedStepCountFromDocumentStatus,
} = require('./acc-workflow-movement.runtime');

const sampleChain = {
    steps: [
        { stepOrder: 1, statusKey: 'DEPT_REVIEW' },
        { stepOrder: 2, statusKey: 'COST_REVIEW' },
        { stepOrder: 3, statusKey: 'FINANCE_REVIEW' },
    ],
};

test('documentStatusForPendingStep — step 1 pending uses PENDING_DEPT', () => {
    assert.equal(documentStatusForPendingStep(sampleChain, 1), 'PENDING_DEPT');
});

test('documentStatusForPendingStep — step 2 pending uses previous step statusKey', () => {
    assert.equal(documentStatusForPendingStep(sampleChain, 2), 'DEPT_REVIEW');
});

test('submitStatusFromApproval — derives status from first pending step', () => {
    const result = submitStatusFromApproval(sampleChain, [
        { stepNumber: 1, status: 'PENDING' },
        { stepNumber: 2, status: 'PENDING' },
    ]);
    assert.equal(result.status, 'PENDING_DEPT');
    assert.equal(result.pendingStepNumber, 1);
});

test('inferApprovedStepCountFromDocumentStatus — maps chain status keys', () => {
    assert.equal(inferApprovedStepCountFromDocumentStatus(sampleChain, 'DEPT_REVIEW'), 1);
    assert.equal(inferApprovedStepCountFromDocumentStatus(sampleChain, 'COST_REVIEW'), 2);
    assert.equal(inferApprovedStepCountFromDocumentStatus(sampleChain, 'DRAFT'), 0);
});

test('documentStatusAfterApprovingStep — returns approved step statusKey', () => {
    assert.equal(documentStatusAfterApprovingStep(sampleChain, 1), 'DEPT_REVIEW');
    assert.equal(documentStatusAfterApprovingStep(sampleChain, 3), 'FINANCE_REVIEW');
});
