const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const servicePath = path.resolve(__dirname, './posting.service.js');

function makeObLines(count, { includeZeroQty = false } = {}) {
    const lines = [];
    for (let i = 0; i < count; i += 1) {
        lines.push({
            itemId: `item-${i}`,
            locationId: 'loc-1',
            qtyInBaseUnit: 10,
            unitCost: 2.5,
            totalValue: 25,
            item: { name: `Item ${i}`, barcode: null, unitPrice: 2.5 },
            location: { name: 'Main Store' },
        });
    }
    if (includeZeroQty) {
        lines.push({
            itemId: 'item-zero',
            locationId: 'loc-1',
            qtyInBaseUnit: 0,
            unitCost: 0,
            totalValue: 0,
            item: { name: 'Zero', barcode: null, unitPrice: 0 },
            location: { name: 'Main Store' },
        });
    }
    return lines;
}

function makeAdjustmentDocument() {
    return {
        id: 'doc-adj',
        tenantId: 'tenant-1',
        status: 'DRAFT',
        movementType: 'ADJUSTMENT',
        documentNo: 'ADJ-DRAFT-001',
        documentDate: new Date(),
        sourceLocationId: 'loc-1',
        concurrencyVersion: 0,
        lines: [
            {
                itemId: 'item-1',
                locationId: 'loc-1',
                qtyInBaseUnit: 5,
                unitCost: 10,
                totalValue: 50,
                item: { name: 'Adj Item', barcode: null, unitPrice: 10 },
                location: { name: 'Main Store' },
            },
        ],
    };
}

function loadPostingServiceWithMocks({ document, txCounters = {}, failAt = null, stockQty = null }) {
    const counters = {
        stockBalanceFindUnique: 0,
        stockBalanceFindMany: 0,
        inventoryLedgerCreate: 0,
        stockBalanceUpsert: 0,
        stockBalanceUpdate: 0,
        ...txCounters,
    };

    const tx = {
        movementDocument: {
            findFirst: async () => document,
            update: async () => {
                if (failAt === 'before_status') {
                    throw new Error('simulated failure before status update');
                }
                return {
                    id: document.id,
                    status: 'POSTED',
                    documentNo: document.documentNo || 'OB-TEST-001',
                    postedAt: new Date(),
                };
            },
        },
        stockBalance: {
            findUnique: async () => {
                counters.stockBalanceFindUnique += 1;
                if (stockQty == null) {
                    return null;
                }
                return { qtyOnHand: stockQty, wacUnitCost: 5 };
            },
            findMany: async () => {
                counters.stockBalanceFindMany += 1;
                return [];
            },
            upsert: async () => {
                counters.stockBalanceUpsert += 1;
                if (failAt === 'before_stock') {
                    throw new Error('simulated failure before stock update');
                }
                return {};
            },
            update: async () => {
                counters.stockBalanceUpdate += 1;
                if (failAt === 'before_stock') {
                    throw new Error('simulated failure before stock update');
                }
                return {};
            },
        },
        inventoryLedger: {
            create: async () => {
                counters.inventoryLedgerCreate += 1;
                if (failAt === 'before_ledger') {
                    throw new Error('simulated failure before ledger write');
                }
                return {};
            },
        },
        tenantSetting: {
            upsert: async () => ({}),
        },
        $executeRaw: async () => 1,
        $queryRaw: async (strings, decrementQty) => {
            const sql = Array.isArray(strings) ? strings.join(' ') : String(strings || '');
            if (sql.includes('FROM "tenant_settings"')) {
                return [{ value: 'OPEN' }];
            }
            if (sql.includes('SELECT "qtyOnHand", "qtyBlocked", "wacUnitCost"')) {
                return [{
                    qtyOnHand: Number(stockQty ?? 0),
                    qtyBlocked: 0,
                    wacUnitCost: Number(stockQty == null ? 0 : 5),
                }];
            }
            counters.stockBalanceUpdate += 1;
            if (failAt === 'before_stock') {
                throw new Error('simulated failure before stock update');
            }
            if (stockQty == null || Number(stockQty) < Number(decrementQty)) {
                return [];
            }
            return [{
                qtyOnHand: Number(stockQty) - Number(decrementQty),
                qtyBlocked: 0,
                wacUnitCost: 5,
            }];
        },
    };

    const prismaMock = {
        movementDocument: {
            findFirst: async () => document,
        },
        $transaction: async (fn) => fn(tx),
    };

    const auditCalls = [];
    const originalLoad = Module._load;
    Module._load = function patchedLoader(request, parent, isMain) {
        if (request === '@prisma/client') {
            return { PrismaClient: function PrismaClient() { return prismaMock; } };
        }
        if (request === './periodGuard.service') {
            return {
                checkPeriodLock: async () => {},
                checkOBAllowed: async () => {},
                validatePostingDate: async () => {},
            };
        }
        if (request === './tenantTimezone.service') {
            return { getTenantTimezone: async () => 'Asia/Riyadh' };
        }
        if (request === './auditTrail.service') {
            return {
                logAction: async (payload) => {
                    auditCalls.push(payload);
                },
                EntityType: { MOVEMENT: 'MOVEMENT' },
            };
        }
        if (request === './docNumbering.service') {
            return {
                generateDocNumber: async () => 'OB-TEST-001',
                prefixFromMovementType: () => 'OB',
            };
        }
        if (request === './valuationGovernance.service') {
            return { resolveUnitCost: async () => 0, VALUATION_BASIS: {} };
        }
        if (request === './countPostingPolicy') {
            return {
                computePolicyBPostingAdjustment: () => ({}),
                formatPolicyBAuditNote: () => '',
            };
        }
        if (request === './movementRegisterGuard.service') {
            return { assertMovementRegisterMutable: () => {} };
        }
        if (request === '../utils/logger') {
            return { error: () => {}, debug: () => {} };
        }
        return originalLoad(request, parent, isMain);
    };

    delete require.cache[servicePath];
    const service = require(servicePath);
    Module._load = originalLoad;
    return { service, counters, auditCalls, tx };
}

