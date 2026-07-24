#!/usr/bin/env node
'use strict';

/**
 * Golden Reporting Language v1 — Phases 1–4 rollout verification.
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
const { resolveGoldenShellRev } = require('../src/services/pdf/report-golden-language');
const { isGoldenReportType } = require('../src/services/pdf/report-golden-rollout.registry');

const OUT_DIR = path.join(__dirname, '../tmp/golden-stock-balance');

function countPages(buf) {
    return (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
}

function makeStockLines(n) {
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

function makeVarianceLines(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push({
            sessionNo: 'CNT-2605-0001',
            countDate: '2026-05-01',
            locationName: i < 14 ? 'F&B Horizon' : 'Store Floor 1',
            department: 'F&B',
            itemCode: `VAR${String(i).padStart(4, '0')}`,
            itemName: `Variance item ${i}`,
            bookQty: 10,
            countedQty: 10 + (i % 3 === 0 ? 1 : 0),
            varianceQty: i % 3 === 0 ? 1 : 0,
            varianceValue: i % 3 === 0 ? 10 + i : 0,
            status: 'POSTED',
        });
    }
    return lines;
}

function makeBreakageLines(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push({
            date: '2026-05-01',
            documentNo: `BRK-${String(i % 4).padStart(3, '0')}`,
            documentKey: `BRK-${String(i % 4).padStart(3, '0')}`,
            category: i < 10 ? 'Beverage' : 'Food',
            itemCode: `BR${String(i).padStart(4, '0')}`,
            itemName: `Breakage ${i}`,
            qty: 1 + (i % 3),
            lineValue: 20 + i,
            unitCost: 10,
            status: 'POSTED',
        });
    }
    return lines;
}

function makeTransferLines(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push({
            transferNo: `TRF-${String(i % 4).padStart(3, '0')}`,
            transferDate: '2026-05-01',
            type: 'INTERNAL',
            fromLocation: 'Main',
            toLocation: 'Floor 2',
            itemCode: `TR${String(i).padStart(4, '0')}`,
            itemName: `Transfer item ${i}`,
            qty: 2 + i,
            value: 30 + i,
            status: 'RECEIVED',
        });
    }
    return lines;
}

function makeFlatLines(reportType, n) {
    if (reportType === 'get-pass-report') {
        return Array.from({ length: n }, (_, i) => ({
            passNo: `GP-${String(i).padStart(4, '0')}`,
            status: 'OUT',
            borrowingEntity: 'Catering Co',
            expectedReturnDate: '2026-05-15',
            createdAt: '2026-05-01',
        }));
    }
    if (reportType === 'pending-operations-report') {
        return [
            { area: 'Open transfers', pendingCount: 3 },
            { area: 'Pending approvals', pendingCount: 2 },
            { area: 'Overdue get-passes', pendingCount: 1 },
        ];
    }
    return Array.from({ length: n }, (_, i) => ({
        transferNo: `OT-${String(i).padStart(4, '0')}`,
        status: 'IN_TRANSIT',
        fromLocation: 'A',
        toLocation: 'B',
        transferDate: '2026-05-01',
        receivedAt: '',
    }));
}

async function generatePdf(reportType, title, lines) {
    const profile = resolvePdfProfile(reportType);
    if (!profile?.goldenReference) {
        throw new Error(`${reportType}: missing goldenReference`);
    }
    const cols = getReportColumns(reportType);
    const totals = computeTotals(reportType, lines);
    const spec = getGroupingSpec(reportType);
    let rows = lines;
    if (profile.mode !== 'flat' && spec) {
        const grouped = buildGroupedReport(lines, spec, reportType);
        rows = grouped.flatRows;
    }
    const exportSet = resolveExportDataset(
        { groupingEnabled: profile.mode !== 'flat', flatRows: rows },
        cols,
        buildTotalsFooterRow(cols, totals),
        { formatCells: false },
    );
    const buf = await generateReportPDF(exportSet.rows, exportSet.columns, title, {
        reportType,
        groupingEnabled: profile.mode !== 'flat',
        totals,
        generatedBy: 'Golden rollout verify',
        generatedAt: new Date().toISOString(),
        tenantName: 'DX OSE Hotels',
        reportBasis: 'May 2026',
        classification: 'INTERNAL USE',
        filters: {},
    });
    return { buf, pages: countPages(buf), profile };
}

function assertSource() {
    const svc = fs.readFileSync(path.join(__dirname, '../src/services/pdf.service.js'), 'utf8');
    if (!svc.includes("profile?.mode !== 'flat'")) {
        throw new Error('pdf.service missing flat profile mode guard');
    }
    const evidence = fs.readFileSync(
        path.join(__dirname, '../src/services/pdf/evidence-pack-pdf.js'),
        'utf8',
    );
    if (!evidence.includes('stampGoldenEvidenceFooters')) {
        throw new Error('evidence-pack-pdf missing golden evidence adapter');
    }
    const getPass = fs.readFileSync(
        path.join(__dirname, '../src/services/pdf/get-pass-pdf.renderer.js'),
        'utf8',
    );
    if (!getPass.includes('resolveGoldenShellRev')) {
        throw new Error('get-pass renderer missing golden shell rev');
    }
}

async function main() {
    assertSource();
    console.log('PASS: Phases 2–4 source wiring');

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const phase1 = ['current-stock-balance', 'inventory-by-location', 'inventory-change-history', 'omc-report'];
    const phase2 = ['count-variance-report', 'breakage-loss-report', 'lost-items-register'];
    const phase3 = ['transfer-history', 'open-transfers', 'get-pass-report', 'pending-operations-report'];

    for (const id of [...phase1, ...phase2, ...phase3]) {
        if (!isGoldenReportType(id) && id !== 'current-stock-balance') {
            throw new Error(`${id} not registered as golden rollout type`);
        }
    }
    console.log('PASS: Golden rollout registry covers Phases 1–3');

    const stock = await generatePdf('current-stock-balance', 'Current Stock Balance', makeStockLines(26));
    fs.writeFileSync(path.join(OUT_DIR, 'verify-rollout-stock-balance.pdf'), stock.buf);
    if (stock.pages !== 2) throw new Error(`stock balance expected 2 pages, got ${stock.pages}`);
    if (resolveGoldenShellRev('current-stock-balance') !== 'golden-v1') {
        throw new Error('stock balance shell rev must be golden-v1');
    }
    console.log(`PASS: current-stock-balance — ${stock.pages} pages, golden-v1`);

    const variance = await generatePdf('count-variance-report', 'Count Variance', makeVarianceLines(26));
    fs.writeFileSync(path.join(OUT_DIR, 'verify-rollout-count-variance.pdf'), variance.buf);
    console.log(`PASS: count-variance-report — ${variance.pages} pages`);

    const breakage = await generatePdf('breakage-loss-report', 'Breakage & Loss', makeBreakageLines(24));
    fs.writeFileSync(path.join(OUT_DIR, 'verify-rollout-breakage-loss.pdf'), breakage.buf);
    console.log(`PASS: breakage-loss-report — ${breakage.pages} pages`);

    const transfer = await generatePdf('transfer-history', 'Transfer History', makeTransferLines(24));
    fs.writeFileSync(path.join(OUT_DIR, 'verify-rollout-transfer-history.pdf'), transfer.buf);
    console.log(`PASS: transfer-history — ${transfer.pages} pages`);

    const getPass = await generatePdf('get-pass-report', 'Get Pass Activity', makeFlatLines('get-pass-report', 12));
    fs.writeFileSync(path.join(OUT_DIR, 'verify-rollout-get-pass.pdf'), getPass.buf);
    console.log(`PASS: get-pass-report — ${getPass.pages} pages`);

    const pending = await generatePdf(
        'pending-operations-report',
        'Pending Operations',
        makeFlatLines('pending-operations-report', 3),
    );
    fs.writeFileSync(path.join(OUT_DIR, 'verify-rollout-pending-ops.pdf'), pending.buf);
    console.log(`PASS: pending-operations-report — ${pending.pages} pages`);

    const aliasProfile = resolvePdfProfile('variance-value-impact');
    if (aliasProfile?.id !== 'count-variance-report') {
        throw new Error('profile alias variance-value-impact failed');
    }
    console.log('PASS: Profile alias dedup (variance-value-impact → count-variance-report)');

    console.log('PASS: Golden v1 Phases 1–4 PDF rollout verification complete');
    console.log(`INFO: outputs in ${OUT_DIR}`);
}

main().catch((err) => {
    console.error('FAIL:', err.message || err);
    process.exit(1);
});
