'use strict';

const { PrismaClient } = require('@prisma/client');
const settingService = require('./setting.service');
const { resolveReplayScope, balanceMapKey, parseBalanceMapKey } = require('./ledgerReplay.service');
const { toInclusiveUtcEndOfDay, toUtcPeriodYearMonth } = require('../utils/report-date-range.util');
const { getTenantTimezone } = require('./tenantTimezone.service');
const { DEFAULT_TENANT_TIMEZONE, tenantDateParts } = require('../utils/tenant-calendar.util');

const prisma = new PrismaClient();

const TRUTH_SOURCE = {
    STOCK_BALANCE: 'STOCK_BALANCE',
    PERIOD_SNAPSHOT: 'PERIOD_SNAPSHOT',
};

const VALUATION_BASIS = {
    EXPLICIT_SNAPSHOT: 'EXPLICIT_SNAPSHOT',
    TODAY: 'TODAY',
    CLOSED_PERIOD: 'CLOSED_PERIOD',
    OPEN_PERIOD_LIVE: 'OPEN_PERIOD_LIVE',
    NEAREST_SNAPSHOT: 'NEAREST_SNAPSHOT',
    LIVE_FALLBACK: 'LIVE_FALLBACK',
};

const OPEN_PERIOD_WARNING = null;

const formatOpenPeriodBasis = (effectiveAsOfDate, requestedAsOfDate) =>
    `Open period — live stock balances as of ${effectiveAsOfDate || 'today'} (Requested review date: ${requestedAsOfDate || '—'})`;
const NEAREST_SNAPSHOT_WARNING =
    'As-of date is not a closed period end; showing last closed snapshot on or before date (no movement overlay).';
const LIVE_FALLBACK_WARNING =
    'No snapshot rows for this scope; showing live stock balances as fallback.';

const isSameCalendarDay = (a, b, timezone = DEFAULT_TENANT_TIMEZONE) => {
    const d1 = tenantDateParts(a, timezone);
    const d2 = tenantDateParts(b, timezone);
    return (
        d1.year === d2.year
        && d1.month === d2.month
        && d1.day === d2.day
    );
};

const isSameCalendarMonth = (a, b, timezone = DEFAULT_TENANT_TIMEZONE) => {
    const d1 = tenantDateParts(a, timezone);
    const d2 = tenantDateParts(b, timezone);
    return d1.year === d2.year && d1.month === d2.month;
};

const endOfDay = (d, timezone = DEFAULT_TENANT_TIMEZONE) => toInclusiveUtcEndOfDay(d, timezone);

const toIsoDate = (d, timezone = DEFAULT_TENANT_TIMEZONE) => {
    const x = tenantDateParts(d, timezone);
    return `${x.year}-${String(x.month).padStart(2, '0')}-${String(x.day).padStart(2, '0')}`;
};

function buildValuationRows(balanceMap, { itemMap, locMap, categoryId }) {
    const rows = [];
    let grandTotal = 0;

    for (const [key, bal] of Object.entries(balanceMap)) {
        if (bal.qty <= 0 && bal.value <= 0) continue;
        const parsed = parseBalanceMapKey(key);
        if (!parsed) continue;
        const { itemId, locationId } = parsed;
        const item = itemMap[itemId];
        const loc = locMap[locationId];
        if (!item || !loc) continue;
        if (categoryId && item.categoryId !== categoryId) continue;

        const qty = Number(bal.qty);
        const wac = Number(bal.wac);
        const totalValue = Number((qty * wac).toFixed(2));
        grandTotal += totalValue;

        rows.push({
            department: loc.department?.name || '',
            location: loc.name,
            category: item.category?.name || '',
            itemCode: item.barcode || '',
            itemName: item.name,
            qtyOnHand: Number(qty.toFixed(4)),
            unitCost: Number(wac.toFixed(4)),
            totalValue,
        });
    }

    rows.sort((a, b) =>
        a.department.localeCompare(b.department)
        || a.location.localeCompare(b.location)
        || a.category.localeCompare(b.category)
        || a.itemName.localeCompare(b.itemName));

    return { rows, grandTotal };
}

async function loadSnapshotBalanceMap(periodCloseId, resolvedLocIds, resolvedItemIds) {
    const balanceMap = {};
    const currentVersion = await prisma.periodSnapshotVersion.findFirst({
        where: { periodCloseId, status: 'CURRENT' },
        select: { id: true },
    });
    if (!currentVersion) return balanceMap;

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
    return balanceMap;
}

async function loadLiveStockBalanceMap(tenantId, resolvedLocIds, resolvedItemIds, categoryId) {
    const balances = await prisma.stockBalance.findMany({
        where: {
            tenantId,
            locationId: { in: resolvedLocIds },
            itemId: { in: resolvedItemIds },
            ...(categoryId ? { item: { categoryId } } : {}),
        },
        select: {
            itemId: true,
            locationId: true,
            qtyOnHand: true,
            wacUnitCost: true,
        },
    });
    const balanceMap = {};
    for (const b of balances) {
        const qty = Number(b.qtyOnHand || 0);
        const wac = Number(b.wacUnitCost || 0);
        balanceMap[balanceMapKey(b.itemId, b.locationId)] = {
            qty,
            wac,
            value: qty * wac,
        };
    }
    return balanceMap;
}

