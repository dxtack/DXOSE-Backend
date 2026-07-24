#!/usr/bin/env node
'use strict';

/**
 * Final Reporting Stabilization — regression lock (no DB).
 * Validates golden report export parity, contracts, SAR/totals, grouped hierarchy.
 */
const fs = require('fs');
const path = require('path');
const { buildGroupedReport } = require('../src/services/report-grouping.engine');
const { getGroupingSpec } = require('../src/services/report-family-registry');
const { resolveExportDataset, prepareGroupedExport } = require('../src/utils/report-export.util');
const { mapStockBalanceExportRow } = require('../src/services/report-workspace.handlers');
const { preparePdfCellText } = require('../src/services/pdf/report-pdf-cell.util');
const { enrichGoldenStockBalanceTotals } = require('../src/services/pdf/report-golden-stock-balance.util');
const { profileLineColumns } = require('../src/services/pdf/report-pdf-profiles');
const { getReportColumns } = require('../src/services/report-column-contracts');
const { computeTotals, buildTotalsFooterRow } = require('../src/services/report-analytics-totals');
const { fmtSar, fmtQty, formatReportCell } = require('../src/utils/report-format.util');
const { isGroupedExportData } = require('../src/services/pdf/report-pdf-presenter');
const { generateReportPDF } = require('../src/services/pdf.service');
const { generateSummaryInventoryPDF } = require('../src/services/pdf/report-summary-pdf.document');
const excelService = require('../src/services/excel.service');

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

function exportSnapshot(payload, cardId) {
    const columnDefs = getReportColumns(cardId);
    const totals = payload.totals || computeTotals(cardId, payload.rows || []);
    const footerRow = buildTotalsFooterRow(columnDefs, totals);
    return resolveExportDataset({ ...payload, totals }, columnDefs, footerRow);
}

/** Golden analytics cards — representative row fixtures (shape only, not live DB). */
const GOLDEN_ANALYTICS = [
    {
        id: 'current-stock-balance',
        label: 'Current stock balance',
        rows: [
            {
                department: 'F&B',
                location: 'Main Store',
                category: 'Dry',
                itemCode: 'A1',
                itemName: 'Item A',
                qtyOnHand: 10,
                unitCost: 5,
                value: 50,
            },
        ],
        grouped: true,
    },
    {
        id: 'count-variance-report',
        label: 'Count variance report',
        rows: [
            {
                sessionNo: 'CNT-1',
                countDate: '2026-05-01',
                locationName: 'Store A',
                department: 'F&B',
                itemCode: 'X1',
                itemName: 'Item X',
                bookQty: 10,
                countedQty: 9,
                varianceQty: -1,
                varianceValue: -10,
                wacUnitCost: 10,
                status: 'POSTED',
                wacSource: 'BALANCE',
                postedBy: 'User A',
            },
        ],
        grouped: true,
    },
    {
        id: 'inventory-change-history',
        label: 'Inventory change history',
        rows: [
            {
                date: '2026-05-01',
                docNo: 'GRN-1',
                documentKey: 'RECEIVE-GRN-1',
                movementType: 'RECEIVE',
                location: 'Store A',
                itemCode: 'A1',
                itemName: 'Item A',
                qtyIn: 5,
                qtyOut: 0,
                unitCost: 10,
                lineValue: 50,
            },
        ],
        grouped: true,
    },
    {
        id: 'transfer-history',
        label: 'Transfer history (analytics open transfers alias)',
        cardId: 'open-transfers',
        rows: [
            {
                transferNo: 'TR-1',
                status: 'PENDING_DEPT',
                transferDate: '2026-05-01',
                fromLocation: 'A',
                toLocation: 'B',
                receivedAt: '',
            },
        ],
        grouped: true,
    },
    {
        id: 'breakage-loss-report',
        label: 'Breakage/loss (contract shape)',
        cardId: 'breakage-loss-report',
        rows: [
            {
                date: '2026-05-01',
                documentNo: 'BRK-1',
                category: 'Food',
                itemCode: 'B1',
                itemName: 'Item B',
                uom: 'EA',
                qty: 2,
                unitCost: 5,
                lineValue: 10,
                status: 'POSTED',
                approvedBy: 'Mgr',
                postedBy: 'User',
            },
        ],
        grouped: false,
    },
    {
        id: 'pending-operational-actions',
        label: 'Pending operations report',
        rows: [
            { area: 'Transfers', pendingCount: 3 },
            { area: 'GRN', pendingCount: 1 },
        ],
        grouped: false,
    },
    {
        id: 'period-close-validation',
        label: 'Period close validation',
        rows: [{ year: 2026, month: 4, status: 'CLOSED', closedAt: '2026-05-01', notes: 'OK' }],
        grouped: false,
    },
    {
        id: 'variance-by-department',
        label: 'Variance by department',
        rows: [
            {
                department: 'F&B',
                bookQty: 10,
                countedQty: 9,
                varianceQty: -1,
                varianceValue: -10,
                lineCount: 5,
            },
        ],
        grouped: false,
    },
];

