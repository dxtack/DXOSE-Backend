const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const servicePath = path.resolve(__dirname, './setting.service.js');

const postingEnginePath = path.resolve(__dirname, './postingEngine.service.js');
const postingServicePath = path.resolve(__dirname, './posting.service.js');

function loadSettingServiceWithMocks(prismaMock, postingEngineMock = {}) {
    const originalLoad = Module._load;
    Module._load = function patchedLoader(request, parent, isMain) {
        if (request === '../config/database') {
            return prismaMock;
        }
        if (request === './audit.service') {
            return { log: async () => {} };
        }
        if (request === './auditTrail.service') {
            return {
                logAction: async () => {},
                EntityType: { SETTINGS: 'SETTINGS' },
            };
        }
        if (request === './postingEngine.service' || request === postingEnginePath) {
            return {
                postMovementDocument: postingEngineMock.postMovementDocument || (async () => {}),
            };
        }
        return originalLoad(request, parent, isMain);
    };

    delete require.cache[servicePath];
    delete require.cache[postingServicePath];
    const service = require(servicePath);
    Module._load = originalLoad;
    return service;
}

const validDraftLine = {
    qtyInBaseUnit: 10,
    unitCost: 5,
    itemId: 'item-1',
    document: { documentNo: 'OB-001' },
    item: { name: 'Item 1', code: 'I1' },
    location: { name: 'Main' },
};

test('OB_FINALIZE_TRANSACTION_OPTIONS uses 120s timeout for large OB posting', () => {
    const { OB_FINALIZE_TRANSACTION_OPTIONS } = require('./setting.service');
    assert.equal(OB_FINALIZE_TRANSACTION_OPTIONS.timeout, 120_000);
    assert.equal(OB_FINALIZE_TRANSACTION_OPTIONS.maxWait, 10_000);
});

test('finalizeOpeningBalance passes extended transaction options to prisma.$transaction', async () => {
    let capturedOptions = null;
    const tenantId = 'tenant-1';
    const userId = 'user-1';

    const tx = {
        movementDocument: {
            findMany: async () => [{ id: 'doc-1' }],
        },
        tenantSetting: {
            findUnique: async () => null,
            upsert: async ({ create, update }) => ({ value: (update || create).value }),
        },
        stockBalance: {
            findMany: async () => [
                { itemId: 'item-1', qtyOnHand: 10, wacUnitCost: 5 },
            ],
        },
    };

    const prismaMock = {
        item: {
            count: async () => 1,
            findMany: async () => [],
        },
        movementLine: {
            findMany: async () => [validDraftLine],
        },
        user: {
            findUnique: async () => ({ firstName: 'Test', lastName: 'User', email: 't@example.com' }),
        },
        $transaction: async (fn, options) => {
            capturedOptions = options;
            return fn(tx);
        },
    };

    let postCalls = 0;
    const mockPostingEngine = {
        postMovementDocument: async () => {
            postCalls += 1;
        },
    };
    const service = loadSettingServiceWithMocks(prismaMock, mockPostingEngine);

    delete require.cache[postingEnginePath];
    require.cache[postingEnginePath] = {
        id: postingEnginePath,
        filename: postingEnginePath,
        loaded: true,
        exports: mockPostingEngine,
    };

    const result = await service.finalizeOpeningBalance(tenantId, userId);
    assert.equal(result.finalized, true);
    assert.equal(postCalls, 1);
    assert.equal(capturedOptions.timeout, 120_000);
    assert.equal(capturedOptions.maxWait, 10_000);
});

test('enableOpeningBalanceStage reopens OB without clearing finalized snapshot', async () => {
    const tenantId = 'tenant-1';
    const userId = 'user-1';
    const existingSnapshot = JSON.stringify({
        totalItemsCount: 3,
        totalOpeningValue: 150,
        finalizedAt: '2026-01-01T00:00:00.000Z',
        finalizedBy: 'Admin User',
    });

    const upsertCalls = [];
    const deleteManyCalls = [];

    const prismaMock = {
        tenantSetting: {
            findUnique: async () => ({ value: existingSnapshot }),
            upsert: async (args) => {
                upsertCalls.push(args);
                return args;
            },
            deleteMany: async (args) => {
                deleteManyCalls.push(args);
                return { count: 0 };
            },
        },
    };

    const service = loadSettingServiceWithMocks(prismaMock);
    await service.enableOpeningBalanceStage(tenantId, userId, 'Need more adjustments');

    assert.equal(deleteManyCalls.length, 0);
    assert.equal(upsertCalls.length, 2);
    assert.equal(upsertCalls[0].update.value, 'OPEN');
    assert.equal(upsertCalls[1].update.value, 'true');
});

