'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const FAKE_CHAIN = {
    versionId: 'wfv-count-v3',
    roleCodes: ['COST_CONTROL', 'DEPT_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER'],
    steps: [
        { stepOrder: 1, roleCode: 'COST_CONTROL', statusKey: 'PENDING_COST_CONTROL' },
        { stepOrder: 2, roleCode: 'DEPT_MANAGER', statusKey: 'PENDING_DEPT' },
        { stepOrder: 3, roleCode: 'FINANCE_MANAGER', statusKey: 'PENDING_FINANCE' },
        { stepOrder: 4, roleCode: 'GENERAL_MANAGER', statusKey: 'PENDING_GM' },
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
        CUTOVER_MODULE_KEYS: new Set(['STOCK_COUNT']),
        isCutoverModule: () => true,
    },
};

const rbacPath = require.resolve('./rbac.service');
const realRbac = require(rbacPath);
require.cache[rbacPath] = {
    id: rbacPath,
    filename: rbacPath,
    loaded: true,
    exports: {
        ...realRbac,
        connectRole: (code) => ({ connect: { code } }),
    },
};

const { backfillCountApprovalRequest } = require('./inventoryCount.service');
const { submitApprovalProjection } = require('./acc-workflow-count.runtime');

function makeFakeTx() {
    const captured = { sessionUpdate: null, approvalCreate: null };
    return {
        captured,
        approvalRequest: {
            create: async ({ data }) => {
                captured.approvalCreate = data;
                return { id: 'ar-count-1', ...data };
            },
        },
        stockCountSession: {
            update: async ({ data }) => {
                captured.sessionUpdate = data;
                return data;
            },
        },
    };
}

test('submitApprovalProjection — lands on PENDING_DEPT after Cost Control certification', () => {
    const projection = submitApprovalProjection(FAKE_CHAIN);
    assert.equal(projection.status, 'PENDING_DEPT');
    assert.equal(projection.pendingStepNumber, 2);
});

test('backfillCountApprovalState — PENDING_DEPT means Cost Control approved', async () => {
    const tx = makeFakeTx();
    await backfillCountApprovalRequest(
        { id: 'sess-1', status: 'PENDING_DEPT', createdBy: 'user-1' },
        'tenant-1',
        tx,
    );
    assert.equal(tx.captured.approvalCreate.currentStep, 2);
    assert.equal(tx.captured.approvalCreate.steps.create[0].status, 'APPROVED');
    assert.equal(tx.captured.approvalCreate.steps.create[1].status, 'PENDING');
    assert.equal(tx.captured.sessionUpdate.status, 'PENDING_DEPT');
});

test('backfillCountApprovalRequest — preserves pinned ACC version', async () => {
    const tx = makeFakeTx();
    await backfillCountApprovalRequest(
        { id: 'sess-2', status: 'PENDING_FINANCE', createdBy: 'user-2' },
        'tenant-1',
        tx,
    );
    assert.equal(tx.captured.approvalCreate.accWorkflowVersionId, 'wfv-count-v3');
    assert.equal(tx.captured.approvalCreate.currentStep, 3);
});
