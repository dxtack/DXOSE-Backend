'use strict';

/**
 * P2 #25 — grouped Excel export must not put SUM-able numbers on subtotal rows.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareGroupedExport, resolveExportDataset } = require('../utils/report-export.util');
const { buildGroupedReport } = require('./report-grouping.engine');

const BREAKAGE_COLUMNS = [
    { header: 'Date', key: 'date', format: 'date' },
    { header: 'Source', key: 'sourceLabel' },
    { header: 'Document', key: 'documentNo' },
    { header: 'Qty', key: 'qty', format: 'number' },
    { header: 'Value', key: 'lineValue', format: 'money' },
];

test('P2 #25 — Excel export qty SUM equals line totals (no ghost subtotal numbers)', () => {
    const lines = [
        {
            date: '2026-07-20',
            sourceLabel: 'Operational',
            documentNo: 'BRK-1',
            documentKey: 'BRK-1',
            qty: 10,
            lineValue: 100,
        },
        {
            date: '2026-07-21',
            sourceLabel: 'Operational',
            documentNo: 'BRK-2',
            documentKey: 'BRK-2',
            qty: 5,
            lineValue: 50,
        },
    ];
    const grouping = {
        levels: [
            { field: 'sourceLabel', levelType: 'source' },
            { field: 'documentKey', levelType: 'document' },
        ],
        subtotalKeys: ['qty', 'lineValue'],
    };
    const grouped = buildGroupedReport(lines, grouping, 'breakage');
    const payload = {
        groupingEnabled: true,
        flatRows: grouped.flatRows,
        rows: lines,
        totals: { totalQty: 15, totalValue: 150 },
    };
    const { rows } = prepareGroupedExport(payload, BREAKAGE_COLUMNS, { formatCells: false });

    const lineQtySum = rows
        .filter((r) => r.rowType === 'LINE')
        .reduce((s, r) => s + Number(r.qty || 0), 0);
    const allQtySum = rows.reduce((s, r) => s + (r.qty === '' || r.qty == null ? 0 : Number(r.qty)), 0);
    const subtotalNumericCells = rows.filter(
        (r) => r.rowType === 'GROUP_SUBTOTAL' && (Number(r.qty) > 0 || Number(r.lineValue) > 0),
    );

    assert.equal(lineQtySum, 15);
    assert.equal(allQtySum, 15, 'subtotal rows must not contribute to column SUM');
    assert.equal(subtotalNumericCells.length, 0);

    // Subtotal labels land on sourceLabel / documentNo — not the Date column.
    const subtotals = rows.filter((r) => r.rowType === 'GROUP_SUBTOTAL');
    assert.ok(subtotals.length > 0);
    for (const row of subtotals) {
        assert.equal(row.date, '', 'date column must stay empty on subtotals');
        assert.match(String(row.sourceLabel || row.documentNo || ''), /Subtotal/);
    }
});

test('P2 #25 — resolveExportDataset footer still carries grand total once', () => {
    const lines = [{ date: '2026-07-20', sourceLabel: 'Operational', documentNo: 'BRK-1', documentKey: 'BRK-1', qty: 3, lineValue: 30 }];
    const grouping = {
        levels: [{ field: 'sourceLabel', levelType: 'source' }],
        subtotalKeys: ['qty', 'lineValue'],
    };
    const grouped = buildGroupedReport(lines, grouping, 'breakage');
    const payload = { groupingEnabled: true, flatRows: grouped.flatRows, rows: lines };
    const footer = { rowType: 'GRAND_TOTAL', qty: 3, lineValue: 30 };
    const { rows } = resolveExportDataset(payload, BREAKAGE_COLUMNS, footer, { formatCells: false });
    const grand = rows.filter((r) => r.rowType === 'GRAND_TOTAL');
    assert.equal(grand.length, 1);
    assert.equal(Number(grand[0].qty), 3);
});