test('finalizeOpeningBalance archives previous snapshot before saving a new one', async () => {
    const tenantId = 'tenant-1';
    const userId = 'user-1';
    const previousSnapshot = {
        totalItemsCount: 2,
        totalOpeningValue: 80,
        finalizedAt: '2026-01-01T00:00:00.000Z',
        finalizedBy: 'First Admin',
    };

    const upsertPayloads = [];

    const tx = {
        movementDocument: {
            findMany: async () => [{ id: 'doc-1' }],
        },
        tenantSetting: {
            findUnique: async ({ where }) => {
                if (where.tenantId_key.key === 'obFinalizeSnapshot') {
                    return { value: JSON.stringify(previousSnapshot) };
                }
                if (where.tenantId_key.key === 'obFinalizeSnapshotHistory') {
                    return null;
                }
                return null;
            },
            upsert: async (args) => {
                upsertPayloads.push(args);
                return { value: (args.update || args.create).value };
            },
        },
        stockBalance: {
            findMany: async () => [
                { itemId: 'item-1', qtyOnHand: 10, wacUnitCost: 5 },
            ],
        },
    };

    const prismaMock = {
        item: {
            count: async () => 1,
            findMany: async () => [],
        },
        movementLine: {
            findMany: async () => [validDraftLine],
        },
        user: {
            findUnique: async () => ({ firstName: 'Test', lastName: 'User', email: 't@example.com' }),
        },
        $transaction: async (fn) => fn(tx),
    };

    const service = loadSettingServiceWithMocks(prismaMock);
    const result = await service.finalizeOpeningBalance(tenantId, userId);

    assert.equal(result.finalized, true);
    const historyUpsert = upsertPayloads.find((entry) => entry.where.tenantId_key.key === 'obFinalizeSnapshotHistory');
    assert.ok(historyUpsert);
    const history = JSON.parse(historyUpsert.create.value);
    assert.equal(history.length, 1);
    assert.equal(history[0].totalItemsCount, 2);
    assert.equal(history[0].finalizedBy, 'First Admin');
});

test('ensureObFinalizedFromCurrentBalances writes LOCKED + snapshot (FINALIZED path)', async () => {
    const tenantId = 'tenant-1';
    const userId = 'user-1';
    const upsertPayloads = [];

    const tx = {
        tenantSetting: {
            findUnique: async () => null,
            upsert: async (args) => {
                upsertPayloads.push(args);
                return { value: (args.update || args.create).value };
            },
        },
        stockBalance: {
            findMany: async () => [
                { itemId: 'item-1', qtyOnHand: 4, wacUnitCost: 2.5 },
                { itemId: 'item-2', qtyOnHand: 1, wacUnitCost: 10 },
            ],
        },
    };

    const prismaMock = {
        user: {
            findUnique: async () => ({ firstName: 'Auto', lastName: 'Lock', email: 'a@example.com' }),
        },
        tenantSetting: tx.tenantSetting,
        stockBalance: tx.stockBalance,
    };

    const service = loadSettingServiceWithMocks(prismaMock);
    const result = await service.ensureObFinalizedFromCurrentBalances(tenantId, userId, {
        reason: 'Auto-locked: COUNT_ADJUSTMENT posted via Inventory Count (CNT-TEST)',
        tx,
        source: 'AUTO_COUNT_ADJUSTMENT_INVENTORY_COUNT',
    });

    assert.equal(result.alreadyFinalized, false);
    assert.equal(result.snapshotSummary.totalItemsCount, 2);
    assert.equal(result.snapshotSummary.totalOpeningValue, 20);
    assert.ok(result.snapshotSummary.finalizedAt);
    assert.equal(result.snapshotSummary.source, 'AUTO_COUNT_ADJUSTMENT_INVENTORY_COUNT');

    const keys = upsertPayloads.map((p) => p.where.tenantId_key.key);
    assert.ok(keys.includes('allowOpeningBalance'));
    assert.ok(keys.includes('isOpeningBalanceAllowed'));
    assert.ok(keys.includes('obFinalizeSnapshot'));

    const allow = upsertPayloads.find((p) => p.where.tenantId_key.key === 'allowOpeningBalance');
    assert.equal(allow.update.value, 'LOCKED');
    const snap = upsertPayloads.find((p) => p.where.tenantId_key.key === 'obFinalizeSnapshot');
    const parsed = JSON.parse(snap.create.value);
    assert.equal(parsed.totalItemsCount, 2);
});

test('ensureObFinalizedFromCurrentBalances is idempotent when snapshot already exists', async () => {
    const existing = {
        totalItemsCount: 1,
        totalOpeningValue: 50,
        finalizedAt: '2026-07-01T00:00:00.000Z',
        finalizedBy: 'Prior',
    };
    let upsertCount = 0;
    const tx = {
        tenantSetting: {
            findUnique: async () => ({ value: JSON.stringify(existing) }),
            upsert: async (args) => {
                upsertCount += 1;
                return { value: (args.update || args.create).value };
            },
        },
        stockBalance: {
            findMany: async () => {
                throw new Error('should not rebuild balances when already finalized');
            },
        },
    };
    const prismaMock = {
        user: { findUnique: async () => null },
        tenantSetting: tx.tenantSetting,
        stockBalance: tx.stockBalance,
    };
    const service = loadSettingServiceWithMocks(prismaMock);
    const result = await service.ensureObFinalizedFromCurrentBalances('t1', 'u1', {
        reason: 'Auto-locked again',
        tx,
    });
    assert.equal(result.alreadyFinalized, true);
    assert.equal(result.snapshotSummary.finalizedAt, existing.finalizedAt);
    assert.equal(upsertCount, 1, 'only re-asserts allowOpeningBalance LOCKED');
});
