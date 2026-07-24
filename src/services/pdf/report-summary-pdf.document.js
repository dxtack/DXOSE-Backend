'use strict';

const PDFDocument = require('pdfkit');
const { TOKENS } = require('./report-pdf-design-tokens');
const { ENTERPRISE_BRAND } = require('./report-pdf-enterprise');
const { drawEvidencePackHeader } = require('./report-pdf-components');
const { createEvidenceLayout, drawEvidenceMiniHeader } = require('./report-pdf-layout');
const { buildReportReference } = require('../../utils/report-format.util');
const { registerPdfFonts } = require('./report-pdf-fonts');
const { formatPdfCell, sanitizePdfText, truncateItemNameForPdf } = require('./report-pdf-cell.util');
const { DENSITY } = require('./report-pdf-density');
const { drawCompactApprovalStrip, stampThreeZoneFooters, drawGoldenPremiumShell } = require('./report-pdf-chrome');
const { drawGrandTotalBand } = require('./report-pdf-table.engine');

const C = TOKENS.color;
const T = TOKENS;

const PORTRAIT_MARGINS = { top: 40, bottom: 48, left: 42, right: 42 };

const MOVEMENT_COLUMNS = {
    list: [
        { key: 'label', header: 'Department', widthPt: 118, format: 'text', align: 'left', maxLines: 1, maxLength: 42 },
        { key: 'openVal', header: 'Opening', widthPt: 62, format: 'sar', align: 'right', sarNumbersOnly: true, maxLines: 1 },
        { key: 'grnVal', header: 'GRN', widthPt: 58, format: 'sar', align: 'right', sarNumbersOnly: true, maxLines: 1 },
        { key: 'brkVal', header: 'Breakage', widthPt: 58, format: 'sar', align: 'right', sarNumbersOnly: true, maxLines: 1 },
        { key: 'passVal', header: 'Gate pass', widthPt: 58, format: 'sar', align: 'right', sarNumbersOnly: true, maxLines: 1 },
        { key: 'theorVal', header: 'Movement', widthPt: 62, format: 'sar', align: 'right', sarNumbersOnly: true, maxLines: 1 },
        { key: 'varVal', header: 'Variance', widthPt: 58, format: 'sar', align: 'right', sarNumbersOnly: true, maxLines: 1 },
        { key: 'closeVal', header: 'Closing', widthPt: 62, format: 'sar', align: 'right', sarNumbersOnly: true, maxLines: 1 },
    ],
    totalWidth: 0,
};
MOVEMENT_COLUMNS.totalWidth = MOVEMENT_COLUMNS.list.reduce((s, c) => s + c.widthPt, 0);

const OPTIONAL_COLUMN_KEYS = {
    grn: 'grnVal',
    brk: 'brkVal',
    pass: 'passVal',
    theor: 'theorVal',
};
const ALWAYS_VISIBLE_KEYS = new Set(['label', 'openVal', 'varVal', 'closeVal']);

function resolveVisibleColumns(visibleGroupIds) {
    let filtered;
    if (!visibleGroupIds || !Array.isArray(visibleGroupIds)) {
        filtered = MOVEMENT_COLUMNS.list.filter((col) => ALWAYS_VISIBLE_KEYS.has(col.key));
    } else {
        const extra = new Set(visibleGroupIds.map((id) => OPTIONAL_COLUMN_KEYS[id]).filter(Boolean));
        const visibleKeys = new Set([...ALWAYS_VISIBLE_KEYS, ...extra]);
        filtered = MOVEMENT_COLUMNS.list.filter((col) => visibleKeys.has(col.key));
    }

    // Scale columns proportionally to always fill the original full table width
    const targetWidth = MOVEMENT_COLUMNS.totalWidth;
    const currentWidth = filtered.reduce((s, c) => s + c.widthPt, 0);
    const scale = targetWidth / currentWidth;
    let usedWidth = 0;
    return filtered.map((col, i) => {
        const w = i === filtered.length - 1
            ? targetWidth - usedWidth
            : Math.round(col.widthPt * scale);
        usedWidth += w;
        return { ...col, widthPt: w };
    });
}

