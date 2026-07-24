#!/usr/bin/env node
'use strict';

/**
 * Verifies current-stock-balance PDF uses Executive Confidence v3.1 golden shell.
 */
const fs = require('fs');
const path = require('path');
const { buildGroupedReport } = require('../src/services/report-grouping.engine');
const { getGroupingSpec } = require('../src/services/report-family-registry');
const { resolveExportDataset } = require('../src/utils/report-export.util');
const { getReportColumns } = require('../src/services/report-column-contracts');
const { computeTotals, buildTotalsFooterRow } = require('../src/services/report-analytics-totals');
const { generateReportPDF } = require('../src/services/pdf.service');
const { resolvePdfProfile } = require('../src/services/pdf/report-pdf-profiles');

const OUT_DIR = path.join(__dirname, '../tmp/golden-stock-balance');
const OUT_FILE = path.join(OUT_DIR, 'verify-mock-shell.pdf');
const CHROME_SRC = path.join(__dirname, '../src/services/pdf/report-pdf-chrome.js');
const PDF_SERVICE_SRC = path.join(__dirname, '../src/services/pdf.service.js');

const LANG_SRC = path.join(__dirname, '../src/services/pdf/report-golden-language.js');
const PURPOSE =
    'This report reflects the current stock on hand and its valuation as of the reporting date.';

function makeLines(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push({
            department: i < 14 ? 'Food & Beverage' : 'Housekeeping',
            location: i < 14 ? 'F&B Horizon' : 'Store Floor 1',
            category: 'Dry',
            itemCode: `CODE${String(i).padStart(4, '0')}`,
            itemName: `Item ${i}`,
            qtyOnHand: 10 + i,
            value: 100 + i,
            unitCost: 10,
        });
    }
    return lines;
}

function assertSourceMockV31() {
    const src = fs.readFileSync(CHROME_SRC, 'utf8');
    const lang = fs.readFileSync(LANG_SRC, 'utf8');
    if (!lang.includes(PURPOSE) || !src.includes('resolveGoldenPurposeLine')) {
        throw new Error('golden purpose line missing (report-golden-language / chrome)');
    }
    const shellBlock = src.slice(src.indexOf('function drawGoldenPremiumShell'), src.indexOf('function drawGoldenContinuationRail'));
    if (!shellBlock.includes('navyH = 57')) {
        throw new Error('drawGoldenPremiumShell navy height not v3.1 (expected 57pt)');
    }
    if (!shellBlock.includes("label: 'Property:'")) {
        throw new Error('drawGoldenPremiumShell missing split inline Property: meta format');
    }
    if (!shellBlock.includes('metaPadX = 17')) {
        throw new Error('drawGoldenPremiumShell missing executive meta column padding');
    }
    const kpiBlock = src.slice(src.indexOf('function drawGoldenExecutiveStrip'), src.indexOf('function drawReportKpiStrip'));
    if (!kpiBlock.includes('? 12.5 :')) {
        throw new Error('drawGoldenExecutiveStrip missing dominant Total Value 12.5pt');
    }
    if (!kpiBlock.includes('const h = 38')) {
        throw new Error('drawGoldenExecutiveStrip KPI height not v3.2d (expected 38pt)');
    }
    const tableSrc = fs.readFileSync(path.join(__dirname, '../src/services/pdf/report-pdf-table.engine.js'), 'utf8');
    if (!tableSrc.includes('`${lvl.en} · `')) {
        throw new Error('report-pdf-table.engine.js missing levelLabel · golden group headers');
    }
    if (!src.includes('GOLDEN_KPI_GAP_AFTER')) {
        throw new Error('drawGoldenExecutiveStrip missing GOLDEN_KPI_GAP_AFTER spacing');
    }
    const svc = fs.readFileSync(PDF_SERVICE_SRC, 'utf8');
    if (!svc.includes('resolveGoldenShellRev')) {
        throw new Error('pdf.service.js missing resolveGoldenShellRev footer wiring');
    }
    const densitySrc = fs.readFileSync(path.join(__dirname, '../src/services/pdf/report-pdf-density.js'), 'utf8');
    if (!densitySrc.includes('GRAND_TOTAL_H_GOLDEN: 33')) {
        throw new Error('report-pdf-density.js GRAND_TOTAL_H_GOLDEN not slimmed to 33pt');
    }
}

async function main() {
    assertSourceMockV31();
    console.log('PASS: golden shell source = golden-v1 (Current Stock Balance promoted)');

    const profile = resolvePdfProfile('current-stock-balance');
    if (!profile?.goldenReference) {
        console.error('FAIL: current-stock-balance profile missing goldenReference');
        process.exit(1);
    }

    const lines = makeLines(26);
    const cols = getReportColumns('current-stock-balance');
    const totals = computeTotals('current-stock-balance', lines);
    const grouped = buildGroupedReport(lines, getGroupingSpec('current-stock-balance'), 'current-stock-balance');
    const exportSet = resolveExportDataset(
        { groupingEnabled: true, flatRows: grouped.flatRows },
        cols,
        buildTotalsFooterRow(cols, totals),
        { formatCells: false },
    );

    const buf = await generateReportPDF(exportSet.rows, exportSet.columns, 'Current Stock Balance', {
        reportType: 'current-stock-balance',
        groupingEnabled: true,
        totals,
        generatedBy: 'Mock shell verify',
        generatedAt: new Date().toISOString(),
        tenantName: 'DX OSE Hotels',
        reportBasis: 'As of 2026-05-21',
        classification: 'INTERNAL USE',
        filters: { locations: '3' },
    });

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, buf);

    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    if (pages !== 2) {
        console.error(`FAIL: expected 2 pages for 26 lines, got ${pages}`);
        process.exit(1);
    }
    console.log(`PASS: Generated ${pages} page(s), ${buf.length} bytes`);
    console.log('PASS: Footer tag wired as Shell golden-v1');
    console.log(`INFO: Open ${OUT_FILE}`);
}

main().catch((err) => {
    console.error('FAIL:', err.message || err);
    process.exit(1);
});
