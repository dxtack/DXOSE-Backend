const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const servicePath = path.resolve(__dirname, './getPass.service.js');
const workflowSendBackPath = path.resolve(__dirname, '../platform/workflowSendBack.service.js');

function loadGetPassServiceWithMocks({ getPass }) {
    const updates = [];
    const auditLogs = [];
    const governedEvents = [];
    const state = { lines: [], ...getPass };

    const prismaMock = {
        getPass: {
            findFirst: async () => state,
            update: async ({ where, data }) => {
                updates.push({ where, data });
                Object.assign(state, data);
                return { ...state, id: where.id };
            },
            updateMany: async ({ where, data }) => {
                updates.push({ where, data, many: true });
                if (
                    where.concurrencyVersion != null &&
                    Number(state.concurrencyVersion) !== Number(where.concurrencyVersion)
                ) {
                    return { count: 0 };
                }
                Object.assign(state, data);
                if (data.concurrencyVersion?.increment) {
                    state.concurrencyVersion = Number(state.concurrencyVersion || 0) + data.concurrencyVersion.increment;
                }
                return { count: 1 };
            },
        },
        approvalRequest: {
            findFirst: async () => state.approvalRequest || null,
            create: async ({ data, include }) => {
                const request = {
                    id: 'ar-gp-1',
                    tenantId: data.tenantId,
                    requestType: data.requestType,
                    status: data.status,
                    getPassId: data.getPassId,
                    currentStep: data.currentStep,
                    totalSteps: data.totalSteps,
                    createdBy: data.createdBy,
                    accWorkflowVersionId:
                        data.accWorkflowVersionId ?? data.accWorkflowVersion?.connect?.id ?? null,
                    steps: data.steps.create.map((s, index) => ({
                        id: `step-${index + 1}`,
                        requestId: 'ar-gp-1',
                        stepNumber: s.stepNumber,
                        requiredRole: { code: s.requiredRole.connect.code },
                        status: s.status,
                        actedBy: s.actedByUser?.connect?.id ?? null,
                        actedAt: s.actedAt ?? null,
                        comment: null,
                    })),
                };
                state.approvalRequest = request;
                return include ? request : { ...request, steps: undefined };
            },
            update: async ({ where, data }) => {
                Object.assign(state.approvalRequest, data);
                return { ...state.approvalRequest, id: where.id };
            },
            updateMany: async ({ where, data }) => {
                if (!state.approvalRequest) return { count: 0 };
                if (where.status && state.approvalRequest.status !== where.status) return { count: 0 };
                if (
                    where.currentStep != null &&
                    Number(state.approvalRequest.currentStep) !== Number(where.currentStep)
                ) {
                    return { count: 0 };
                }
                Object.assign(state.approvalRequest, data);
                return { count: 1 };
            },
        },
        approvalStep: {
            update: async ({ where, data }) => {
                const step = state.approvalRequest.steps.find((s) => s.id === where.id);
                if (step) {
                    Object.assign(step, {
                        status: data.status ?? step.status,
                        actedBy: data.actedByUser?.connect?.id ?? (data.actedByUser?.disconnect ? null : step.actedBy),
                        actedAt: data.actedAt ?? step.actedAt,
                        comment: data.comment ?? step.comment,
                    });
                }
                return step;
            },
        },
        auditLog: {
            findMany: async () => [],
            count: async () => auditLogs.filter((a) => a.action === 'SEND_BACK').length,
        },
        $transaction: async (fn) => fn(prismaMock),
        $on: () => {},
    };

    const originalLoad = Module._load;
    Module._load = function patchedLoader(request, parent, isMain) {
        if (request === '@prisma/client') {
            return { PrismaClient: function PrismaClient() { return prismaMock; } };
        }
        if (request === './auditTrail.service') {
            return {
                logAction: async (entry) => {
                    auditLogs.push(entry);
                },
                EntityType: { GET_PASS: 'GET_PASS' },
            };
        }
        if (request === './auditGoverned.service') {
            return {
                logGovernedEvent: async (entry) => {
                    governedEvents.push(entry);
                },
                EntityType: { GET_PASS: 'GET_PASS' },
            };
        }
        if (request === './postingEngine.service') return {};
        if (request === './periodGuard.service') {
            return { checkPeriodLock: async () => {}, validatePostingDate: async () => {} };
        }
        if (request === './rbac.service') {
            return {
                connectRole: (code) => ({ connect: { code } }),
                normalizeRole: (r) => String(r || '').toUpperCase().replace(/-/g, '_'),
            };
        }
        if (request === '../services/auditWriter.service') {
            return {
                writeAuditLogTransactional: async (entry) => {
                    auditLogs.push(entry);
                },
            };
        }
        if (request === './scope/scopeContext') {
            return {
                resolveScopeContext: async () => ({}),
                scopeWhereFor: () => ({}),
                metaFor: () => ({}),
                assertInScope: async () => true,
                assertLocationInScope: async () => true,
                SCOPE_MODULE: {},
            };
        }
        if (request === './scope/assignment-mutation.guard') {
            return { assertActiveAssignmentForMutation: async () => true };
        }
        if (request === './breakage.service') return { createMovementApprovalRequest: async () => {} };
        if (request === './organization.service') return { organizationRootId: () => 'org-1' };
        if (request === './systemNotification.service') {
            return {
                notifyIncomingInternalGetPass: async () => {},
                notifySourceTenantAdminsOfPermanentReceipt: async () => {},
                notifyTenantRoles: async () => {},
            };
        }
        if (request === './docNumbering.service') {
            return { generateDocNumber: async () => 'GP-001', DocPrefix: { GET_PASS: 'GP' } };
        }
        if (request === './acc-workflow-runtime.service') {
            const mockChain = {
                versionId: 'wf-version-1',
                steps: [
                    {
                        stepOrder: 1,
                        statusKey: 'PENDING_DEPT',
                        roleCode: 'DEPT_MANAGER',
                        permissionCode: 'GET_PASS_MANAGE',
                    },
                    {
                        stepOrder: 2,
                        statusKey: 'PENDING_COST_CONTROL',
                        roleCode: 'COST_CONTROLLER',
                        permissionCode: 'GET_PASS_MANAGE',
                    },
                    {
                        stepOrder: 3,
                        statusKey: 'PENDING_FINANCE',
                        roleCode: 'FINANCE_MANAGER',
                        permissionCode: 'GET_PASS_MANAGE',
                    },
                ],
            };
            return {
                resolveWorkflowByVersionId: async () => mockChain,
                resolveWorkflowForDocument: async () => mockChain,
            };
        }
        if (request === './acc-workflow-status-key-guard.service') {
            return { assertAwaitingStatusKey: (key) => key };
        }
        if (request === '../acc-authority/step-permission-enforcement') {
            return {
                assertUserHasGetPassStepPermission: () => {},
                assertDualGateApproval: () => {},
            };
        }
        return originalLoad(request, parent, isMain);
    };

    delete require.cache[servicePath];
    delete require.cache[workflowSendBackPath];
    const service = require(servicePath);
    Module._load = originalLoad;

    return { service, updates, auditLogs, governedEvents, state };
}