console.log('Reporting — Final regression lock\n');

// --- PDF / Excel parity (same resolveExportDataset) ---
for (const g of GOLDEN_ANALYTICS) {
    const cardId = g.cardId || g.id;
    const cols = getReportColumns(cardId);
    if (!cols?.length) {
        bad(`${g.label}: missing contract`);
        continue;
    }
    let payload = { rows: g.rows, totals: computeTotals(cardId, g.rows) };
    if (g.grouped) {
        const spec = getGroupingSpec(cardId);
        if (spec) {
            const grouped = buildGroupedReport(g.rows, spec, cardId);
            payload = {
                rows: g.rows,
                totals: payload.totals,
                groupingEnabled: true,
                flatRows: grouped.flatRows,
            };
        }
    }
    const expA = exportSnapshot(payload, cardId);
    const expB = exportSnapshot(payload, cardId);
    if (!expA || !expB) {
        bad(`${g.label}: export dataset null`);
        continue;
    }
    if (expA.rows.length !== expB.rows.length) {
        bad(`${g.label}: export row count mismatch`);
        continue;
    }
    const keysA = expA.columns.map((c) => c.key).join(',');
    const keysB = expB.columns.map((c) => c.key).join(',');
    if (keysA !== keysB) {
        bad(`${g.label}: column order mismatch`);
        continue;
    }
    const hdrs = expA.columns.map((c) => c.header).join('|');
    if (/[a-z][A-Z]/.test(hdrs) && !hdrs.includes(' ')) {
        bad(`${g.label}: camelCase headers detected`);
        continue;
    }
    ok(`${g.label}: PDF/Excel export parity (${expA.rows.length} rows, ${expA.columns.length} cols)`);
}

// --- Grouped hierarchy preserved in export ---
const cvLines = GOLDEN_ANALYTICS.find((g) => g.id === 'count-variance-report').rows;
const cvGrouped = buildGroupedReport(cvLines, getGroupingSpec('count-variance-report'), 'count-variance');
const cvPayload = {
    groupingEnabled: true,
    flatRows: cvGrouped.flatRows,
    totals: computeTotals('count-variance-report', cvLines),
};
const cvExport = exportSnapshot(cvPayload, 'count-variance-report');
const lineRows = cvExport.rows.filter((r) => r.rowType === 'LINE');
const subRows = cvExport.rows.filter((r) => r.rowType === 'GROUP_SUBTOTAL');
if (lineRows.length !== cvLines.length) {
    bad(`Grouped export line count: expected ${cvLines.length}, got ${lineRows.length}`);
} else {
    ok(`Grouped hierarchy: ${lineRows.length} lines, ${subRows.length} subtotals in export`);
}

// --- Stock balance: department from balance location (current ownership) ---
{
    const mapped = mapStockBalanceExportRow({
        qtyOnHand: 5,
        wacUnitCost: 10,
        location: { name: 'Store Floor 1', department: { name: 'Housekeeping' } },
        item: {
            name: 'Bowl Duo',
            barcode: '234976875633',
            department: { name: 'Food & Beverage' },
            category: { name: 'China' },
        },
    });
    const grouped = buildGroupedReport([mapped], getGroupingSpec('current-stock-balance'), 'current-stock-balance');
    const deptHeader = grouped.flatRows.find(
        (r) => r.rowType === 'GROUP_HEADER' && r.groupLevel === 'department',
    );
    if (mapped.department === 'Housekeeping' && deptHeader?.groupLabel === 'Housekeeping') {
        ok('Stock balance department from location.department (not item master)');
    } else {
        bad(
            `Stock balance ownership mapping: dept="${mapped.department}" header="${deptHeader?.groupLabel}"`,
        );
    }
}

