'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const servicePath = path.resolve(__dirname, './inventoryValuation.service.js');

const TENANT = 'tenant-1';
const LOC = 'loc-1';
const ITEM = 'item-1';

const scope = {
    resolvedLocIds: [LOC],
    resolvedItemIds: [ITEM],
    itemMap: {
        [ITEM]: {
            id: ITEM,
            name: 'Test Item',
            barcode: 'T001',
            categoryId: 'cat-1',
            category: { name: 'Cat' },
        },
    },
    locMap: {
        [LOC]: {
            id: LOC,
            name: 'Main Store',
            department: { name: 'Kitchen' },
        },
    },
};

function loadServiceWithMocks({
    obStatus = 'FINALIZED',
    periodCloses = [],
    snapshots = [],
    stockBalances = [],
    prismaOverrides = {},
} = {}) {
    const periodCloseFindFirst = async ({ where }) => {
        if (where.id) {
            return periodCloses.find((p) => p.id === where.id && p.status === 'CLOSED') || null;
        }
        if (where.year != null && where.month != null) {
            return periodCloses.find(
                (p) =>
                    p.tenantId === where.tenantId
                    && p.year === where.year
                    && p.month === where.month
                    && p.status === 'CLOSED',
            ) || null;
        }
        if (where.status === 'CLOSED' && where.closedAt?.lte) {
            const asOf = where.closedAt.lte;
            const eligible = periodCloses
                .filter((p) => p.status === 'CLOSED' && p.closedAt <= asOf)
                .sort((a, b) => b.closedAt - a.closedAt);
            return eligible[0] || null;
        }
        return null;
    };

    const versionIdForClose = (periodCloseId) => `ver-${periodCloseId}`;

    const prismaMock = {
        periodClose: { findFirst: periodCloseFindFirst },
        periodSnapshotVersion: {
            findFirst: async ({ where }) => {
                if (!where?.periodCloseId) return null;
                if (where.status && where.status !== 'CURRENT') return null;
                const hasClose = periodCloses.some((p) => p.id === where.periodCloseId);
                if (!hasClose) return null;
                return { id: versionIdForClose(where.periodCloseId) };
            },
        },
        periodSnapshotLine: {
            findMany: async ({ where }) => {
                const versionId = where?.snapshotVersionId;
                if (!versionId || typeof versionId !== 'string' || !versionId.startsWith('ver-')) {
                    return [];
                }
                const periodCloseId = versionId.slice('ver-'.length);
                return snapshots.filter(
                    (s) =>
                        s.periodCloseId === periodCloseId
                        && where.locationId.in.includes(s.locationId)
                        && where.itemId.in.includes(s.itemId),
                );
            },
        },
        stockBalance: {
            findMany: async ({ where }) =>
                stockBalances.filter(
                    (b) =>
                        b.tenantId === where.tenantId
                        && where.locationId.in.includes(b.locationId)
                        && where.itemId.in.includes(b.itemId),
                ),
            count: async ({ where }) =>
                stockBalances.filter(
                    (b) =>
                        b.tenantId === where.tenantId
                        && where.locationId.in.includes(b.locationId)
                        && where.itemId.in.includes(b.itemId)
                        && Number(b.qtyOnHand) > 0,
                ).length,
        },
        ...prismaOverrides,
    };

    const originalLoad = Module._load;
    Module._load = function patchedLoader(request, parent, isMain) {
        if (request === '@prisma/client') {
            return { PrismaClient: function PrismaClient() { return prismaMock; } };
        }
        if (request === './setting.service') {
            return { getObStatus: async () => obStatus };
        }
        if (request === './tenantTimezone.service') {
            return { getTenantTimezone: async () => 'Asia/Riyadh' };
        }
        if (request === './ledgerReplay.service') {
            return {
                resolveReplayScope: async () => scope,
                balanceMapKey: (itemId, locationId) => `${itemId}_${locationId}`,
                parseBalanceMapKey: (key) => {
                    const idx = key.indexOf('_');
                    return idx <= 0 ? null : { itemId: key.slice(0, idx), locationId: key.slice(idx + 1) };
                },
            };
        }
        return originalLoad(request, parent, isMain);
    };

    delete require.cache[servicePath];
    const service = require(servicePath);
    Module._load = originalLoad;
    return service;
}