const deptApprovedAt = new Date('2026-01-10T10:00:00.000Z');
const costControlApprovedAt = new Date('2026-01-11T11:00:00.000Z');

const partiallyApprovedGetPass = {
    id: 'gp-1',
    tenantId: 'tenant-1',
    accWorkflowVersionId: 'wf-version-1',
    status: 'PENDING_FINANCE',
    concurrencyVersion: 0,
    deptApprovedBy: 'dept-user',
    deptApprovedAt,
    costControlApprovedBy: 'cc-user',
    costControlApprovedAt,
    financeApprovedBy: null,
    financeApprovedAt: null,
    gmApprovedBy: null,
    gmApprovedAt: null,
    securityApprovedBy: null,
    securityApprovedAt: null,
};

test('rejectGetPass: retains prior approval stamps and logs REJECT', async () => {
    const { service, updates, auditLogs } = loadGetPassServiceWithMocks({
        getPass: { ...partiallyApprovedGetPass },
    });

    const result = await service.rejectGetPass(
        'gp-1',
        'tenant-1',
        { id: 'fin-user', role: 'FINANCE_MANAGER' },
        'Budget not approved',
        0,
    );

    assert.equal(result.status, 'REJECTED');
    assert.equal(result.rejectionReason, 'Budget not approved');
    assert.equal(result.deptApprovedBy, 'dept-user');
    assert.equal(result.deptApprovedAt, deptApprovedAt);
    assert.equal(result.costControlApprovedBy, 'cc-user');
    assert.equal(result.costControlApprovedAt, costControlApprovedAt);
    assert.equal(result.financeApprovedBy, null);
    assert.equal(result.financeApprovedAt, null);

    assert.equal(updates.length, 1);
    const { data } = updates[0];
    assert.deepEqual(data, {
        status: 'REJECTED',
        rejectionReason: 'Budget not approved',
        concurrencyVersion: { increment: 1 },
    });

    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, 'REJECT');
    assert.equal(auditLogs[0].entityType, 'GET_PASS');
    assert.equal(auditLogs[0].entityId, 'gp-1');
    assert.equal(auditLogs[0].changedBy, 'fin-user');
});

