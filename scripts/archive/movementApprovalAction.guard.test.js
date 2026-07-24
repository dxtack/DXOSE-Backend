'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    assertMovementApprovalActionAllowed,
    MOVEMENT_APPROVAL_PIPELINE_STATUSES,
} = require('../src/platform/movementApprovalAction.guard');

function pendingRequest(currentStep = 2, overrides = {}) {
    return {
        status: 'PENDING',
        currentStep,
        totalSteps: 4,
        steps: [
            { stepNumber: 1, status: 'APPROVED' },
            { stepNumber: 2, status: 'PENDING', requiredRole: { code: 'COST_CONTROL' } },
            { stepNumber: 3, status: 'PENDING', requiredRole: { code: 'FINANCE_MANAGER' } },
            { stepNumber: 4, status: 'PENDING', requiredRole: { code: 'GENERAL_MANAGER' } },
        ],
        ...overrides,
    };
}

function baseParams(overrides = {}) {
    const approvalRequest = pendingRequest();
    return {
        moduleKey: 'LOST',
        documentStatus: 'DEPT_APPROVED',
        approvalRequest,
        action: 'APPROVE',
        currentStep: approvalRequest.steps.find((s) => s.stepNumber === 2),
        ...overrides,
    };
}

test('resolveFirstPendingApprovalStepNumber finds first pending', () => {
    const { resolveFirstPendingApprovalStepNumber } = require('../src/platform/movementApprovalAction.guard');
    assert.equal(
        resolveFirstPendingApprovalStepNumber([
            { stepNumber: 1, status: 'APPROVED' },
            { stepNumber: 2, status: 'PENDING' },
            { stepNumber: 3, status: 'PENDING' },
        ]),
        2,
    );
    assert.equal(resolveFirstPendingApprovalStepNumber([]), null);
});

test('Allowed: approve on current active step', () => {
    assert.doesNotThrow(() => assertMovementApprovalActionAllowed(baseParams()));
});

test('Allowed: reject on current active step', () => {
    assert.doesNotThrow(() =>
        assertMovementApprovalActionAllowed(baseParams({ action: 'REJECT' })),
    );
});

test('Blocked: approve on future step (not currentStep)', () => {
    const approvalRequest = pendingRequest(2);
    const futureStep = approvalRequest.steps.find((s) => s.stepNumber === 3);
    assert.throws(
        () =>
            assertMovementApprovalActionAllowed(
                baseParams({ approvalRequest, currentStep: futureStep }),
            ),
        (e) => e.code === 'APPROVAL_STEP_NOT_CURRENT',
    );
});

test('Blocked: duplicate approve on completed step', () => {
    const approvalRequest = pendingRequest(2);
    const completedStep = approvalRequest.steps.find((s) => s.stepNumber === 1);
    assert.throws(
        () =>
            assertMovementApprovalActionAllowed(
                baseParams({ approvalRequest, currentStep: completedStep }),
            ),
        (e) => e.code === 'APPROVAL_STEP_NOT_CURRENT' || e.code === 'APPROVAL_STEP_NOT_PENDING',
    );
});

test('Blocked: approve after reject terminal document', () => {
    assert.throws(
        () => assertMovementApprovalActionAllowed(baseParams({ documentStatus: 'REJECTED' })),
        (e) => e.code === 'APPROVAL_ACTION_BLOCKED',
    );
});

test('Blocked: approve after approved terminal document', () => {
    assert.throws(
        () => assertMovementApprovalActionAllowed(baseParams({ documentStatus: 'APPROVED' })),
        (e) => e.code === 'APPROVAL_ACTION_BLOCKED',
    );
});

test('Blocked: approve without active approval request (null)', () => {
    assert.throws(
        () => assertMovementApprovalActionAllowed(baseParams({ approvalRequest: null })),
        (e) => e.code === 'APPROVAL_REQUEST_MISSING',
    );
});

test('Blocked: approve when approval request is REJECTED', () => {
    assert.throws(
        () =>
            assertMovementApprovalActionAllowed(
                baseParams({ approvalRequest: pendingRequest(2, { status: 'REJECTED' }) }),
            ),
        (e) => e.code === 'APPROVAL_REQUEST_NOT_ACTIVE',
    );
});

test('Blocked: approve when approval request is APPROVED', () => {
    assert.throws(
        () =>
            assertMovementApprovalActionAllowed(
                baseParams({ approvalRequest: pendingRequest(4, { status: 'APPROVED' }) }),
            ),
        (e) => e.code === 'APPROVAL_REQUEST_NOT_ACTIVE',
    );
});

test('Blocked: approve on DRAFT (not in approval pipeline)', () => {
    assert.throws(
        () => assertMovementApprovalActionAllowed(baseParams({ documentStatus: 'DRAFT' })),
        (e) => e.code === 'DOCUMENT_STATUS_NOT_IN_APPROVAL_PIPELINE',
    );
});

test('Pipeline statuses exclude DRAFT and terminal states', () => {
    assert.ok(MOVEMENT_APPROVAL_PIPELINE_STATUSES.has('DEPT_APPROVED'));
    assert.ok(!MOVEMENT_APPROVAL_PIPELINE_STATUSES.has('DRAFT'));
    assert.ok(!MOVEMENT_APPROVAL_PIPELINE_STATUSES.has('APPROVED'));
});
