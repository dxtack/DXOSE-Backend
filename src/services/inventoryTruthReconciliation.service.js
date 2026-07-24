'use strict';

const { PrismaClient } = require('@prisma/client');
const {
    balanceMapKey,
    parseBalanceMapKey,
    replayOfficialLedgerBalances,
} = require('./ledgerReplay.service');

const prisma = new PrismaClient();

const DRIFT_TOLERANCE = 0.0001;
const VALUE_TOLERANCE = 0.02;

const PROBABLE_CAUSE = Object.freeze({
    REVERSIBLE_GET_PASS: 'REVERSIBLE_GET_PASS',
    LEGACY_NON_VALUATION_LEDGER: 'LEGACY_NON_VALUATION_LEDGER',
    MISSING_OFFICIAL_LEDGER: 'MISSING_OFFICIAL_LEDGER',
    INACTIVE_ITEM: 'INACTIVE_ITEM',
    REPLAY_ONLY_BALANCE: 'REPLAY_ONLY_BALANCE',
    STOCK_LEDGER_DRIFT: 'STOCK_LEDGER_DRIFT',
});

const r4 = (n) => Number(Number(n || 0).toFixed(4));
const money = (n) => Number(Number(n || 0).toFixed(2));

function inferProbableCause(ctx) {
    const {
        qtyDrift,
        qtyBlocked,
        hasOfficialLedger,
        hasNonValuationNet,
        itemInactive,
        stockQty,
        replayQty,
    } = ctx;

    if (Math.abs(qtyDrift) <= DRIFT_TOLERANCE) return null;

    if (qtyBlocked > DRIFT_TOLERANCE && qtyDrift > DRIFT_TOLERANCE) {
        return PROBABLE_CAUSE.REVERSIBLE_GET_PASS;
    }
    if (hasNonValuationNet && stockQty > replayQty + DRIFT_TOLERANCE) {
        return PROBABLE_CAUSE.LEGACY_NON_VALUATION_LEDGER;
    }
    if (stockQty > DRIFT_TOLERANCE && !hasOfficialLedger) {
        return PROBABLE_CAUSE.MISSING_OFFICIAL_LEDGER;
    }
    if (itemInactive && stockQty > DRIFT_TOLERANCE && Math.abs(replayQty) <= DRIFT_TOLERANCE) {
        return PROBABLE_CAUSE.INACTIVE_ITEM;
    }
    if (stockQty <= DRIFT_TOLERANCE && replayQty > DRIFT_TOLERANCE) {
        return PROBABLE_CAUSE.REPLAY_ONLY_BALANCE;
    }
    return PROBABLE_CAUSE.STOCK_LEDGER_DRIFT;
}

/**
 * Audit reconciliation: stock_balances vs official ledger replay (not a carrying truth).
 */
