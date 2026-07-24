#!/usr/bin/env node
'use strict';

/**
 * FINAL density tuning — page count + truncation + code single-line guards.
 */
const { buildGroupedReport } = require('../src/services/report-grouping.engine');
const { getGroupingSpec } = require('../src/services/report-family-registry');
const { prepareGroupedExport } = require('../src/utils/report-export.util');
const { getReportColumns } = require('../src/services/report-column-contracts');
const { generateReportPDF } = require('../src/services/pdf.service');
const {
    sanitizePdfText,
    truncateItemNameForPdf,
    preparePdfCellText,
    isCodeColumn,
} = require('../src/services/pdf/report-pdf-cell.util');
const { DENSITY } = require('../src/services/pdf/report-pdf-density');

let pass = 0;
let fail = 0;

function ok(msg) {
    pass++;
    console.log(`  PASS  ${msg}`);
}

function bad(msg) {
    fail++;
    console.error(`  FAIL  ${msg}`);
}

function countPdfPages(buffer) {
    const s = buffer.toString('latin1');
    const matches = s.match(/\/Type\s*\/Page\b/g);
    return matches ? matches.length : 0;
}

const longCatalog =
    'Flute Champagne 200ml / 7oz - H: 212mm / 8 1/4" - D: 67.5mm / 2 5/8" - Max Ø 222mm';

const trimmed = truncateItemNameForPdf(longCatalog);
if (trimmed.includes('212mm') || trimmed.includes('67.5mm')) bad('Item truncation still keeps dimension tail');
else ok(`Item truncation keeps identity: "${trimmed}"`);

const code = preparePdfCellText(
    { itemCode: '234976875633' },
    { key: 'itemCode', cellRole: 'code', maxLength: 22 },
    {},
);
if (code.includes('\n')) bad('Code cell contains newline');
else ok(`Code single-line: ${code}`);

if (isCodeColumn({ key: 'itemCode', cellRole: 'code' })) ok('Code column role detected');

if (DENSITY.MIN_ROW_H === 12) ok('Compact MIN_ROW_H=12');
else bad(`MIN_ROW_H unexpected: ${DENSITY.MIN_ROW_H}`);

function makeStockLines(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push({
            department: 'F&B',
            location: 'Main Store',
            category: 'Dry',
            itemCode: `234976875${String(i).padStart(3, '0')}`,
            itemName: i % 3 === 0 ? longCatalog : `Item ${i} Standard`,
            qtyOnHand: 10 + i,
            value: 100 + i,
            unitCost: 10,
        });
    }
    return lines;
}

function makeVarianceFlatRows(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push({
            sessionNo: 'CNT-2605-0001',
            locationName: 'Store Floor 1',
            itemCode: `9189308282${String(i).padStart(2, '0')}`,
            itemName: i % 2 === 0 ? longCatalog : `BISTROT JUG ${i}`,
            bookQty: 100 + i,
            countedQty: 98 + i,
            varianceQty: -2,
            varianceValue: -20,
            status: 'POSTED',
            countDate: '2026-05-19',
        });
    }
    const grouped = buildGroupedReport(lines, getGroupingSpec('count-variance-report'), 'count-variance');
    return prepareGroupedExport(
        { groupingEnabled: true, flatRows: grouped.flatRows },
        getReportColumns('count-variance-report'),
        { formatCells: false },
    );
}

(async () => {
    try {
        const stockLines = makeStockLines(26);
        const stockCols = getReportColumns('current-stock-balance').map((c) => ({
            header: c.header,
            key: c.key,
            width: c.width,
            format: c.format,
            align: c.align,
        }));
        const stockGrouped = buildGroupedReport(
            stockLines,
            getGroupingSpec('current-stock-balance'),
            'current-stock-balance',
        );
        const stockExport = prepareGroupedExport(
            { groupingEnabled: true, flatRows: stockGrouped.flatRows },
            getReportColumns('current-stock-balance'),
            { formatCells: false },
        );

        const stockBuf = await generateReportPDF(stockExport.rows, stockExport.columns, 'Stock 26 lines', {
            generatedBy: 'Density smoke',
            reportType: 'current-stock-balance',
            groupingEnabled: true,
            totals: { totalQty: 26 * 10, totalValue: 2600, rowCount: 26 },
        });
        const stockPages = countPdfPages(stockBuf);
        if (stockPages === 2) {
            ok(`Stock balance 26 lines → 2 pages`);
        } else {
            bad(`Stock balance 26 lines: ${stockPages} pages (expected 2)`);
        }

        // 30-line check — must also be 2 pages
        const stock30Lines = makeStockLines(30);
        const stock30Grouped = buildGroupedReport(
            stock30Lines,
            getGroupingSpec('current-stock-balance'),
            'current-stock-balance',
        );
        const stock30Export = prepareGroupedExport(
            { groupingEnabled: true, flatRows: stock30Grouped.flatRows },
            getReportColumns('current-stock-balance'),
            { formatCells: false },
        );
        const stock30Buf = await generateReportPDF(stock30Export.rows, stock30Export.columns, 'Stock 30 lines', {
            generatedBy: 'Density smoke',
            reportType: 'current-stock-balance',
            groupingEnabled: true,
            totals: { totalQty: 30 * 10, totalValue: 3000, rowCount: 30 },
        });
        const stock30Pages = countPdfPages(stock30Buf);
        if (stock30Pages === 2) {
            ok(`Stock balance 30 lines → 2 pages`);
        } else {
            bad(`Stock balance 30 lines: ${stock30Pages} pages (expected 2)`);
        }

        const cvExport = makeVarianceFlatRows(26);
        const cvBuf = await generateReportPDF(cvExport.rows, cvExport.columns, 'CV 26 lines', {
            generatedBy: 'Density smoke',
            reportType: 'count-variance-report',
            groupingEnabled: true,
            totals: { totalVarianceQty: -52, totalVarianceValue: -520, rowCount: 26 },
        });
        const cvPages = countPdfPages(cvBuf);
        if (cvPages === 2) {
            ok(`Count variance 26 lines → 2 pages`);
        } else {
            bad(`Count variance 26 lines: ${cvPages} pages (expected 2)`);
        }

        console.log('\n  v3.2c: KPI rail h=38, signatures h=34, footer mock-v3.2c');
        console.log(`  Pages: stock-26=${stockPages}, stock-30=${stock30Pages}, variance-26=${cvPages}`);
    } catch (e) {
        bad(`Render: ${e.message}`);
        console.error(e);
    }

    console.log(`\n--- PDF density: ${pass} passed, ${fail} failed ---`);
    process.exit(fail > 0 ? 1 : 0);
})();
