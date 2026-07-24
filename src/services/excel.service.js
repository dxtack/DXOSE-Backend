const ExcelJS = require('exceljs');

const PALETTE = {
    NAVY: 'FF1E293B',
    SLATE: 'FF334155',
    LIGHT_GRAY: 'FFF1F5F9',
    ZEBRA: 'FFFAFBFC',
    TEXT_PRIMARY: 'FF0F172A',
    TEXT_MUTED: 'FF64748B',
    TEXT_ON_DARK: 'FFF1F5F9',
    TEXT_ON_DARK_BRIGHT: 'FFF8FAFC',
    VARIANCE_NEG: 'FFB91C1C',
    VARIANCE_POS: 'FF15803D',
};

const DATE_NUM_FMT = 'dd/mm/yyyy';
const DATETIME_NUM_FMT = 'dd/mm/yyyy hh:mm';

const MIN_WIDTH_BY_FORMAT = {
    date: 12,
    sar: 14,
    qty: 10,
    int: 8,
    text: 10,
};

const MIN_WIDTH_BY_KEY = {
    documentNo: 16,
    docNo: 14,
    transferNo: 14,
    itemName: 18,
    label: 16,
    sourceLabel: 16,
};

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function isValidCalendarYear(year) {
    return year >= 1900 && year <= 2100;
}

function isDateTimeValue(value) {
    if (value instanceof Date) {
        return value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0;
    }
    if (typeof value !== 'string' || !value.trim()) return false;
    return /T\d{2}:\d{2}/.test(value) || /\d{1,2}:\d{2}/.test(value);
}

function parseExcelDate(raw) {
    if (raw == null || raw === '') return null;
    if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime())) return null;
        return isValidCalendarYear(raw.getFullYear()) ? raw : null;
    }

    if (typeof raw === 'number' && raw > 1 && raw < 100000) {
        const d = new Date(EXCEL_EPOCH + raw * 86400000);
        if (!Number.isNaN(d.getTime()) && isValidCalendarYear(d.getUTCFullYear())) {
            return d;
        }
        return null;
    }

    const s = String(raw).trim();

    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (isoDate) {
        const y = +isoDate[1];
        const m = +isoDate[2] - 1;
        const d = +isoDate[3];
        if (isValidCalendarYear(y)) return new Date(y, m, d);
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
        const d = new Date(s);
        if (!Number.isNaN(d.getTime()) && isValidCalendarYear(d.getFullYear())) return d;
        return null;
    }

    if (/^\d{1,6}$/.test(s)) return null;

    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    if (!isValidCalendarYear(d.getFullYear())) return null;
    return d;
}

function resolveColumnWidth(col) {
    const declared = col.width || 12;
    const byFormat = MIN_WIDTH_BY_FORMAT[col.format || 'text'] || MIN_WIDTH_BY_FORMAT.text;
    const byKey = MIN_WIDTH_BY_KEY[col.key] || 0;
    return Math.max(declared, byFormat, byKey);
}

function getWidthCap(col, densityProfile) {
    const wide = densityProfile === 'wide';
    if (col.format === 'sar') return wide ? 20 : 18;
    if (col.format === 'date') return 14;
    if (col.key === 'label' || col.format === 'text') return wide ? 30 : 28;
    return wide ? 24 : 22;
}

function measureCellWidth(value, col) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') {
        if (col.format === 'sar') return 14;
        if (col.format === 'qty') return 11;
        return 10;
    }
    if (value instanceof Date) {
        return isDateTimeValue(value) ? 16 : 12;
    }
    return String(value).length + 1;
}

const MOVEMENT_COLORS = {
    INBOUND: 'FF166534',
    OUTBOUND: 'FF9B2C2C',
    ADJ_POS: 'FF0369A1',
};

function resolveMovementSemanticRole(col, accentProfile) {
    if (accentProfile !== 'omc-movement') return null;
    const role = col.semanticRole;
    if (role === 'inbound' || role === 'outbound' || role === 'adj') return role;
    if (['grnQty', 'tfrInQty', 'returnQty'].includes(col.key)) return 'inbound';
    if (['breakageQty', 'lostQty', 'tfrOutQty', 'issueQty'].includes(col.key)) return 'outbound';
    if (col.key === 'adjQty') return 'adj';
    return null;
}

function applyOmcMovementFont(cell, role, value) {
    if (typeof value !== 'number' || value === 0) return;
    if (role === 'inbound') {
        cell.font = { ...(cell.font || {}), color: { argb: MOVEMENT_COLORS.INBOUND } };
        return;
    }
    if (role === 'outbound' && value > 0) {
        cell.font = { ...(cell.font || {}), color: { argb: MOVEMENT_COLORS.OUTBOUND } };
        return;
    }
    if (role === 'adj') {
        cell.font = {
            ...(cell.font || {}),
            color: { argb: value < 0 ? MOVEMENT_COLORS.OUTBOUND : MOVEMENT_COLORS.ADJ_POS },
        };
    }
}