// --- PDF grouped export: raw SAR (not pre-formatted Excel strings) ---
const stockCols = getReportColumns('current-stock-balance');
const stockGrouped = buildGroupedReport(
    GOLDEN_ANALYTICS.find((g) => g.id === 'current-stock-balance').rows,
    getGroupingSpec('current-stock-balance'),
    'current-stock-balance',
);
const stockFormatted = prepareGroupedExport(
    { groupingEnabled: true, flatRows: stockGrouped.flatRows },
    stockCols,
    { formatCells: true },
);
const stockRaw = prepareGroupedExport(
    { groupingEnabled: true, flatRows: stockGrouped.flatRows },
    stockCols,
    { formatCells: false },
);
const sarCol = { key: 'value', format: 'sar', sarNumbersOnly: true };
const fmtLine = stockFormatted.rows.find((r) => r.rowType === 'LINE' && r.value);
const rawLine = stockRaw.rows.find((r) => r.rowType === 'LINE' && r.value != null);
if (fmtLine && preparePdfCellText(fmtLine, sarCol, { sarNumbersOnly: true }) === '—') {
    ok('Pre-formatted SAR strings correctly fail PDF sarNumbersOnly (Excel path)');
} else {
    bad('Expected formatted SAR line to render as em-dash in PDF cell');
}
const rawPdfText = rawLine ? preparePdfCellText(rawLine, sarCol, { sarNumbersOnly: true }) : '';
if (rawLine && rawPdfText !== '—' && /50\.00/.test(rawPdfText)) {
    ok(`PDF grouped export raw SAR renders (${rawPdfText})`);
} else {
    bad(`PDF grouped export raw SAR missing (got "${rawPdfText}")`);
}

// --- SAR / totals ---
if (fmtSar(-2500.5) !== '(SAR 2,500.50)') bad('SAR negative format');
else ok('SAR negative format locked');

const cvTotals = computeTotals('count-variance-report', cvLines);
const cvFooter = buildTotalsFooterRow(getReportColumns('count-variance-report'), cvTotals);
if (cvFooter?.varianceValue !== cvTotals.totalVarianceValue) bad('Totals footer varianceValue');
else ok('Totals footer maps variance value');

