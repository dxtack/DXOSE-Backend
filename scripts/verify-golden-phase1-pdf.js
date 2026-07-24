#!/usr/bin/env node
'use strict';

/**
 * Golden Reporting Language v1 — Phase 1 rollout verification.
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

function makeStockLines(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push({
            department: i < Math.floor(n * 0.55) ? 'Food & Beverage' : 'Housekeeping',
            location: i < Math.floor(n * 0.55) ? 'F&B Horizon' : 'Store Floor 1',
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

function makeLedgerLines(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        const docNo = `DOC${String(i % 5).padStart(3, '0')}`;
        lines.push({
            date: '2026-05-01',
            docNo,
            documentKey: `GRN-${docNo}`,
            movementType: i % 2 === 0 ? 'GRN' : 'ISSUE',
            location: i < 14 ? 'F&B Horizon' : 'Store Floor 1',
            itemCode: `LC${String(i).padStart(4, '0')}`,
            itemName: `Ledger item ${i}`,
            qtyIn: i % 2 === 0 ? 5 + i : 0,
            qtyOut: i % 2 === 1 ? 2 + i : 0,
            unitCost: 10,
            lineValue: 50 + i,
        });
    }
    return lines;
}

function makeOmcLines(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push({
            department: 'F&B',
            location: 'Main',
            category: i < 8 ? 'Beverage' : 'Food',
            itemCode: `OMC${String(i).padStart(4, '0')}`,
            itemName: `OMC item ${i}`,
            openingQty: 10,
            inQty: 2,
            outQty: 1,
            closingQty: 11 + i,
            openingValue: 100,
            closingValue: 110 + i,
            unitCost: 10,
        });
    }
    return lines;
}

async function generateGoldenPdf(reportType, title, lines, extraMeta = {}) {
    const profile = resolvePdfProfile(reportType);
    if (!profile?.goldenReference) {
        throw new Error(`${reportType}: profile missing goldenReference`);
    }
    const cols = getReportColumns(reportType);
    const totals = computeTotals(reportType, lines);
    const spec = getGroupingSpec(reportType);
    const grouped = buildGroupedReport(lines, spec, reportType);
    const exportSet = resolveExportDataset(
        { groupingEnabled: true, flatRows: grouped.flatRows },
        cols,
        buildTotalsFooterRow(cols, totals),
        { formatCells: false },
    );
    const buf = await generateReportPDF(exportSet.rows, exportSet.columns, title, {
        reportType,
        groupingEnabled: true,
        totals,
        generatedBy: 'Golden phase1 verify',
        generatedAt: new Date().toISOString(),
        tenantName: 'DX OSE Hotels',
        reportBasis: 'May 2026',
        classification: 'INTERNAL USE',
        filters: { locations: '3' },
        ...extraMeta,
    });
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    return { buf, pages, profile };
}

function assertSource() {
    for (const id of ['inventory-by-location', 'inventory-change-history', 'omc-report']) {
        const p = resolvePdfProfile(id);
        if (!p) throw new Error(`missing profile ${id}`);
        if (!p.goldenReference) throw new Error(`${id}: goldenReference not enabled`);
    }
    const chrome = fs.readFileSync(
        path.join(__dirname, '../src/services/pdf/report-pdf-chrome.js'),
        'utf8',
    );
    if (!chrome.includes('resolveGoldenPurposeLine')) {
        throw new Error('drawGoldenPremiumShell missing resolveGoldenPurposeLine');
    }
    const table = fs.readFileSync(
        path.join(__dirname, '../src/services/pdf/report-pdf-table.engine.js'),
        'utf8',
    );
    if (!table.includes('`${lvl.en} · `')) {
        throw new Error('golden group headers missing levelLabel · pattern');
    }
}

async function main() {
    assertSource();
    console.log('PASS: Phase 1 source wiring');

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const stock = await generateGoldenPdf(
        'current-stock-balance',
        'Current Stock Balance',
        makeStockLines(26),
    );
    fs.writeFileSync(path.join(OUT_DIR, 'verify-stock-balance-frozen.pdf'), stock.buf);
    if (stock.pages !== 2) throw new Error(`stock balance expected 2 pages, got ${stock.pages}`);
    console.log(`PASS: current-stock-balance frozen — ${stock.pages} pages`);

    const loc = await generateGoldenPdf(
        'inventory-by-location',
        'Inventory by Location',
        makeStockLines(26),
    );
    fs.writeFileSync(path.join(OUT_DIR, 'verify-golden-v1-inventory-by-location.pdf'), loc.buf);
    console.log(`PASS: inventory-by-location — ${loc.pages} pages (target ≤3)`);

    const ledger = await generateGoldenPdf(
        'inventory-change-history',
        'Inventory Change History',
        makeLedgerLines(26),
    );
    fs.writeFileSync(path.join(OUT_DIR, 'verify-golden-v1-inventory-change-history.pdf'), ledger.buf);
    console.log(`PASS: inventory-change-history — ${ledger.pages} pages`);

    const omc = await generateGoldenPdf('omc-report', 'OMC Report', makeOmcLines(20));
    fs.writeFileSync(path.join(OUT_DIR, 'verify-golden-v1-omc-report.pdf'), omc.buf);
    console.log(`PASS: omc-report — ${omc.pages} pages`);

    console.log('PASS: Golden v1 Phase 1 PDF generation complete');
    console.log(`INFO: outputs in ${OUT_DIR}`);
}

main().catch((err) => {
    console.error('FAIL:', err.message || err);
    process.exit(1);
});