const FILTER_LABELS = {
    startDate: 'From',
    endDate: 'To',
    asOfDate: 'As of',
    departmentIds: 'Departments',
    categoryId: 'Category',
    locationCount: 'Locations',
};

function formatMetadataFilters(filters) {
    if (!filters || typeof filters !== 'object') return '';
    const parts = [];
    const f = filters;
    if (f.startDate && f.endDate) {
        parts.push(`Period: ${f.startDate} – ${f.endDate}`);
    } else if (f.asOfDate) {
        parts.push(`As of: ${f.asOfDate}`);
    } else if (f.startDate) {
        parts.push(`From: ${f.startDate}`);
    } else if (f.endDate) {
        parts.push(`To: ${f.endDate}`);
    }
    if (f.departmentIds) parts.push(`Departments: ${f.departmentIds}`);
    if (f.categoryId) parts.push(`Category: ${f.categoryId}`);
    if (f.locationCount != null && f.locationCount !== '') {
        parts.push(`Locations: ${f.locationCount}`);
    }
    if (f.snapshotBasis) parts.push(f.snapshotBasis);
    for (const [key, value] of Object.entries(f)) {
        if (value == null || value === '' || value === 0) continue;
        if (['startDate', 'endDate', 'asOfDate', 'departmentIds', 'categoryId', 'locationCount', 'snapshotBasis'].includes(key)) {
            continue;
        }
        parts.push(`${FILTER_LABELS[key] || key}: ${value}`);
    }
    return parts.join('  ·  ');
}

function styleMetadataCell(cell, { font, alignment, border } = {}) {
    if (font) cell.font = font;
    if (alignment) cell.alignment = alignment;
    if (border) cell.border = border;
}

function assignCellValue(cell, raw, col) {
    if (raw == null || raw === '') {
        cell.value = '';
        return;
    }
    if (col.format === 'date') {
        const d = parseExcelDate(raw);
        if (d) {
            cell.value = d;
            cell.numFmt = isDateTimeValue(raw) || isDateTimeValue(d) ? DATETIME_NUM_FMT : DATE_NUM_FMT;
            return;
        }
        cell.value = raw;
        return;
    }
    if (typeof raw === 'number') {
        cell.value = raw;
        if (col.format === 'sar') cell.numFmt = '"SAR "#,##0.00';
        else if (col.format === 'qty') cell.numFmt = '#,##0.00';
        else if (col.format === 'int') cell.numFmt = '#,##0';
        return;
    }
    cell.value = raw;
}

/**
 * Generates an Excel workbook buffer from JSON data
 * @param {Array} data Array of objects representing rows
 * @param {Array} columns Array of column definitions: { header: 'Name', key: 'name', width: 20 }
 * @param {String} reportTitle The name of the worksheet tab
 * @param {Object} metadata Optional metadata like filters applied, generatedAt, etc.
 * @returns {Buffer} The Excel file buffer
 */
