#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — PDF presentation: sanitization, dynamic rows, profiles, extraction.
 */
const fs = require('fs');
const path = require('path');

function extractPdfText(buf) {
    return buf.toString('latin1');
}
const { buildGroupedReport } = require('../src/services/report-grouping.engine');
const { getGroupingSpec } = require('../src/services/report-family-registry');
const { prepareGroupedExport } = require('../src/utils/report-export.util');
const { getReportColumns } = require('../src/services/report-column-contracts');
const { generateReportPDF } = require('../src/services/pdf.service');
const { generateSummaryInventoryPDF } = require('../src/services/pdf/report-summary-pdf.document');
const { sanitizePdfText } = require('../src/services/pdf/report-pdf-cell.util');
const { resolvePdfProfile } = require('../src/services/pdf/report-pdf-profiles');
const { registerPdfFonts, resolveFontFile } = require('../src/services/pdf/report-pdf-fonts');

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

const longName =
    'MR. CHEF Insalatiera\nSalad Bowl 162 cl - 54 3/4 oz\nh 97 mm - 3 3/4"\nMax Ø 222 mm';

const sanitized = sanitizePdfText(longName, { maxLength: 95 });
if (!sanitized.includes('\n')) ok('Sanitizer collapses newlines');
else bad('Sanitizer still contains newlines');

if (sanitized.includes('Ø') || sanitized.includes('Dia')) ok('Sanitizer normalizes diameter symbol');
else bad('Sanitizer diameter handling');

const profile = resolvePdfProfile('count-variance-report');
if (profile?.lineColumns?.length === 7) ok('Count variance PDF profile has 7 line columns');
else bad(`Count variance profile columns: ${profile?.lineColumns?.length}`);

if (resolveFontFile) {
    const fontPath = resolveFontFile([
        path.join(__dirname, '../assets/fonts/NotoSans-Regular.ttf'),
        path.join(__dirname, '../assets/fonts/ArialUnicode.ttf'),
    ]);
    if (fontPath) ok(`Unicode font resolved: ${path.basename(fontPath)}`);
    else bad('No Unicode font file found in assets/fonts');
}

const varianceLines = [
    {
        sessionNo: 'CNT-2605-0001',
        locationName: 'Store Floor 1',
        itemCode: '918930828267',
        itemName: longName,
        bookQty: 235,
        countedQty: 233,
        varianceQty: -2,
        varianceValue: null,
        wacUnitCost: null,
        status: 'POSTED',
        wacSource: 'STOCK_BALANCE',
        postedBy: 'Amr FC',
        countDate: '2026-05-19',
    },
];

const cvGrouped = buildGroupedReport(varianceLines, getGroupingSpec('count-variance-report'), 'count-variance');
const cvExport = prepareGroupedExport(
    { groupingEnabled: true, flatRows: cvGrouped.flatRows },
    getReportColumns('count-variance-report'),
    { formatCells: false },
);

(async () => {
    try {
        const cvBuf = await generateReportPDF(cvExport.rows, cvExport.columns, 'Count Variance Phase 1', {
            generatedBy: 'Phase 1 smoke',
            reportType: 'count-variance-report',
            familyId: 'count-variance',
            groupingEnabled: true,
            totals: { totalVarianceQty: -2, totalVarianceValue: 0, rowCount: 1, wacMissingCount: 1 },
        });
        if (cvBuf.length > 2000) ok(`Count variance PDF renders (${cvBuf.length} bytes)`);
        else bad('Count variance PDF too small');

        const cvMagic = cvBuf.slice(0, 5).toString('ascii');
        if (cvMagic === '%PDF-') ok('Count variance PDF valid header');
        else bad(`Count variance invalid header: ${cvMagic}`);

        const summaryBuf = await generateSummaryInventoryPDF({
            rows: [
                {
                    label: 'F&B - Dry Inventory',
                    deptName: 'Food & Beverage',
                    catName: 'Dry',
                    openVal: 1000,
                    grnVal: 200,
                    brkVal: 50,
                    passVal: 0,
                    theorVal: 1150,
                    varVal: -10,
                    closeVal: 1140,
                },
            ],
            totals: {
                openVal: 1000,
                grnVal: 200,
                brkVal: 50,
                passVal: 0,
                theorVal: 1150,
                varVal: -10,
                closeVal: 1140,
                theorQty: 100,
            },
            metadata: {
                generatedBy: 'Phase 1 smoke',
                generatedAt: new Date().toISOString(),
                tenantName: 'DX OSE',
                reportBasis: '01/05/2026 – 21/05/2026',
                reportReference: 'DX-REP-SUMMARYI-TEST',
            },
        });

        if (summaryBuf.length > 2000) ok(`Summary portrait PDF renders (${summaryBuf.length} bytes)`);
        else bad('Summary PDF too small');

        const sumMagic = summaryBuf.slice(0, 5).toString('ascii');
        if (sumMagic === '%PDF-') ok('Summary PDF valid header');
        else bad(`Summary invalid header: ${sumMagic}`);

        const stockLines = [
            {
                rowType: 'LINE',
                department: 'F&B',
                location: 'Main',
                category: 'Dry',
                itemCode: 'A1',
                itemName: longName,
                qtyOnHand: 10,
                value: 500,
                unitCost: 50,
            },
        ];
        const stockCols = getReportColumns('current-stock-balance').map((c) => ({
            header: c.header,
            key: c.key,
            width: c.width,
            format: c.format,
            align: c.align,
        }));
        const stockBuf = await generateReportPDF(stockLines, stockCols, 'Stock Balance Phase 1', {
            generatedBy: 'Phase 1 smoke',
            reportType: 'current-stock-balance',
            groupingEnabled: false,
            totals: { totalQty: 10, totalValue: 500 },
        });
        if (stockBuf.length > 1500) ok(`Current stock balance PDF renders (${stockBuf.length} bytes)`);
        else bad('Stock balance PDF too small');

        const outDir = path.join(__dirname, '../tmp/reporting-pdf-phase1');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'count-variance-phase1.pdf'), cvBuf);
        fs.writeFileSync(path.join(outDir, 'summary-phase1.pdf'), summaryBuf);
        fs.writeFileSync(path.join(outDir, 'stock-balance-phase1.pdf'), stockBuf);
        console.log(`\nSamples: ${outDir}`);
    } catch (e) {
        bad(`Render: ${e.message}`);
        console.error(e);
    }

    console.log(`\n--- PDF Phase 1: ${pass} passed, ${fail} failed ---`);
    process.exit(fail > 0 ? 1 : 0);
})();