test('sendBackGetPass: from step 2 parks on creator (Returned), logs SEND_BACK', async () => {
    const { service, updates, auditLogs, state } = loadGetPassServiceWithMocks({
        getPass: {
            ...partiallyApprovedGetPass,
            status: 'PENDING_COST_CONTROL',
            notes: null,
            costControlApprovedBy: null,
            costControlApprovedAt: null,
            createdByUser: { id: 'creator-user', firstName: 'Person', lastName: 'A' },
            deptApprover: { id: 'dept-user', firstName: 'Person', lastName: 'B' },
        },
    });

    const result = await service.sendBackGetPass(
        'gp-1',
        'tenant-1',
        { id: 'cc-user', role: 'COST_CONTROL' },
        'Fix borrowing entity',
        0,
        0,
    );

    assert.equal(result.status, 'DRAFT');
    assert.equal(state.accWorkflowVersionId, 'wf-version-1');
    assert.match(state.notes, /\[Send Back\] Fix borrowing entity/);
    assert.equal(state.approvalRequest.currentStep, 0);

    assert.equal(updates.some((u) => u.data.status === 'DRAFT'), true);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, 'SEND_BACK');
    assert.equal(auditLogs[0].afterValue.targetStepNumber, 0);
    assert.equal(auditLogs[0].afterValue.targetType, 'CREATOR');
});

test('sendBackGetPass: C can send back to B (prior step), not only creator', async () => {
    const { service, updates, auditLogs, state } = loadGetPassServiceWithMocks({
        getPass: {
            ...partiallyApprovedGetPass,
            status: 'PENDING_FINANCE',
            notes: null,
            financeApprovedBy: null,
            financeApprovedAt: null,
            createdByUser: { id: 'creator-user', firstName: 'Person', lastName: 'A' },
            deptApprover: { id: 'dept-user', firstName: 'Person', lastName: 'B' },
            costControlApprover: { id: 'cc-user', firstName: 'Person', lastName: 'C' },
        },
    });

    const result = await service.sendBackGetPass(
        'gp-1',
        'tenant-1',
        { id: 'fin-user', role: 'FINANCE_MANAGER' },
        'Need cost recheck',
        0,
        2,
    );

    assert.equal(result.status, 'PENDING_COST_CONTROL');
    assert.equal(state.approvalRequest.currentStep, 2);
    assert.equal(state.notes, null);
    assert.equal(auditLogs[0].afterValue.targetStepNumber, 2);
    assert.equal(updates.some((u) => u.data.status === 'PENDING_COST_CONTROL'), true);
});

