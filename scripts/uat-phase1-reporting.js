#!/usr/bin/env node
'use strict';

/**
 * Phase 1 Reporting — automated integrity checks (no live API required).
 * Run: node scripts/uat-phase1-reporting.js
 */

const { computeTotals, buildTotalsFooterRow } = require('../src/services/report-analytics-totals');
const { fmtSar, fmtQty, formatReportCell, buildReportReference, isTotalsFooterRow } = require('../src/utils/report-format.util');
const { getReportColumns } = require('../src/services/report-column-contracts');

const results = [];

function assert(name, condition, detail = '') {
    results.push({ name, pass: !!condition, detail });
    const icon = condition ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const sampleVarianceRows = [
    { sessionNo: 'CNT-001', bookQty: 10, countedQty: 8, varianceQty: -2, varianceValue: -50, wacMissing: false },
    { sessionNo: 'CNT-001', bookQty: 5, countedQty: 7, varianceQty: 2, varianceValue: 0, wacMissing: true },
    { sessionNo: 'CNT-002', bookQty: 1, countedQty: 1, varianceQty: 0, varianceValue: 0, wacMissing: false },
];

const varianceTotals = computeTotals('count-variance-report', sampleVarianceRows);
assert('Count variance totalBookQty', varianceTotals.totalBookQty === 16, `got ${varianceTotals.totalBookQty}`);
assert('Count variance totalCountedQty', varianceTotals.totalCountedQty === 16, `got ${varianceTotals.totalCountedQty}`);
assert('Count variance totalVarianceQty', varianceTotals.totalVarianceQty === 0, `got ${varianceTotals.totalVarianceQty}`);
assert('Count variance totalVarianceValue', varianceTotals.totalVarianceValue === -50, `got ${varianceTotals.totalVarianceValue}`);
assert('Count variance wacMissingCount', varianceTotals.wacMissingCount === 1, `got ${varianceTotals.wacMissingCount}`);

const cols = getReportColumns('count-variance-report');
const footer = buildTotalsFooterRow(cols.map((c) => ({ key: c.key })), varianceTotals);
assert('Footer row maps varianceValue', footer?.varianceValue === -50);
assert('Footer flagged as totals', footer?._isTotalsRow === true);
assert('isTotalsFooterRow detects TOTAL', isTotalsFooterRow({ sessionNo: 'TOTAL' }, cols));

assert('fmtSar negative', fmtSar(-1234.5) === '(SAR 1,234.50)');
assert('fmtSar positive', fmtSar(100) === 'SAR 100.00');
assert('formatReportCell sar', formatReportCell(-10, 'sar') === '(SAR 10.00)');

const stockRows = [{ qtyOnHand: 3, value: 150.25 }, { qtyOnHand: 2, value: 49.75 }];
const stockTotals = computeTotals('current-stock-balance', stockRows);
assert('Stock totalQty', stockTotals.totalQty === 5);
assert('Stock totalValue', stockTotals.totalValue === 200);

const ref = buildReportReference('count-variance-report', new Date('2026-05-15T10:00:00Z'));
assert('Report reference format', /^DX-REP-[A-Z0-9]+-\d{8}-\d+$/.test(ref), ref);

const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log('\n--- UAT Summary ---');
console.log(`Passed: ${passed}/${results.length}`);
if (failed > 0) {
    console.error('FAILED checks — Phase 1 automated UAT not clear.');
    process.exit(1);
}
console.log('Automated integrity UAT: CLEAR (manual Screen=Excel=PDF still required in staging).');
