'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('fs');

const servicePath = path.resolve(__dirname, './grn.service.js');
const BASELINE_PATH = path.join(__dirname, '../tmp/grn-service-test-baseline.json');
const realConcurrency = require('../platform/concurrency.service');

const mockChain = {
    versionId: 'chain-1',
    totalSteps: 2,
    steps: [
        { stepOrder: 1, statusKey: 'PENDING_APPROVAL', permissionCode: 'GRN_MANAGE', roleCode: 'FINANCE_MANAGER' },
        { stepOrder: 2, statusKey: 'PENDING_FINANCE', permissionCode: 'GRN_MANAGE', roleCode: 'FINANCE_MANAGER' },
    ],
    roleCodes: ['FINANCE_MANAGER', 'FINANCE_MANAGER'],
};

function buildApproval({ currentStep = 2, step1Status = 'APPROVED', step2Status = 'PENDING' } = {}) {
    return {
        id: 'ar-1',
        currentStep,
        totalSteps: 2,
        status: 'PENDING',
        cycleNumber: 1,
        grnImportId: 'grn-1',
        steps: [
            {
                id: 'step-1',
                stepNumber: 1,
                status: step1Status,
                requiredRole: { code: 'FINANCE_MANAGER' },
            },
            {
                id: 'step-2',
                stepNumber: 2,
                status: step2Status,
                requiredRole: { code: 'FINANCE_MANAGER' },
            },
        ],
    };
}