test('submitGetPass: resubmit preserves pinned workflow and logs GET_PASS_RESUBMIT', async () => {
    const { service, updates, auditLogs, governedEvents, state } = loadGetPassServiceWithMocks({
        getPass: {
            id: 'gp-1',
            tenantId: 'tenant-1',
            createdBy: 'creator-user',
            accWorkflowVersionId: 'wf-version-1',
            status: 'DRAFT',
            concurrencyVersion: 1,
            notes: '[Send Back] Fix borrowing entity',
            lines: [],
            approvalRequest: {
                id: 'ar-gp-1',
                status: 'PENDING',
                currentStep: 0,
                totalSteps: 3,
                accWorkflowVersionId: 'wf-version-1',
                steps: [
                    { id: 'step-1', stepNumber: 1, status: 'PENDING', requiredRole: { code: 'DEPT_MANAGER' } },
                    { id: 'step-2', stepNumber: 2, status: 'PENDING', requiredRole: { code: 'COST_CONTROLLER' } },
                    { id: 'step-3', stepNumber: 3, status: 'PENDING', requiredRole: { code: 'FINANCE_MANAGER' } },
                ],
            },
        },
    });

    const result = await service.submitGetPass(
        'gp-1',
        'tenant-1',
        { id: 'creator-user', role: 'DEPT_MANAGER' },
        1,
    );

    assert.equal(result.status, 'PENDING_COST_CONTROL');
    assert.equal(state.accWorkflowVersionId, 'wf-version-1');
    assert.equal(state.approvalRequest.currentStep, 2);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].data.status, 'PENDING_COST_CONTROL');
    assert.equal(governedEvents.length, 0);
    const submitAudit = auditLogs.find((entry) => entry.action === 'SUBMIT');
    assert.ok(submitAudit);
    assert.equal(submitAudit.afterValue.resubmit, true);
});

test('submitGetPass: resubmit rejects non-creator', async () => {
    const { service } = loadGetPassServiceWithMocks({
        getPass: {
            id: 'gp-1',
            tenantId: 'tenant-1',
            createdBy: 'creator-user',
            accWorkflowVersionId: 'wf-version-1',
            status: 'DRAFT',
            concurrencyVersion: 1,
            notes: '[Send Back] Fix borrowing entity',
            lines: [],
        },
    });

    await assert.rejects(
        () =>
            service.submitGetPass(
                'gp-1',
                'tenant-1',
                { id: 'other-user', role: 'FINANCE_MANAGER' },
                1,
            ),
        /Only the document creator may edit or resubmit after Send Back/,
    );
});

test('sendBackGetPass: rejects missing reason', async () => {
    const { service } = loadGetPassServiceWithMocks({
        getPass: { ...partiallyApprovedGetPass, status: 'PENDING_COST_CONTROL' },
    });

    await assert.rejects(
        () => service.sendBackGetPass('gp-1', 'tenant-1', { id: 'cc-user', role: 'COST_CONTROL' }, '  ', 0),
        /Send Back reason is required/,
    );
});

function loadDeleteGetPassMocks({ status }) {
    const deleted = [];
    const auditLogs = [];
    const state = { id: 'gp-del-1', tenantId: 'tenant-1', status, concurrencyVersion: 0 };

    const prismaMock = {
        getPass: {
            findFirst: async () => state,
            delete: async ({ where }) => {
                deleted.push(where);
                return state;
            },
        },
        $on: () => {},
    };

    const originalLoad = Module._load;
    Module._load = function patchedLoader(request, parent, isMain) {
        if (request === '@prisma/client') {
            return { PrismaClient: function PrismaClient() { return prismaMock; } };
        }
        if (request === './auditTrail.service') {
            return {
                logAction: async (entry) => {
                    auditLogs.push(entry);
                },
                EntityType: { GET_PASS: 'GET_PASS' },
            };
        }
        if (request === './auditGoverned.service') {
            return { logGovernedEvent: async () => {}, EntityType: { GET_PASS: 'GET_PASS' } };
        }
        if (request === './postingEngine.service') return {};
        if (request === './periodGuard.service') {
            return { checkPeriodLock: async () => {}, validatePostingDate: async () => {} };
        }
        if (request === './rbac.service') {
            return { normalizeRole: (r) => String(r || '').toUpperCase().replace(/-/g, '_') };
        }
        if (request === './scope/scopeContext') {
            return {
                resolveScopeContext: async () => ({}),
                scopeWhereFor: () => ({}),
                metaFor: () => ({}),
                assertInScope: async () => true,
                assertLocationInScope: async () => true,
                SCOPE_MODULE: {},
            };
        }
        if (request === './scope/assignment-mutation.guard') {
            return { assertActiveAssignmentForMutation: async () => true };
        }
        return originalLoad(request, parent, isMain);
    };

    delete require.cache[servicePath];
    const service = require(servicePath);
    Module._load = originalLoad;

    return { service, deleted, auditLogs };
}

