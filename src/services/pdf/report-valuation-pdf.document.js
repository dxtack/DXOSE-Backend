'use strict';

const PDFDocument = require('pdfkit');
const { TOKENS } = require('./report-pdf-design-tokens');
const { ENTERPRISE_BRAND } = require('./report-pdf-enterprise');
const { createEvidenceLayout, drawEvidenceMiniHeader } = require('./report-pdf-layout');
const { buildReportReference } = require('../../utils/report-format.util');
const { registerPdfFonts } = require('./report-pdf-fonts');
const { formatPdfCell, sanitizePdfText, truncateItemNameForPdf } = require('./report-pdf-cell.util');
const { DENSITY } = require('./report-pdf-density');
const { drawCompactApprovalStrip, stampThreeZoneFooters, drawGoldenPremiumShell } = require('./report-pdf-chrome');

const C = TOKENS.color;

const REPORT_TITLE = 'Inventory Carrying Value Review';

const PORTRAIT_MARGINS = { top: 40, bottom: 48, left: 42, right: 42 };

// Portrait A4 available width = 595 - 42 - 42 = 511pt
const VALUATION_COLUMNS = [
    { key: 'department', header: 'Department',       widthPt: 62,  format: 'text', align: 'left'  },
    { key: 'location',   header: 'Location',         widthPt: 68,  format: 'text', align: 'left'  },
    { key: 'category',   header: 'Category',         widthPt: 70,  format: 'text', align: 'left'  },
    { key: 'itemName',   header: 'Item',              widthPt: 133, format: 'text', align: 'left'  },
    { key: 'qtyOnHand',  header: 'Qty on hand',      widthPt: 52,  format: 'qty',  align: 'right' },
    { key: 'unitCost',   header: 'Unit cost (WAC)',   widthPt: 66,  format: 'sar',  align: 'right', sarNumbersOnly: true },
    { key: 'totalValue', header: 'Carrying value',    widthPt: 60,  format: 'sar',  align: 'right', sarNumbersOnly: true },
];
const TABLE_WIDTH = VALUATION_COLUMNS.reduce((s, c) => s + c.widthPt, 0); // 511

const HEADER_H  = DENSITY.HEADER_H;
const MIN_ROW_H = DENSITY.MIN_ROW_H;
const BODY_SIZE = DENSITY.BODY_FONT_SIZE;
const DEPT_BAND_H = 14;

function formatAsOfDate(asOfDate) {
    if (!asOfDate) return '—';
    const d = new Date(asOfDate);
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
}

