'use strict';



const {

    GOLDEN_PHASE1_REPORT_TYPES,

    GOLDEN_PHASE2_REPORT_TYPES,

    GOLDEN_PHASE3_REPORT_TYPES,

    GOLDEN_FROZEN_SHELL,

    PDF_GOLDEN_PROFILE_ALIASES,

} = require('./report-golden-rollout.registry');



/**

 * DX OSE Golden Reporting Language v1 — shared presentation contract (presentation only).

 * Master visual reference: current-stock-balance (Shell golden-v1).

 */



const GOLDEN_REPORTING_V1_BASE = {

    goldenReference: true,

    compactChrome: true,

    grandTotalBand: true,

    sarNumbersOnly: true,

    fillPageWidth: true,

    mode: 'grouped',

};



const GOLDEN_PURPOSE_LINES = {

    'current-stock-balance':

        'This report reflects the current stock on hand and its valuation as of the reporting date.',

    'inventory-by-location':

        'This report presents stock quantities and values aggregated by location for executive review.',

    'inventory-change-history':

        'This report summarizes inventory movements and ledger activity for the selected period.',

    'omc-report':

        'This report reconciles opening and closing quantities and values by category for the period.',

    'detail-report':

        'This report presents item-level stock movements, theoretical balances, physical counts, and variances by department and location for the period.',

    'count-variance-report':

        'This report compares physical count results to system snapshot quantities and values by session and location.',

    'breakage-loss-report':

        'This report documents breakage and loss transactions with quantities and values for audit review.',

    'lost-items-register':

        'This report lists lost-item records and disposition status for operational accountability.',

    'transfer-history':

        'This report summarizes inter-location transfer movements and receipt status for the period.',

    'open-transfers':

        'This report highlights open and in-transit transfers requiring operational follow-up.',

    'get-pass-report':
        'This operational review summarizes assets outside store custody, return exposure, and overdue gate passes for the selected period.',

    'pending-operations-report':

        'This report aggregates pending operational actions requiring management attention.',

    'inventory-valuation':
        'This report presents the WAC-based carrying value of inventory positions as of the stated date, sourced from live stock balances or closed period snapshots per ADR-002. Ledger replay is not used as the published total.',

};



function resolveGoldenPurposeLine(reportType, metadata = {}) {

    if (metadata.purposeLine) return metadata.purposeLine;

    const resolved = PDF_GOLDEN_PROFILE_ALIASES[reportType] || reportType;

    return (

        GOLDEN_PURPOSE_LINES[resolved] ||

        GOLDEN_PURPOSE_LINES['current-stock-balance']

    );

}



/** Official footer shell tag. Current Stock Balance uses golden-v1 (same as Phase 1–3 reports). */
function resolveGoldenShellRev(reportType) {
    if (GOLDEN_FROZEN_SHELL.has(reportType)) return 'mock-v3.2f';

    if (
        GOLDEN_PHASE1_REPORT_TYPES.has(reportType) ||
        GOLDEN_PHASE2_REPORT_TYPES.has(reportType) ||
        GOLDEN_PHASE3_REPORT_TYPES.has(reportType)
    ) {
        return 'golden-v1';
    }

    return 'golden-v1';
}



module.exports = {

    GOLDEN_REPORTING_V1_BASE,

    GOLDEN_PURPOSE_LINES,

    GOLDEN_PHASE1_REPORT_TYPES,

    GOLDEN_PHASE2_REPORT_TYPES,

    GOLDEN_PHASE3_REPORT_TYPES,

    resolveGoldenPurposeLine,

    resolveGoldenShellRev,

};