test('deleteGetPass: allows DRAFT only', async () => {
    const { service, deleted, auditLogs } = loadDeleteGetPassMocks({ status: 'DRAFT' });

    const ok = await service.deleteGetPass('gp-del-1', 'tenant-1', 'user-1', 0);
    assert.equal(ok, true);
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].id, 'gp-del-1');
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, 'DELETE');
});

test('deleteGetPass: rejects REJECTED (Ch.2.6 draft-only delete)', async () => {
    const { service, deleted } = loadDeleteGetPassMocks({ status: 'REJECTED' });

    await assert.rejects(
        () => service.deleteGetPass('gp-del-1', 'tenant-1', 'user-1'),
        /Can only delete DRAFT Get Passes/,
    );
    assert.equal(deleted.length, 0);
});

test('rejectGetPass: requires rejectionReason', async () => {
    const { service } = loadGetPassServiceWithMocks({
        getPass: { ...partiallyApprovedGetPass },
    });

    await assert.rejects(
        () =>
            service.rejectGetPass(
                'gp-1',
                'tenant-1',
                { id: 'fin-user', role: 'FINANCE_MANAGER' },
                '   ',
            ),
        /rejectionReason is required/,
    );
});

test('rejectGetPass: creator can reject Returned (send-back) draft', async () => {
    const { service, updates, auditLogs } = loadGetPassServiceWithMocks({
        getPass: {
            id: 'gp-1',
            tenantId: 'tenant-1',
            createdBy: 'creator-user',
            status: 'DRAFT',
            concurrencyVersion: 2,
            notes: '[Send Back] Fix qty',
            deptApprovedBy: 'dept-user',
            deptApprovedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
    });

    const result = await service.rejectGetPass(
        'gp-1',
        'tenant-1',
        { id: 'creator-user', role: 'DEPT_MANAGER' },
        'Will not proceed',
        2,
    );

    assert.equal(result.status, 'REJECTED');
    assert.equal(result.rejectionReason, 'Will not proceed');
    assert.equal(updates.length, 1);
    assert.equal(auditLogs[0].action, 'REJECT');
    assert.equal(auditLogs[0].note, 'GET_PASS_CREATOR_REJECT_RETURNED');
});

test('rejectGetPass: non-creator cannot reject Returned draft', async () => {
    const { service } = loadGetPassServiceWithMocks({
        getPass: {
            id: 'gp-1',
            tenantId: 'tenant-1',
            createdBy: 'creator-user',
            status: 'DRAFT',
            concurrencyVersion: 1,
            notes: '[Send Back] Fix qty',
        },
    });

    await assert.rejects(
        () =>
            service.rejectGetPass(
                'gp-1',
                'tenant-1',
                { id: 'other-user', role: 'DEPT_MANAGER' },
                'Nope',
                1,
            ),
        /Only the document creator may edit or resubmit after Send Back/,
    );
});

const closeEligiblePass = {
    id: 'gp-close-1',
    tenantId: 'tenant-1',
    transferType: 'TEMPORARY',
    status: 'OUT',
    isInternalTransfer: false,
    receivedAt: null,
    destinationDeptAcceptedAt: null,
    destinationSecurityExitAt: null,
    lines: [{ id: 'l1', qty: 5, qtyReturned: 5 }],
};

test('closeGetPass: simple close when outstanding is zero', async () => {
    const { service, updates, auditLogs } = loadGetPassServiceWithMocks({
        getPass: { ...closeEligiblePass },
    });

    const result = await service.closeGetPass('gp-close-1', 'tenant-1', 'fin-user');

    assert.equal(result.status, 'CLOSED');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].data.status, 'CLOSED');
    assert.equal(updates[0].data.closedVia, 'SIMPLE');
    assert.equal(updates[0].data.closeReason, null);
    assert.equal(auditLogs[0].note, 'GET_PASS_CLOSE');
});