const generateExcelBuffer = async (data, columns, reportTitle = 'Report', metadata = {}) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = metadata.generatedBy || 'OS&E System';
    workbook.created = metadata.generatedAt ? new Date(metadata.generatedAt) : new Date();

    const sheet = workbook.addWorksheet(reportTitle.substring(0, 31));

    sheet.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.65, bottom: 0.65, header: 0.3, footer: 0.3 },
    };

    // ── Metadata header rows ──────────────────────────────────────────────────
    let startRow = 1;
    const metaAlign = { vertical: 'middle', wrapText: false };
    const metaMutedFont = { size: 8, color: { argb: PALETTE.TEXT_MUTED } };
    const metaSeparator = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

    if (Object.keys(metadata).length > 0) {
        const titleRow = sheet.getRow(startRow);
        titleRow.height = 20;
        styleMetadataCell(titleRow.getCell(1), {
            font: { bold: true, size: 12, color: { argb: PALETTE.TEXT_PRIMARY } },
            alignment: metaAlign,
        });
        titleRow.getCell(1).value = reportTitle;
        startRow++;

        const genRow = sheet.getRow(startRow);
        genRow.height = 14;
        const generatedAt = metadata.generatedAt ? new Date(metadata.generatedAt) : new Date();
        styleMetadataCell(genRow.getCell(1), {
            font: metaMutedFont,
            alignment: metaAlign,
        });
        genRow.getCell(1).value = `Generated ${generatedAt.toLocaleString('en-GB')}  ·  ${metadata.generatedBy || 'System'}`;
        startRow++;

        const filterLine = formatMetadataFilters(metadata.filters);
        if (filterLine) {
            const filterRow = sheet.getRow(startRow);
            filterRow.height = 14;
            styleMetadataCell(filterRow.getCell(1), {
                font: metaMutedFont,
                alignment: metaAlign,
                border: metaSeparator,
            });
            filterRow.getCell(1).value = filterLine;
            startRow++;
        } else {
            genRow.getCell(1).border = metaSeparator;
        }

        const spacerRow = sheet.addRow([]);
        spacerRow.height = 6;
        startRow++;
    }

    const contentWidths = columns.map((col) => Math.max(
        resolveColumnWidth(col),
        (col.header || '').length + 1,
    ));

    // ── Column header row — dark navy ─────────────────────────────────────────
    const headerRow = sheet.getRow(startRow);
    headerRow.height = 18;
    columns.forEach((col, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = col.header;
        cell.font = { bold: true, size: 9, color: { argb: PALETTE.TEXT_ON_DARK } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.NAVY } };
        const isNumeric = col.format === 'qty' || col.format === 'sar' || col.format === 'int';
        cell.alignment = {
            horizontal: col.align === 'right' || isNumeric ? 'right' : 'left',
            vertical: 'middle',
        };
        sheet.getColumn(index + 1).width = contentWidths[index];
    });

    // Freeze header rows
    sheet.views = [{ state: 'frozen', ySplit: startRow }];

    const accentProfile = metadata.accentProfile || null;
    const densityProfile = metadata.densityProfile || null;

    // ── Data rows ─────────────────────────────────────────────────────────────
    data.forEach((row, rowIndex) => {
        const dataRow = sheet.getRow(startRow + 1 + rowIndex);
        const rowType = row.rowType || '';
        const isGroupHeader   = rowType === 'GROUP_HEADER';
        const isGroupSubtotal = rowType === 'GROUP_SUBTOTAL';
        const isGrandTotal    = rowType === 'GRAND_TOTAL' || row._isTotalsRow === true;
        const isDataRow       = !isGroupHeader && !isGroupSubtotal && !isGrandTotal;

        dataRow.height = isGrandTotal ? 18 : isGroupHeader ? 15 : 13;

        columns.forEach((col, colIndex) => {
            const cell = dataRow.getCell(colIndex + 1);
            const raw  = row[col.key];
            const isNumeric = col.format === 'qty' || col.format === 'sar' || col.format === 'int';

            assignCellValue(cell, raw, col);

            const measured = measureCellWidth(cell.value, col);
            if (measured > contentWidths[colIndex]) {
                contentWidths[colIndex] = measured;
            }

            const isLabelCell = (isGroupHeader || isGroupSubtotal)
                && typeof cell.value === 'string'
                && cell.value !== '';

            // ── Alignment ──────────────────────────────────────────────────
            cell.alignment = {
                horizontal: col.align === 'right' || isNumeric ? 'right' : 'left',
                vertical: 'middle',
                wrapText: col.key === 'itemName' || col.key === 'item_name' || isLabelCell,
            };

            // ── Row type styling ───────────────────────────────────────────
            if (isGrandTotal) {
                cell.font = { bold: true, size: 9.5, color: { argb: PALETTE.TEXT_ON_DARK_BRIGHT } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.NAVY } };
            } else if (isGroupHeader) {
                cell.font = { bold: true, size: 8.5, color: { argb: PALETTE.TEXT_ON_DARK } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.SLATE } };
            } else if (isGroupSubtotal) {
                cell.font = { italic: true, bold: true, size: 8, color: { argb: PALETTE.TEXT_PRIMARY } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
            } else if (isDataRow && rowIndex % 2 === 0) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.ZEBRA } };
            }

            // ── Variance semantic coloring (data rows only) ────────────────
            if (isDataRow && (col.key === 'varianceQty' || col.key === 'varianceValue')) {
                if (typeof raw === 'number' && raw !== 0) {
                    const argb = raw < 0 ? PALETTE.VARIANCE_NEG : PALETTE.VARIANCE_POS;
                    cell.font = { ...(cell.font || {}), color: { argb }, bold: raw < 0 };
                }
            }

            // ── OMC movement semantic coloring (line + subtotal rows) ────────
            if ((isDataRow || isGroupSubtotal) && accentProfile === 'omc-movement') {
                const movementRole = resolveMovementSemanticRole(col, accentProfile);
                if (movementRole) {
                    applyOmcMovementFont(cell, movementRole, cell.value);
                }
            }

            // ── Numeric formatting pass (qty/sar) ──────────────────────────
            if (isNumeric && typeof cell.value === 'number') {
                if      (col.format === 'sar') cell.numFmt = '"SAR "#,##0.00';
                else if (col.format === 'qty') cell.numFmt = '#,##0.00';
            }
        });
    });

    columns.forEach((col, index) => {
        const cap = getWidthCap(col, densityProfile);
        sheet.getColumn(index + 1).width = Math.min(
            Math.max(contentWidths[index], resolveColumnWidth(col)),
            cap,
        );
    });

    if (columns.length > 0 && data.length > 0) {
        sheet.autoFilter = {
            from: { row: startRow, column: 1 },
            to: { row: startRow + data.length, column: columns.length },
        };
    }

    return await workbook.xlsx.writeBuffer();
};

module.exports = {
    generateExcelBuffer,
};