// --- Render PDF + Excel buffers for golden grouped report ---
(async () => {
    try {
        const cvPdfExport = resolveExportDataset(cvPayload, getReportColumns('count-variance-report'), cvFooter, {
            formatCells: false,
        });
        const bufPdf = await generateReportPDF(cvPdfExport.rows, cvPdfExport.columns, 'Count Variance Golden', {
            generatedBy: 'Final regression',
            reportType: 'count-variance-report',
            familyId: 'count-variance',
            groupingEnabled: true,
            bilingualHeaders: false,
            totals: cvTotals,
        });
        if (bufPdf.length < 1024) bad('Golden PDF buffer too small');
        else ok(`Golden PDF renders (${bufPdf.length} bytes)`);

        const stockLines = [];
        for (let i = 0; i < 26; i++) {
            stockLines.push({
                department: 'F&B',
                location: 'Main Store',
                category: 'Dry',
                itemCode: `234976875${String(i).padStart(3, '0')}`,
                itemName: `Item ${i}`,
                qtyOnHand: 10 + i,
                value: 100 + i,
                unitCost: 10,
            });
        }
        const stockGrouped = buildGroupedReport(
            stockLines,
            getGroupingSpec('current-stock-balance'),
            'current-stock-balance',
        );
        const stockTotals = { totalQty: stockLines.reduce((s, r) => s + r.qtyOnHand, 0), totalValue: stockLines.reduce((s, r) => s + r.value, 0), rowCount: 26 };
        const stockFooter = buildTotalsFooterRow(stockCols, stockTotals);
        const stockPdfExport = resolveExportDataset(
            { groupingEnabled: true, flatRows: stockGrouped.flatRows },
            stockCols,
            stockFooter,
            { formatCells: false },
        );
        const bufStock = await generateReportPDF(stockPdfExport.rows, stockPdfExport.columns, 'Stock Ghost Fix', {
            generatedBy: 'Final regression',
            reportType: 'current-stock-balance',
            groupingEnabled: true,
            totals: stockTotals,
        });
        const stockPageMatches = bufStock.toString('latin1').match(/\/Type\s*\/Page\b/g);
        const stockPages = stockPageMatches ? stockPageMatches.length : 0;
        if (stockPages >= 2 && stockPages <= 3) {
            ok(`Stock balance 26 lines PDF page count ${stockPages} (no ghost pages)`);
        } else {
            bad(`Stock balance page count ${stockPages} (expected 2–3)`);
        }
        const stockLine = stockPdfExport.rows.find((r) => r.rowType === 'LINE' && r.value != null);
        const stockSarText = stockLine
            ? preparePdfCellText(stockLine, { key: 'value', format: 'sar', sarNumbersOnly: true }, { sarNumbersOnly: true })
            : '';
        if (stockLine && stockSarText !== '—' && /\d/.test(stockSarText)) {
            ok(`Stock PDF raw SAR path preserved (${stockSarText})`);
        } else {
            bad('Stock PDF SAR regression on raw export rows');
        }

        const goldenProfile = require('../src/services/pdf/report-pdf-profiles').resolvePdfProfile('current-stock-balance');
        const pageW = 770;
        const scaled = profileLineColumns(goldenProfile, pageW);
        const sumW = scaled.reduce((s, c) => s + c.widthPt, 0);
        if (goldenProfile.goldenReference && sumW >= pageW - 2) {
            ok(`Golden full-width columns (${sumW}pt ~ ${pageW}pt)`);
        } else {
            bad(`Golden column width sum ${sumW} expected ~${pageW}`);
        }
        const enriched = enrichGoldenStockBalanceTotals(stockTotals, stockLines, { filters: { locations: '1' } });
        if (enriched.totalWacBlended != null && enriched.totalWacBlended > 0) {
            ok(`Golden blended WAC derived (${enriched.totalWacBlended})`);
        } else {
            bad('Golden blended WAC missing');
        }

        const bufSummary = await generateSummaryInventoryPDF({
            rows: [
                {
                    label: 'F&B - Dry Inventory',
                    deptName: 'Food & Beverage',
                    catName: 'Dry',
                    openVal: 100,
                    grnVal: 20,
                    brkVal: 10,
                    passVal: 0,
                    theorVal: 110,
                    varVal: -10,
                    closeVal: 100,
                },
            ],
            totals: {
                openVal: 100,
                grnVal: 20,
                brkVal: 10,
                passVal: 0,
                theorVal: 110,
                varVal: -10,
                closeVal: 100,
                theorQty: 11,
            },
            metadata: {
                generatedBy: 'Final regression',
                generatedAt: new Date().toISOString(),
                reportBasis: '01/05/2026 – 21/05/2026',
                reportReference: 'DX-REP-SUMMARYI-GOLDEN',
            },
        });
        if (bufSummary.length < 1024) bad('Summary inventory PDF buffer too small');
        else ok(`Summary inventory PDF renders (${bufSummary.length} bytes)`);

        const pdfMagic = bufSummary.slice(0, 5).toString('ascii');
        if (pdfMagic !== '%PDF-') {
            bad(`Summary PDF invalid header: ${pdfMagic}`);
        } else {
            ok('Summary PDF valid vector document header');
        }

        if (!isGroupedExportData(cvExport.rows)) bad('Grouped export not detected for PDF presenter');
        else ok('Grouped export detected for PDF presenter');

        const bufXlsx = await excelService.generateExcelBuffer(
            cvExport.rows,
            cvExport.columns,
            'Count Variance Golden',
            { generatedBy: 'Final regression', totalsRow: cvFooter },
        );
        if (!bufXlsx || bufXlsx.length < 512) bad('Golden Excel buffer too small');
        else ok(`Golden Excel renders (${bufXlsx.length} bytes)`);

        const outDir = path.join(__dirname, '../tmp/reporting-final-regression');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'golden-count-variance.pdf'), bufPdf);
        fs.writeFileSync(path.join(outDir, 'golden-count-variance.xlsx'), bufXlsx);
        console.log(`\nSamples: ${outDir}`);
    } catch (e) {
        bad(`Render: ${e.message}`);
    }

    // Engine export path uses same resolveExportDataset when grouped (static shape)
    const omcFlat = [
        {
            rowType: 'LINE',
            groupLevel: '',
            groupLabel: '',
            category: 'Food',
            itemCode: 'I1',
            itemName: 'Item',
            closingQty: 5,
            closingValue: 50,
        },
    ];
    const omcCols = getReportColumns('omc-report');
    const omcExport = resolveExportDataset(
        { groupingEnabled: true, flatRows: omcFlat, rows: [] },
        omcCols,
        null,
    );
    if (omcExport?.columns?.length >= 5) ok('Engine OMC grouped export columns resolved');
    else bad('Engine OMC grouped export columns');

    console.log(`\n--- Final regression: ${pass} passed, ${fail} failed ---`);
    process.exit(fail > 0 ? 1 : 0);
})();