test('closeGetPass: rejects when outstanding remains', async () => {
    const { service } = loadGetPassServiceWithMocks({
        getPass: {
            ...closeEligiblePass,
            lines: [{ id: 'l1', qty: 5, qtyReturned: 2 }],
        },
    });

    await assert.rejects(
        () => service.closeGetPass('gp-close-1', 'tenant-1', 'fin-user'),
        /outstanding quantities remain/,
    );
});

test('closeGetPass: rejects RETURNED status', async () => {
    const { service } = loadGetPassServiceWithMocks({
        getPass: { ...closeEligiblePass, status: 'RETURNED' },
    });

    await assert.rejects(
        () => service.closeGetPass('gp-close-1', 'tenant-1', 'fin-user'),
        /only available for passes that are out or partially returned/,
    );
});

test('closeGetPass: rejects internal transfer with open destination custody', async () => {
    const { service } = loadGetPassServiceWithMocks({
        getPass: {
            ...closeEligiblePass,
            isInternalTransfer: true,
            receivedAt: new Date(),
        },
    });

    await assert.rejects(
        () => service.closeGetPass('gp-close-1', 'tenant-1', 'fin-user'),
        /internal transfer custody/,
    );
});

function loadSettlementServiceWithMocks({ getPass, stockBlocked = 10 }) {
    const updates = [];
    const governedEvents = [];
    const postingCalls = [];
    const state = JSON.parse(JSON.stringify(getPass));

    const lineRecord = {
        id: 'l1',
        getPassId: 'gp-settle-1',
        itemId: 'item-1',
        locationId: 'loc-1',
        qty: 10,
        qtyReturned: 4,
        unitCost: 5,
        item: { name: 'Fork' },
    };

    const prismaMock = {
        getPass: {
            findFirst: async () => state,
            update: async ({ where, data }) => {
                updates.push({ where, data });
                Object.assign(state, data);
                return { ...state, id: where.id };
            },
        },
        getPassLine: {
            findFirst: async () => ({ ...lineRecord, qtyReturned: state.lines?.[0]?.qtyReturned ?? 4 }),
            update: async ({ where, data }) => {
                updates.push({ where, data, entity: 'line' });
                if (state.lines?.[0]) Object.assign(state.lines[0], data);
                return state.lines?.[0];
            },
        },
        getPassReturn: {
            create: async ({ data }) => {
                updates.push({ entity: 'return', data });
                return { id: 'ret-1', ...data };
            },
            aggregate: async () => ({
                _sum: { qtyGood: 6, qtyLost: 0, qtyDamaged: 0 },
            }),
        },
        stockBalance: {
            findUnique: async () => ({ qtyBlocked: stockBlocked, qtyOnHand: 20, wacUnitCost: 5 }),
            update: async () => ({}),
        },
        movementDocument: { findFirst: async () => null, create: async () => ({ id: 'doc-1' }) },
        inventoryLedger: { create: async () => ({}) },
        postingExecution: {
            create: async ({ data }) => ({ id: 'execution-1', ...data }),
            update: async ({ where, data }) => ({ id: where.id, ...data }),
        },
        postingEffect: {
            create: async ({ data }) => ({ id: 'effect-1', ...data }),
        },
        auditLog: { findMany: async () => [] },
        $transaction: async (fn) => fn(prismaMock),
        $on: () => {},
    };

    const postingEngineMock = {
        isBlockingTransferType: () => true,
        isReversibleTransferType: () => true,
        releaseBlockedOnReturn: async (...args) => {
            postingCalls.push({ fn: 'releaseBlockedOnReturn', args });
        },
        postReturnGoodLedger: async (...args) => {
            postingCalls.push({ fn: 'postReturnGoodLedger', args });
            return { id: 'ledger-1' };
        },
        postReturnGoodWithStockIncrease: async () => {},
        createTrackingLedgerEntry: async () => {},
    };

    const originalLoad = Module._load;
    Module._load = function patchedLoader(request, parent, isMain) {
        if (request === '@prisma/client') {
            return { PrismaClient: function PrismaClient() { return prismaMock; } };
        }
        if (request === './auditTrail.service') {
            return {
                logAction: async () => {},
                EntityType: { GET_PASS: 'GET_PASS' },
            };
        }
        if (request === './auditGoverned.service') {
            return {
                logGovernedEvent: async (entry) => {
                    governedEvents.push(entry);
                },
                EntityType: { GET_PASS: 'GET_PASS' },
            };
        }
        if (request === './postingEngine.service') return postingEngineMock;
        if (request === './periodGuard.service') {
            return { checkPeriodLock: async () => {}, validatePostingDate: async () => {} };
        }
        if (request === './rbac.service') {
            return { normalizeRole: (r) => String(r || '').toUpperCase().replace(/-/g, '_') };
        }
        if (request === './scope/scopeContext') {
            return {
                resolveScopeContext: async () => ({}),
                scopeWhereFor: () => ({}),
                metaFor: () => ({}),
                assertInScope: async () => true,
                assertLocationInScope: async () => true,
                SCOPE_MODULE: {},
            };
        }
        if (request === './scope/assignment-mutation.guard') {
            return { assertActiveAssignmentForMutation: async () => true };
        }
        if (request === './breakage.service') return { createMovementApprovalRequest: async () => {} };
        if (request === './organization.service') return { organizationRootId: () => 'org-1' };
        if (request === './systemNotification.service') {
            return {
                notifyIncomingInternalGetPass: async () => {},
                notifySourceTenantAdminsOfPermanentReceipt: async () => {},
                notifyTenantRoles: async () => {},
            };
        }
        if (request === './docNumbering.service') {
            return { generateDocNumber: async () => 'BRK-001', DocPrefix: { BREAKAGE: 'BRK' } };
        }
        return originalLoad(request, parent, isMain);
    };

    delete require.cache[servicePath];
    const service = require(servicePath);
    Module._load = originalLoad;

    return { service, updates, governedEvents, postingCalls, state };
}