function groupRowsByDepartment(rows) {
    const map = new Map();
    for (const row of rows) {
        const dept = String(row.department || 'Other');
        if (!map.has(dept)) map.set(dept, []);
        map.get(dept).push(row);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function drawKpiStrip(doc, layout, kpis) {
    const fonts = registerPdfFonts(doc);
    const cards = [
        { label: 'TOTAL CARRYING VALUE (SAR)', value: formatPdfCell(kpis.totalValue, 'sar', { sarNumbersOnly: false }) },
        { label: 'LINES',                       value: String(kpis.rowCount) },
        { label: 'LOCATIONS',                   value: String(kpis.locationCount) },
        { label: 'TOTAL QTY ON HAND',           value: formatPdfCell(kpis.totalQtyOnHand, 'qty', {}) },
        { label: 'BLENDED WAC (SAR)',            value: kpis.blendedWac != null ? Number(kpis.blendedWac).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' },
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
            doc.strokeColor('#d1d9e6').lineWidth(0.4).moveTo(x, y + 6).lineTo(x, y + h - 6).stroke();
        }
        doc.save();
        doc.fillColor('#64748b').font(fonts.body).fontSize(5.5)
            .text(card.label, x + 10, y + 8, { width: w - 14, characterSpacing: 0.5, lineBreak: false });
        const isHero = i === 0;
        const valueSize = isHero ? 13 : 10;
        const valueY    = isHero ? y + 20 : y + 23;
        doc.fillColor(C.navy.primary).font(fonts.bold).fontSize(valueSize)
            .text(card.value, x + 10, valueY, { width: w - 14, lineBreak: false });
        doc.restore();
        x += w;
    });

    doc.y = y + h + 8;
}

function drawTableHeader(doc, y, marginLeft, fonts) {
    doc.fillColor(C.navy.tableHeader).rect(marginLeft, y, TABLE_WIDTH, HEADER_H).fill();
    let x = marginLeft;
    VALUATION_COLUMNS.forEach((col) => {
        doc.fillColor(C.text.onDark).font(fonts.bold).fontSize(7.5)
            .text(col.header, x + 4, y + 5, { width: col.widthPt - 8, align: col.align, lineBreak: false });
        x += col.widthPt;
    });
    return y + HEADER_H;
}

function drawTableRow(doc, y, row, marginLeft, fonts, zebra) {
    const bg = zebra ? C.surface.page : C.surface.panel;
    doc.fillColor(bg).rect(marginLeft, y, TABLE_WIDTH, MIN_ROW_H).fill();
    let x = marginLeft;
    VALUATION_COLUMNS.forEach((col) => {
        const w = col.widthPt;
        let text = '—';
        const raw = row[col.key];
        if (col.key === 'itemName') {
            text = truncateItemNameForPdf(raw || '—', { maxLength: 40 });
        } else if (raw != null && raw !== '') {
            text = formatPdfCell(raw, col.format, { sarNumbersOnly: col.sarNumbersOnly || false });
        }
        doc.fillColor(C.text.primary).font(fonts.body).fontSize(BODY_SIZE)
            .text(text, x + 4, y + 2, { width: w - 8, align: col.align, lineBreak: false, ellipsis: true });
        x += w;
    });
    doc.strokeColor(C.border.subtle).lineWidth(0.35)
        .moveTo(marginLeft, y + MIN_ROW_H).lineTo(marginLeft + TABLE_WIDTH, y + MIN_ROW_H).stroke();
    return y + MIN_ROW_H;
}

function drawDeptSubtotal(doc, y, marginLeft, fonts, subtotals) {
    const SUBTOTAL_H = MIN_ROW_H;
    doc.fillColor('#e2e8f0').rect(marginLeft, y, TABLE_WIDTH, SUBTOTAL_H).fill();
    doc.strokeColor('#64748b').lineWidth(0.6)
        .moveTo(marginLeft, y).lineTo(marginLeft + TABLE_WIDTH, y).stroke();
    let x = marginLeft;
    VALUATION_COLUMNS.forEach((col, idx) => {
        const w = col.widthPt;
        let text = '';
        if (idx === 0) {
            text = 'Subtotal';
        } else if (col.key === 'qtyOnHand') {
            text = formatPdfCell(subtotals.qty, 'qty', {});
        } else if (col.key === 'totalValue') {
            text = formatPdfCell(subtotals.value, 'sar', { sarNumbersOnly: true });
        }
        if (text) {
            doc.fillColor(C.text.primary).font(fonts.bold).fontSize(BODY_SIZE)
                .text(text, x + 4, y + 2, { width: w - 8, align: col.align, lineBreak: false });
        }
        x += w;
    });
    return y + SUBTOTAL_H;
}

function generateValuationPDF(payload) {
    const {
        rows = [],
        totalValue = 0,
        asOfDate,
        snapshotUsed,
        truthSource,
        valuationBasis,
        warning,
        effectiveAsOfDate,
        requestedAsOfDate,
        metadata = {},
    } = payload;
    const generatedAt = metadata.generatedAt || new Date().toISOString();
    const reportReference = metadata.reportReference || buildReportReference('inventory-valuation', generatedAt);

    // Compute KPI enrichments
    const rowCount = rows.length;
    const totalQtyOnHand = rows.reduce((s, r) => s + Number(r.qtyOnHand || 0), 0);
    const locationCount = new Set(rows.map((r) => r.location).filter(Boolean)).size;
    const blendedWac = totalQtyOnHand > 0 ? Number((totalValue / totalQtyOnHand).toFixed(2)) : null;

    const basisLabel = metadata.valuationBasisLabel
        || (valuationBasis === 'OPEN_PERIOD_LIVE'
            ? `Open period — live stock balances as of ${effectiveAsOfDate || 'today'} (Requested review date: ${requestedAsOfDate || '—'})`
            : valuationBasis === 'CLOSED_PERIOD' && snapshotUsed
                ? `Closed period snapshot ${snapshotUsed.year}/${String(snapshotUsed.month || '').padStart(2, '0')}`
                : truthSource === 'PERIOD_SNAPSHOT' && snapshotUsed
                    ? `Period snapshot ${snapshotUsed.year}/${String(snapshotUsed.month || '').padStart(2, '0')}`
                    : 'Live stock balances');

    const purposeLine = metadata.purposeLine
        || 'WAC-based carrying value from stock balances or closed period snapshots (ADR-002). Ledger replay is audit-only and is not the published total.';

    const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margins: PORTRAIT_MARGINS,
        bufferPages: true,
        autoFirstPage: true,
    });

    const layout = createEvidenceLayout(doc, {
        marginLeft: PORTRAIT_MARGINS.left,
        marginRight: PORTRAIT_MARGINS.right,
    });
    layout.pageWidth = TABLE_WIDTH; // 511pt — matches page margins exactly
    layout.marginLeft = PORTRAIT_MARGINS.left;
    layout.headerOptions = { title: REPORT_TITLE, reportReference, generatedAt };
    layout.drawMiniHeader = (d) => drawEvidenceMiniHeader(d, layout.headerOptions, layout);
    layout.bottomLimit = () => doc.page.height - 48;

    const fonts = registerPdfFonts(doc);

    // ── Header ───────────────────────────────────────────────────────────────
    drawGoldenPremiumShell(doc, layout, {
        title: REPORT_TITLE.toUpperCase(),
        classification: metadata.classification || 'INTERNAL USE',
        documentNo: reportReference,
        generatedAt,
        generatedBy: metadata.generatedBy || 'System',
        tenantName: metadata.tenantName || ENTERPRISE_BRAND.platformName,
        reportBasis: formatAsOfDate(requestedAsOfDate || asOfDate),
        reportScope: metadata.scopeLabel || 'All departments',
        purposeLine,
    });

    // ── KPI strip ────────────────────────────────────────────────────────────
    drawKpiStrip(doc, layout, {
        totalValue,
        rowCount,
        locationCount,
        totalQtyOnHand,
        blendedWac,
    });

    // ── Valuation basis note ─────────────────────────────────────────────────
    const marginLeft = PORTRAIT_MARGINS.left;
    const basisNote = valuationBasis === 'OPEN_PERIOD_LIVE'
        ? basisLabel
        : `${basisLabel}${warning ? `.  ${warning}` : ''}`;
    doc.fillColor('#64748b').font(fonts.body).fontSize(6)
        .text(
            `All values in SAR — currency prefix omitted from table cells.  Valuation basis: ${basisNote}.`,
            marginLeft, doc.y,
            { width: TABLE_WIDTH, lineBreak: false }
        );
    doc.moveDown(0.5);

    // ── Table ────────────────────────────────────────────────────────────────
    let tableY = drawTableHeader(doc, doc.y, marginLeft, fonts);
    const departments = groupRowsByDepartment(rows);
    let zebra = 0;

    departments.forEach(([deptName, deptRows]) => {
        if (tableY + DEPT_BAND_H + MIN_ROW_H > layout.bottomLimit()) {
            doc.addPage();
            layout.drawMiniHeader(doc, layout.headerOptions, layout);
            tableY = drawTableHeader(doc, doc.y, marginLeft, fonts);
        }

        // Department band
        doc.fillColor(C.surface.muted).rect(marginLeft, tableY, TABLE_WIDTH, DEPT_BAND_H).fill();
        doc.fillColor(C.navy.primary).rect(marginLeft, tableY, 3, DEPT_BAND_H).fill();
        doc.fillColor(C.text.primary).font(fonts.bold).fontSize(9)
            .text(sanitizePdfText(deptName, { maxLength: 60 }), marginLeft + 10, tableY + 3, {
                width: TABLE_WIDTH - 20,
                lineBreak: false,
            });
        tableY += DEPT_BAND_H + 2;

        // Item rows + dept running totals
        let deptQty = 0;
        let deptVal = 0;
        deptRows.forEach((row) => {
            if (tableY + MIN_ROW_H > layout.bottomLimit()) {
                doc.addPage();
                layout.drawMiniHeader(doc, layout.headerOptions, layout);
                tableY = drawTableHeader(doc, doc.y, marginLeft, fonts);
            }
            deptQty += Number(row.qtyOnHand || 0);
            deptVal  += Number(row.totalValue || 0);
            tableY = drawTableRow(doc, tableY, row, marginLeft, fonts, zebra % 2 === 0);
            zebra += 1;
        });

        // Dept subtotal
        if (tableY + MIN_ROW_H > layout.bottomLimit()) {
            doc.addPage();
            layout.drawMiniHeader(doc, layout.headerOptions, layout);
            tableY = drawTableHeader(doc, doc.y, marginLeft, fonts);
        }
        tableY = drawDeptSubtotal(doc, tableY, marginLeft, fonts, { qty: deptQty, value: deptVal });
        tableY += 3;
    });

    // ── Grand total ──────────────────────────────────────────────────────────
    if (tableY + MIN_ROW_H + 4 > layout.bottomLimit()) {
        doc.addPage();
        layout.drawMiniHeader(doc, layout.headerOptions, layout);
        tableY = doc.y;
    }
    doc.strokeColor('#c9a84c').lineWidth(0.75)
        .moveTo(marginLeft, tableY).lineTo(marginLeft + TABLE_WIDTH, tableY).stroke();
    doc.fillColor(C.navy.tableHeader).rect(marginLeft, tableY, TABLE_WIDTH, MIN_ROW_H).fill();
    const grandQty = rows.reduce((s, r) => s + Number(r.qtyOnHand || 0), 0);
    const grandVal = totalValue;
    let gx = marginLeft;
    VALUATION_COLUMNS.forEach((col, idx) => {
        const w = col.widthPt;
        let text = idx === 0 ? 'GRAND TOTAL' : '';
        if (col.key === 'qtyOnHand')  text = formatPdfCell(grandQty, 'qty', {});
        if (col.key === 'totalValue') text = formatPdfCell(grandVal, 'sar', { sarNumbersOnly: true });
        doc.fillColor('#ffffff').font(fonts.bold).fontSize(BODY_SIZE)
            .text(text, gx + 4, tableY + 2, { width: w - 8, align: col.align, lineBreak: false, ellipsis: true });
        gx += w;
    });
    tableY += MIN_ROW_H;

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.y = tableY + 8;
    drawCompactApprovalStrip(doc, layout, metadata);
    stampThreeZoneFooters(doc, layout, {
        ...metadata,
        reportReference,
        documentSuffix: REPORT_TITLE,
    });

    return new Promise((resolve, reject) => {
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}

module.exports = { generateValuationPDF };
