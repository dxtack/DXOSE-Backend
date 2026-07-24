#!/usr/bin/env node
'use strict';

/**
 * Wave 1A — PDF presentation smoke: row counts unchanged, SAR format, render success.
 */
const fs = require('fs');
const path = require('path');
const { buildGroupedReport } = require('../src/services/report-grouping.engine');
const { getGroupingSpec } = require('../src/services/report-family-registry');
const { prepareGroupedExport } = require('../src/utils/report-export.util');
const { getReportColumns } = require('../src/services/report-column-contracts');
const { isGroupedExportData } = require('../src/services/pdf/report-pdf-presenter');
const { generateReportPDF, generateStockReportVariancePDF } = require('../src/services/pdf.service');
const { fmtSar } = require('../src/utils/report-format.util');

const results = [];
const assert = (name, ok, detail = '') => {
    results.push({ name, pass: ok });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const varianceLines = [
    { sessionNo: 'CNT-1', locationName: 'Store A', itemCode: 'A1', itemName: 'Item A', bookQty: 10, countedQty: 8, varianceQty: -2, varianceValue: -20 },
    { sessionNo: 'CNT-1', locationName: 'Store A', itemCode: 'A2', itemName: 'Item B', bookQty: 5, countedQty: 5, varianceQty: 0, varianceValue: 0 },
];
const cvGrouped = buildGroupedReport(varianceLines, getGroupingSpec('count-variance-report'), 'count-variance');
const cvExport = prepareGroupedExport(
    { groupingEnabled: true, flatRows: cvGrouped.flatRows },
    getReportColumns('count-variance-report'),
    { formatCells: false },
);

assert('Grouped export row count', cvExport.rows.length === cvGrouped.flatRows.length);
assert('SAR negative format', fmtSar(-100) === '(SAR 100.00)');
assert('SAR positive format', fmtSar(1234.5) === 'SAR 1,234.50');

const mockStockReport = {
    reportNo: 'SR-TEST-1',
    status: 'POSTED',
    createdAt: new Date().toISOString(),
    location: { name: 'Main Store' },
    notes: 'UAT',
    createdByUser: { firstName: 'Test', lastName: 'User' },
    approvalRequest: { steps: [] },
    lines: [
        {
            item: { name: 'Item Alpha' },
            openingQty: 0,
            openingValue: 0,
            closingQty: 10,
            closingValue: 100,
            inwardQty: 12,
            inwardValue: 120,
            outwardQty: 2,
            outwardValue: 20,
        },
    ],
};

(async () => {
    try {
        const lineCount = cvExport.rows.filter((r) => r.rowType === 'LINE').length;
        const buf = await generateReportPDF(cvExport.rows, cvExport.columns, 'Count Variance Wave 1A', {
            generatedBy: 'Wave 1A smoke',
            reportType: 'count-variance-report',
            familyId: 'count-variance',
            groupingEnabled: true,
            totals: { totalVarianceQty: -2, totalVarianceValue: -20, rowCount: lineCount },
        });
        assert('Analytics PDF renders', buf.length > 1024, `${buf.length} bytes`);

        const stockBuf = await generateStockReportVariancePDF(mockStockReport);
        assert('Stock report variance PDF renders', stockBuf.length > 1024, `${stockBuf.length} bytes`);

        const flatBuf = await generateReportPDF(
            [
                { a: 1, b: 2 },
                { a: 3, b: 4 },
            ],
            [
                { header: 'A', key: 'a', width: 10, align: 'right', format: 'qty' },
                { header: 'B', key: 'b', width: 10, align: 'right', format: 'sar' },
            ],
            'Flat Table',
            { groupingEnabled: false },
        );
        assert('Flat PDF renders', flatBuf.length > 500);

        const outDir = path.join(__dirname, '../tmp/wave-1a-pdf');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'count-variance-wave1a.pdf'), buf);
        fs.writeFileSync(path.join(outDir, 'stock-report-variance-wave1a.pdf'), stockBuf);
        console.log(`\nSamples: ${outDir}`);
    } catch (err) {
        assert('PDF render', false, err.message);
    }

    const passed = results.filter((r) => r.pass).length;
    console.log(`\n--- Wave 1A PDF: ${passed}/${results.length} ---`);
    process.exit(passed === results.length ? 0 : 1);
})();