const settlementEligiblePass = {
    id: 'gp-settle-1',
    tenantId: 'tenant-1',
    passNo: 'GP-SET-1',
    transferType: 'TEMPORARY',
    status: 'PARTIALLY_RETURNED',
    isInternalTransfer: false,
    receivedAt: null,
    destinationDeptAcceptedAt: null,
    destinationSecurityExitAt: null,
    lines: [{ id: 'l1', qty: 10, qtyReturned: 4, itemId: 'item-1', locationId: 'loc-1', unitCost: 5 }],
};

const settlementPayload = {
    settlementCycleId: 'settlement-cycle-1',
    closeReason: 'Items not returned by guest',
    accountability: 'COMPANY_LOSS',
    lines: [{ lineId: 'l1', disposition: 'GOOD' }],
};

test('submitForceCloseSettlement: success moves to pending', async () => {
    const { service, updates, governedEvents } = loadSettlementServiceWithMocks({
        getPass: { ...settlementEligiblePass },
    });

    const result = await service.submitForceCloseSettlement(
        'gp-settle-1',
        'tenant-1',
        'fin-user',
        settlementPayload,
    );

    assert.equal(result.status, 'PENDING_FORCE_CLOSE_SETTLEMENT');
    assert.equal(updates[0].data.settlementPriorStatus, 'PARTIALLY_RETURNED');
    assert.equal(updates[0].data.closeReason, settlementPayload.closeReason);
    assert.equal(governedEvents[0].eventType, 'GET_PASS_FORCE_CLOSE_SUBMITTED');
});

test('submitForceCloseSettlement: rejects missing closeReason', async () => {
    const { service } = loadSettlementServiceWithMocks({
        getPass: { ...settlementEligiblePass },
    });

    await assert.rejects(
        () =>
            service.submitForceCloseSettlement('gp-settle-1', 'tenant-1', 'fin-user', {
                accountability: 'COMPANY_LOSS',
                lines: [{ lineId: 'l1', disposition: 'GOOD' }],
            }),
        /closeReason is required/,
    );
});