async function findClosedPeriodByYearMonth(tenantId, year, month) {
    return prisma.periodClose.findFirst({
        where: { tenantId, year, month, status: 'CLOSED' },
    });
}

async function findNearestClosedPeriodOnOrBefore(tenantId, asOfEnd) {
    return prisma.periodClose.findFirst({
        where: { tenantId, status: 'CLOSED', closedAt: { lte: asOfEnd } },
        orderBy: { closedAt: 'desc' },
    });
}

async function hasScopedStock(tenantId, resolvedLocIds, resolvedItemIds, categoryId) {
    if (!resolvedLocIds.length || !resolvedItemIds.length) return false;
    const count = await prisma.stockBalance.count({
        where: {
            tenantId,
            locationId: { in: resolvedLocIds },
            itemId: { in: resolvedItemIds },
            qtyOnHand: { gt: 0 },
            ...(categoryId ? { item: { categoryId } } : {}),
        },
    });
    return count > 0;
}

function balanceMapHasPositiveQty(balanceMap) {
    return Object.values(balanceMap).some((b) => Number(b.qty) > 0 || Number(b.value) > 0);
}

/**
 * Resolve balance source per ADR-002 / Finding #27 priority order.
 */
async function resolveValuationBalanceSource(
    tenantId,
    asOf,
    filters,
    resolvedLocIds,
    resolvedItemIds,
    categoryId,
    referenceNow = new Date(),
    timezone = DEFAULT_TENANT_TIMEZONE,
) {
    const { snapshotId } = filters;
    const now = referenceNow;
    const { year: requestedYear, month: requestedMonth } = toUtcPeriodYearMonth(asOf, timezone);

    let balanceMap = {};
    let truthSource = TRUTH_SOURCE.STOCK_BALANCE;
    let valuationBasis = VALUATION_BASIS.TODAY;
    let bestClose = null;
    let warning = null;
    let effectiveAsOfDate = toIsoDate(asOf, timezone);

    const applyLiveStock = async (basis, basisWarning = null) => {
        balanceMap = await loadLiveStockBalanceMap(tenantId, resolvedLocIds, resolvedItemIds, categoryId);
        truthSource = TRUTH_SOURCE.STOCK_BALANCE;
        valuationBasis = basis;
        bestClose = null;
        warning = basisWarning;
        effectiveAsOfDate = toIsoDate(now, timezone);
    };

    const applySnapshot = async (periodClose, basis, basisWarning = null) => {
        bestClose = periodClose;
        balanceMap = await loadSnapshotBalanceMap(periodClose.id, resolvedLocIds, resolvedItemIds);
        truthSource = TRUTH_SOURCE.PERIOD_SNAPSHOT;
        valuationBasis = basis;
        warning = basisWarning;
        effectiveAsOfDate = toIsoDate(asOf, timezone);
    };

    // 1. Explicit snapshotId
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
        await applySnapshot(bestClose, VALUATION_BASIS.EXPLICIT_SNAPSHOT);
    }
    // 2. Today
    else if (isSameCalendarDay(asOf, now, timezone)) {
        await applyLiveStock(VALUATION_BASIS.TODAY);
    }
    // 3. Closed month (year + month)
    else {
        const closedForMonth = await findClosedPeriodByYearMonth(tenantId, requestedYear, requestedMonth);
        if (closedForMonth) {
            await applySnapshot(closedForMonth, VALUATION_BASIS.CLOSED_PERIOD);
        }
        // 4. Open current month
        else if (isSameCalendarMonth(asOf, now, timezone)) {
            await applyLiveStock(VALUATION_BASIS.OPEN_PERIOD_LIVE, OPEN_PERIOD_WARNING);
        }
        // 5. Nearest closed snapshot
        else {
            const nearest = await findNearestClosedPeriodOnOrBefore(tenantId, asOf);
            if (nearest) {
                await applySnapshot(nearest, VALUATION_BASIS.NEAREST_SNAPSHOT, NEAREST_SNAPSHOT_WARNING);
            } else if (await hasScopedStock(tenantId, resolvedLocIds, resolvedItemIds, categoryId)) {
                await applyLiveStock(VALUATION_BASIS.LIVE_FALLBACK, LIVE_FALLBACK_WARNING);
            }
        }
    }

    // 6. Live stock fallback when snapshot path is empty but stock exists
    if (
        truthSource === TRUTH_SOURCE.PERIOD_SNAPSHOT
        && !balanceMapHasPositiveQty(balanceMap)
        && await hasScopedStock(tenantId, resolvedLocIds, resolvedItemIds, categoryId)
    ) {
        await applyLiveStock(VALUATION_BASIS.LIVE_FALLBACK, LIVE_FALLBACK_WARNING);
    }

    // 7. True empty — no stock in scope and empty balance map
    if (
        !balanceMapHasPositiveQty(balanceMap)
        && !(await hasScopedStock(tenantId, resolvedLocIds, resolvedItemIds, categoryId))
    ) {
        balanceMap = {};
    }

    return {
        balanceMap,
        truthSource,
        valuationBasis,
        bestClose,
        warning,
        effectiveAsOfDate,
    };
}

