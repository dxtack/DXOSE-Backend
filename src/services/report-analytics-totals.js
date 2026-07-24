'use strict';

const r2 = (n) => Number(Number(n || 0).toFixed(4));
const r2money = (n) => Number(Number(n || 0).toFixed(2));

const sum = (rows, key) => rows.reduce((s, row) => s + Number(row[key] || 0), 0);

const COUNT_VARIANCE_CARDS = new Set([
    'count-variance-report',
    'variance-by-location',
    'variance-by-department',
    'variance-by-category',
    'variance-by-counter',
    'variance-value-impact',
    'top-variance-items',
]);

const STOCK_VALUE_CARDS = new Set([
    'current-stock-balance',
    'inventory-by-location',
    'negative-stock-report',
    'critical-stock-levels',
    'slow-moving-items',
    'dead-stock',
    'zero-movement-items',
]);

const TRANSFER_CARDS = new Set(['open-transfers', 'transfer-delays', 'transfer-aging', 'operational-delays']);

const GET_PASS_CARDS = new Set([
    'get-pass-activity',
    'open-get-passes',
    'overdue-returns',
    'temporary-movement-report',
    'returned-vs-outstanding-assets',
]);

const LEDGER_CARDS = new Set([
    'inventory-change-history',
    'posting-activity-report',
    'adjustment-history',
    'stock-adjustment-summary',
    'breakage-workflow',
    'stock-movement-analysis',
    'workflow-completion-analysis',
    'workflow-timeline-report',
]);

/**
 * Compute report totals on the server from row data (and optional pre-computed extras).
 */
function computeTotals(cardId, rows, extras = {}) {
    if (extras.totals && typeof extras.totals === 'object') {
        return extras.totals;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        return {};
    }

    if (COUNT_VARIANCE_CARDS.has(cardId)) {
        const wacMissingCount = rows.filter((r) => r.wacMissing === true).length;
        return {
            totalBookQty: r2(sum(rows, 'bookQty')),
            totalCountedQty: r2(sum(rows, 'countedQty')),
            totalVarianceQty: r2(sum(rows, 'varianceQty')),
            totalVarianceValue: r2money(sum(rows, 'varianceValue')),
            wacMissingCount,
            sessionCount: new Set(rows.map((r) => r.sessionNo).filter(Boolean)).size,
            rowCount: rows.length,
        };
    }

    if (STOCK_VALUE_CARDS.has(cardId)) {
        return {
            totalQty: r2(sum(rows, 'qtyOnHand')),
            totalValue: r2money(sum(rows, 'value')),
            rowCount: rows.length,
        };
    }

    if (cardId === 'high-consumption-items') {
        return {
            totalQty: r2(sum(rows, 'totalQty')),
            totalValue: r2money(sum(rows, 'totalValue')),
            rowCount: rows.length,
        };
    }

    const BREAKAGE_CARDS = new Set(['breakage-loss-report', 'breakage-trend-analysis', 'loss-analysis']);
    if (BREAKAGE_CARDS.has(cardId)) {
        return {
            totalQty: r2(sum(rows, 'qty')),
            totalValue: r2money(sum(rows, 'lineValue')),
            rowCount: rows.length,
        };
    }

    const TRANSFER_HISTORY_CARDS = new Set(['transfer-history', 'inter-location-movement']);
    if (TRANSFER_HISTORY_CARDS.has(cardId)) {
        return {
            totalQty: r2(sum(rows, 'qty')),
            totalValue: r2money(sum(rows, 'value')),
            rowCount: rows.length,
        };
    }

    if (TRANSFER_CARDS.has(cardId)) {
        return { rowCount: rows.length };
    }

    if (cardId === 'lost-items-register') {
        return { rowCount: rows.length };
    }

    if (GET_PASS_CARDS.has(cardId)) {
        let openCount = 0;
        let overdueCount = 0;
        let returnedCount = 0;
        let exposureValue = 0;
        let outstandingQty = 0;
        const activeBorrowers = new Set();
        for (const row of rows) {
            const bucket = row.operationalBucket;
            if (bucket === 'OPEN' || bucket === 'OVERDUE') {
                openCount += 1;
                if (row.borrowingEntity) activeBorrowers.add(row.borrowingEntity);
                exposureValue += Number(row.exposureValue || 0);
                outstandingQty += Number(row.qtyOutstanding || 0);
            }
            if (bucket === 'OVERDUE') overdueCount += 1;
            if (bucket === 'RETURNED') returnedCount += 1;
        }
        return {
            openCount,
            overdueCount,
            returnedCount,
            exposureValue: r2money(exposureValue),
            outstandingQty: r2(outstandingQty),
            activeBorrowers: activeBorrowers.size,
            rowCount: rows.length,
        };
    }

    if (cardId === 'omc-report') {
        const sum = (k) => r2(rows.reduce((s, r) => s + Number(r[k] || 0), 0));
        return {
            totalOpeningQty: sum('openingQty'),
            totalInQty: sum('inQty'),
            totalOutQty: sum('outQty'),
            totalClosingQty: sum('closingQty'),
            totalOpeningValue: r2money(rows.reduce((s, r) => s + Number(r.openingValue || 0), 0)),
            totalClosingValue: r2money(rows.reduce((s, r) => s + Number(r.closingValue || 0), 0)),
            rowCount: rows.length,
        };
    }

    if (cardId === 'detail-report') {
        const sum = (k) => r2(rows.reduce((s, r) => s + Number(r[k] || 0), 0));
        const sumMoney = (k) => r2money(rows.reduce((s, r) => s + Number(r[k] || 0), 0));
        return {
            totalOpeningQty: sum('openingQty'),
            totalOpeningValue: sumMoney('openingValue'),
            totalInwardQty: sum('inwardQty'),
            totalInwardValue: sumMoney('inwardValue'),
            totalBreakageQty: sum('breakageQty'),
            totalBreakageValue: sumMoney('breakageValue'),
            totalGatePassQty: sum('gatePassQty'),
            totalGatePassValue: sumMoney('gatePassValue'),
            totalTheoreticalQty: sum('theoreticalQty'),
            totalTheoreticalValue: sumMoney('theoreticalValue'),
            totalPhysicalQty: sum('physicalQty'),
            totalPhysicalValue: sumMoney('physicalValue'),
            totalVarianceQty: sum('varianceQty'),
            totalVarianceValue: sumMoney('varianceValue'),
            totalClosingQty: sum('closingQty'),
            totalClosingValue: sumMoney('closingValue'),
            rowCount: rows.length,
        };
    }

    const GOVERNANCE_LIVE = new Set([
        'audit-activity-report',
        'user-operational-activity',
        'approval-activity-report',
        'workflow-violations',
    ]);
    if (GOVERNANCE_LIVE.has(cardId)) {
        return {
            rowCount: rows.length,
            eventCount: rows.length,
            moduleCount: new Set(rows.map((r) => r.moduleKey || r.entityType).filter(Boolean)).size,
        };
    }

    if (LEDGER_CARDS.has(cardId)) {
        const qtyIn = r2(sum(rows, 'qtyIn'));
        const qtyOut = r2(sum(rows, 'qtyOut'));
        const lineValue = r2money(sum(rows, 'lineValue') || sum(rows, 'value'));
        return {
            totalQtyIn: qtyIn,
            totalQtyOut: qtyOut,
            totalNetQty: r2(qtyIn - qtyOut),
            totalValue: lineValue,
            rowCount: rows.length,
        };
    }

    if (cardId === 'pending-operational-actions' || cardId === 'daily-operational-review' || cardId === 'operational-attention-report') {
        return {
            totalPendingCount: rows.reduce((s, r) => s + Number(r.pendingCount || 0), 0),
            rowCount: rows.length,
        };
    }

  // Generic numeric column totals for remaining reports
    const numericKeys = new Set();
    for (const row of rows) {
        for (const [k, v] of Object.entries(row)) {
            if (typeof v === 'number' && !Number.isNaN(v)) numericKeys.add(k);
        }
    }
    const generic = { rowCount: rows.length };
    for (const k of numericKeys) {
        generic[`total_${k}`] = r2money(sum(rows, k));
    }
    return generic;
}