test('prefetchStockBalancesForLines batches one findMany for many lines', async () => {
    const { prefetchStockBalancesForLines } = require('./posting.service');
    let findManyCalls = 0;
    const tx = {
        stockBalance: {
            findMany: async ({ where }) => {
                findManyCalls += 1;
                assert.equal(where.tenantId, 'tenant-1');
                assert.equal(where.OR.length, 3);
                return [];
            },
        },
    };
    const lines = [
        { itemId: 'a', locationId: 'loc-1' },
        { itemId: 'b', locationId: 'loc-1' },
        { itemId: 'c', locationId: 'loc-1' },
    ];
    const map = await prefetchStockBalancesForLines(
        tx,
        'tenant-1',
        lines,
        (line) => line.locationId,
    );
    assert.equal(findManyCalls, 1);
    assert.equal(map.size, 0);
});

test('postDocument OPENING_BALANCE rejects the whole document when a line has zero quantity', async () => {
    const lines = makeObLines(200, { includeZeroQty: true });
    const document = {
        id: 'doc-ob',
        tenantId: 'tenant-1',
        status: 'DRAFT',
        movementType: 'OPENING_BALANCE',
        documentNo: 'OB-DRAFT-001',
        documentDate: new Date(),
        sourceLocationId: null,
        lines,
    };

    const { service, counters, auditCalls } = loadPostingServiceWithMocks({ document });

    await assert.rejects(
        () => service.postDocument('doc-ob', 'tenant-1', 'user-1'),
        { code: 'INVALID_POSTING_LINE_QUANTITY' },
    );

    assert.equal(counters.stockBalanceFindUnique, 0, 'OB should not call findUnique per line');
    assert.equal(counters.stockBalanceFindMany, 0, 'invalid OB must fail before stock prefetch');
    assert.equal(counters.inventoryLedgerCreate, 0, 'invalid OB must not create ledger effects');
    assert.equal(counters.stockBalanceUpdate, 0, 'invalid OB must not update stock');
    assert.equal(auditCalls.length, 0);
});

test('postDocument OPENING_BALANCE prefetches valid stock lines once', async () => {
    const document = {
        id: 'doc-ob',
        tenantId: 'tenant-1',
        status: 'DRAFT',
        movementType: 'OPENING_BALANCE',
        documentNo: 'OB-DRAFT-001',
        documentDate: new Date(),
        sourceLocationId: null,
        lines: makeObLines(200),
    };
    const { service, counters } = loadPostingServiceWithMocks({ document });

    await service.postDocument('doc-ob', 'tenant-1', 'user-1');

    assert.equal(counters.stockBalanceFindUnique, 0);
    assert.equal(counters.stockBalanceFindMany, 1);
    assert.equal(counters.inventoryLedgerCreate, 200);
    assert.equal(counters.stockBalanceUpdate, 200);
});

