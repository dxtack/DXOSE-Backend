'use strict';

/**
 * Golden Reporting Language v1 — rollout registry (profile aliases + phase sets).
 * Single source for PDF profile resolution aligned with column-contract aliases.
 */

/** @type {Record<string, string>} */
const PDF_GOLDEN_PROFILE_ALIASES = {
    // Phase 1 (stock / ledger / omc)
    // Phase 2 — count variance family
    'variance-by-location': 'count-variance-report',
    'variance-by-department': 'count-variance-report',
    'variance-by-category': 'count-variance-report',
    'variance-by-counter': 'count-variance-report',
    'variance-value-impact': 'count-variance-report',
    'top-variance-items': 'count-variance-report',
    'breakage-trend-analysis': 'breakage-loss-report',
    'loss-analysis': 'breakage-loss-report',
    // Phase 3 — transfers & get-pass
    'transfer-delays': 'open-transfers',
    'transfer-aging': 'open-transfers',
    'operational-delays': 'open-transfers',
    'inter-location-movement': 'transfer-history',
    'get-pass-activity': 'get-pass-report',
    'open-get-passes': 'get-pass-report',
    'overdue-returns': 'get-pass-report',
    'temporary-movement-report': 'get-pass-report',
    'returned-vs-outstanding-assets': 'get-pass-report',
    'daily-operational-review': 'pending-operations-report',
    'operational-attention-report': 'pending-operations-report',
    AGING: 'inventory-health-aging',
    DETAIL: 'detail-report',
};

const GOLDEN_PHASE1_REPORT_TYPES = new Set([
    'current-stock-balance',
    'inventory-by-location',
    'inventory-change-history',
    'inventory-health-aging',
    'omc-report',
    'detail-report',
]);

const GOLDEN_PHASE2_REPORT_TYPES = new Set([
    'count-variance-report',
    'breakage-loss-report',
    'lost-items-register',
]);

const GOLDEN_PHASE3_REPORT_TYPES = new Set([
    'transfer-history',
    'open-transfers',
    'get-pass-report',
    'pending-operations-report',
]);

/** Empty — Current Stock Balance promoted to golden-v1 (live financial use). */
const GOLDEN_FROZEN_SHELL = new Set();

const EVIDENCE_PACK_GOLDEN_TYPES = {
    breakage: 'breakage-loss-report',
    lost: 'lost-items-register',
    transfer: 'transfer-history',
};

function resolveGoldenProfileId(reportType) {
    if (!reportType) return null;
    return PDF_GOLDEN_PROFILE_ALIASES[reportType] || reportType;
}

function isGoldenReportType(reportType) {
    const id = resolveGoldenProfileId(reportType);
    return (
        GOLDEN_FROZEN_SHELL.has(id) ||
        GOLDEN_PHASE1_REPORT_TYPES.has(id) ||
        GOLDEN_PHASE2_REPORT_TYPES.has(id) ||
        GOLDEN_PHASE3_REPORT_TYPES.has(id)
    );
}

function resolveEvidenceGoldenReportType(packType) {
    return EVIDENCE_PACK_GOLDEN_TYPES[packType] || null;
}

module.exports = {
    PDF_GOLDEN_PROFILE_ALIASES,
    GOLDEN_PHASE1_REPORT_TYPES,
    GOLDEN_PHASE2_REPORT_TYPES,
    GOLDEN_PHASE3_REPORT_TYPES,
    GOLDEN_FROZEN_SHELL,
    EVIDENCE_PACK_GOLDEN_TYPES,
    resolveGoldenProfileId,
    isGoldenReportType,
    resolveEvidenceGoldenReportType,
};