async function runInventoryTruthReconciliation(tenantId, options = {}) {
    const {
        asOfDate = new Date(),
        locationIds = [],
        departmentIds = [],
        categoryId,
        includeInactive = true,
        limit = 500,
    } = options;

    const filters = { locationIds, departmentIds, categoryId, includeInactive };
    const replay = await replayOfficialLedgerBalances(tenantId, asOfDate, filters);
    const { balanceMap, bestClose, asOf, itemMap, locMap, resolvedLocIds } = replay;

    if (!resolvedLocIds.length) {
        return {
            purpose: 'AUDIT_RECONCILIATION',
            healthy: true,
            asOfDate: asOf.toISOString(),
            snapshotUsed: bestClose
                ? { id: bestClose.id, year: bestClose.year, month: bestClose.month, closedAt: bestClose.closedAt }
                : null,
            rows: [],
            totals: {
                stockQty: 0,
                stockValue: 0,
                replayQty: 0,
                replayValue: 0,
                qtyDrift: 0,
                valueDrift: 0,
                driftRowCount: 0,
            },
            meta: { message: 'No locations in scope.' },
        };
    }

    const stockWhere = {
        tenantId,
        locationId: { in: resolvedLocIds },
        ...(categoryId ? { item: { categoryId } } : {}),
    };

    const stockBalances = await prisma.stockBalance.findMany({
        where: stockWhere,
        include: {
            item: { select: { id: true, name: true, barcode: true, isActive: true, category: { select: { name: true } } } },
            location: { select: { id: true, name: true, department: { select: { name: true } } } },
        },
    });

    const itemIds = [...new Set(stockBalances.map((b) => b.itemId))];
    const nonValuationAgg =
        itemIds.length > 0
            ? await prisma.inventoryLedger.groupBy({
                  by: ['itemId', 'locationId'],
                  where: {
                      tenantId,
                      affectsValuation: false,
                      itemId: { in: itemIds },
                      locationId: { in: resolvedLocIds },
                      createdAt: { lte: asOf },
                  },
                  _sum: { qtyIn: true, qtyOut: true },
              })
            : [];
    const nonValuationNetMap = new Map(
        nonValuationAgg.map((row) => {
            const net = Number(row._sum.qtyIn || 0) - Number(row._sum.qtyOut || 0);
            return [balanceMapKey(row.itemId, row.locationId), net];
        }),
    );

    const officialLedgerPresence = new Set();
    if (itemIds.length > 0) {
        const officialRows = await prisma.inventoryLedger.findMany({
            where: {
                tenantId,
                affectsValuation: true,
                itemId: { in: itemIds },
                locationId: { in: resolvedLocIds },
                createdAt: { lte: asOf },
            },
            select: { itemId: true, locationId: true },
            distinct: ['itemId', 'locationId'],
        });
        for (const row of officialRows) {
            officialLedgerPresence.add(balanceMapKey(row.itemId, row.locationId));
        }
    }

    const seenKeys = new Set();
    const driftRows = [];

    const pushRow = (itemId, locationId, stockRow, replayBal) => {
        const key = balanceMapKey(itemId, locationId);
        seenKeys.add(key);

        const stockQty = stockRow ? r4(stockRow.qtyOnHand) : 0;
        const stockWac = stockRow ? Number(stockRow.wacUnitCost || 0) : 0;
        const stockValue = money(stockQty * stockWac);

        const replayQty = replayBal ? r4(replayBal.qty) : 0;
        const replayWac = replayBal ? Number(replayBal.wac || 0) : 0;
        const replayValue = money(replayQty * replayWac);

        const qtyDrift = r4(stockQty - replayQty);
        const valueDrift = money(stockValue - replayValue);

        if (Math.abs(qtyDrift) <= DRIFT_TOLERANCE && Math.abs(valueDrift) <= VALUE_TOLERANCE) {
            return;
        }

        const item = stockRow?.item || itemMap[itemId];
        const loc = stockRow?.location || locMap[locationId];
        const qtyBlocked = stockRow ? r4(stockRow.qtyBlocked) : 0;

        const probableCause = inferProbableCause({
            qtyDrift,
            qtyBlocked,
            hasOfficialLedger: officialLedgerPresence.has(key),
            hasNonValuationNet: Math.abs(nonValuationNetMap.get(key) || 0) > DRIFT_TOLERANCE,
            itemInactive: item && item.isActive === false,
            stockQty,
            replayQty,
        });

        driftRows.push({
            itemId,
            locationId,
            itemCode: item?.barcode || '',
            itemName: item?.name || '',
            department: loc?.department?.name || '',
            location: loc?.name || '',
            category: item?.category?.name || '',
            stockQty,
            stockValue,
            stockWac: Number(stockWac.toFixed(4)),
            qtyBlocked,
            availableQty: r4(stockQty - qtyBlocked),
            replayQty,
            replayValue,
            replayWac: Number(replayWac.toFixed(4)),
            qtyDrift,
            valueDrift,
            probableCause,
            severity: Math.abs(qtyDrift) > DRIFT_TOLERANCE ? 'BLOCKER' : 'WARNING',
        });
    };

    for (const b of stockBalances) {
        if (!includeInactive && b.item && b.item.isActive === false) continue;
        const replayBal = balanceMap[balanceMapKey(b.itemId, b.locationId)];
        pushRow(b.itemId, b.locationId, b, replayBal);
    }

    for (const [key, replayBal] of Object.entries(balanceMap)) {
        if (seenKeys.has(key)) continue;
        const parsed = parseBalanceMapKey(key);
        if (!parsed) continue;
        pushRow(parsed.itemId, parsed.locationId, null, replayBal);
    }

    driftRows.sort(
        (a, b) =>
            Math.abs(b.qtyDrift) - Math.abs(a.qtyDrift) ||
            Math.abs(b.valueDrift) - Math.abs(a.valueDrift),
    );

    const limitedRows = driftRows.slice(0, Math.max(1, Math.min(limit, 5000)));

    const sumStockQty = r4(stockBalances.reduce((s, b) => s + Number(b.qtyOnHand || 0), 0));
    const sumStockValue = money(
        stockBalances.reduce((s, b) => s + Number(b.qtyOnHand || 0) * Number(b.wacUnitCost || 0), 0),
    );
    let sumReplayQty = 0;
    let sumReplayValue = 0;
    for (const bal of Object.values(balanceMap)) {
        sumReplayQty += Number(bal.qty || 0);
        sumReplayValue += Number(bal.qty || 0) * Number(bal.wac || 0);
    }
    sumReplayQty = r4(sumReplayQty);
    sumReplayValue = money(sumReplayValue);

    const totals = {
        stockQty: sumStockQty,
        stockValue: sumStockValue,
        replayQty: sumReplayQty,
        replayValue: sumReplayValue,
        qtyDrift: r4(sumStockQty - sumReplayQty),
        valueDrift: money(sumStockValue - sumReplayValue),
        driftRowCount: driftRows.length,
        rowsReturned: limitedRows.length,
        truncated: driftRows.length > limitedRows.length,
    };

    return {
        purpose: 'AUDIT_RECONCILIATION',
        healthy: driftRows.filter((r) => r.severity === 'BLOCKER').length === 0,
        asOfDate: asOf.toISOString(),
        snapshotUsed: bestClose
            ? { id: bestClose.id, year: bestClose.year, month: bestClose.month, closedAt: bestClose.closedAt }
            : null,
        rows: limitedRows,
        totals,
        meta: {
            note: 'Ledger replay explains stock; it is not the authoritative carrying total.',
            probableCauseCodes: Object.values(PROBABLE_CAUSE),
        },
    };
}

module.exports = {
    DRIFT_TOLERANCE,
    VALUE_TOLERANCE,
    PROBABLE_CAUSE,
    inferProbableCause,
    runInventoryTruthReconciliation,
};