test('postDocument OPENING_BALANCE writes audit inside parent transaction when tx passed', async () => {
    const lines = makeObLines(2);
    const document = {
        id: 'doc-ob',
        tenantId: 'tenant-1',
        status: 'DRAFT',
        movementType: 'OPENING_BALANCE',
        documentNo: 'OB-DRAFT-001',
        documentDate: new Date(),
        sourceLocationId: null,
        lines,
    };

    const { service, auditCalls, tx } = loadPostingServiceWithMocks({ document });

    await service.postDocument('doc-ob', 'tenant-1', 'user-1', tx);

    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].tx, tx, 'nested finalize post must audit inside parent tx');
    assert.equal(auditCalls[0].action, 'POST');
});

test('postDocument ADJUSTMENT rolls back when ledger write fails', async () => {
    const document = makeAdjustmentDocument();
    const { service, counters, auditCalls } = loadPostingServiceWithMocks({
        document,
        failAt: 'before_ledger',
    });

    await assert.rejects(
        () => service.postDocument('doc-adj', 'tenant-1', 'user-1'),
        /simulated failure before ledger write/,
    );

    assert.equal(counters.inventoryLedgerCreate, 1);
    assert.equal(counters.stockBalanceUpsert, 0);
    assert.equal(auditCalls.length, 0, 'no POST audit on rollback');
});

test('postDocument ADJUSTMENT rolls back when stock update fails after ledger', async () => {
    const document = makeAdjustmentDocument();
    const { service, counters, auditCalls } = loadPostingServiceWithMocks({
        document,
        failAt: 'before_stock',
    });

    await assert.rejects(
        () => service.postDocument('doc-adj', 'tenant-1', 'user-1'),
        /simulated failure before stock update/,
    );

    assert.equal(counters.inventoryLedgerCreate, 1);
    assert.equal(counters.stockBalanceUpsert, 1);
    assert.equal(auditCalls.length, 0, 'no POST audit on rollback');
});

test('postDocument ADJUSTMENT rolls back when status update fails after ledger and stock', async () => {
    const document = makeAdjustmentDocument();
    const { service, counters, auditCalls } = loadPostingServiceWithMocks({
        document,
        failAt: 'before_status',
    });

    await assert.rejects(
        () => service.postDocument('doc-adj', 'tenant-1', 'user-1'),
        /simulated failure before status update/,
    );

    assert.equal(counters.inventoryLedgerCreate, 1);
    assert.equal(counters.stockBalanceUpsert, 1);
    assert.equal(auditCalls.length, 0, 'no POST audit on rollback');
});

test('postDocument ADJUSTMENT increase writes detailed audit inside transaction', async () => {
    const document = makeAdjustmentDocument();
    const { service, counters, auditCalls } = loadPostingServiceWithMocks({ document });

    await service.postDocument('doc-adj', 'tenant-1', 'user-1');

    assert.equal(counters.inventoryLedgerCreate, 1);
    assert.equal(counters.stockBalanceUpsert, 1);
    assert.equal(auditCalls.length, 1);
    assert.ok(auditCalls[0].tx, 'adjustment POST audit must be inside transaction');
    assert.equal(auditCalls[0].beforeValue.status, 'DRAFT');
    assert.equal(auditCalls[0].afterValue.status, 'POSTED');
    assert.equal(auditCalls[0].afterValue.lines[0].direction, 'INCREASE');
});

test('postDocument ADJUSTMENT decrease rejects insufficient stock', async () => {
    const document = {
        ...makeAdjustmentDocument(),
        lines: [
            {
                ...makeAdjustmentDocument().lines[0],
                qtyInBaseUnit: -8,
            },
        ],
    };
    const { service } = loadPostingServiceWithMocks({ document, stockQty: 5 });

    await assert.rejects(
        () => service.postDocument('doc-adj', 'tenant-1', 'user-1'),
        /Insufficient stock/,
    );
});

test('postDocument ADJUSTMENT decrease posts qtyOut and lowers stock once', async () => {
    const document = {
        ...makeAdjustmentDocument(),
        lines: [
            {
                ...makeAdjustmentDocument().lines[0],
                qtyInBaseUnit: -3,
            },
        ],
    };
    const { service, counters, auditCalls } = loadPostingServiceWithMocks({
        document,
        stockQty: 10,
    });

    await service.postDocument('doc-adj', 'tenant-1', 'user-1');

    assert.equal(counters.inventoryLedgerCreate, 1);
    assert.equal(counters.stockBalanceUpdate, 1);
    assert.equal(counters.stockBalanceUpsert, 0);
    assert.equal(auditCalls[0].afterValue.lines[0].direction, 'DECREASE');
    assert.equal(auditCalls[0].afterValue.lines[0].stockBefore, 10);
    assert.equal(auditCalls[0].afterValue.lines[0].stockAfter, 7);
});