/**
 * Stock / period_snapshot backed valuation (ADR-002). No ledger movement overlay.
 */
async function generateStockBackedValuationReport(tenantId, asOfDate, filters = {}) {
    const { categoryId } = filters;
    const { resolvedLocIds, resolvedItemIds, itemMap, locMap } = await resolveReplayScope(tenantId, filters);

    const timezone = await getTenantTimezone(tenantId, prisma);
    const asOf = endOfDay(asOfDate, timezone);
    const requestedAsOfDate = toIsoDate(asOfDate, timezone);

    const baseResponse = {
        requestedAsOfDate,
        asOfDate: asOf.toISOString(),
    };

    if (resolvedLocIds.length === 0) {
        return {
            ...baseResponse,
            rows: [],
            totalValue: 0,
            truthSource: TRUTH_SOURCE.STOCK_BALANCE,
            valuationBasis: null,
            effectiveAsOfDate: requestedAsOfDate,
            snapshotUsed: null,
        };
    }

    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return {
            ...baseResponse,
            rows: [],
            totalValue: 0,
            truthSource: TRUTH_SOURCE.STOCK_BALANCE,
            valuationBasis: null,
            effectiveAsOfDate: requestedAsOfDate,
            snapshotUsed: null,
            emptyReason: 'OB_NOT_FINALIZED',
            obStatus,
        };
    }

    const {
        balanceMap,
        truthSource,
        valuationBasis,
        bestClose,
        warning,
        effectiveAsOfDate,
    } = await resolveValuationBalanceSource(
        tenantId,
        asOf,
        filters,
        resolvedLocIds,
        resolvedItemIds,
        categoryId,
        new Date(),
        timezone,
    );

    const { rows, grandTotal } = buildValuationRows(balanceMap, { itemMap, locMap, categoryId });

    return {
        ...baseResponse,
        rows,
        totalValue: Number(grandTotal.toFixed(2)),
        truthSource,
        valuationBasis,
        effectiveAsOfDate,
        snapshotUsed: bestClose
            ? {
                id: bestClose.id,
                year: bestClose.year,
                month: bestClose.month,
                closedAt: bestClose.closedAt,
            }
            : null,
        ...(warning ? { warning } : {}),
    };
}

function describeValuationBasis({
    valuationBasis,
    snapshotUsed,
    warning,
    effectiveAsOfDate,
    requestedAsOfDate,
} = {}) {
    switch (valuationBasis) {
        case VALUATION_BASIS.EXPLICIT_SNAPSHOT:
            return snapshotUsed
                ? `Closed period snapshot ${snapshotUsed.year}/${String(snapshotUsed.month || '').padStart(2, '0')} (explicit selection)`
                : 'Closed period snapshot (explicit selection)';
        case VALUATION_BASIS.TODAY:
            return 'Live stock balances as of today';
        case VALUATION_BASIS.CLOSED_PERIOD:
            return snapshotUsed
                ? `Closed period snapshot ${snapshotUsed.year}/${String(snapshotUsed.month || '').padStart(2, '0')}`
                : 'Closed period snapshot';
        case VALUATION_BASIS.OPEN_PERIOD_LIVE:
            return formatOpenPeriodBasis(effectiveAsOfDate, requestedAsOfDate);
        case VALUATION_BASIS.NEAREST_SNAPSHOT:
            return snapshotUsed
                ? `Nearest closed snapshot ${snapshotUsed.year}/${String(snapshotUsed.month || '').padStart(2, '0')} (no movement overlay)`
                : 'Nearest closed snapshot (no movement overlay)';
        case VALUATION_BASIS.LIVE_FALLBACK:
            return 'Live stock balances (snapshot unavailable for scope)';
        default:
            return warning || 'Stock-backed carrying value';
    }
}
module.exports = {
    TRUTH_SOURCE,
    VALUATION_BASIS,
    generateStockBackedValuationReport,
    isSameCalendarDay,
    isSameCalendarMonth,
    findClosedPeriodByYearMonth,
    findNearestClosedPeriodOnOrBefore,
    hasScopedStock,
    balanceMapHasPositiveQty,
    resolveValuationBalanceSource,
    buildValuationRows,
    loadLiveStockBalanceMap,
    loadSnapshotBalanceMap,
    toIsoDate,
    describeValuationBasis,
    formatOpenPeriodBasis,
};
