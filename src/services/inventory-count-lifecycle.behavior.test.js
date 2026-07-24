'use strict';

/**
 * Inventory Count v3 lifecycle — mocked DB proof for operational + ACC approval matrix.
 * Covers: role gates, dept scope, send-back chain, cancel, resubmit version pin, posting once after GM.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const DEPT_A = '22222222-2222-4222-8222-222222222222';
const DEPT_B = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';

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

const LEGACY_CHAIN_2 = {
    versionId: 'wfv-count-legacy-2',
    roleCodes: ['FINANCE_MANAGER', 'GENERAL_MANAGER'],
    steps: [
        { stepOrder: 1, roleCode: 'FINANCE_MANAGER', statusKey: 'PENDING_FINANCE' },
        { stepOrder: 2, roleCode: 'GENERAL_MANAGER', statusKey: 'PENDING_GM' },
    ],
};

function roleStep(roleCode, stepNumber, status = 'PENDING') {
    return {
        id: `step-${stepNumber}`,
        stepNumber,
        status,
        requiredRole: { code: roleCode },
        actedBy: null,
        actedAt: null,
        comment: null,
    };
}

function makeSession(overrides = {}) {
    return {
        id: SESSION_ID,
        tenantId: TENANT_ID,
        sessionNo: 'CNT-2607-0001',
        status: 'REVEAL_REVIEW',
        departmentId: DEPT_A,
        createdBy: 'user-storekeeper',
        countDate: new Date('2026-07-01'),
        createdAt: new Date('2026-07-01'),
        notes: null,
        approvalRequestId: null,
        approvalRequest: null,
        scopedLocations: [],
        locationId: 'loc-1',
        currentRound: 1,
        blindMode: false,
        snapshotAt: new Date('2026-07-01'),
        concurrencyVersion: 0,
        ...overrides,
    };
}

function cvBody(h) {
    return { concurrencyVersion: h.session.concurrencyVersion ?? 0 };
}

function makeApprovalRequest(session, { currentStep = 2, steps } = {}) {
    const defaultSteps = steps || [
        { ...roleStep('COST_CONTROL', 1, 'APPROVED'), actedBy: 'user-cc', actedAt: new Date() },
        roleStep('DEPT_MANAGER', 2),
        roleStep('FINANCE_MANAGER', 3),
        roleStep('GENERAL_MANAGER', 4),
    ];
    return {
        id: 'ar-1',
        tenantId: TENANT_ID,
        requestType: 'COUNT_ADJUSTMENT',
        status: 'PENDING',
        currentStep,
        totalSteps: 4,
        createdBy: 'user-cc',
        accWorkflowVersionId: FAKE_CHAIN.versionId,
        createdAt: new Date(),
        resolvedAt: null,
        steps: defaultSteps,
        StockCountSession: { id: session.id },
    };
}

function user(id, role, extra = {}) {
    return {
        id,
        role,
        permissions: ['APPROVE_INVENTORY_COUNT', 'STOCK_COUNT_CREATE', 'STOCK_COUNT_EXECUTE', 'STOCK_COUNT_CANCEL', 'STOCK_COUNT_RECOUNT', 'STOCK_COUNT_SUBMIT'],
        ...extra,
    };
}

function setupHarness() {
    let session = makeSession();
    let approvalRequest = null;
    let postingCalls = 0;
    const auditLog = [];
    let scopeDepartmentId = DEPT_A;
    let deptAssignmentDeptId = null;

    const runtimePath = require.resolve('./acc-workflow-runtime.service');
    require.cache[runtimePath] = {
        id: runtimePath,
        filename: runtimePath,
        loaded: true,
        exports: {
            resolveWorkflowForDocument: async () => FAKE_CHAIN,
            resolveWorkflowByVersionId: async (id) =>
                id === LEGACY_CHAIN_2.versionId ? LEGACY_CHAIN_2 : FAKE_CHAIN,
            approvalRequestVersionPin: (chain) => ({ accWorkflowVersionId: chain.versionId }),
            CUTOVER_MODULE_KEYS: new Set(['STOCK_COUNT']),
            isCutoverModule: () => true,
        },
    };

    const postingPath = require.resolve('./postingEngine.service');
    require.cache[postingPath] = {
        id: postingPath,
        filename: postingPath,
        loaded: true,
        exports: {
            postInventoryCountSession: async () => {
                postingCalls += 1;
                return { postedAt: new Date('2026-07-02') };
            },
        },
    };

    const auditPath = require.resolve('./auditTrail.service');
    require.cache[auditPath] = {
        id: auditPath,
        filename: auditPath,
        loaded: true,
        exports: {
            logAction: async (entry) => {
                auditLog.push(entry);
            },
            EntityType: { STOCK_COUNT: 'STOCK_COUNT' },
        },
    };

    const auditWriterPath = require.resolve('./auditWriter.service');
    require.cache[auditWriterPath] = {
        id: auditWriterPath,
        filename: auditWriterPath,
        loaded: true,
        exports: {
            writeAuditLogTransactional: async (entry) => {
                auditLog.push(entry);
            },
        },
    };

    const periodPath = require.resolve('./periodGuard.service');
    require.cache[periodPath] = {
        id: periodPath,
        filename: periodPath,
        loaded: true,
        exports: { checkPeriodLock: async () => {} },
    };

    const scopePath = require.resolve('./scope/scopeContext');
    require.cache[scopePath] = {
        id: scopePath,
        filename: scopePath,
        loaded: true,
        exports: {
            resolveScopeContext: async () => ({
                departmentId: scopeDepartmentId,
                propertyId: TENANT_ID,
            }),
        },
    };

    const dbPath = require.resolve('../config/database');
    const helpersPath = require.resolve('./inventory-count-workflow.helpers');
    const servicePath = require.resolve('./inventoryCount.service');
    delete require.cache[dbPath];
    delete require.cache[helpersPath];
    delete require.cache[servicePath];

    require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: {
            urUserAssignment: {
                findFirst: async () => {
                    if (deptAssignmentDeptId && deptAssignmentDeptId === session.departmentId) {
                        return { id: 'assign-1' };
                    }
                    return null;
                },
            },
            approvalRequest: {
                findFirst: async ({ where, select }) => {
                    if (where?.StockCountSession?.id === session.id && approvalRequest) {
                        return select?.accWorkflowVersionId
                            ? { accWorkflowVersionId: approvalRequest.accWorkflowVersionId }
                            : approvalRequest;
                    }
                    return null;
                },
            },
        },
    };

    function syncSessionApproval() {
        if (approvalRequest) {
            session.approvalRequestId = approvalRequest.id;
            session.approvalRequest = approvalRequest;
        }
    }

    function normalizeSessionPatch(data) {
        const patch = { ...data };
        if (
            patch.concurrencyVersion
            && typeof patch.concurrencyVersion === 'object'
            && patch.concurrencyVersion.increment
        ) {
            patch.concurrencyVersion = (session.concurrencyVersion ?? 0) + patch.concurrencyVersion.increment;
        }
        return patch;
    }

    function createPrismaMock() {
        const tx = {
            approvalRequest: {
                create: async ({ data }) => {
                    const steps = (data.steps?.create || []).map((s, i) => ({
                        id: `step-new-${i + 1}`,
                        ...s,
                        requiredRole: { code: FAKE_CHAIN.roleCodes[i] },
                    }));
                    approvalRequest = {
                        id: `ar-${Date.now()}`,
                        ...data,
                        steps,
                    };
                    syncSessionApproval();
                    return approvalRequest;
                },
                update: async ({ where, data }) => {
                    approvalRequest = { ...approvalRequest, ...data, id: where.id };
                    syncSessionApproval();
                    return approvalRequest;
                },
            },
            approvalStep: {
                update: async ({ where, data }) => {
                    const step = approvalRequest.steps.find((s) => s.id === where.id);
                    Object.assign(step, data);
                    return step;
                },
                updateMany: async ({ data }) => {
                    for (const step of approvalRequest.steps) {
                        Object.assign(step, data);
                    }
                    return { count: approvalRequest.steps.length };
                },
            },
            stockCountSession: {
                update: async ({ where, data }) => {
                    session = { ...session, ...normalizeSessionPatch(data), id: where.id };
                    syncSessionApproval();
                    return session;
                },
                updateMany: async ({ where, data }) => {
                    const guard = where?.status?.in;
                    if (guard && !guard.includes(session.status)) {
                        return { count: 0 };
                    }
                    session = { ...session, ...normalizeSessionPatch(data) };
                    syncSessionApproval();
                    return { count: 1 };
                },
                findFirst: async () => {
                    syncSessionApproval();
                    return { ...session };
                },
            },
            auditLog: {
                create: async ({ data }) => {
                    auditLog.push(data);
                    return data;
                },
            },
        };

        return {
            stockCountSession: {
                findFirst: async () => {
                    syncSessionApproval();
                    return { ...session };
                },
                update: tx.stockCountSession.update,
                updateMany: tx.stockCountSession.updateMany,
            },
            stockCountLocationQty: { count: async () => 0 },
            approvalRequest: tx.approvalRequest,
            approvalStep: tx.approvalStep,
            $transaction: async (fn) => fn(createPrismaMock()),
        };
    }

    const prismaClientPath = require.resolve('@prisma/client');
    require.cache[prismaClientPath] = {
        id: prismaClientPath,
        filename: prismaClientPath,
        loaded: true,
        exports: {
            PrismaClient: class MockPrismaClient {
                constructor() {
                    return createPrismaMock();
                }
            },
        },
    };

    delete require.cache[servicePath];
    const svc = require('./inventoryCount.service');
    const helpers = require('./inventory-count-workflow.helpers');

    return {
        svc,
        helpers,
        get session() {
            return session;
        },
        set session(next) {
            session = next;
        },
        get approvalRequest() {
            return approvalRequest;
        },
        set approvalRequest(next) {
            approvalRequest = next;
            syncSessionApproval();
        },
        get postingCalls() {
            return postingCalls;
        },
        get auditLog() {
            return auditLog;
        },
        setScopeDepartment(id) {
            scopeDepartmentId = id;
        },
        setDeptAssignment(deptId) {
            deptAssignmentDeptId = deptId;
        },
        user,
    };
}

test('prepare roles — Storekeeper and Receiving may prepare; RECEIVER retired', () => {
    const { helpers } = setupHarness();
    assert.equal(helpers.isCountPrepareRole('STOREKEEPER'), true);
    assert.equal(helpers.isCountPrepareRole('RECEIVER'), false);
    helpers.assertCountPrepareActor({ role: 'STOREKEEPER', permissions: ['STOCK_COUNT_CREATE'] });
    assert.throws(
        () => helpers.assertCountPrepareActor({ role: 'RECEIVER', permissions: ['STOCK_COUNT_CREATE'] }),
        (e) => e.code === 'COUNT_CREATE_ACTOR_REQUIRED',
    );
});

test('Cost Control submit — lands on PENDING_DEPT without posting', async () => {
    const h = setupHarness();
    const result = await h.svc.submitForApproval(TENANT_ID, h.user('user-cc', 'COST_CONTROL'), SESSION_ID, cvBody(h));
    assert.equal(result.status, 'PENDING_DEPT');
    assert.equal(h.postingCalls, 0);
    assert.equal(h.approvalRequest.accWorkflowVersionId, FAKE_CHAIN.versionId);
    assert.equal(h.approvalRequest.steps[0].status, 'APPROVED');
    assert.equal(h.approvalRequest.steps[1].status, 'PENDING');
    assert.ok(h.auditLog.some((e) => e.note.includes('submittedBy=user-cc')));
});

test('Department Manager — correct department may approve; wrong department blocked', async () => {
    const h = setupHarness();
    await h.svc.submitForApproval(TENANT_ID, h.user('user-cc', 'COST_CONTROL'), SESSION_ID, cvBody(h));
    h.setScopeDepartment(DEPT_A);
    h.setDeptAssignment(DEPT_A);

    const ok = await h.svc.approve(TENANT_ID, 'user-dept-a', h.user('user-dept-a', 'DEPT_MANAGER'), SESSION_ID, cvBody(h));
    assert.equal(ok.status, 'PENDING_FINANCE');
    assert.equal(h.postingCalls, 0);

    h.session = makeSession({ status: 'PENDING_DEPT', departmentId: DEPT_A });
    h.approvalRequest = makeApprovalRequest(h.session, { currentStep: 2 });
    h.setScopeDepartment(DEPT_B);
    h.setDeptAssignment(DEPT_B);

    await assert.rejects(
        () => h.svc.approve(TENANT_ID, 'user-dept-b', h.user('user-dept-b', 'DEPT_MANAGER'), SESSION_ID, cvBody(h)),
        (e) => e.code === 'COUNT_DEPT_MANAGER_SCOPE_MISMATCH',
    );
});

test('Send Back — Dept→CC, Finance→Dept, GM→Finance', async () => {
    const h = setupHarness();
    await h.svc.submitForApproval(TENANT_ID, h.user('user-cc', 'COST_CONTROL'), SESSION_ID, cvBody(h));

    h.setScopeDepartment(DEPT_A);
    h.setDeptAssignment(DEPT_A);
    const deptBack = await h.svc.sendBack(
        TENANT_ID,
        'user-dept-a',
        h.user('user-dept-a', 'DEPT_MANAGER'),
        SESSION_ID,
        { reason: 'Recount needed', ...cvBody(h) },
    );
    assert.equal(deptBack.status, 'PENDING_COST_CONTROL');
    assert.equal(h.postingCalls, 0);

    h.session = makeSession({ status: 'PENDING_FINANCE' });
    h.approvalRequest = makeApprovalRequest(h.session, {
        currentStep: 3,
        steps: [
            { ...roleStep('COST_CONTROL', 1, 'APPROVED') },
            { ...roleStep('DEPT_MANAGER', 2, 'APPROVED') },
            roleStep('FINANCE_MANAGER', 3),
            roleStep('GENERAL_MANAGER', 4),
        ],
    });
    const finBack = await h.svc.sendBack(
        TENANT_ID,
        'user-fm',
        h.user('user-fm', 'FINANCE_MANAGER'),
        SESSION_ID,
        { reason: 'Dept review again', ...cvBody(h) },
    );
    assert.equal(finBack.status, 'PENDING_DEPT');

    h.session = makeSession({ status: 'PENDING_GM' });
    h.approvalRequest = makeApprovalRequest(h.session, {
        currentStep: 4,
        steps: [
            { ...roleStep('COST_CONTROL', 1, 'APPROVED') },
            { ...roleStep('DEPT_MANAGER', 2, 'APPROVED') },
            { ...roleStep('FINANCE_MANAGER', 3, 'APPROVED') },
            roleStep('GENERAL_MANAGER', 4),
        ],
    });
    const gmBack = await h.svc.sendBack(
        TENANT_ID,
        'user-gm',
        h.user('user-gm', 'GENERAL_MANAGER'),
        SESSION_ID,
        { reason: 'Finance rework', ...cvBody(h) },
    );
    assert.equal(gmBack.status, 'PENDING_FINANCE');
    assert.equal(h.postingCalls, 0);
});

test('Cancel — allowed in DRAFT/COUNTING only; blocked after submit', async () => {
    const h = setupHarness();
    h.session = makeSession({ status: 'DRAFT' });
    const cancelled = await h.svc.cancelSession(TENANT_ID, h.user('user-sk', 'STOREKEEPER'), SESSION_ID, {
        reason: 'Wrong locations',
        ...cvBody(h),
    });
    assert.equal(cancelled.status, 'VOID');
    assert.equal(h.postingCalls, 0);
    assert.ok(h.auditLog.some((e) => e.action === 'CANCEL'));
    assert.equal(h.session.status, 'VOID');

    h.session = makeSession({ status: 'COUNTING' });
    const cancelled2 = await h.svc.cancelSession(TENANT_ID, h.user('user-sk', 'STOREKEEPER'), SESSION_ID, {
        reason: 'Aborted',
        ...cvBody(h),
    });
    assert.equal(cancelled2.status, 'VOID');

    h.session = makeSession({ status: 'VOID' });
    await assert.rejects(
        () => h.svc.cancelSession(TENANT_ID, h.user('user-sk', 'STOREKEEPER'), SESSION_ID, { reason: 'Again', ...cvBody(h) }),
        (e) => e.code === 'COUNT_SESSION_ALREADY_VOID',
    );

    h.session = makeSession({ status: 'REVEAL_REVIEW' });
    await assert.rejects(
        () => h.svc.cancelSession(TENANT_ID, h.user('user-sk', 'STOREKEEPER'), SESSION_ID, { reason: 'Too late', ...cvBody(h) }),
        (e) => e.code === 'COUNT_SESSION_INVALID_STATE',
    );
});

test('Dept Send Back — one-step rewind preserves pinned ACC workflow version', async () => {
    const h = setupHarness();
    await h.svc.submitForApproval(TENANT_ID, h.user('user-cc', 'COST_CONTROL'), SESSION_ID, cvBody(h));
    const pinnedVersion = h.approvalRequest.accWorkflowVersionId;

    h.setScopeDepartment(DEPT_A);
    h.setDeptAssignment(DEPT_A);
    await h.svc.sendBack(
        TENANT_ID,
        'user-dept-a',
        h.user('user-dept-a', 'DEPT_MANAGER'),
        SESSION_ID,
        { reason: 'Fix variances', ...cvBody(h) },
    );
    assert.equal(h.session.status, 'PENDING_COST_CONTROL');

    const ccApproval = await h.svc.approve(TENANT_ID, 'user-cc', h.user('user-cc', 'COST_CONTROL'), SESSION_ID, cvBody(h));
    assert.equal(ccApproval.status, 'PENDING_DEPT');
    assert.equal(h.approvalRequest.accWorkflowVersionId, pinnedVersion);
    assert.equal(h.postingCalls, 0);
});

test('Full approval chain — posting exactly once after GM only', async () => {
    const h = setupHarness();
    await h.svc.submitForApproval(TENANT_ID, h.user('user-cc', 'COST_CONTROL'), SESSION_ID, cvBody(h));

    h.setScopeDepartment(DEPT_A);
    h.setDeptAssignment(DEPT_A);
    await h.svc.approve(TENANT_ID, 'user-dept', h.user('user-dept', 'DEPT_MANAGER'), SESSION_ID, cvBody(h));
    assert.equal(h.postingCalls, 0);

    await h.svc.approve(TENANT_ID, 'user-fm', h.user('user-fm', 'FINANCE_MANAGER'), SESSION_ID, cvBody(h));
    assert.equal(h.postingCalls, 0);

    const final = await h.svc.approve(TENANT_ID, 'user-gm', h.user('user-gm', 'GENERAL_MANAGER'), SESSION_ID, cvBody(h));
    assert.equal(final.status, 'POSTED');
    assert.equal(h.postingCalls, 1);
    assert.ok(h.auditLog.some((e) => e.note.includes('INVENTORY_COUNT_APPROVE_FINAL')));
});

test('legacy 2-step pinned chain — matrix does not remap in-flight Finance→GM docs', () => {
    const { inferLegacyCountApprovalState } = require('./acc-workflow-count.runtime');
    const legacy = inferLegacyCountApprovalState('PENDING_GM', LEGACY_CHAIN_2);
    assert.equal(legacy.approvedCount, 1);
    assert.equal(legacy.pendingStep, 2);
    const v3 = inferLegacyCountApprovalState('PENDING_GM', FAKE_CHAIN);
    assert.equal(v3.approvedCount, 3);
    assert.equal(v3.pendingStep, 4);
});
