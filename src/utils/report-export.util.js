'use strict';

const { formatReportCell } = require('./report-format.util');

/**
 * Build export rows/columns from grouped flatRows.
 * @param {object} [options]
 * @param {boolean} [options.formatCells=true] — pass false for PDF and Excel (raw numbers/dates).
 */
function prepareGroupedExport(payload, columnDefs, options = {}) {
    const flatRows = payload.flatRows || [];
    if (!payload.groupingEnabled || !flatRows.length) {
        return null;
    }

    const formatCells = options.formatCells !== false;

    const lineColumns = (columnDefs || []).map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width || 12,
        format: c.format || 'text',
        align: c.align || 'left',
    }));

    // Business-facing columns only — rowType kept in row objects for styling, not as a column
    const columns = [...lineColumns];

    /** Map grouping levelType → primary column key (Breakage uses sourceLabel/documentNo). */
    const LEVEL_TYPE_TO_COLUMN = Object.freeze({
        source: 'sourceLabel',
        document: 'documentNo',
        department: 'department',
        location: 'location',
        section: 'sectionGroup',
        module: 'moduleKey',
    });

    function resolveLabelColumnKey(groupLevel) {
        if (!groupLevel) return lineColumns[0]?.key;
        const direct = lineColumns.find((c) => c.key === groupLevel)?.key;
        if (direct) return direct;
        const mapped = LEVEL_TYPE_TO_COLUMN[groupLevel];
        if (mapped && lineColumns.some((c) => c.key === mapped)) return mapped;
        if (groupLevel === 'document' && lineColumns.some((c) => c.key === 'documentKey')) {
            return 'documentKey';
        }
        if (groupLevel === 'document' && lineColumns.some((c) => c.key === 'docNo')) {
            return 'docNo';
        }
        return lineColumns[0]?.key;
    }

    const rows = flatRows.map((row) => {
        // rowType/groupLevel/groupLabel/depth ride on every row object for PDF renderer
        // and Excel styling hooks — they are NOT in the columns array so ExcelJS never
        // writes them to cells; they stay invisible to the spreadsheet consumer.
        const out = {
            rowType:    row.rowType    || 'LINE',
            groupLevel: row.groupLevel ?? '',
            groupLabel: row.groupLabel ?? '',
        };
        if (row.depth != null) out.depth = row.depth;

        if (row.rowType === 'GROUP_HEADER') {
            const labelColKey = resolveLabelColumnKey(row.groupLevel);
            for (const col of lineColumns) {
                out[col.key] = col.key === labelColKey ? (row.groupLabel || '—') : '';
            }
        } else if (row.rowType === 'GROUP_SUBTOTAL') {
            // P2 #25 — label only. Never write qty/value into subtotal rows: worksheet SUM()
            // over the column would otherwise count lines + nested subtotals + footer (~4×).
            const labelColKey = resolveLabelColumnKey(row.groupLevel);
            const prefix = row.groupLevel === 'location' ? 'Subtotal · ' : 'Subtotal — ';
            for (const col of lineColumns) {
                out[col.key] = col.key === labelColKey ? `${prefix}${row.groupLabel || ''}` : '';
            }
        } else {
            for (const col of lineColumns) {
                const raw = row[col.key];
                out[col.key] = raw == null ? '' : formatCells ? formatReportCell(raw, col.format) : raw;
            }
        }
        return out;
    });

    return { rows, columns };
}

/**
 * Resolve export dataset: grouped flatRows or legacy rows + footer.
 * @param {object} [options]
 * @param {boolean} [options.formatCells=true] — pass false for PDF and Excel (raw numbers/dates).
 * @param {boolean} [options.flatLineRowsOnly] — when true, export payload.rows only (flat PDF profiles).
 */
function resolveExportDataset(payload, columnDefs, footerRow, options = {}) {
    const useFlatLines = options.flatLineRowsOnly === true;

    if (!useFlatLines) {
        const grouped = prepareGroupedExport(payload, columnDefs, options);
        if (grouped) {
            if (footerRow) {
                const totalRow = { rowType: 'GRAND_TOTAL', groupLabel: 'TOTAL' };
                for (const col of columnDefs || []) {
                    if (footerRow[col.key] != null) totalRow[col.key] = footerRow[col.key];
                }
                grouped.rows.push(totalRow);
            }
            return grouped;
        }
    }

    const columns = columnDefs?.length
        ? columnDefs.map((c) => ({
              header: c.header,
              key: c.key,
              width: c.width || 12,
              format: c.format || 'text',
              align: c.align || 'left',
          }))
        : [];

    const rows = (payload.rows || []).filter((row) => {
        const kind = row.rowType || 'LINE';
        return kind === 'LINE' || kind === undefined;
    });
    const exportRows = footerRow ? [...rows, footerRow] : rows;
    return { rows: exportRows, columns };
}

module.exports = {
    prepareGroupedExport,
    resolveExportDataset,
};
