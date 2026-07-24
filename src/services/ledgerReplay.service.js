'use strict';

const { PrismaClient } = require('@prisma/client');
const { toInclusiveUtcEndOfDay } = require('../utils/report-date-range.util');

const prisma = new PrismaClient();

const OFFICIAL_LEDGER_WHERE = { affectsValuation: true };

const balanceMapKey = (itemId, locationId) => `${itemId}_${locationId}`;

const parseBalanceMapKey = (key) => {
    const idx = key.indexOf('_');
    if (idx <= 0) return null;
    return { itemId: key.slice(0, idx), locationId: key.slice(idx + 1) };
};

/**
 * Apply one official ledger row to a running balance entry (valuation replay semantics).
 * @param {{ qty: number, wac: number, value: number }} b
 */
function applyLedgerEntryToBalance(b, e) {
    const qIn = Number(e.qtyIn || 0);
    const qOut = Number(e.qtyOut || 0);
    const val = Number(e.totalValue || 0);
    const unitCost = Number(e.unitCost || 0);

    switch (e.movementType) {
        case 'RECEIVE':
        case 'OPENING_BALANCE':
        case 'RETURN':
        case 'TRANSFER_IN':
        case 'GET_PASS_RETURN': {
            const newTotalQty = b.qty + qIn;
            const newTotalVal = b.value + val;
            b.wac = newTotalQty > 0 ? newTotalVal / newTotalQty : unitCost || b.wac;
            b.qty = newTotalQty;
            b.value = newTotalVal;
            break;
        }
        case 'ISSUE':
        case 'BREAKAGE':
        case 'LOST':
        case 'TRANSFER_OUT':
        case 'GET_PASS_OUT':
        case 'LOAN_WRITE_OFF':
            b.qty -= qOut;
            b.value = b.qty * b.wac;
            break;
        case 'ADJUSTMENT':
        case 'COUNT_ADJUSTMENT': {
            const net = qIn - qOut;
            b.qty += net;
            b.value = b.qty * b.wac;
            break;
        }
        default:
            break;
    }
    if (b.qty < 0) {
        b.qty = 0;
        b.value = 0;
    }
}

async function resolveReplayScope(tenantId, filters = {}) {
    const { locationIds = [], departmentIds = [], categoryId, includeInactive = false } = filters;

    const locWhere = { tenantId, isActive: true };
    if (locationIds.length > 0) locWhere.id = { in: locationIds };
    if (departmentIds.length > 0) locWhere.departmentId = { in: departmentIds };
    const locations = await prisma.location.findMany({ where: locWhere, include: { department: true } });
    const resolvedLocIds = locations.map((l) => l.id);
    const locMap = Object.fromEntries(locations.map((l) => [l.id, l]));

    const itemWhere = { tenantId };
    if (!includeInactive) itemWhere.isActive = true;
    if (categoryId) itemWhere.categoryId = categoryId;
    const items = await prisma.item.findMany({ where: itemWhere, include: { category: true } });
    const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));
    const resolvedItemIds = items.map((i) => i.id);

    return { resolvedLocIds, resolvedItemIds, itemMap, locMap, locations };
}

/**
 * Replay official inventory ledger into per item×location balances (audit / legacy valuation engine).
 * Does not read stock_balances — use inventoryTruthReconciliation to compare.
 */
async function replayOfficialLedgerBalances(tenantId, asOfDate, filters = {}) {
    const { snapshotId } = filters;
    const { resolvedLocIds, resolvedItemIds, itemMap, locMap } = await resolveReplayScope(tenantId, filters);

    if (resolvedLocIds.length === 0) {
        return {
            balanceMap: {},
            bestClose: null,
            asOf: new Date(asOfDate),
            itemMap,
            locMap,
            resolvedLocIds,
            resolvedItemIds,
        };
    }

    const asOf = toInclusiveUtcEndOfDay(asOfDate);

    let bestClose = null;
    if (snapshotId) {
        bestClose = await prisma.periodClose.findFirst({
            where: { id: snapshotId, tenantId, status: 'CLOSED' },
        });
        if (!bestClose) {
            throw Object.assign(new Error('Invalid snapshotId. Closed snapshot not found.'), { status: 400 });
        }
        if (bestClose.closedAt > asOf) {
            throw Object.assign(new Error('snapshotId must be on or before asOfDate.'), { status: 400 });
        }
    }
    if (!bestClose) {
        bestClose = await prisma.periodClose.findFirst({
            where: { tenantId, status: 'CLOSED', closedAt: { lte: asOf } },
            orderBy: { closedAt: 'desc' },
        });
    }

    const balanceMap = {};
    let snapshotBaselineAt = null;
    if (bestClose) {
        const currentVersion = await prisma.periodSnapshotVersion.findFirst({
            where: { periodCloseId: bestClose.id, status: 'CURRENT' },
            select: { id: true },
        });
        if (currentVersion) {
            const snapshots = await prisma.periodSnapshotLine.findMany({
                where: {
                    snapshotVersionId: currentVersion.id,
                    locationId: { in: resolvedLocIds },
                    itemId: { in: resolvedItemIds },
                },
                select: {
                    itemId: true,
                    locationId: true,
                    closingQty: true,
                    closingValue: true,
                    wacUnitCost: true,
                },
            });
            for (const s of snapshots) {
                balanceMap[balanceMapKey(s.itemId, s.locationId)] = {
                    qty: Number(s.closingQty),
                    wac: Number(s.wacUnitCost),
                    value: Number(s.closingValue),
                };
            }
            if (snapshots.length > 0) {
                snapshotBaselineAt = bestClose.closedAt ?? new Date(0);
            }
        }
    }

    const ledgerEntries = await prisma.inventoryLedger.findMany({
        where: {
            tenantId,
            ...OFFICIAL_LEDGER_WHERE,
            locationId: { in: resolvedLocIds },
            itemId: { in: resolvedItemIds },
            createdAt: {
                // If CLOSED period has no CURRENT snapshot lines, do not advance the ledger floor
                // (avoids empty replay after incomplete/harness closes).
                gte: snapshotBaselineAt ?? new Date(0),
                lte: asOf,
            },
        },
        orderBy: { createdAt: 'asc' },
        select: {
            itemId: true,
            locationId: true,
            movementType: true,
            qtyIn: true,
            qtyOut: true,
            unitCost: true,
            totalValue: true,
        },
    });

    for (const e of ledgerEntries) {
        const key = balanceMapKey(e.itemId, e.locationId);
        if (!balanceMap[key]) balanceMap[key] = { qty: 0, wac: 0, value: 0 };
        applyLedgerEntryToBalance(balanceMap[key], e);
    }

    return {
        balanceMap,
        bestClose,
        asOf,
        itemMap,
        locMap,
        resolvedLocIds,
        resolvedItemIds,
    };
}

module.exports = {
    OFFICIAL_LEDGER_WHERE,
    balanceMapKey,
    parseBalanceMapKey,
    applyLedgerEntryToBalance,
    resolveReplayScope,
    replayOfficialLedgerBalances,
};
