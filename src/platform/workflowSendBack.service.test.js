'use strict';

/**
 * Constitutional Send Back — platform helper proofs (guarded concurrency, audit atomicity).
 * NEW test file — not expectation updates on legacy tests.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const auditWriterPath = require.resolve('../services/auditWriter.service');
const auditTrailPath = require.resolve('../services/auditTrail.service');

function installAuditMocks({ auditThrows = false } = {}) {
    const auditLog = [];
    require.cache[auditWriterPath] = {
        id: auditWriterPath,
        filename: auditWriterPath,
        loaded: true,
        exports: {
            writeAuditLogTransactional: async (entry) => {
                if (auditThrows) throw new Error('audit write failed');
                auditLog.push(entry);
            },
        },
    };
    require.cache[auditTrailPath] = {
        id: auditTrailPath,
        filename: auditTrailPath,
        loaded: true,
        exports: { EntityType: { TRANSFER: 'TRANSFER' } },
    };
    delete require.cache[require.resolve('../platform/workflowSendBack.service')];
    return auditLog;
}

function makeApprovalRequest({ currentStep = 2, steps } = {}) {
    const defaultSteps = steps || [
        { id: 's1', stepNumber: 1, status: 'APPROVED', requiredRole: { code: 'DEPT_MANAGER' }, comment: null },
        { id: 's2', stepNumber: 2, status: 'PENDING', requiredRole: { code: 'FINANCE_MANAGER' }, comment: null },
        { id: 's3', stepNumber: 3, status: 'PENDING', requiredRole: { code: 'GENERAL_MANAGER' }, comment: null },
    ];
    return {
        id: 'ar-sb-1',
        status: 'PENDING',
        currentStep,
        totalSteps: defaultSteps.length,
        accWorkflowVersionId: 'wfv-pin-1',
        steps: defaultSteps,
    };
}

function makeTx({ updateManyCount = 1, auditCount = 0 } = {}) {
    const state = { arUpdates: 0, stepUpdates: 0, auditCount };
    return {
        state,
        approvalRequest: {
            updateMany: async () => {
                state.arUpdates += 1;
                return { count: updateManyCount };
            },
            update: async () => {
                state.arUpdates += 1;
                return {};
            },
        },
        approvalStep: {
            update: async () => {
                state.stepUpdates += 1;
                return {};
            },
        },
        auditLog: {
            count: async () => auditCount,
        },
    };
}

test('normalizeReason — rejects empty reason', () => {
    const { normalizeReason } = require('../platform/workflowSendBack.service');
    assert.throws(() => normalizeReason(''), (err) => err.code === 'SEND_BACK_REASON_REQUIRED');
    assert.throws(() => normalizeReason('   '), (err) => err.code === 'SEND_BACK_REASON_REQUIRED');
});

test('normalizeReason — trims valid reason', () => {
    const { normalizeReason } = require('../platform/workflowSendBack.service');
    assert.equal(normalizeReason('  Fix qty  '), 'Fix qty');
});

test('executeWorkflowSendBackInTx — one-step rewind to previous approver', async () => {
    const auditLog = installAuditMocks();
    const { executeWorkflowSendBackInTx } = require('../platform/workflowSendBack.service');
    const tx = makeTx();
    const ar = makeApprovalRequest({ currentStep: 2 });

    const result = await executeWorkflowSendBackInTx(tx, {
        approvalRequest: ar,
        sourceStepNumber: 2,
        reason: 'Need dept fix',
        userId: 'u-fin',
        tenantId: 't-1',
        entityType: 'TRANSFER',
        entityId: 'doc-1',
        documentStatusBefore: 'PENDING_FINANCE',
        documentStatusAfter: 'PENDING_DEPT',
    });

    assert.equal(result.targetStepNumber, 1);
    assert.equal(result.targetType, 'STEP');
    assert.equal(result.workflowRound, 1);
    assert.equal(tx.state.arUpdates, 1);
    assert.ok(tx.state.stepUpdates >= 2, 'source + later steps reset to PENDING');
    assert.equal(auditLog.length, 1);
    assert.equal(auditLog[0].action, 'SEND_BACK');
    assert.equal(auditLog[0].afterValue.approvalRequestId, 'ar-sb-1');
    assert.equal(auditLog[0].afterValue.accWorkflowVersionId, 'wfv-pin-1');
    assert.equal(auditLog[0].afterValue.reason, 'Need dept fix');
});

test('executeWorkflowSendBackInTx — step 1 send-back reaches Creator (currentStep=0)', async () => {
    installAuditMocks();
    const { executeWorkflowSendBackInTx } = require('../platform/workflowSendBack.service');
    const tx = makeTx();
    const ar = makeApprovalRequest({
        currentStep: 1,
        steps: [
            { id: 's1', stepNumber: 1, status: 'PENDING', requiredRole: { code: 'DEPT_MANAGER' }, comment: null },
            { id: 's2', stepNumber: 2, status: 'PENDING', requiredRole: { code: 'FINANCE_MANAGER' }, comment: null },
        ],
    });

    const result = await executeWorkflowSendBackInTx(tx, {
        approvalRequest: ar,
        sourceStepNumber: 1,
        reason: 'Creator must edit',
        userId: 'u-dept',
        tenantId: 't-1',
        entityType: 'STOCK_COUNT',
        entityId: 'cnt-1',
    });

    assert.equal(result.targetStepNumber, 0);
    assert.equal(result.targetType, 'CREATOR');
});

test('executeWorkflowSendBackInTx — guarded updateMany count=0 throws concurrency conflict', async () => {
    installAuditMocks();
    const { executeWorkflowSendBackInTx } = require('../platform/workflowSendBack.service');
    const tx = makeTx({ updateManyCount: 0 });
    const ar = makeApprovalRequest({ currentStep: 2 });

    await assert.rejects(
        () => executeWorkflowSendBackInTx(tx, {
            approvalRequest: ar,
            sourceStepNumber: 2,
            reason: 'Race',
            userId: 'u1',
            tenantId: 't-1',
            entityType: 'TRANSFER',
            entityId: 'doc-1',
        }),
        (err) => err.code === 'CONCURRENCY_CONFLICT' && err.status === 409,
    );
});

test('executeWorkflowSendBackInTx — audit failure rolls back (no partial audit)', async () => {
    const auditLog = installAuditMocks({ auditThrows: true });
    const { executeWorkflowSendBackInTx } = require('../platform/workflowSendBack.service');
    const tx = makeTx();
    const ar = makeApprovalRequest({ currentStep: 2 });

    await assert.rejects(
        () => executeWorkflowSendBackInTx(tx, {
            approvalRequest: ar,
            sourceStepNumber: 2,
            reason: 'Audit fail',
            userId: 'u1',
            tenantId: 't-1',
            entityType: 'GRN',
            entityId: 'grn-1',
        }),
        /audit write failed/,
    );
    assert.equal(auditLog.length, 0);
});

test('executeWorkflowSendBackInTx — rejects non-pending source step', async () => {
    installAuditMocks();
    const { executeWorkflowSendBackInTx } = require('../platform/workflowSendBack.service');
    const tx = makeTx();
    const ar = makeApprovalRequest({
        currentStep: 2,
        steps: [
            { id: 's1', stepNumber: 1, status: 'APPROVED', requiredRole: { code: 'DEPT_MANAGER' }, comment: null },
            { id: 's2', stepNumber: 2, status: 'APPROVED', requiredRole: { code: 'FINANCE_MANAGER' }, comment: null },
        ],
    });

    await assert.rejects(
        () => executeWorkflowSendBackInTx(tx, {
            approvalRequest: ar,
            sourceStepNumber: 2,
            reason: 'Too late',
            userId: 'u1',
            tenantId: 't-1',
            entityType: 'BREAKAGE',
            entityId: 'br-1',
        }),
        (err) => err.code === 'SEND_BACK_STEP_NOT_PENDING',
    );
});

test('executeCreatorResubmitInTx — advances currentStep 0→1 same request', async () => {
    const auditLog = installAuditMocks();
    const { executeCreatorResubmitInTx } = require('../platform/workflowSendBack.service');
    const tx = makeTx({ auditCount: 1 });
    const ar = makeApprovalRequest({
        currentStep: 0,
        steps: [
            { id: 's1', stepNumber: 1, status: 'PENDING', requiredRole: { code: 'DEPT_MANAGER' }, comment: null },
            { id: 's2', stepNumber: 2, status: 'PENDING', requiredRole: { code: 'FINANCE_MANAGER' }, comment: null },
        ],
    });

    const result = await executeCreatorResubmitInTx(tx, {
        approvalRequest: ar,
        userId: 'creator-1',
        tenantId: 't-1',
        entityType: 'GET_PASS',
        entityId: 'gp-1',
        documentStatusBefore: 'DRAFT',
        documentStatusAfter: 'PENDING_DEPT',
    });

    assert.equal(result.currentStep, 1);
    assert.equal(result.workflowRound, 2);
    assert.equal(auditLog[0].afterValue.resubmit, true);
    assert.equal(auditLog[0].afterValue.approvalRequestId, 'ar-sb-1');
});

test('executeCreatorResubmitInTx — guarded updateMany count=0 is concurrency conflict', async () => {
    installAuditMocks();
    const { executeCreatorResubmitInTx } = require('../platform/workflowSendBack.service');
    const tx = makeTx({ updateManyCount: 0 });
    const ar = makeApprovalRequest({ currentStep: 0 });

    await assert.rejects(
        () => executeCreatorResubmitInTx(tx, {
            approvalRequest: ar,
            userId: 'creator-1',
            tenantId: 't-1',
            entityType: 'LOST',
            entityId: 'lost-1',
        }),
        (err) => err.code === 'CONCURRENCY_CONFLICT',
    );
});

test('resolveWorkflowRound — increments from SEND_BACK audit count', async () => {
    delete require.cache[require.resolve('../platform/workflowSendBack.service')];
    const { resolveWorkflowRound } = require('../platform/workflowSendBack.service');
    const tx = { auditLog: { count: async () => 2 } };
    const round = await resolveWorkflowRound(tx, 't-1', 'TRANSFER', 'doc-1');
    assert.equal(round, 3);
});

test('buildSendBackAuditPayload — preserves version pin and round metadata', () => {
    const { buildSendBackAuditPayload } = require('../platform/workflowSendBack.service');
    const payload = buildSendBackAuditPayload({
        approvalRequest: { id: 'ar-1', accWorkflowVersionId: 'wfv-9' },
        sourceStep: { stepNumber: 3, requiredRole: { code: 'FINANCE_MANAGER' } },
        targetStepNumber: 2,
        targetType: 'STEP',
        targetStep: { stepNumber: 2, requiredRole: { code: 'DEPT_MANAGER' } },
        reason: 'Fix cost',
        workflowRound: 2,
        documentStatusBefore: 'PENDING_FINANCE',
        documentStatusAfter: 'PENDING_DEPT',
    });
    assert.equal(payload.approvalRequestId, 'ar-1');
    assert.equal(payload.accWorkflowVersionId, 'wfv-9');
    assert.equal(payload.workflowRound, 2);
    assert.equal(payload.sourceStepNumber, 3);
    assert.equal(payload.targetStepNumber, 2);
    assert.equal(payload.reason, 'Fix cost');
});