test('isSameCalendarDay matches same local calendar date', () => {
    const { isSameCalendarDay } = loadServiceWithMocks();
    const d = new Date(2026, 5, 12, 10, 0, 0);
    assert.equal(isSameCalendarDay(d, new Date(2026, 5, 12, 23, 0, 0)), true);
    assert.equal(isSameCalendarDay(d, new Date(2026, 5, 13, 0, 0, 0)), false);
});

test('isSameCalendarMonth detects same month', () => {
    const { isSameCalendarMonth } = loadServiceWithMocks();
    assert.equal(isSameCalendarMonth(new Date(2026, 5, 30), new Date(2026, 5, 1)), true);
    assert.equal(isSameCalendarMonth(new Date(2026, 5, 30), new Date(2026, 4, 31)), false);
});

test('today as-of uses TODAY basis and live stock', async () => {
    const today = new Date();
    const service = loadServiceWithMocks({
        stockBalances: [{ tenantId: TENANT, itemId: ITEM, locationId: LOC, qtyOnHand: 10, wacUnitCost: 5 }],
    });
    const result = await service.generateStockBackedValuationReport(TENANT, today, {});
    assert.equal(result.truthSource, 'STOCK_BALANCE');
    assert.equal(result.valuationBasis, 'TODAY');
    assert.equal(result.rows.length, 1);
    assert.equal(result.totalValue, 50);
});

test('open current month (June 30 while in June, no June close) → OPEN_PERIOD_LIVE', async () => {
    const referenceNow = new Date(2026, 5, 12);
    const service = loadServiceWithMocks({
        periodCloses: [
            {
                id: 'close-may',
                tenantId: TENANT,
                year: 2026,
                month: 5,
                status: 'CLOSED',
                closedAt: new Date(2026, 4, 31),
            },
        ],
        stockBalances: [{ tenantId: TENANT, itemId: ITEM, locationId: LOC, qtyOnHand: 39788, wacUnitCost: 21.18 }],
    });
    const asOf = new Date(2026, 5, 30, 23, 59, 59, 999);
    const resolved = await service.resolveValuationBalanceSource(
        TENANT,
        asOf,
        {},
        [LOC],
        [ITEM],
        undefined,
        referenceNow,
    );
    assert.equal(resolved.truthSource, 'STOCK_BALANCE');
    assert.equal(resolved.valuationBasis, 'OPEN_PERIOD_LIVE');
    assert.equal(resolved.warning, null);
    assert.equal(resolved.effectiveAsOfDate, '2026-06-12');

    const rows = service.buildValuationRows(resolved.balanceMap, {
        itemMap: scope.itemMap,
        locMap: scope.locMap,
    });
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.grandTotal, Number((39788 * 21.18).toFixed(2)));
});

test('closed month uses year+month lookup, not closedAt calendar day', async () => {
    const service = loadServiceWithMocks({
        periodCloses: [
            {
                id: 'close-may',
                tenantId: TENANT,
                year: 2026,
                month: 5,
                status: 'CLOSED',
                closedAt: new Date(2026, 4, 30, 15, 0, 0),
            },
        ],
        snapshots: [
            {
                periodCloseId: 'close-may',
                itemId: ITEM,
                locationId: LOC,
                closingQty: 100,
                closingValue: 500,
                wacUnitCost: 5,
            },
        ],
    });
    const result = await service.generateStockBackedValuationReport(TENANT, '2026-05-31', {});
    assert.equal(result.truthSource, 'PERIOD_SNAPSHOT');
    assert.equal(result.valuationBasis, 'CLOSED_PERIOD');
    assert.equal(result.totalValue, 500);
    assert.equal(result.snapshotUsed?.month, 5);
});