test('submitForceCloseSettlement: rejects when outstanding is zero', async () => {
    const { service } = loadSettlementServiceWithMocks({
        getPass: {
            ...settlementEligiblePass,
            lines: [{ id: 'l1', qty: 10, qtyReturned: 10 }],
        },
    });

    await assert.rejects(
        () =>
            service.submitForceCloseSettlement('gp-settle-1', 'tenant-1', 'fin-user', settlementPayload),
        /Use simple close instead/,
    );
});

test('approveForceCloseSettlement: GOOD line releases blocked and posts ledger', async () => {
    const { service, governedEvents, postingCalls } = loadSettlementServiceWithMocks({
        getPass: {
            ...settlementEligiblePass,
            status: 'PENDING_FORCE_CLOSE_SETTLEMENT',
            settlementPriorStatus: 'PARTIALLY_RETURNED',
            settlementPayload,
            closeReason: settlementPayload.closeReason,
        },
        stockBlocked: 10,
    });

    const result = await service.approveForceCloseSettlement('gp-settle-1', 'tenant-1', 'gm-user');

    assert.equal(result.status, 'CLOSED');
    assert.equal(postingCalls.some((c) => c.fn === 'releaseBlockedOnReturn'), true);
    assert.equal(postingCalls.some((c) => c.fn === 'postReturnGoodLedger'), true);
    assert.equal(governedEvents[0].eventType, 'GET_PASS_FORCE_CLOSE_APPROVED');
});

test('approveForceCloseSettlement: rejects insufficient blocked qty', async () => {
    const { service } = loadSettlementServiceWithMocks({
        getPass: {
            ...settlementEligiblePass,
            status: 'PENDING_FORCE_CLOSE_SETTLEMENT',
            settlementPriorStatus: 'PARTIALLY_RETURNED',
            settlementPayload,
        },
        stockBlocked: 2,
    });

    await assert.rejects(
        () => service.approveForceCloseSettlement('gp-settle-1', 'tenant-1', 'gm-user'),
        /Insufficient blocked quantity/,
    );
});

test('rejectForceCloseSettlement: restores prior status', async () => {
    const { service, updates, governedEvents } = loadSettlementServiceWithMocks({
        getPass: {
            ...settlementEligiblePass,
            status: 'PENDING_FORCE_CLOSE_SETTLEMENT',
            settlementPriorStatus: 'PARTIALLY_RETURNED',
            settlementPayload,
        },
    });

    const result = await service.rejectForceCloseSettlement(
        'gp-settle-1',
        'tenant-1',
        'gm-user',
        'Need more evidence',
    );

    assert.equal(result.status, 'PARTIALLY_RETURNED');
    assert.equal(updates[0].data.settlementRejectionReason, 'Need more evidence');
    assert.equal(governedEvents[0].eventType, 'GET_PASS_FORCE_CLOSE_REJECTED');
});

test('cancelForceCloseSettlement: restores prior status', async () => {
    const { service, updates, governedEvents } = loadSettlementServiceWithMocks({
        getPass: {
            ...settlementEligiblePass,
            status: 'PENDING_FORCE_CLOSE_SETTLEMENT',
            settlementPriorStatus: 'OUT',
            settlementPayload,
        },
    });

    const result = await service.cancelForceCloseSettlement('gp-settle-1', 'tenant-1', 'fin-user');

    assert.equal(result.status, 'OUT');
    assert.equal(governedEvents[0].eventType, 'GET_PASS_FORCE_CLOSE_CANCELLED');
});

test('processReturns: blocked while settlement pending', async () => {
    const { service } = loadSettlementServiceWithMocks({
        getPass: {
            ...settlementEligiblePass,
            status: 'PENDING_FORCE_CLOSE_SETTLEMENT',
        },
    });

    await assert.rejects(
        () => service.processReturns('gp-settle-1', 'tenant-1', 'user-1', [], null),
        /pending force-close settlement/,
    );
});