const HEADER_H = DENSITY.HEADER_H;
const MIN_ROW_H = DENSITY.MIN_ROW_H;
const DEPT_BAND_H = 14;
const BODY_SIZE = DENSITY.BODY_FONT_SIZE;

function formatDateTime(value) {
    return value ? new Date(value).toLocaleString('en-GB') : '—';
}

function formatReviewPeriodLabel(reportBasis) {
    if (!reportBasis || reportBasis === '—') return reportBasis || '—';
    const match = reportBasis.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return reportBasis;
    const d = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
}

function groupRowsByDepartment(rows) {
    const map = new Map();
    for (const row of rows) {
        const dept = row.deptName || 'Other';
        if (!map.has(dept)) map.set(dept, []);
        map.get(dept).push(row);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function drawSummaryKpis(doc, layout, totals) {
    const fonts = registerPdfFonts(doc);
    if (!totals) return;

    const openVal = totals.openVal ?? 0;
    const closeVal = totals.closeVal ?? 0;
    const varVal = totals.varVal ?? 0;
    const varPct = totals.theorVal !== 0
        ? ((varVal / totals.theorVal) * 100).toFixed(2)
        : '0.00';

    const cards = [
        { label: 'OPENING (SAR)', value: formatPdfCell(openVal, 'sar', { sarNumbersOnly: false }) },
        { label: 'CLOSING (SAR)', value: formatPdfCell(closeVal, 'sar', { sarNumbersOnly: false }) },
        { label: 'VARIANCE (SAR)', value: formatPdfCell(varVal, 'sar', { sarNumbersOnly: false }) },
        { label: 'VARIANCE %', value: `${varPct}%` },
    ];

    const h = 40;
    layout.ensureSpace(h + 8);
    const y = doc.y;
    const ml = layout.marginLeft;
    const pw = layout.pageWidth;
    const w = Math.floor(pw / cards.length);

    doc.fillColor('#f4f7fb').rect(ml, y, pw, h).fill();
    doc.strokeColor('#d1d9e6').lineWidth(0.5).moveTo(ml, y).lineTo(ml + pw, y).stroke();
    doc.strokeColor('#d1d9e6').lineWidth(0.35).moveTo(ml, y + h).lineTo(ml + pw, y + h).stroke();

    let x = ml;
    cards.forEach((card, i) => {
        if (i > 0) {
            doc.strokeColor('#d1d9e6').lineWidth(0.4)
                .moveTo(x, y + 6).lineTo(x, y + h - 6).stroke();
        }
        doc.save();
        doc.fillColor('#64748b').font(fonts.body).fontSize(5.5)
            .text(card.label, x + 10, y + 8, {
                width: w - 14, characterSpacing: 0.5, lineBreak: false,
            });
        doc.fillColor(C.navy.primary).font(fonts.bold).fontSize(10)
            .text(card.value, x + 10, y + 23, { width: w - 14, lineBreak: false });
        doc.restore();
        x += w;
    });

    doc.y = y + h + 8;
}

function drawMovementHeader(doc, y, marginLeft, fonts, cols, totalWidth) {
    const colList = cols || MOVEMENT_COLUMNS.list;
    const colWidth = totalWidth || MOVEMENT_COLUMNS.totalWidth;
    doc.fillColor(C.navy.tableHeader).rect(marginLeft, y, colWidth, HEADER_H).fill();
    let x = marginLeft;
    colList.forEach((col) => {
        doc.fillColor(C.text.onDark).font(fonts.bold).fontSize(7.5)
            .text(col.header, x + 4, y + 5, { width: col.widthPt - 8, align: col.align, lineBreak: false });
        x += col.widthPt;
    });
    return y + HEADER_H;
}

function drawMovementRow(doc, y, row, marginLeft, fonts, zebra, cols, totalWidth) {
    const colList = cols || MOVEMENT_COLUMNS.list;
    const colWidth = totalWidth || MOVEMENT_COLUMNS.totalWidth;
    const bg = zebra ? C.surface.page : C.surface.panel;
    const label = truncateItemNameForPdf(row.catName || row.label, { maxLength: 42 });
    let rowH = MIN_ROW_H;

    doc.fillColor(bg).rect(marginLeft, y, colWidth, rowH).fill();
    let x = marginLeft;
    colList.forEach((col) => {
        const w = col.widthPt;
        let text = '—';
        let rowTextColor = C.text.primary;
        if (col.key === 'label') {
            text = label;
        } else {
            const raw = row[col.key];
            if (raw != null && raw !== '') {
                text = formatPdfCell(raw, col.format, { sarNumbersOnly: true });
                if (col.key === 'varVal') {
                    const n = Number(raw);
                    if (n > 0) rowTextColor = '#15803d';
                    else if (n < 0) rowTextColor = '#b91c1c';
                }
            }
        }
        const align = col.align === 'right' ? 'right' : 'left';
        doc.fillColor(rowTextColor).font(fonts.body).fontSize(BODY_SIZE)
            .text(text, x + 3, y + 2, { width: w - 6, align, lineBreak: false, ellipsis: true });
        x += w;
    });
    doc.strokeColor(C.border.subtle).lineWidth(0.35)
        .moveTo(marginLeft, y + rowH).lineTo(marginLeft + colWidth, y + rowH).stroke();
    return y + rowH;
}

/**
 * Portrait executive summary inventory PDF (presentation only).
 */
function generateSummaryInventoryPDF(payload) {
    const { rows, totals, metadata = {}, visibleGroupIds } = payload;
    const visibleCols = resolveVisibleColumns(visibleGroupIds);
    const tableWidth = visibleCols.reduce((s, c) => s + c.widthPt, 0);
    const generatedAt = metadata.generatedAt || new Date().toISOString();
    const reportReference = metadata.reportReference || buildReportReference('summary-inventory', generatedAt);

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'portrait',
            margins: PORTRAIT_MARGINS,
            bufferPages: true,
        });

        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        registerPdfFonts(doc);
        const fonts = doc._pdfFontMeta;

        const marginLeft = PORTRAIT_MARGINS.left;
        const pageWidth = doc.page.width - marginLeft - PORTRAIT_MARGINS.right;

        const layout = createEvidenceLayout(doc, {
            marginLeft,
            marginRight: PORTRAIT_MARGINS.right,
            onNewPage: (d) =>
                drawEvidenceMiniHeader(
                    d,
                    {
                        title: 'Summary Inventory Report',
                        reportReference,
                        generatedBy: metadata.generatedBy || 'System',
                        generatedAt,
                        accent: C.navy.primary,
                    },
                    layout,
                ),
        });
        layout.pageWidth = pageWidth;
        layout.marginLeft = marginLeft;
        layout.headerOptions = { title: 'Summary Inventory Report', reportReference, generatedAt };
        layout.drawMiniHeader = (d) => drawEvidenceMiniHeader(d, layout.headerOptions, layout);
        layout.bottomLimit = () => doc.page.height - 44;

        drawGoldenPremiumShell(doc, layout, {
            title: 'MONTH-END INVENTORY REPORT',
            classification: metadata.classification || 'INTERNAL USE',
            documentNo: reportReference,
            generatedAt,
            generatedBy: metadata.generatedBy || 'System',
            tenantName: metadata.tenantName || ENTERPRISE_BRAND.platformName,
            reportBasis: formatReviewPeriodLabel(metadata.reportBasis),
            reportScope: 'All departments',
            purposeLine: 'This review documents the month-end inventory movement — opening position, receipts, breakage, gate pass, and closing balance — for period-close governance.',
        });

        drawSummaryKpis(doc, layout, totals);

        let tableY = drawMovementHeader(doc, doc.y, marginLeft, fonts, visibleCols, tableWidth);
        const departments = groupRowsByDepartment(rows);
        let zebra = 0;

        departments.forEach(([deptName, deptRows]) => {
            if (tableY + DEPT_BAND_H + MIN_ROW_H > layout.bottomLimit()) {
                doc.addPage();
                layout.drawMiniHeader(doc, layout.headerOptions, layout);
                tableY = drawMovementHeader(doc, doc.y, marginLeft, fonts, visibleCols, tableWidth);
            }

            doc.fillColor(C.surface.muted).rect(marginLeft, tableY, tableWidth, DEPT_BAND_H).fill();
            doc.fillColor(C.navy.primary).rect(marginLeft, tableY, 3, DEPT_BAND_H).fill();
            doc.fillColor(C.text.primary).font(fonts.bold).fontSize(9)
                .text(sanitizePdfText(deptName, { maxLength: 60 }), marginLeft + 10, tableY + 6, {
                    width: pageWidth - 20,
                    lineBreak: false,
                });
            tableY += DEPT_BAND_H + 2;

            deptRows.forEach((row) => {
                if (tableY + MIN_ROW_H > layout.bottomLimit()) {
                    doc.addPage();
                    layout.drawMiniHeader(doc, layout.headerOptions, layout);
                    tableY = drawMovementHeader(doc, doc.y, marginLeft, fonts, visibleCols, tableWidth);
                }
                tableY = drawMovementRow(doc, tableY, row, marginLeft, fonts, zebra % 2 === 0, visibleCols, tableWidth);
                zebra += 1;
            });
        });

        if (totals) {
            if (tableY + MIN_ROW_H + 4 > layout.bottomLimit()) {
                doc.addPage();
                layout.drawMiniHeader(doc, layout.headerOptions, layout);
                tableY = doc.y;
            }
            doc.strokeColor('#c9a84c').lineWidth(0.75)
                .moveTo(marginLeft, tableY).lineTo(marginLeft + tableWidth, tableY).stroke();
            doc.fillColor(C.navy.tableHeader).rect(marginLeft, tableY, tableWidth, MIN_ROW_H).fill();

            const grandValues = {
                openVal: totals.openVal,
                grnVal: totals.grnVal,
                brkVal: totals.brkVal,
                passVal: totals.passVal,
                theorVal: totals.theorVal,
                varVal: totals.varVal,
                closeVal: totals.closeVal,
            };
            let gx = marginLeft;
            visibleCols.forEach((col, idx) => {
                const w = col.widthPt;
                let text;
                let textColor = '#ffffff';
                if (idx === 0) {
                    text = 'GRAND TOTAL';
                } else {
                    const raw = grandValues[col.key];
                    text = raw != null ? formatPdfCell(raw, col.format, { sarNumbersOnly: true }) : '—';
                    if (col.key === 'varVal' && raw != null) {
                        const n = Number(raw);
                        if (n > 0) textColor = '#86efac';
                        else if (n < 0) textColor = '#fca5a5';
                    }
                }
                const align = col.align === 'right' ? 'right' : 'left';
                doc.fillColor(textColor).font(fonts.bold).fontSize(BODY_SIZE)
                    .text(text, gx + 3, tableY + 2, { width: w - 6, align, lineBreak: false, ellipsis: true });
                gx += w;
            });
            tableY += MIN_ROW_H;
        }

        doc.y = tableY + 8;
        drawCompactApprovalStrip(doc, layout, metadata);
        stampThreeZoneFooters(doc, layout, {
            ...metadata,
            reportReference,
            documentSuffix: 'Summary Inventory',
        });

        doc.end();
    });
}

module.exports = {
    generateSummaryInventoryPDF,
    MOVEMENT_COLUMNS,
};
