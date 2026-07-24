'use strict';

const { fmtSar, fmtQty } = require('../../utils/report-format.util');

function enrichGoldenStockBalanceTotals(totals = {}, data = [], metadata = {}) {
    const out = { ...totals };
    const qty = Number(totals.totalQty || 0);
    const value = Number(totals.totalValue || 0);

    if (qty > 0 && value != null) {
        out.totalWacBlended = Number((value / qty).toFixed(2));
    } else {
        out.totalWacBlended = null;
    }

    const filterLoc = metadata.filters?.locations;
    if (filterLoc != null && filterLoc !== '' && filterLoc !== 'All') {
        const n = Number(filterLoc);
        out.locationCount = Number.isFinite(n) ? n : filterLoc;
    } else {
        const lines = (data || []).filter((r) => !r.rowType || r.rowType === 'LINE');
        const locs = new Set(lines.map((r) => r.location).filter(Boolean));
        out.locationCount = locs.size;
    }

    return out;
}

const GOLDEN_KPI_REGISTRY = {
    'current-stock-balance': [
        { key: 'totalValue', label: 'Total value', format: 'sar', hero: true },
        { key: 'totalQty', label: 'Total qty', format: 'qty' },
        { key: 'rowCount', label: 'Lines', format: 'count' },
        { key: 'locationCount', label: 'Locations', format: 'count' },
        { key: 'totalWacBlended', label: 'Total WAC', format: 'wac' },
    ],
    'inventory-by-location': [
        { key: 'totalValue', label: 'Total value', format: 'sar', hero: true },
        { key: 'totalQty', label: 'Total qty', format: 'qty' },
        { key: 'rowCount', label: 'Lines', format: 'count' },
    ],
    'inventory-health-aging': [
        { key: 'totalValue', label: 'Total value', format: 'sar', hero: true },
        { key: 'totalQty', label: 'Total qty', format: 'qty' },
        { key: 'rowCount', label: 'Lines', format: 'count' },
        { key: 'criticalCount', label: 'Critical (90+ days)', format: 'count' },
    ],
    'inventory-change-history': [
        { key: 'totalValue',  label: 'Total value',  format: 'sar', hero: true },
        { key: 'totalQtyIn',  label: 'Qty in',       format: 'qty' },
        { key: 'totalQtyOut', label: 'Qty out',      format: 'qty' },
        { key: 'totalNetQty', label: 'Net movement', format: 'qty' },
        { key: 'rowCount',    label: 'Lines',        format: 'count' },
    ],
    'omc-report': [
        { key: 'totalOpeningQty',   label: 'Opening',       format: 'qty' },
        { key: 'totalInQty',        label: 'In (+)',         format: 'qty' },
        { key: 'totalOutQty',       label: 'Out (−)',        format: 'qty' },
        { key: 'totalClosingQty',   label: 'Closing',       format: 'qty' },
        { key: 'totalClosingValue', label: 'Closing value', format: 'sar', hero: true },
    ],
    'detail-report': [
        { key: 'totalVarianceValue', label: 'Variance value', format: 'sar', hero: true },
        { key: 'totalVarianceQty',   label: 'Variance qty',   format: 'qty', signed: true },
        { key: 'totalClosingQty',    label: 'Closing qty',    format: 'qty' },
        { key: 'totalClosingValue',  label: 'Closing value',  format: 'sar' },
        { key: 'rowCount',           label: 'Lines',          format: 'count' },
    ],
    'count-variance-report': [
        { key: 'totalVarianceValue', label: 'Variance value', format: 'sar', hero: true },
        { key: 'totalVarianceQty', label: 'Variance qty', format: 'qty', signed: true },
        { key: 'rowCount', label: 'Lines', format: 'count' },
        { key: 'wacMissingCount', label: 'WAC missing', format: 'count' },
    ],
    'breakage-loss-report': [
        { key: 'totalValue', label: 'Total value', format: 'sar', hero: true },
        { key: 'totalQty', label: 'Total qty', format: 'qty' },
        { key: 'rowCount', label: 'Lines', format: 'count' },
    ],
    'lost-items-register': [
        { key: 'rowCount', label: 'Records', format: 'count', hero: true },
    ],
    'transfer-history': [
        { key: 'totalValue', label: 'Total value', format: 'sar', hero: true },
        { key: 'totalQty', label: 'Total qty', format: 'qty' },
        { key: 'rowCount', label: 'Lines', format: 'count' },
    ],
    'open-transfers': [
        { key: 'rowCount', label: 'Transfers', format: 'count', hero: true },
    ],
    'get-pass-report': [
        { key: 'exposureValue', label: 'Exposure value', format: 'sar', hero: true },
        { key: 'openCount', label: 'Open passes', format: 'count' },
        { key: 'overdueCount', label: 'Overdue returns', format: 'count' },
        { key: 'outstandingQty', label: 'Qty outstanding', format: 'qty' },
        { key: 'activeBorrowers', label: 'Active borrowers', format: 'count' },
        { key: 'returnedCount', label: 'Returned', format: 'count' },
    ],
    'pending-operations-report': [
        { key: 'totalPendingCount', label: 'Pending actions', format: 'count', hero: true },
        { key: 'rowCount', label: 'Areas', format: 'count' },
    ],
    'inventory-valuation': [
        { key: 'totalValue',     label: 'Total carrying value', format: 'sar',   hero: true },
        { key: 'rowCount',       label: 'Lines',                format: 'count'             },
        { key: 'locationCount',  label: 'Locations',            format: 'count'             },
        { key: 'totalQtyOnHand', label: 'Total qty on hand',    format: 'qty'               },
        { key: 'blendedWac',     label: 'Blended WAC',          format: 'wac',  footnote: true },
    ],
};

function formatGoldenKpiValue(totals, def) {
    const raw = totals[def.key];
    if (raw == null || raw === '') return '—';
    if (def.format === 'sar') return fmtSar(raw);
    if (def.format === 'qty') return fmtQty(raw);
    if (def.format === 'wac') {
        const n = Number(raw);
        if (Number.isNaN(n)) return '—';
        return n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(raw);
}

function getGoldenKpiDefs(reportType, profile = null) {
    const id = profile?.id || reportType || 'current-stock-balance';
    const registry = GOLDEN_KPI_REGISTRY[id] || GOLDEN_KPI_REGISTRY['current-stock-balance'];
    const keys = profile?.kpiKeys;
    if (!keys?.length) return registry;
    const byKey = new Map(registry.map((d) => [d.key, d]));
    return keys.map((key) => byKey.get(key)).filter(Boolean);
}

function enrichGoldenTotals(reportType, totals = {}, data = [], metadata = {}) {
    if (reportType === 'current-stock-balance' || reportType === 'inventory-by-location') {
        return enrichGoldenStockBalanceTotals(totals, data, metadata);
    }
    return { ...totals };
}

const GOLDEN_KPI_DEFS = GOLDEN_KPI_REGISTRY['current-stock-balance'];

module.exports = {
    GOLDEN_KPI_REGISTRY,
    GOLDEN_KPI_DEFS,
    formatGoldenKpiValue,
    getGoldenKpiDefs,
    enrichGoldenTotals,
    enrichGoldenStockBalanceTotals,
};