test('explicit snapshotId wins over other rules', async () => {
    const service = loadServiceWithMocks({
        periodCloses: [
            {
                id: 'snap-a',
                tenantId: TENANT,
                year: 2026,
                month: 4,
                status: 'CLOSED',
                closedAt: new Date(2026, 3, 30),
            },
            {
                id: 'snap-b',
                tenantId: TENANT,
                year: 2026,
                month: 5,
                status: 'CLOSED',
                closedAt: new Date(2026, 4, 30),
            },
        ],
        snapshots: [
            {
                periodCloseId: 'snap-a',
                itemId: ITEM,
                locationId: LOC,
                closingQty: 7,
                closingValue: 35,
                wacUnitCost: 5,
            },
        ],
        stockBalances: [{ tenantId: TENANT, itemId: ITEM, locationId: LOC, qtyOnHand: 999, wacUnitCost: 5 }],
    });
    const result = await service.generateStockBackedValuationReport(TENANT, '2026-06-30', { snapshotId: 'snap-a' });
    assert.equal(result.valuationBasis, 'EXPLICIT_SNAPSHOT');
    assert.equal(result.totalValue, 35);
});

test('historical non-closed uses nearest snapshot + warning', async () => {
    const referenceNow = new Date(2026, 5, 12);
    const service = loadServiceWithMocks({
        periodCloses: [
            {
                id: 'close-mar',
                tenantId: TENANT,
                year: 2026,
                month: 3,
                status: 'CLOSED',
                closedAt: new Date(2026, 2, 31),
            },
        ],
        snapshots: [
            {
                periodCloseId: 'close-mar',
                itemId: ITEM,
                locationId: LOC,
                closingQty: 20,
                closingValue: 100,
                wacUnitCost: 5,
            },
        ],
    });
    const resolved = await service.resolveValuationBalanceSource(
        TENANT,
        new Date(2026, 3, 15, 23, 59, 59, 999),
        {},
        [LOC],
        [ITEM],
        undefined,
        referenceNow,
    );
    assert.equal(resolved.valuationBasis, 'NEAREST_SNAPSHOT');
    assert.equal(resolved.truthSource, 'PERIOD_SNAPSHOT');
    assert.match(resolved.warning || '', /not a closed period end/i);
});

test('no period closes but stock exists → LIVE_FALLBACK, not empty', async () => {
    const referenceNow = new Date(2026, 5, 12);
    const service = loadServiceWithMocks({
        periodCloses: [],
        stockBalances: [{ tenantId: TENANT, itemId: ITEM, locationId: LOC, qtyOnHand: 5, wacUnitCost: 10 }],
    });
    const resolved = await service.resolveValuationBalanceSource(
        TENANT,
        new Date(2026, 3, 15, 23, 59, 59, 999),
        {},
        [LOC],
        [ITEM],
        undefined,
        referenceNow,
    );
    assert.equal(resolved.valuationBasis, 'LIVE_FALLBACK');
    assert.ok(service.balanceMapHasPositiveQty(resolved.balanceMap));
});

test('scoped filters exclude all rows → true empty', async () => {
    const service = loadServiceWithMocks({
        stockBalances: [{ tenantId: TENANT, itemId: ITEM, locationId: LOC, qtyOnHand: 10, wacUnitCost: 5 }],
    });
    const result = await service.generateStockBackedValuationReport(TENANT, new Date(), { categoryId: 'missing-cat' });
    assert.equal(result.rows.length, 0);
    assert.equal(result.totalValue, 0);
});

test('OB_NOT_FINALIZED returns emptyReason', async () => {
    const service = loadServiceWithMocks({
        obStatus: 'OPEN',
        stockBalances: [{ tenantId: TENANT, itemId: ITEM, locationId: LOC, qtyOnHand: 10, wacUnitCost: 5 }],
    });
    const result = await service.generateStockBackedValuationReport(TENANT, new Date(), {});
    assert.equal(result.rows.length, 0);
    assert.equal(result.emptyReason, 'OB_NOT_FINALIZED');
});

test('empty snapshot with stock present → LIVE_FALLBACK', async () => {
    const service = loadServiceWithMocks({
        periodCloses: [
            {
                id: 'close-may',
                tenantId: TENANT,
                year: 2026,
                month: 5,
                status: 'CLOSED',
                closedAt: new Date(2026, 4, 30),
            },
        ],
        snapshots: [],
        stockBalances: [{ tenantId: TENANT, itemId: ITEM, locationId: LOC, qtyOnHand: 3, wacUnitCost: 4 }],
    });
    const result = await service.generateStockBackedValuationReport(TENANT, '2026-05-31', {});
    assert.equal(result.valuationBasis, 'LIVE_FALLBACK');
    assert.equal(result.totalValue, 12);
});