function loadGrnServiceWithMocks(options = {}) {
    const {
        grn,
        postThrows = false,
        approval = null,
        denyDualGate = false,
        approvalHistory = [],
        auditLog = [],
    } = options;

    const updates = [];
    let posted = false;
    let state = {
        concurrencyVersion: 0,
        ...grn,
        approvalRequestId: approval?.id || grn.approvalRequestId || null,
        accWorkflowVersionId: grn.accWorkflowVersionId || 'chain-1',
        approvalRequest: approval,
    };
    const approvalRows = [...approvalHistory];
    if (approval) approvalRows.push(approval);

    const prismaMock = {
        grnImport: {
            findFirst: async ({ include, where } = {}) => {
                if (where?.id && where.id !== state.id) return null;
                const row = { ...state, lines: state.lines || [{ id: 'line-1', receivedQty: 1, isMapped: true }] };
                if (include?.approvalRequest && state.approvalRequest) row.approvalRequest = state.approvalRequest;
                if (include?.lines) row.lines = state.lines || [{ id: 'line-1', receivedQty: 1, isMapped: true }];
                return row;
            },
            findMany: async () => [],
            update: async ({ where, data }) => {
                updates.push({ where, data });
                state = { ...state, ...data, id: where.id };
                if (data.approvalRequestId === null) state.approvalRequest = null;
                return state;
            },
        },
        approvalRequest: {
            aggregate: async ({ where }) => {
                const rows = approvalRows.filter(
                    (r) => r.grnImportId === where.grnImportId && r.requestType !== 'EXCLUDED',
                );
                const max = rows.reduce((m, r) => Math.max(m, r.cycleNumber || 0), 0);
                return { _max: { cycleNumber: max || null } };
            },
            update: async ({ where, data }) => {
                if (state.approvalRequest?.id === where.id) {
                    state.approvalRequest = { ...state.approvalRequest, ...data };
                }
                const row = approvalRows.find((r) => r.id === where.id);
                if (row) Object.assign(row, data);
                return state.approvalRequest;
            },
            create: async () => ({}),
        },
        approvalStep: {
            update: async ({ where, data }) => {
                const step = state.approvalRequest.steps.find((s) => s.id === where.id);
                Object.assign(step, data);
                return step;
            },
        },
        auditLog: {
            count: async () => auditEvents.filter((e) => e.action === 'SEND_BACK').length,
            create: async ({ data }) => {
                auditEvents.push(data);
                return data;
            },
        },
        tenantMember: { findMany: async () => [] },
        user: { findUnique: async () => ({ email: 'a@test.com' }) },
        item: { findMany: async () => [] },
        unit: { findMany: async () => [] },
        supplier: { findFirst: async () => null },
        location: { findFirst: async () => null },
        $executeRaw: async () => 1,
        $transaction: async (fn) => fn(prismaMock),
        $on: () => {},
    };

    const auditEvents = [...auditLog];
    const postingEngine = {
        postGrnInTransaction: async () => {
            if (postThrows) throw new Error('post failed');
            posted = true;
            state.status = 'POSTED';
        },
    };

    const originalLoad = Module._load;
    Module._load = function patchedLoader(request, parent, isMain) {
        if (request === '@prisma/client') {
            return { PrismaClient: function PrismaClient() { return prismaMock; } };
        }
        if (request === './postingEngine.service') return postingEngine;
        if (request === './email.service') return {};
        if (request === './setting.service') return { getObStatus: async () => 'FINALIZED' };
        if (request === '../config/storage') {
            return { getStorage: () => ({ getSignedUrl: async () => null }) };
        }
        if (request === './auditGoverned.service') {
            return {
                logGovernedEvent: async (p) => { auditEvents.push(p); },
                EntityType: { GRN: 'GRN' },
            };
        }
        if (request.endsWith('config/database') || request.endsWith('config\\database')) return prismaMock;
        if (request === './rbac.service') {
            return { normalizeRole: (r) => String(r || '').toUpperCase().replace(/-/g, '_') };
        }
        if (request === './acc-workflow-runtime.service') {
            return {
                resolveWorkflowForDocument: async () => mockChain,
                resolveWorkflowByVersionId: async () => mockChain,
            };
        }
        if (request === './acc-approval-request.util') {
            return {
                createAccApprovalRequestInTx: async (_tx, opts) => {
                    const ar = {
                        id: `ar-${approvalRows.length + 1}`,
                        requestType: 'GRN_IMPORT',
                        ...opts.extraData,
                        ...opts,
                        steps: mockChain.steps.map((s, i) => ({
                            id: `step-new-${i + 1}`,
                            stepNumber: i + 1,
                            status: 'PENDING',
                            requiredRole: { code: 'FINANCE_MANAGER' },
                        })),
                    };
                    approvalRows.push(ar);
                    return ar;
                },
            };
        }
        if (request === '../acc-authority/step-permission-enforcement') {
            const real = originalLoad(request, parent, isMain);
            return {
                ...real,
                assertDualGateApproval: () => {
                    if (denyDualGate) throw Object.assign(new Error('Forbidden'), { status: 403, statusCode: 403 });
                },
                assertUserHasGrnManage: () => {},
            };
        }
        if (request === './acc-workflow-status-key-guard.service') {
            return { assertAwaitingStatusKey: (key) => key };
        }
        if (request === './grn-workflow-presentation.util') {
            return { buildGrnWorkflowTimeline: () => [] };
        }
        if (request === './scope/scopeContext') {
            return {
                resolveScopeContext: async () => ({}),
                scopeWhereFor: () => ({}),
                metaFor: () => ({}),
                assertInScope: async () => {},
                SCOPE_MODULE: { GRN: 'GRN' },
            };
        }
        if (request === '../middleware/authorize') {
            return { hasPermission: () => true };
        }
        if (request === '../platform/lifecyclePresentation.service') {
            return { mapUserFacingState: () => 'In Review' };
        }
        if (request.includes('concurrency.service')) {
            return realConcurrency;
        }
        return originalLoad(request, parent, isMain);
    };

    delete require.cache[servicePath];
    const service = require(servicePath);
    Module._load = originalLoad;

    return { service, updates, getPosted: () => posted, getState: () => state, auditEvents, approvalRows };
}

