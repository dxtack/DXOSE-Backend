'use strict';

/**
 * Inventory Count cancel — atomic transaction + audit rollback proof.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';

function makeSession(overrides = {}) {
    return {
        id: SESSION_ID,
        tenantId: TENANT_ID,
        sessionNo: 'CNT-2607-0099',
        status: 'DRAFT',
        departmentId: '22222222-2222-4222-8222-222222222222',
        createdBy: 'user-storekeeper',
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

function setupHarness({ auditThrows = false } = {}) {
    let session = makeSession();
    let approvalRequest = null;
    const auditLog = [];

    const auditWriterPath = require.resolve('./auditWriter.service');
    require.cache[auditWriterPath] = {
        id: auditWriterPath,
        filename: auditWriterPath,
        loaded: true,
        exports: {
            writeAuditLogTransactional: async (entry) => {
                if (auditThrows) {
                    throw new Error('audit write failed');
                }
                auditLog.push(entry);
            },
        },
    };

    const auditPath = require.resolve('./auditTrail.service');
    require.cache[auditPath] = {
        id: auditPath,
        filename: auditPath,
        loaded: true,
        exports: {
            logAction: async (entry) => auditLog.push(entry),
            EntityType: { STOCK_COUNT: 'STOCK_COUNT' },
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
                departmentId: session.departmentId,
                propertyId: TENANT_ID,
            }),
        },
    };

    function syncSessionApproval() {
        if (approvalRequest) {
            session.approvalRequestId = approvalRequest.id;
            session.approvalRequest = approvalRequest;
        }
    }

    function matchesStatusGuard(where) {
        if (!where?.status) return true;
        if (where.status.in) return where.status.in.includes(session.status);
        return where.status === session.status;
    }

    function createPrismaMock() {
        const tx = {
            approvalRequest: {
                update: async ({ where, data }) => {
                    approvalRequest = { ...approvalRequest, ...data, id: where.id };
                    syncSessionApproval();
                    return approvalRequest;
                },
            },
            approvalStep: {
                updateMany: async ({ data }) => {
                    if (approvalRequest?.steps) {
                        for (const step of approvalRequest.steps) Object.assign(step, data);
                    }
                    return { count: approvalRequest?.steps?.length || 0 };
                },
            },
            stockCountSession: {
                update: async ({ where, data }) => {
                    session = { ...session, ...data, id: where.id };
                    syncSessionApproval();
                    return session;
                },
                updateMany: async ({ where, data }) => {
                    // Conditional guarded update — mirrors WHERE status IN (...).
                    if (!matchesStatusGuard(where)) {
                        return { count: 0 };
                    }
                    session = { ...session, ...data };
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

        // Serialize transactions to emulate row-level locking on the same session.
        let txQueue = Promise.resolve();

        const client = {
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
            $transaction: (fn) => {
                const run = txQueue.then(async () => {
                    const sessionBefore = { ...session };
                    const approvalBefore = approvalRequest
                        ? {
                              ...approvalRequest,
                              steps: approvalRequest.steps?.map((step) => ({ ...step })),
                          }
                        : null;
                    try {
                        return await fn(tx);
                    } catch (err) {
                        session = sessionBefore;
                        approvalRequest = approvalBefore;
                        throw err;
                    }
                });
                // Keep the queue chained regardless of individual outcome.
                txQueue = run.then(
                    () => undefined,
                    () => undefined,
                );
                return run;
            },
            $on: () => {},
        };
        return client;
    }

    const dbPath = require.resolve('../config/database');
    const helpersPath = require.resolve('./inventory-count-workflow.helpers');
    const servicePath = require.resolve('./inventoryCount.service');
    const prismaClientPath = require.resolve('@prisma/client');
    delete require.cache[dbPath];
    delete require.cache[helpersPath];
    delete require.cache[servicePath];
    delete require.cache[prismaClientPath];

    const prismaMock = createPrismaMock();
    require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: prismaMock,
    };

    require.cache[prismaClientPath] = {
        id: prismaClientPath,
        filename: prismaClientPath,
        loaded: true,
        exports: {
            PrismaClient: class MockPrismaClient {
                constructor() {
                    return prismaMock;
                }
            },
        },
    };

    const svc = require('./inventoryCount.service');

    return {
        svc,
        get session() {
            return session;
        },
        set session(next) {
            session = next;
            syncSessionApproval();
        },
        get approvalRequest() {
            return approvalRequest;
        },
        set approvalRequest(next) {
            approvalRequest = next;
            syncSessionApproval();
        },
        get auditLog() {
            return auditLog;
        },
        user: (id, role) => ({
            id,
            role,
            permissions: [
                'STOCK_COUNT_CREATE',
                'STOCK_COUNT_EXECUTE',
                'STOCK_COUNT_CANCEL',
                'STOCK_COUNT_RECOUNT',
                'STOCK_COUNT_SUBMIT',
            ],
        }),
    };
}

test('Successful cancel updates session VOID and audit CANCEL atomically', async () => {
    const h = setupHarness();
    const result = await h.svc.cancelSession(TENANT_ID, h.user('user-sk', 'STOREKEEPER'), SESSION_ID, {
        reason: 'Wrong department',
        concurrencyVersion: 0,
    });
    assert.equal(result.status, 'VOID');
    assert.equal(h.session.status, 'VOID');
    assert.equal(h.auditLog.length, 1);
    assert.equal(h.auditLog[0].action, 'CANCEL');
    assert.equal(h.auditLog[0].afterValue.status, 'VOID');
});

test('Audit failure causes full rollback — session stays DRAFT', async () => {
    const h = setupHarness({ auditThrows: true });
    await assert.rejects(
        () => h.svc.cancelSession(TENANT_ID, h.user('user-sk', 'STOREKEEPER'), SESSION_ID, { reason: 'Fail audit', concurrencyVersion: 0 }),
        (e) => /audit write failed/i.test(e?.message || ''),
    );
    assert.equal(h.session.status, 'DRAFT');
    assert.equal(h.auditLog.length, 0);
});

test('Second cancel on VOID is idempotently blocked', async () => {
    const h = setupHarness();
    await h.svc.cancelSession(TENANT_ID, h.user('user-sk', 'STOREKEEPER'), SESSION_ID, { reason: 'First', concurrencyVersion: 0 });
    await assert.rejects(
        () => h.svc.cancelSession(TENANT_ID, h.user('user-sk', 'STOREKEEPER'), SESSION_ID, { reason: 'Second', concurrencyVersion: 0 }),
        (e) => e.code === 'COUNT_SESSION_ALREADY_VOID',
    );
    assert.equal(h.session.status, 'VOID');
});

test('Cancel with active approval request closes approval inside transaction', async () => {
    const h = setupHarness();
    h.session = makeSession({
        status: 'COUNTING',
        approvalRequestId: 'ar-draft',
    });
    h.approvalRequest = {
        id: 'ar-draft',
        status: 'PENDING',
        steps: [
            { id: 'st-1', stepNumber: 1, status: 'PENDING' },
            { id: 'st-2', stepNumber: 2, status: 'PENDING' },
        ],
    };
    await h.svc.cancelSession(TENANT_ID, h.user('user-sk', 'STOREKEEPER'), SESSION_ID, { reason: 'Abort', concurrencyVersion: 0 });
    assert.equal(h.approvalRequest.status, 'CANCELLED');
    assert.equal(h.approvalRequest.steps.every((s) => s.status === 'CANCELLED'), true);
    assert.equal(h.session.status, 'VOID');
});

test('Concurrent cancel — only first succeeds, second returns 409, single CANCEL audit', async () => {
    const h = setupHarness();
    // Both requests read DRAFT before either transaction runs (true race).
    const results = await Promise.allSettled([
        h.svc.cancelSession(TENANT_ID, h.user('user-a', 'STOREKEEPER'), SESSION_ID, { reason: 'Racer A', concurrencyVersion: 0 }),
        h.svc.cancelSession(TENANT_ID, h.user('user-b', 'STOREKEEPER'), SESSION_ID, { reason: 'Racer B', concurrencyVersion: 0 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one cancel should succeed');
    assert.equal(rejected.length, 1, 'exactly one cancel should be blocked');
    assert.equal(fulfilled[0].value.status, 'VOID');
    assert.equal(rejected[0].reason.code, 'COUNT_SESSION_ALREADY_VOID');
    assert.equal(rejected[0].reason.statusCode, 409);

    assert.equal(h.session.status, 'VOID');
    const cancelAudits = h.auditLog.filter((e) => e.action === 'CANCEL');
    assert.equal(cancelAudits.length, 1, 'only one CANCEL audit event may be recorded');
});