/**
 * Build a footer row aligned to data columns for Excel export.
 */
function buildTotalsFooterRow(columns, totals) {
    if (!totals || !Object.keys(totals).length || !columns?.length) return null;

    const footer = {};
    const firstKey = columns[0]?.key;
    if (firstKey) footer[firstKey] = 'TOTAL';

    const mapTotalToColumn = {
        totalQty: ['qtyOnHand', 'qty', 'totalQty'],
        totalValue: ['value', 'lineValue', 'totalValue'],
        totalVarianceQty: ['varianceQty'],
        totalVarianceValue: ['varianceValue'],
        totalBookQty: ['bookQty'],
        totalCountedQty: ['countedQty'],
        totalQtyIn: ['qtyIn'],
        totalQtyOut: ['qtyOut'],
        // Do NOT map totalNetQty → qtyIn: Object.entries order would overwrite
        // the real inbound total with (qtyIn − qtyOut) on the GRAND TOTAL row.
        totalPendingCount: ['pendingCount'],
        totalOpeningQty: ['openingQty'],
        totalInQty: ['inQty'],
        totalOutQty: ['outQty'],
        totalClosingQty: ['closingQty'],
        totalOpeningValue: ['openingValue'],
        totalClosingValue: ['closingValue'],
        exposureValue: ['exposureValue'],
        outstandingQty: ['qtyOutstanding'],
        openCount: ['passNo'],
        overdueCount: ['daysOverdue'],
        returnedCount: ['returnedDate'],
        activeBorrowers: ['borrowingEntity'],
        // OMC granular movement columns
        totalGrnQty:      ['grnQty'],
        totalTfrInQty:    ['tfrInQty'],
        totalReturnQty:   ['returnQty'],
        totalBreakageQty: ['breakageQty'],
        totalLostQty:     ['lostQty'],
        totalTfrOutQty:   ['tfrOutQty'],
        totalIssueQty:    ['issueQty'],
        totalGetPassOutQty: ['getPassOutQty'],
        totalAdjQty:      ['adjQty'],
        totalInwardQty:   ['inwardQty'],
        totalInwardValue: ['inwardValue'],
        totalBreakageQty: ['breakageQty'],
        totalBreakageValue: ['breakageValue'],
        totalGatePassQty: ['gatePassQty'],
        totalGatePassValue: ['gatePassValue'],
        totalTheoreticalQty: ['theoreticalQty'],
        totalTheoreticalValue: ['theoreticalValue'],
        totalPhysicalQty: ['physicalQty'],
        totalPhysicalValue: ['physicalValue'],
    };

    for (const [totalKey, colCandidates] of Object.entries(mapTotalToColumn)) {
        if (totals[totalKey] == null) continue;
        for (const col of columns) {
            if (colCandidates.includes(col.key)) {
                footer[col.key] = totals[totalKey];
                break;
            }
        }
    }

    // rowCount / sessionCount — skip in footer unless no other totals mapped
    const hasValue = Object.keys(footer).some((k) => k !== firstKey);
    if (!hasValue) return null;
    footer._isTotalsRow = true;
    return footer;
}

module.exports = {
    computeTotals,
    buildTotalsFooterRow,
    COUNT_VARIANCE_CARDS,
    GET_PASS_CARDS,
};