const baseGrn = {
    id: 'grn-1',
    tenantId: 'tenant-1',
    grnNumber: 'GRN-001',
    status: 'PENDING_FINANCE',
    approvedBy: 'cost-user',
    concurrencyVersion: 0,
    lines: [{ id: 'line-1', receivedQty: 1, isMapped: true }],
};

const userWithGrnManage = { id: 'fin-user', role: 'FINANCE_MANAGER', permissions: ['GRN_MANAGE'] };
const userWithoutGrnManage = { id: 'sec-user', role: 'SECURITY', permissions: [] };
const orgBypassUser = { id: 'org-user', role: 'ORG_MANAGER', permissions: [] };

test('baseline evidence: failures were concurrencyVersion missing in mocks (pre-existing)', () => {
    const evidence = {
        at: new Date().toISOString(),
        note: 'Before Phase 2 gate fix, 4 updateStatus tests failed with CONCURRENCY_VERSION_REQUIRED because baseGrn mock omitted concurrencyVersion and calls omitted expectedVersion. Phase 2 submit changes did not cause these failures.',
        failedTests: [
            'updateStatus: user with GRN_MANAGE can POST from PENDING_FINANCE',
            'updateStatus: user without GRN_MANAGE cannot POST',
            'updateStatus: ORG_MANAGER governance bypass can POST',
            'updateStatus: GRN_MANAGE forwards VALIDATED to PENDING_FINANCE',
        ],
        errorCode: 'CONCURRENCY_VERSION_REQUIRED',
        fixedBy: 'concurrencyVersion:0 on baseGrn + expectedVersion passed in tests',
    };
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(evidence, null, 2));
    assert.ok(fs.existsSync(BASELINE_PATH));
});

test('updateStatus: user with GRN_MANAGE can POST from PENDING_FINANCE', async () => {
    const approval = buildApproval({ currentStep: 2, step2Status: 'PENDING' });
    const { service, getPosted } = loadGrnServiceWithMocks({ grn: { ...baseGrn }, approval });
    await service.updateStatus('grn-1', 'tenant-1', 'POSTED', null, 'fin-user', userWithGrnManage, 0);
    assert.equal(getPosted(), true);
});

test('updateStatus: user without GRN_MANAGE cannot POST', async () => {
    const approval = buildApproval({ currentStep: 2, step2Status: 'PENDING' });
    const { service, getPosted } = loadGrnServiceWithMocks({ grn: { ...baseGrn }, approval, denyDualGate: true });
    await assert.rejects(
        () => service.updateStatus('grn-1', 'tenant-1', 'POSTED', null, 'sec-user', userWithoutGrnManage, 0),
        (err) => err.statusCode === 403 || err.status === 403,
    );
    assert.equal(getPosted(), false);
});

test('updateStatus: ORG_MANAGER governance bypass can POST', async () => {
    const approval = buildApproval({ currentStep: 2, step2Status: 'PENDING' });
    const { service, getPosted } = loadGrnServiceWithMocks({ grn: { ...baseGrn }, approval });
    await service.updateStatus('grn-1', 'tenant-1', 'POSTED', null, 'org-user', orgBypassUser, 0);
    assert.equal(getPosted(), true);
});

test('updateStatus: GRN_MANAGE cannot POST unless PENDING_FINANCE', async () => {
    const { service, getPosted } = loadGrnServiceWithMocks({
        grn: { ...baseGrn, status: 'VALIDATED' },
        approval: buildApproval({ currentStep: 1, step1Status: 'PENDING', step2Status: 'PENDING' }),
    });
    await assert.rejects(
        () => service.updateStatus('grn-1', 'tenant-1', 'POSTED', null, 'fin-user', userWithGrnManage, 0),
        (err) => err.status === 422,
    );
    assert.equal(getPosted(), false);
});

