#!/usr/bin/env node
'use strict';

/**
 * Wave C — PDF presentation layer UAT (structure + render smoke).
 */
const fs = require('fs');
const path = require('path');
const { buildGroupedReport } = require('../src/services/report-grouping.engine');
const { getGroupingSpec } = require('../src/services/report-family-registry');
const { prepareGroupedExport } = require('../src/utils/report-export.util');
const { getReportColumns } = require('../src/services/report-column-contracts');
const {
    isGroupedExportData,
    classifyPdfRow,
    buildGroupStackAt,
    formatContinuationPath,
    extractLineColumns,
} = require('../src/services/pdf/report-pdf-presenter');
const { resolveTheme } = require('../src/services/pdf/report-pdf-theme');
const { resolvePdfClassification } = require('../src/services/pdf/report-pdf-signatures.util');
const { generateReportPDF } = require('../src/services/pdf.service');

const results = [];
const assert = (name, ok, detail = '') => {
    results.push({ name, pass: ok });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── Count Variance flatRows ──
const varianceLines = [
    { sessionNo: 'CNT-1', locationName: 'Store A', itemCode: 'A1', itemName: 'Item A', bookQty: 10, countedQty: 8, varianceQty: -2, varianceValue: -20 },
    { sessionNo: 'CNT-1', locationName: 'Store A', itemCode: 'A2', itemName: 'Item B', bookQty: 5, countedQty: 5, varianceQty: 0, varianceValue: 0 },
];
const cvGrouped = buildGroupedReport(varianceLines, getGroupingSpec('count-variance-report'), 'count-variance');
const cvExport = prepareGroupedExport({ groupingEnabled: true, flatRows: cvGrouped.flatRows }, getReportColumns('count-variance-report'), { formatCells: false });

assert('Count variance export is grouped', isGroupedExportData(cvExport.rows));
assert('Count variance has GROUP_HEADER', cvExport.rows.some((r) => r.rowType === 'GROUP_HEADER'));
assert('Count variance has GROUP_SUBTOTAL', cvExport.rows.some((r) => r.rowType === 'GROUP_SUBTOTAL'));
assert('Count variance theme resolved', resolveTheme('count-variance').accent === '#1e293b');

// ── Ledger flatRows ──
const ledgerLines = [
    { date: '2026-05-01', documentKey: 'D1', docNo: 'D1', itemCode: 'X', qtyIn: 0, qtyOut: 2, lineValue: -20 },
    { date: '2026-05-01', documentKey: 'D1', docNo: 'D1', itemCode: 'Y', qtyIn: 0, qtyOut: 1, lineValue: -10 },
];
const ledgerGrouped = buildGroupedReport(ledgerLines, getGroupingSpec('inventory-change-history'), 'ledger');
const ledgerExport = prepareGroupedExport({ groupingEnabled: true, flatRows: ledgerGrouped.flatRows }, getReportColumns('inventory-change-history'), { formatCells: false });
assert('Ledger export is grouped', isGroupedExportData(ledgerExport.rows));
assert('Ledger theme', resolveTheme('ledger').name.includes('Ledger'));

// ── Breakage flatRows ──
const brkLines = [
    { documentKey: 'BRK-1', documentNo: 'BRK-1', category: 'Glass', itemCode: 'G1', qty: 2, lineValue: 20 },
    { documentKey: 'BRK-1', documentNo: 'BRK-1', category: 'Glass', itemCode: 'G2', qty: 1, lineValue: 15 },
];
const brkGrouped = buildGroupedReport(brkLines, getGroupingSpec('breakage-loss-report'), 'breakage');
const brkExport = prepareGroupedExport({ groupingEnabled: true, flatRows: brkGrouped.flatRows }, getReportColumns('breakage-loss-report'), { formatCells: false });
assert('Breakage export is grouped', isGroupedExportData(brkExport.rows));

const omcLines = [
    { category: 'Bev', itemCode: 'B1', openingQty: 1, inQty: 2, outQty: 1, closingQty: 2, closingValue: 10 },
    { category: 'Dry', itemCode: 'D1', openingQty: 5, inQty: 0, outQty: 1, closingQty: 4, closingValue: 8 },
];
const omcGrouped = buildGroupedReport(omcLines, getGroupingSpec('omc-report'), 'omc');
const omcExport = prepareGroupedExport({ groupingEnabled: true, flatRows: omcGrouped.flatRows }, getReportColumns('omc-report'), { formatCells: false });
assert('OMC export is grouped', isGroupedExportData(omcExport.rows));
assert('OMC theme', resolveTheme('omc').accent === '#1e293b');

const govLines = [
    { moduleKey: 'Transfer', documentKey: 'T-1', date: '2026-05-01', action: 'APPROVE' },
    { moduleKey: 'Breakage', documentKey: 'B-1', date: '2026-05-02', action: 'POST' },
];
const govGrouped = buildGroupedReport(govLines, getGroupingSpec('audit-activity-report'), 'governance');
const govExport = prepareGroupedExport({ groupingEnabled: true, flatRows: govGrouped.flatRows }, getReportColumns('audit-activity-report'), { formatCells: false });
assert('Governance export is grouped', isGroupedExportData(govExport.rows));

const trfLines = [
    { transferNo: 'TR-1', documentKey: 'TR-1', date: '2026-05-01', qty: 2 },
    { transferNo: 'TR-2', documentKey: 'TR-2', date: '2026-05-02', qty: 1 },
];
const trfGrouped = buildGroupedReport(trfLines, getGroupingSpec('transfer-history'), 'transfers');
const trfExport = prepareGroupedExport({ groupingEnabled: true, flatRows: trfGrouped.flatRows }, getReportColumns('transfer-history'), { formatCells: false });
assert('Transfer export is grouped', isGroupedExportData(trfExport.rows));

assert('AUDITOR gets AUDIT COPY', resolvePdfClassification({ role: 'AUDITOR' }) === 'AUDIT COPY');
assert('Admin gets INTERNAL USE', resolvePdfClassification({ role: 'ADMIN' }) === 'INTERNAL USE');
assert('Query override AUDIT', resolvePdfClassification({ role: 'ADMIN' }, 'AUDIT_COPY') === 'AUDIT COPY');

// ── Row classification ──
const headerIdx = cvExport.rows.findIndex((r) => r.rowType === 'GROUP_HEADER');
assert('classifyPdfRow header', classifyPdfRow(cvExport.rows[headerIdx]) === 'header');
assert('classifyPdfRow line', classifyPdfRow({ rowType: 'LINE' }) === 'line');
assert('classifyPdfRow subtotal', classifyPdfRow({ rowType: 'GROUP_SUBTOTAL' }) === 'subtotal');

// ── Continuation path ──
const stack = buildGroupStackAt(cvExport.rows, cvExport.rows.length - 1);
assert('Group stack non-empty', stack.length > 0);
assert('Continuation path string', formatContinuationPath(stack).includes('›') || formatContinuationPath(stack).length > 0);

// ── Line columns exclude meta keys ──
const lineCols = extractLineColumns(cvExport.columns);
assert('Line columns exclude rowType', !lineCols.some((c) => c.key === 'rowType'));
assert('Line columns have item fields', lineCols.some((c) => c.key === 'itemName'));

// ── PDF render smoke (Count Variance + Ledger + Breakage) ──
async function renderSmoke(label, exportSet, familyId, cardId) {
    const buf = await generateReportPDF(exportSet.rows, exportSet.columns, label, {
        generatedBy: 'Wave C UAT',
        generatedAt: new Date().toISOString(),
        tenantName: 'DX OSE Test Property',
        reportType: cardId,
        familyId,
        groupingEnabled: true,
        classification: 'INTERNAL USE',
        totals: { rowCount: exportSet.rows.filter((r) => r.rowType === 'LINE').length },
    });
    assert(`${label} PDF buffer > 1KB`, buf.length > 1024, `${buf.length} bytes`);
    return buf;
}

(async () => {
    try {
        await renderSmoke('Count Variance', cvExport, 'count-variance', 'count-variance-report');
        await renderSmoke('Ledger', ledgerExport, 'ledger', 'inventory-change-history');
        await renderSmoke('Breakage', brkExport, 'breakage', 'breakage-loss-report');
        await renderSmoke('OMC', omcExport, 'omc', 'omc-report');
        await renderSmoke('Governance', govExport, 'governance', 'audit-activity-report');
        await renderSmoke('Transfers', trfExport, 'transfers', 'transfer-history');

        const largeLines = [];
        for (let s = 1; s <= 40; s++) {
            for (let l = 1; l <= 5; l++) {
                largeLines.push({
                    sessionNo: `CNT-${s}`,
                    locationName: `Loc-${l}`,
                    itemCode: `I-${s}-${l}`,
                    itemName: `Item ${s}-${l}`,
                    bookQty: 10,
                    countedQty: 9,
                    varianceQty: -1,
                    varianceValue: -5,
                });
            }
        }
        const largeGrouped = buildGroupedReport(largeLines, getGroupingSpec('count-variance-report'), 'count-variance');
        const largeExport = prepareGroupedExport(
            { groupingEnabled: true, flatRows: largeGrouped.flatRows },
            getReportColumns('count-variance-report'),
            { formatCells: false },
        );
        const t0 = Date.now();
        const largeBuf = await generateReportPDF(largeExport.rows, largeExport.columns, 'Large Variance', {
            reportType: 'count-variance-report',
            familyId: 'count-variance',
            groupingEnabled: true,
            totals: { rowCount: largeLines.length },
        });
        const elapsed = Date.now() - t0;
        assert('Large PDF renders', largeBuf.length > 5000, `${largeBuf.length} bytes`);
        assert('Large PDF under 30s', elapsed < 30000, `${elapsed}ms`);

        const outDir = path.join(__dirname, '../tmp/wave-c-uat');
        fs.mkdirSync(outDir, { recursive: true });
        const cvBuf = await generateReportPDF(cvExport.rows, cvExport.columns, 'Count Variance UAT', {
            generatedBy: 'UAT',
            reportType: 'count-variance-report',
            familyId: 'count-variance',
            groupingEnabled: true,
        });
        fs.writeFileSync(path.join(outDir, 'count-variance-sample.pdf'), cvBuf);
        console.log(`\nSample PDF written: ${path.join(outDir, 'count-variance-sample.pdf')}`);
    } catch (err) {
        assert('PDF render smoke', false, err.message);
    }

    const passed = results.filter((r) => r.pass).length;
    console.log(`\n--- Wave C PDF UAT: ${passed}/${results.length} ---`);
    process.exit(passed === results.length ? 0 : 1);
})();
