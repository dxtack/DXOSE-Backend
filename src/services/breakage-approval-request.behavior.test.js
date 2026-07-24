'use strict';

/**
 * Behaviour proof — Breakage/Lost approval-request creation.
 *
 * Default: Department step stays PENDING unless caller passes preApproveFirstStep
 * (single-motion when creator role matches ACC step 1).
 * Get-pass return may pass preApproveFirstStep:true when doc is already DEPT_APPROVED.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const FAKE_CHAIN = {
    versionId: 'wfv-1',
    roleCodes: ['DEPT_MANAGER', 'COST_CONTROL', 'FINANCE_MANAGER', 'GENERAL_MANAGER'],
    steps: [
        { stepOrder: 1, roleCode: 'DEPT_MANAGER', statusKey: 'DEPT_APPROVED' },
        { stepOrder: 2, roleCode: 'COST_CONTROL', statusKey: 'COST_CONTROL_APPROVED' },
        { stepOrder: 3, roleCode: 'FINANCE_MANAGER', statusKey: 'FINANCE_APPROVED' },
        { stepOrder: 4, roleCode: 'GENERAL_MANAGER', statusKey: 'APPROVED' },
    ],
};

const runtimePath = require.resolve('./acc-workflow-runtime.service');
require.cache[runtimePath] = {
    id: runtimePath,
    filename: runtimePath,
    loaded: true,
    exports: {
        resolveWorkflowForDocument: async () => FAKE_CHAIN,
        resolveWorkflowByVersionId: async () => FAKE_CHAIN,
        approvalRequestVersionPin: () => ({ accWorkflowVersionId: FAKE_CHAIN.versionId }),
        CUTOVER_MODULE_KEYS: new Set(['BREAKAGE', 'LOST']),
        isCutoverModule: () => true,
    },
};

const { createMovementApprovalRequest } = require('./breakage.service');

function makeFakeTx() {
    const captured = {};
    return {
        captured,
        approvalRequest: {
            findFirst: async () => null,
            create: async ({ data }) => {
                captured.data = data;
                return { id: 'ar-1', ...data };
            },
            update: async () => ({}),
        },
    };
}

test('createMovementApprovalRequest — Department step 1 PENDING by default', async () => {
    const tx = makeFakeTx();
    await createMovementApprovalRequest(tx, {
        tenantId: 'tenant-1',
        documentId: 'doc-1',
        createdBy: 'user-1',
        requestType: 'BREAKAGE',
        deptApproverUserId: 'user-1',
    });

    const data = tx.captured.data;
    assert.ok(data, 'approvalRequest.create must be called');
    assert.equal(data.currentStep, 1, 'first live actor must be Department (step 1)');
    assert.equal(data.totalSteps, 4);
    assert.equal(data.status, 'PENDING', 'overall request pending until final approval');

    const steps = data.steps.create;
    assert.equal(steps[0].status, 'PENDING', 'Department (step 1) pending by default');
    assert.equal(steps[1].status, 'PENDING', 'Cost Control (step 2) pending');
    assert.equal(steps[2].status, 'PENDING', 'Finance (step 3) pending');
    assert.equal(steps[3].status, 'PENDING', 'GM (step 4) pending');
});

test('createMovementApprovalRequest — LOST uses same pending Department by default', async () => {
    const tx = makeFakeTx();
    await createMovementApprovalRequest(tx, {
        tenantId: 'tenant-1',
        documentId: 'doc-2',
        createdBy: 'user-2',
        requestType: 'LOST',
        deptApproverUserId: 'user-2',
    });
    const steps = tx.captured.data.steps.create;
    assert.equal(tx.captured.data.currentStep, 1);
    assert.equal(steps[0].status, 'PENDING');
    assert.equal(steps[1].status, 'PENDING');
});

test('createMovementApprovalRequest — autoApproveAllSteps approves every step and resolves', async () => {
    const tx = makeFakeTx();
    await createMovementApprovalRequest(tx, {
        tenantId: 'tenant-1',
        documentId: 'doc-3',
        createdBy: 'user-3',
        requestType: 'BREAKAGE',
        deptApproverUserId: 'user-3',
        autoApproveAllSteps: true,
        autoApprovedByUserId: 'user-3',
    });

    const data = tx.captured.data;
    assert.equal(data.status, 'APPROVED');
    assert.equal(data.currentStep, 4);
    assert.ok(data.resolvedAt, 'resolvedAt set when fully auto-approved');
    for (const step of data.steps.create) {
        assert.equal(step.status, 'APPROVED');
    }
});

test('createMovementApprovalRequest — preApproveFirstStep:true auto-approves Department', async () => {
    const tx = makeFakeTx();
    await createMovementApprovalRequest(tx, {
        tenantId: 'tenant-1',
        documentId: 'doc-4',
        createdBy: 'user-4',
        requestType: 'BREAKAGE',
        deptApproverUserId: 'user-4',
        preApproveFirstStep: true,
    });

    const data = tx.captured.data;
    assert.equal(data.currentStep, 2, 'first live actor is Cost Control when DEPT pre-approved');
    assert.equal(data.steps.create[0].status, 'APPROVED');
    assert.equal(data.steps.create[1].status, 'PENDING');
});