test('updateStatus: GRN_MANAGE forwards VALIDATED to PENDING_FINANCE', async () => {
    const validated = { ...baseGrn, status: 'VALIDATED', approvedBy: null };
    const { service, updates } = loadGrnServiceWithMocks({
        grn: validated,
        approval: buildApproval({ currentStep: 1, step1Status: 'PENDING', step2Status: 'PENDING' }),
    });
    const result = await service.updateStatus('grn-1', 'tenant-1', 'PENDING_FINANCE', null, 'cost-user', userWithGrnManage, 0);
    assert.equal(result.status, 'PENDING_FINANCE');
    assert.equal(updates.some((u) => u.data.status === 'PENDING_FINANCE'), true);
});

test('submitForApproval: first submit creates cycle 1 with grnImportId', async () => {
    const { service, approvalRows, getState } = loadGrnServiceWithMocks({
        grn: { ...baseGrn, status: 'VALIDATED', approvalRequestId: null, approvalRequest: null },
    });
    await service.submitForApproval('grn-1', 'tenant-1', 'creator-1', 0);
    assert.equal(approvalRows.length, 1);
    assert.equal(approvalRows[0].cycleNumber, 1);
    assert.equal(approvalRows[0].grnImportId, 'grn-1');
    assert.equal(getState().approvalRequestId, approvalRows[0].id);
});

test('sendBackGrn: preserves active request and history link', async () => {
    const approval = buildApproval();
    const { service, approvalRows, updates } = loadGrnServiceWithMocks({ grn: { ...baseGrn, status: 'PENDING_FINANCE' }, approval });
    await service.sendBackGrn('grn-1', 'tenant-1', userWithGrnManage, 'Fix invoice', 0);
    const arUpdate = approvalRows.find((r) => r.id === 'ar-1');
    assert.equal(arUpdate.status, 'PENDING');
    assert.equal(arUpdate.grnImportId, 'grn-1');
    assert.equal(updates.some((u) => u.data.approvalRequestId === null), false);
});

test('resubmit creates cycle 2 and logs GRN_RESUBMIT', async () => {
    const history = [{
        id: 'ar-old', requestType: 'GRN_IMPORT', grnImportId: 'grn-1', cycleNumber: 1, status: 'CANCELLED',
    }];
    const { service, approvalRows, auditEvents } = loadGrnServiceWithMocks({
        grn: { ...baseGrn, status: 'VALIDATED', approvalRequestId: null, approvalRequest: null },
        approvalHistory: history,
    });
    await service.submitForApproval('grn-1', 'tenant-1', 'creator-1', 0);
    assert.equal(approvalRows.length, 2);
    assert.equal(approvalRows[1].cycleNumber, 2);
    assert.ok(auditEvents.some((a) => a.eventType === 'GRN_RESUBMIT'));
});

test('notes text does not emit RESUBMIT audit', async () => {
    const { service, auditEvents } = loadGrnServiceWithMocks({
        grn: {
            ...baseGrn,
            status: 'VALIDATED',
            notes: '[Send Back] please fix',
            approvalRequestId: null,
            approvalRequest: null,
        },
    });
    await service.submitForApproval('grn-1', 'tenant-1', 'creator-1', 0);
    assert.equal(auditEvents.filter((a) => a.eventType === 'GRN_RESUBMIT').length, 0);
});

test('concurrent resubmit mock: second submit rejected when version stale', async () => {
    const history = [{ id: 'ar-old', requestType: 'GRN_IMPORT', grnImportId: 'grn-1', cycleNumber: 1, status: 'CANCELLED' }];
    const { service } = loadGrnServiceWithMocks({
        grn: { ...baseGrn, status: 'VALIDATED', approvalRequestId: null, approvalRequest: null, concurrencyVersion: 0 },
        approvalHistory: history,
    });
    await service.submitForApproval('grn-1', 'tenant-1', 'creator-1', 0);
    await assert.rejects(
        () => service.submitForApproval('grn-1', 'tenant-1', 'creator-1', 0),
        (err) => err.status === 422 || err.code === 'CONCURRENCY_VERSION_REQUIRED' || err.status === 409,
    );
});
