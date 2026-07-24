'use strict';

/**
 * Breakage Evidence PDF — literal Golden Reference replication (presentation only).
 */
const { TOKENS, getStatusColors, getControlledDocumentStatusColors } = require('./report-pdf-design-tokens');
const { registerPdfFonts } = require('./report-pdf-fonts');
const { ENTERPRISE_BRAND, isWorkflowStepComplete, formatConditionLabel } = require('./report-pdf-enterprise');
const {
    formatDate,
    formatDateTime,
    formatMoney,
    sanitizePrintableText,
    isEmptyReportField,
} = require('./report-pdf-layout');
const { mergeLineItemsWithImpact, resolveLossResponsibility } = require('./report-pdf-components');

function pdfCurrency(layout) {
    return String(layout?.displayCurrency || 'SAR').toUpperCase();
}
const {
    resolveFinalLossTreatmentFromApprovalHistory,
    LABEL_HOTEL_EXPENSES,
    LABEL_EMPLOYEE_DEDUCTION,
} = require('../../utils/resolveFinalLossTreatment');
const {
    GOLDEN_NAVY,
    LOSS_RED,
    KPI_ICONS,
    META_BAR_ICONS,
    drawIconShield,
} = require('./report-pdf-audit-icons');

const T = TOKENS;
const C = T.color;
const A = T.audit || {};
const BRAND_WHITE = '#ffffff';
const PANEL_FILL = A.panelFill || '#f5f7fa';
const GRIDLINE = A.cardBorder || '#d9d9d9';
const CARD_RADIUS = A.cardRadius || 5;
/** Print-safe inventory variance colors (table + KPI). */
const COUNT_VARIANCE_SURPLUS = '#166534';
const COUNT_VARIANCE_SHORTAGE = '#991b1b';

function resolveAuditFonts(doc, layout) {
    if (layout?.fonts) return layout.fonts;
    return registerPdfFonts(doc);
}

function auditBody(doc, layout) {
    return resolveAuditFonts(doc, layout).body;
}

function auditBold(doc, layout) {
    return resolveAuditFonts(doc, layout).bold;
}

function auditSemiBold(doc, layout) {
    const fonts = resolveAuditFonts(doc, layout);
    return fonts.semibold || fonts.body;
}

function mergeAuditLineItems(lineItems = [], perItem = [], header = {}) {
    const base = mergeLineItemsWithImpact(lineItems, perItem);
    const impactByItem = new Map((perItem || []).map((p) => [p.itemId, p]));
    const defaultReason = sanitizePrintableText(header.reason || '');

    return base.map((row, idx) => {
        const line = lineItems[idx] || {};
        const impact = impactByItem.get(line.itemId) || perItem[idx] || {};
        const lineNotes = sanitizePrintableText(line.notes || '');
        const reason = lineNotes || defaultReason || '';
        return {
            ...row,
            location: sanitizePrintableText(impact.locationName || ''),
            reason,
        };
    });
}

function truncateText(text, max = 28) {
    const s = String(text || '').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
}

function drawGoldenSectionTitle(doc, layout, title, reserveH = 0, options = {}) {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const gap = options.gapBefore ?? A.sectionGapBefore ?? 12;
    doc.y += gap;
    const titleBlock = 14;
    ensureSpace(titleBlock + reserveH + gap);
    const y = doc.y;
    doc.fillColor(GOLDEN_NAVY).fontSize(A.sectionTitleSize || 9.5).font(auditBold(doc, layout))
        .text(String(title).toUpperCase(), marginLeft, y, { width: pageWidth, height: 11 });
    doc.y = y + titleBlock;
    return doc.y;
}

/** Classification pill — light blue fill, navy border (reference spec) */
function drawGoldenOutlinePill(doc, layout, x, y, text, maxW) {
    const label = String(text || '—').toUpperCase();
    const pillH = A.classificationPillH || 18;
    doc.fontSize(6.5).font(auditBold(doc, layout));
    const textW = Math.min(Math.max(doc.widthOfString(label) + 24, 96), maxW);
    doc.fillColor(A.classificationPillBg || '#e8f0fe').roundedRect(x, y, textW, pillH, 14).fill();
    doc.strokeColor(GOLDEN_NAVY).lineWidth(0.55).roundedRect(x, y, textW, pillH, 14).stroke();
    doc.fillColor(GOLDEN_NAVY).fontSize(6.5).font(auditBold(doc, layout))
        .text(label, x + 12, y + 5, { width: textW - 24, align: 'center', ellipsis: true, height: pillH - 8 });
    return textW;
}

function drawGoldenStatusPill(doc, layout, x, y, text, maxW) {
    const label = String(text || '—').toUpperCase();
    const style = getStatusColors(text);
    const pillH = A.statusPillH || 22;
    doc.fontSize(7.5).font(auditBold(doc, layout));
    const textW = Math.min(Math.max(doc.widthOfString(label) + 28, 64), maxW);
    doc.fillColor(style.bg).roundedRect(x, y, textW, pillH, 11).fill();
    if (style.border) {
        doc.strokeColor(style.border).lineWidth(0.55).roundedRect(x, y, textW, pillH, 11).stroke();
    }
    doc.fillColor(style.text).fontSize(7.5).font(auditBold(doc, layout))
        .text(label, x + 14, y + 7, { width: textW - 28, align: 'center', height: pillH - 12 });
    return textW;
}

function drawDxLogoBlock(doc, layout, x, y, markSize) {
    doc.fillColor(GOLDEN_NAVY).rect(x, y, markSize, markSize).fill();
    doc.fillColor(BRAND_WHITE).fontSize(markSize * 0.36).font(auditBold(doc, layout))
        .text('DX', x, y + markSize * 0.3, { width: markSize, align: 'center', height: markSize * 0.45 });
}

function drawGoldenPageHeader(doc, layout, meta = {}) {
    const { marginLeft, pageWidth } = layout;
    const bandTop = 28;
    const railH = A.railHeight || 3;
    const markSize = A.brandMarkSize || 24;
    const leftW = A.headerLeftW || 158;
    const pillMaxW = A.headerPillW || 108;
    const pillH = A.classificationPillH || 18;

    doc.fillColor(GOLDEN_NAVY).rect(marginLeft, bandTop, pageWidth, railH).fill();

    const rowTop = bandTop + railH + 5;
    const rowH = markSize;

    drawDxLogoBlock(doc, layout, marginLeft + 2, rowTop, markSize);

    const brandX = marginLeft + 2 + markSize + 8;
    doc.fillColor(GOLDEN_NAVY).fontSize(A.brandSize || 11.5).font(auditBold(doc, layout))
        .text('DX OSE', brandX, rowTop + 1, { width: 118, height: 12 });
    doc.fillColor('#64748b').fontSize(A.taglineSize || 6).font(auditBody(doc, layout))
        .text(ENTERPRISE_BRAND.platformTagline, brandX, rowTop + 14, { width: 128, height: 9 });

    const dividerX = marginLeft + leftW;
    doc.strokeColor(GRIDLINE).lineWidth(0.45)
        .moveTo(dividerX, rowTop - 1).lineTo(dividerX, rowTop + rowH + 1).stroke();

    const title = sanitizePrintableText(meta.title || 'BREAKAGE EVIDENCE REPORT') || 'BREAKAGE EVIDENCE REPORT';
    const titleZoneX = dividerX + 10;
    const titleZoneW = pageWidth - leftW - 10 - pillMaxW - 6;

    if (meta.subtitle) {
        doc.fillColor(GOLDEN_NAVY).fontSize(12).font(auditBold(doc, layout))
            .text(String(title).toUpperCase(), titleZoneX, rowTop + 2, { width: titleZoneW, align: 'center', height: 13 });
        doc.fillColor('#64748b').fontSize(6.5).font(auditBody(doc, layout))
            .text(String(meta.subtitle), titleZoneX, rowTop + 16, { width: titleZoneW, align: 'center', height: 9 });
    } else {
        const titleSize = A.titleSize || 13;
        const titleLineH = 13;
        const titleY = rowTop + (rowH - titleLineH) / 2;
        doc.fillColor(GOLDEN_NAVY).fontSize(titleSize).font(auditBold(doc, layout))
            .text(String(title).toUpperCase(), titleZoneX, titleY, { width: titleZoneW, align: 'center', height: titleLineH });
    }

    const pillY = rowTop + (rowH - pillH) / 2;
    drawGoldenOutlinePill(doc, layout, marginLeft + pageWidth - pillMaxW, pillY, meta.classification || 'INTERNAL AUDIT', pillMaxW);

    const sepY = rowTop + rowH + 5;
    doc.strokeColor(GOLDEN_NAVY).lineWidth(0.65)
        .moveTo(marginLeft, sepY).lineTo(marginLeft + pageWidth, sepY).stroke();

    doc.y = sepY + (A.headerToMetadataGap ?? 8);
}

function drawAuditReportHeader(doc, layout, theme, meta = {}) {
    drawGoldenPageHeader(doc, layout, {
        title: meta.title || 'BREAKAGE EVIDENCE REPORT',
        classification: meta.classification || 'INTERNAL AUDIT',
    });
}

function formatReportTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

function drawMetadataGridRow(doc, layout, labelX, valueX, valueW, y, label, value, options = {}) {
    const labelSize = A.metadataLabelSize || 7;
    const valueSize = options.valueSize || A.metadataValueSize || 8.25;
    const lineH = A.metadataLineH || 8;
    const labelColW = (valueX - labelX) - 2;

    doc.fillColor(A.metadataLabelColor || '#64748b').fontSize(labelSize).font(auditBody(doc, layout))
        .text(String(label), labelX, y, { width: labelColW, height: lineH });
    doc.fillColor(A.metadataValueColor || GOLDEN_NAVY).fontSize(valueSize).font(auditSemiBold(doc, layout));
    const valueOpts = { width: valueW, height: lineH };
    if (!options.noEllipsis) valueOpts.ellipsis = true;
    doc.text(String(value), valueX, y, valueOpts);
}

function drawMetadataStatusBlock(doc, layout, g3X, startY, panelH, col3W, displayStatus) {
    const pad = A.metadataPanelPad ?? 4;
    const pillH = A.metadataStatusPillH || 17;
    const pillFont = A.metadataStatusFontSize || 6.5;
    const innerW = col3W - pad * 2;
    const zoneInset = A.metadataStatusZoneInset ?? 2;
    const zoneTop = startY + zoneInset;
    const zoneH = panelH - zoneInset * 2;

    doc.fillColor(A.metadataStatusZoneBg || '#eef2f7')
        .roundedRect(g3X - pad, zoneTop, col3W, zoneH, 3).fill();

    const label = String(displayStatus || '—').toUpperCase();
    const style = getStatusColors(displayStatus);
    doc.fontSize(pillFont).font(auditSemiBold(doc, layout));
    const hPad = A.metadataStatusPillHPadding ?? 16;
    const pillW = Math.min(Math.max(doc.widthOfString(label) + hPad, A.metadataStatusPillMinW || 56), innerW);
    const pillX = g3X + (innerW - pillW) / 2;
    const pillY = zoneTop + (zoneH - pillH) / 2;
    const radius = A.metadataStatusPillRadius ?? 8;
    doc.fillColor(style.bg).roundedRect(pillX, pillY, pillW, pillH, radius).fill();
    if (style.border) {
        doc.strokeColor(style.border).lineWidth(0.5).roundedRect(pillX, pillY, pillW, pillH, radius).stroke();
    }
    const textY = pillY + (pillH - pillFont) / 2 - 0.5;
    doc.fillColor(style.text).fontSize(pillFont).font(auditSemiBold(doc, layout))
        .text(label, pillX + hPad / 2, textY, { width: pillW - hPad, align: 'center', height: pillH });
}

function drawMetadataDivider(doc, startY, panelH, x) {
    const divH = panelH * (A.metadataDividerRatio || 0.72);
    const divTop = startY + (panelH - divH) / 2;
    doc.strokeColor(A.metadataDividerColor || '#b8b8b8').lineWidth(A.metadataDividerWeight || 0.6)
        .moveTo(x, divTop).lineTo(x, divTop + divH).stroke();
}

function drawAuditGrnMetadataBlock(doc, layout, header = {}, displayStatus = 'PENDING') {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const pad = A.metadataPanelPad ?? 4;
    const rowStep = A.metadataRowStep ?? 14;
    const rowCount = 4;
    const panelH = pad * 2 + rowStep * (rowCount - 1) + 8;
    const labelColW = A.metadataLabelColW ?? 76;
    ensureSpace(panelH + 8);

    const startY = doc.y;
    doc.fillColor(PANEL_FILL).roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).fill();
    doc.strokeColor(GRIDLINE).lineWidth(0.5)
        .roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).stroke();

    const innerY = startY + pad;
    const col1W = pageWidth * 0.36;
    const col2W = pageWidth * 0.37;
    const col3W = pageWidth - col1W - col2W;

    const g1X = marginLeft + pad;
    const g2X = marginLeft + col1W + pad;
    const g3X = marginLeft + col1W + col2W + pad;
    const div1X = marginLeft + col1W;
    const div2X = marginLeft + col1W + col2W;

    const v1X = g1X + labelColW;
    const v2X = g2X + labelColW;
    const v1W = col1W - pad - labelColW;
    const v2W = col2W - pad * 2 - labelColW;

    const rowY = (index) => innerY + index * rowStep;

    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(0), 'Property', header.tenantName || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(1), 'GRN No.', header.documentNo || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(2), 'Supplier', header.supplierName || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(3), 'Receiving Location', header.receivingLocation || '—');
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(0), 'Receiving Date',
        formatDate(header.documentDate || header.createdAt),
    );
    drawMetadataGridRow(doc, layout, g2X, v2X, v2W, rowY(1), 'Invoice Ref', header.invoiceRef || '—');
    drawMetadataGridRow(doc, layout, g2X, v2X, v2W, rowY(2), 'Imported By', header.createdBy || '—');
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(3), 'Posted At',
        header.postedAt ? formatDate(header.postedAt) : '—',
    );

    drawMetadataStatusBlock(doc, layout, g3X, startY, panelH, col3W, displayStatus);

    drawMetadataDivider(doc, startY, panelH, div1X);
    drawMetadataDivider(doc, startY, panelH, div2X);

    doc.y = startY + panelH + (A.sectionGapBefore ?? 12);
}

function drawAuditTransferMetadataBlock(doc, layout, header = {}, displayStatus = 'PENDING') {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const pad = A.metadataPanelPad ?? 4;
    const rowStep = A.metadataRowStep ?? 14;
    const rowCount = 4;
    const panelH = pad * 2 + rowStep * (rowCount - 1) + 8;
    const labelColW = A.metadataLabelColW ?? 76;
    ensureSpace(panelH + 8);

    const startY = doc.y;
    doc.fillColor(PANEL_FILL).roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).fill();
    doc.strokeColor(GRIDLINE).lineWidth(0.5)
        .roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).stroke();

    const innerY = startY + pad;
    const col1W = pageWidth * 0.36;
    const col2W = pageWidth * 0.37;
    const col3W = pageWidth - col1W - col2W;

    const g1X = marginLeft + pad;
    const g2X = marginLeft + col1W + pad;
    const g3X = marginLeft + col1W + col2W + pad;
    const div1X = marginLeft + col1W;
    const div2X = marginLeft + col1W + col2W;

    const v1X = g1X + labelColW;
    const v2X = g2X + labelColW;
    const v1W = col1W - pad - labelColW;
    const v2W = col2W - pad * 2 - labelColW;

    const rowY = (index) => innerY + index * rowStep;

    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(0), 'Property', header.tenantName || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(1), 'Transfer No.', header.documentNo || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(2), 'From Location', header.sourceLocation || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(3), 'To Location', header.destLocation || '—');
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(0), 'Transfer Date',
        formatDate(header.documentDate || header.createdAt),
    );
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(1), 'Prepared By',
        header.preparedBy || header.createdBy || '—',
    );
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(2), 'Posted At',
        header.postedAt ? formatDate(header.postedAt) : '—',
    );

    drawMetadataStatusBlock(doc, layout, g3X, startY, panelH, col3W, displayStatus);

    drawMetadataDivider(doc, startY, panelH, div1X);
    drawMetadataDivider(doc, startY, panelH, div2X);

    doc.y = startY + panelH + (A.sectionGapBefore ?? 12);
}

function drawAuditGetPassMetadataBlock(doc, layout, meta = {}, displayStatus = 'PENDING') {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const pad = A.metadataPanelPad ?? 4;
    const rowStep = A.metadataRowStep ?? 14;
    const rowCount = 4;
    const panelH = pad * 2 + rowStep * (rowCount - 1) + 8;
    const labelColW = A.metadataLabelColW ?? 76;
    ensureSpace(panelH + 8);

    const startY = doc.y;
    doc.fillColor(PANEL_FILL).roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).fill();
    doc.strokeColor(GRIDLINE).lineWidth(0.5)
        .roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).stroke();

    const innerY = startY + pad;
    const col1W = pageWidth * 0.36;
    const col2W = pageWidth * 0.37;
    const col3W = pageWidth - col1W - col2W;

    const g1X = marginLeft + pad;
    const g2X = marginLeft + col1W + pad;
    const g3X = marginLeft + col1W + col2W + pad;
    const div1X = marginLeft + col1W;
    const div2X = marginLeft + col1W + col2W;

    const v1X = g1X + labelColW;
    const v2X = g2X + labelColW;
    const v1W = col1W - pad - labelColW;
    const v2W = col2W - pad * 2 - labelColW;

    const rowY = (index) => innerY + index * rowStep;

    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(0), 'Property', meta.tenantName || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(1), 'Pass No.', meta.passNo || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(2), 'Department', meta.department || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(3), 'Borrower', meta.borrower || '—');
    drawMetadataGridRow(doc, layout, g2X, v2X, v2W, rowY(0), 'Type', meta.transferType || '—');
    drawMetadataGridRow(doc, layout, g2X, v2X, v2W, rowY(1), 'Created On', meta.createdOn || '—');
    drawMetadataGridRow(doc, layout, g2X, v2X, v2W, rowY(2), 'Prepared By', meta.preparedBy || '—');

    drawGetPassMetadataStatusBlock(doc, layout, g3X, startY, panelH, col3W, displayStatus);

    drawMetadataDivider(doc, startY, panelH, div1X);
    drawMetadataDivider(doc, startY, panelH, div2X);

    doc.y = startY + panelH + (A.sectionGapBefore ?? 12);
}

function drawAuditInventoryCountMetadataBlock(doc, layout, meta = {}, displayStatus = 'POSTED') {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const pad = A.metadataPanelPad ?? 4;
    const rowStep = A.metadataRowStep ?? 14;
    const rowCount = 4;
    const panelH = pad * 2 + rowStep * (rowCount - 1) + 8;
    const labelColW = A.metadataLabelColW ?? 76;
    ensureSpace(panelH + 8);

    const startY = doc.y;
    doc.fillColor(PANEL_FILL).roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).fill();
    doc.strokeColor(GRIDLINE).lineWidth(0.5)
        .roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).stroke();

    const innerY = startY + pad;
    const col1W = pageWidth * 0.36;
    const col2W = pageWidth * 0.37;
    const col3W = pageWidth - col1W - col2W;

    const g1X = marginLeft + pad;
    const g2X = marginLeft + col1W + pad;
    const g3X = marginLeft + col1W + col2W + pad;
    const div1X = marginLeft + col1W;
    const div2X = marginLeft + col1W + col2W;

    const v1X = g1X + labelColW;
    const v2X = g2X + labelColW;
    const v1W = col1W - pad - labelColW;
    const v2W = col2W - pad * 2 - labelColW;

    const rowY = (index) => innerY + index * rowStep;

    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(0), 'Property', meta.tenantName || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(1), 'Session No.', meta.sessionNo || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(2), 'Department', meta.department || '—');
    drawMetadataGridRow(
        doc, layout, g1X, v1X, v1W, rowY(3),
        meta.locationLabel || 'Primary Location',
        meta.locationDisplay || meta.primaryLocation || '—',
    );
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(0), 'Snapshot',
        meta.snapshotAt ? formatDateTime(meta.snapshotAt) : '—',
    );
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(1), 'Posted',
        meta.postedAt ? formatDateTime(meta.postedAt) : '—',
    );
    drawMetadataGridRow(doc, layout, g2X, v2X, v2W, rowY(2), 'Round', meta.roundLabel || '—');
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(3), 'Created',
        meta.createdAt ? formatDateTime(meta.createdAt) : '—',
    );

    drawMetadataStatusBlock(doc, layout, g3X, startY, panelH, col3W, displayStatus);

    drawMetadataDivider(doc, startY, panelH, div1X);
    drawMetadataDivider(doc, startY, panelH, div2X);

    doc.y = startY + panelH + (A.sectionGapBefore ?? 12);
}

/** Get Pass metadata status — controlled-document colors, stronger pill for operational review. */
function drawGetPassMetadataStatusBlock(doc, layout, g3X, startY, panelH, col3W, displayStatus) {
    const pad = A.metadataPanelPad ?? 4;
    const pillH = A.getPassStatusPillH ?? 22;
    const pillFont = A.getPassStatusFontSize ?? 8;
    const innerW = col3W - pad * 2;
    const zoneInset = A.metadataStatusZoneInset ?? 2;
    const zoneTop = startY + zoneInset;
    const zoneH = panelH - zoneInset * 2;

    doc.fillColor(A.metadataStatusZoneBg || '#eef2f7')
        .roundedRect(g3X - pad, zoneTop, col3W, zoneH, 3).fill();

    const label = String(displayStatus || '—').toUpperCase();
    const style = getControlledDocumentStatusColors(displayStatus);
    doc.fontSize(pillFont).font(auditBold(doc, layout));
    const hPad = A.getPassStatusPillHPadding ?? 20;
    const pillW = Math.min(Math.max(doc.widthOfString(label) + hPad, A.getPassStatusPillMinW || 72), innerW);
    const pillX = g3X + (innerW - pillW) / 2;
    const pillY = zoneTop + (zoneH - pillH) / 2;
    const radius = A.getPassStatusPillRadius ?? 9;
    doc.fillColor(style.bg).roundedRect(pillX, pillY, pillW, pillH, radius).fill();
    const borderW = style.border ? 0.75 : 0.5;
    if (style.border) {
        doc.strokeColor(style.border).lineWidth(borderW).roundedRect(pillX, pillY, pillW, pillH, radius).stroke();
    }
    const textY = pillY + (pillH - pillFont) / 2 - 1;
    doc.fillColor(style.text).fontSize(pillFont).font(auditBold(doc, layout))
        .text(label, pillX + hPad / 2, textY, { width: pillW - hPad, align: 'center', height: pillH });
}

function drawAuditMetadataBlock(doc, layout, header = {}, displayStatus = 'PENDING', options = {}) {
    if (options.profile === 'grn') {
        drawAuditGrnMetadataBlock(doc, layout, header, displayStatus);
        return;
    }
    if (options.profile === 'transfer') {
        drawAuditTransferMetadataBlock(doc, layout, header, displayStatus);
        return;
    }
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const pad = A.metadataPanelPad ?? 4;
    const rowStep = A.metadataRowStep ?? 14;
    const panelH = A.metadataPanelH ?? 44;
    const labelColW = A.metadataLabelColW ?? 76;
    ensureSpace(panelH + 8);

    const startY = doc.y;
    doc.fillColor(PANEL_FILL).roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).fill();
    doc.strokeColor(GRIDLINE).lineWidth(0.5)
        .roundedRect(marginLeft, startY, pageWidth, panelH, CARD_RADIUS).stroke();

    const innerY = startY + pad;
    const col1W = pageWidth * 0.36;
    const col2W = pageWidth * 0.37;
    const col3W = pageWidth - col1W - col2W;

    const g1X = marginLeft + pad;
    const g2X = marginLeft + col1W + pad;
    const g3X = marginLeft + col1W + col2W + pad;
    const div1X = marginLeft + col1W;
    const div2X = marginLeft + col1W + col2W;

    const v1X = g1X + labelColW;
    const v2X = g2X + labelColW;
    const v1W = col1W - pad - labelColW;
    const v2W = col2W - pad * 2 - labelColW;

    const rowY = (index) => innerY + index * rowStep;

    // Left — property + document identity
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(0), 'Property', header.tenantName || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(1), 'Report No.', header.documentNo || '—');
    drawMetadataGridRow(doc, layout, g1X, v1X, v1W, rowY(2), 'Department', header.department || '—');

    // Center — timing + ownership
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(0), 'Report Date',
        formatDate(header.documentDate || header.createdAt),
    );
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(1), 'Report Time',
        formatReportTime(header.createdAt || header.documentDate),
        { noEllipsis: true },
    );
    drawMetadataGridRow(
        doc, layout, g2X, v2X, v2W, rowY(2), 'Prepared By',
        header.preparedBy || header.createdBy || '—',
    );

    // Right — status
    drawMetadataStatusBlock(doc, layout, g3X, startY, panelH, col3W, displayStatus);

    drawMetadataDivider(doc, startY, panelH, div1X);
    drawMetadataDivider(doc, startY, panelH, div2X);

    doc.y = startY + panelH + (A.sectionGapBefore ?? 12);
}

function drawAuditKpiCard(doc, layout, x, y, cardW, cardH, metric, iconSize) {
    const lossAccent = metric.accent && !metric.accentNavy && !metric.varianceState;
    let bg = lossAccent ? '#fef2f2' : BRAND_WHITE;
    let border = lossAccent ? '#fca5a5' : GRIDLINE;
    let valueColor = GOLDEN_NAVY;
    let iconColor = GOLDEN_NAVY;

    if (metric.varianceState === 'shortage') {
        bg = A.auditVarianceShortageKpiBg || '#faf5f5';
        border = A.auditVarianceShortageKpiBorder || '#d4a5a5';
        valueColor = A.auditVarianceShortageKpiText || COUNT_VARIANCE_SHORTAGE;
        iconColor = valueColor;
    } else if (metric.varianceState === 'surplus') {
        bg = A.auditVarianceSurplusKpiBg || '#f4faf6';
        border = A.auditVarianceSurplusKpiBorder || '#9fbfaa';
        valueColor = A.auditVarianceSurplusKpiText || COUNT_VARIANCE_SURPLUS;
        iconColor = valueColor;
    } else if (metric.accentNavy) {
        valueColor = GOLDEN_NAVY;
        iconColor = GOLDEN_NAVY;
    } else if (metric.accent) {
        valueColor = LOSS_RED;
        iconColor = LOSS_RED;
    }

    doc.fillColor(bg).roundedRect(x, y, cardW, cardH, CARD_RADIUS).fill();
    doc.strokeColor(border).lineWidth(0.5).roundedRect(x, y, cardW, cardH, CARD_RADIUS).stroke();

    const labelSize = A.kpiLabelSize || 5.25;
    const valueSize = metric.accent ? (A.kpiFocalValueSize || 11) : (A.kpiValueSize || 10.5);
    const iconGap = A.kpiIconTextGap ?? 8;
    const textStackGap = A.kpiTextStackGap ?? 2;
    const labelColor = A.kpiLabelColor || '#64748b';
    const maxTextW = Math.max(cardW - (A.kpiCardPadX ?? 6) * 2 - iconSize - iconGap, 24);

    doc.fontSize(labelSize).font(auditSemiBold(doc, layout));
    const labelH = doc.heightOfString(metric.label, { width: maxTextW });
    doc.fontSize(valueSize).font(auditBold(doc, layout));
    const valueStr = String(metric.value);
    const valueH = doc.heightOfString(valueStr, { width: maxTextW, ellipsis: true });

    const textBlockH = labelH + textStackGap + valueH;
    const groupH = Math.max(iconSize, textBlockH);
    const textBlockW = Math.min(
        maxTextW,
        Math.max(doc.widthOfString(metric.label), doc.widthOfString(valueStr)) + 1,
    );
    const groupW = iconSize + iconGap + textBlockW;
    const groupX = x + (cardW - groupW) / 2;
    const groupY = y + (cardH - groupH) / 2;

    const iconFn = KPI_ICONS[metric.key];
    const iconX = groupX;
    const iconY = groupY + (groupH - iconSize) / 2;
    if (iconFn) iconFn(doc, iconX, iconY, iconSize, iconColor);

    const textX = groupX + iconSize + iconGap;
    const textY = groupY + (groupH - textBlockH) / 2;
    doc.fillColor(labelColor).fontSize(labelSize).font(auditSemiBold(doc, layout))
        .text(metric.label, textX, textY, { width: textBlockW, lineBreak: false, ellipsis: true });

    const valueY = textY + labelH + textStackGap;
    doc.fillColor(valueColor).fontSize(valueSize).font(auditBold(doc, layout))
        .text(valueStr, textX, valueY, { width: textBlockW, lineBreak: false, ellipsis: true });
}

function drawAuditSummaryKpiStrip(doc, layout, stockImpactSummary = {}, lineItems = [], header = {}, options = {}) {
    const { marginLeft, pageWidth } = layout;
    const currency = stockImpactSummary.currency || 'SAR';
    const totalQty = lineItems.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
    const totalLoss = stockImpactSummary.totalLossValue ?? 0;
    const kpiProfile = options.kpiProfile || 'loss';
    const costSummary = options.costSummary || {};
    const transferSummary = options.transferSummary || {};
    const getPassSummary = options.getPassSummary || {};
    const inventoryCountSummary = options.inventoryCountSummary || {};

    const stripH = A.kpiStripHeight || 46;
    const gap = A.kpiBlockGap || 14;
    const cardScale = A.kpiCardScale ?? 0.82;
    const iconSize = A.kpiIconSize || 14;
    const titleCardGap = A.kpiTitleToCardsGap ?? 10;

    let metrics;
    if (kpiProfile === 'grn') {
        metrics = [
            { key: 'items', label: 'TOTAL ITEMS', value: String(lineItems.length), accent: false },
            {
                key: 'qty',
                label: 'TOTAL QTY',
                value: String(costSummary.totalQty ?? totalQty),
                accent: false,
            },
            {
                key: 'value',
                label: 'TOTAL GRN VALUE (SAR)',
                value: formatMoney(costSummary.totalValue ?? totalLoss, currency),
                accent: true,
                accentNavy: true,
            },
        ];
    } else if (kpiProfile === 'transfer') {
        metrics = [
            {
                key: 'items',
                label: 'LINE ITEMS',
                value: String(transferSummary.lineCount ?? lineItems.length),
                accent: false,
            },
            {
                key: 'qty',
                label: 'TOTAL QTY',
                value: String(transferSummary.totalQty ?? totalQty),
                accent: false,
            },
            {
                key: 'value',
                label: 'TRANSFER VALUE (SAR)',
                value: formatMoney(transferSummary.totalValue ?? totalLoss, currency),
                accent: true,
                accentNavy: true,
            },
        ];
    } else if (kpiProfile === 'get_pass') {
        metrics = [
            {
                key: 'items',
                label: 'TOTAL ITEMS',
                value: String(getPassSummary.lineCount ?? lineItems.length),
                accent: false,
            },
            {
                key: 'qty',
                label: 'TOTAL QTY OUT',
                value: String(getPassSummary.totalQtyOut ?? totalQty),
                accent: false,
            },
            {
                key: 'returned',
                label: 'TOTAL QTY RETURNED',
                value: String(getPassSummary.totalQtyReturned ?? 0),
                accent: false,
            },
        ];
    } else if (kpiProfile === 'inventory_count') {
        const netVarianceValue = Number(inventoryCountSummary.totalNetVarianceValue ?? 0);
        let varianceState = 'neutral';
        if (netVarianceValue > 0) varianceState = 'surplus';
        else if (netVarianceValue < 0) varianceState = 'shortage';

        metrics = [
            {
                key: 'items',
                label: 'LINES COUNTED',
                value: String(inventoryCountSummary.linesCounted ?? lineItems.length),
                accent: false,
            },
            {
                key: 'qty',
                label: 'VARIANCE ITEMS',
                value: String(inventoryCountSummary.itemsWithVariance ?? 0),
                accent: false,
            },
            {
                key: 'value',
                label: 'NET VARIANCE VALUE (SAR)',
                value: formatMoney(netVarianceValue, currency),
                accent: true,
                varianceState,
            },
            {
                key: 'loss',
                label: 'ABS VARIANCE EXPOSURE (SAR)',
                value: formatMoney(inventoryCountSummary.totalAbsVarianceValue ?? 0, currency),
                accent: false,
            },
        ];
    } else {
        metrics = [
            { key: 'items', label: 'TOTAL ITEMS', value: String(lineItems.length), accent: false },
            { key: 'qty', label: 'TOTAL QTY LOST', value: String(totalQty), accent: false },
            { key: 'loss', label: 'TOTAL LOSS VALUE (SAR)', value: formatMoney(totalLoss, currency), accent: true },
        ];
    }

    const cardCount = metrics.length;
    const slotW = (pageWidth - gap * (cardCount - 1)) / cardCount;
    const cardW = slotW * cardScale;
    const rowW = cardCount * cardW + (cardCount - 1) * gap;
    const rowStartX = marginLeft + (pageWidth - rowW) / 2;

    drawGoldenSectionTitle(doc, layout, 'Summary', stripH + titleCardGap + 4, {
        gapBefore: A.kpiSectionGapBefore ?? 5,
    });
    const panelY = doc.y + titleCardGap;

    metrics.forEach((metric, i) => {
        const x = rowStartX + i * (cardW + gap);
        drawAuditKpiCard(doc, layout, x, panelY, cardW, stripH, metric, iconSize);
    });

    doc.y = panelY + stripH + (A.sectionGapBefore ?? 12);
}

const AUDIT_ITEM_TABLE_HEADERS = [
    '#', 'Item Code', 'Item Name', 'Qty Lost', 'Unit Cost (SAR)', 'Total Cost (SAR)', 'Location', 'Reason',
];
const AUDIT_ITEM_MAX_REASON_LINES = 2;
const AUDIT_ITEM_REASON_LINE_GAP = 1;

/** Normalize reason for PDF (presentation only). */
function formatAuditReasonForPdf(reason) {
    const raw = sanitizePrintableText(reason);
    if (!raw) return '—';
    return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Lay out reason on up to 2 lines — never ellipsized (audit evidence must stay readable).
 * @returns {{ lines: string[], blockH: number }}
 */
function layoutAuditReasonLines(doc, layout, reason, cellW) {
    const bodySize = A.tableBodySize || 7.5;
    const lineGap = AUDIT_ITEM_REASON_LINE_GAP;
    const lineStep = bodySize + lineGap;
    const maxBlockH = bodySize * AUDIT_ITEM_MAX_REASON_LINES + lineGap * (AUDIT_ITEM_MAX_REASON_LINES - 1);
    const text = formatAuditReasonForPdf(reason);

    doc.fontSize(bodySize).font(auditBody(doc, layout));

    if (doc.widthOfString(text) <= cellW) {
        return { lines: [text], blockH: bodySize };
    }

    const colonMatch = text.match(/^([^:]+:)\s*(.*)$/);
    if (colonMatch && colonMatch[2]) {
        const line1 = colonMatch[1];
        const line2 = colonMatch[2];
        if (doc.widthOfString(line1) <= cellW) {
            return { lines: [line1, line2], blockH: Math.min(lineStep + bodySize, maxBlockH) };
        }
    }

    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let lineWords = [];
    for (const word of words) {
        const trial = [...lineWords, word].join(' ');
        if (doc.widthOfString(trial) <= cellW) {
            lineWords.push(word);
            continue;
        }
        if (lineWords.length) lines.push(lineWords.join(' '));
        if (lines.length >= AUDIT_ITEM_MAX_REASON_LINES) {
            lineWords = [];
            break;
        }
        lineWords = [word];
    }
    if (lineWords.length && lines.length < AUDIT_ITEM_MAX_REASON_LINES) {
        lines.push(lineWords.join(' '));
    } else if (lineWords.length && lines.length === AUDIT_ITEM_MAX_REASON_LINES) {
        lines[AUDIT_ITEM_MAX_REASON_LINES - 1] = `${lines[AUDIT_ITEM_MAX_REASON_LINES - 1]} ${lineWords.join(' ')}`.trim();
    }
    const capped = lines.slice(0, AUDIT_ITEM_MAX_REASON_LINES);
    const blockH = Math.min(
        bodySize * capped.length + lineGap * Math.max(capped.length - 1, 0),
        maxBlockH,
    );
    return { lines: capped, blockH };
}

function drawAuditReasonCell(doc, layout, tableY, cellX, cellW, reason, padY, rowH) {
    const bodySize = A.tableBodySize || 7.5;
    const lineGap = AUDIT_ITEM_REASON_LINE_GAP;
    const lineStep = bodySize + lineGap;
    const { lines } = layoutAuditReasonLines(doc, layout, reason, cellW);
    const clipH = rowH != null ? rowH : (padY * 2 + lines.length * lineStep);

    doc.save();
    doc.rect(cellX - 1, tableY, cellW + 2, clipH).clip();
    doc.fillColor('#475569').fontSize(bodySize).font(auditBody(doc, layout));
    lines.forEach((line, idx) => {
        doc.text(line, cellX, tableY + padY + idx * lineStep, {
            width: cellW,
            lineBreak: false,
        });
    });
    doc.restore();
    doc.x = cellX;
    doc.y = tableY + clipH;
}

/**
 * Clip + isolate cell text so PDFKit cannot advance the page cursor mid-row.
 * Same contract as report-pdf-table.engine drawPdfCell.
 */
function drawAuditClippedCell(doc, {
    cellLeft,
    cellWidth,
    rowTop,
    rowH,
    text,
    align = 'left',
    font,
    fontSize,
    color,
    padX = A.tableCellPadX ?? 5,
    padY = A.tableCellPadY ?? 5,
    lineBreak = false,
    ellipsis = true,
}) {
    const innerW = Math.max(cellWidth - padX * 2, 4);
    const innerH = Math.max(4, rowH - padY * 2);
    const textY = lineBreak ? rowTop + padY : rowTop + (rowH - fontSize) / 2 - 0.5;

    doc.save();
    doc.rect(cellLeft, rowTop, cellWidth, rowH).clip();
    doc.fillColor(color).font(font).fontSize(fontSize);
    const opts = {
        width: innerW,
        align,
        height: innerH,
        ellipsis,
    };
    if (lineBreak) {
        opts.lineGap = 1;
    } else {
        opts.lineBreak = false;
    }
    doc.text(String(text ?? '—'), cellLeft + padX, textY, opts);
    doc.restore();
    doc.x = cellLeft;
    doc.y = rowTop + rowH;
}

/** ensureSpace once before a row; reset tableY to a new header if a page was added. */
function beginAuditTableRow(doc, layout, tableY, rowH, drawHeader) {
    doc.y = tableY;
    const spilled = layout.ensureSpace(rowH + 4);
    if (spilled || doc.y > tableY + 2) {
        return drawHeader(doc.y);
    }
    return tableY;
}

function finishAuditTableRow(doc, tableY, rowH) {
    const nextY = tableY + rowH;
    doc.x = doc.page.margins?.left ?? 40;
    doc.y = nextY;
    return nextY;
}

function buildAuditItemTableColumns(pageWidth) {
    const colRatios = A.tableColRatios || [0.055, 0.108, 0.275, 0.078, 0.124, 0.124, 0.088, 0.124];
    const minWidths = A.tableColMinWidths || [28, 72, 110, 42, 68, 68, 36, 52];
    const aligns = ['center', 'left', 'left', 'center', 'right', 'right', 'left', 'left'];
    const keys = ['index', 'code', 'name', 'qty', 'unit', 'total', 'location', 'reason'];

    const widths = colRatios.map((ratio) => Math.floor(pageWidth * ratio));
    widths[2] += pageWidth - widths.reduce((sum, w) => sum + w, 0);

    for (let i = 0; i < widths.length; i += 1) {
        if (i === 2 || widths[i] >= minWidths[i]) continue;
        const deficit = minWidths[i] - widths[i];
        widths[i] = minWidths[i];
        widths[2] = Math.max(widths[2] - deficit, minWidths[2]);
    }

    return widths.map((width, i) => ({ key: keys[i], width, align: aligns[i] }));
}

function auditTableColLeft(columns, marginLeft, index) {
    return marginLeft + columns.slice(0, index).reduce((s, c) => s + c.width, 0);
}

function auditTableCellInnerW(col, padX) {
    return Math.max(col.width - padX * 2, 4);
}

function auditTableTextY(rowY, rowH, fontSize) {
    return rowY + (rowH - fontSize) / 2 - 0.5;
}

function auditTableSpanWidth(columns, fromIndex, toIndex) {
    return columns.slice(fromIndex, toIndex).reduce((sum, col) => sum + col.width, 0);
}

function drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, y, h, options = {}) {
    const gridColor = options.color || A.tableGridColor || '#cbd5e1';
    const weight = options.weight ?? 0.35;
    const right = marginLeft + pageWidth;
    doc.strokeColor(gridColor).lineWidth(weight);
    doc.moveTo(marginLeft, y).lineTo(right, y).stroke();
    doc.moveTo(marginLeft, y).lineTo(marginLeft, y + h).stroke();
    for (let i = 1; i < columns.length; i += 1) {
        const x = auditTableColLeft(columns, marginLeft, i);
        doc.moveTo(x, y).lineTo(x, y + h).stroke();
    }
    doc.moveTo(right, y).lineTo(right, y + h).stroke();
    doc.moveTo(marginLeft, y + h).lineTo(right, y + h).stroke();
}

function drawAuditItemTableHeader(doc, layout, y, columns, marginLeft, pageWidth) {
    const hdrH = A.tableHdrH || 22;
    const hdrSize = A.tableHeaderSize || 7;
    const hdrColor = A.tableHeaderTextColor || '#ffffff';

    doc.fillColor(GOLDEN_NAVY).rect(marginLeft, y, pageWidth, hdrH).fill();
    columns.forEach((col, i) => {
        drawAuditClippedCell(doc, {
            cellLeft: auditTableColLeft(columns, marginLeft, i),
            cellWidth: col.width,
            rowTop: y,
            rowH: hdrH,
            text: AUDIT_ITEM_TABLE_HEADERS[i].toUpperCase(),
            align: col.align,
            font: auditBold(doc, layout),
            fontSize: hdrSize,
            color: hdrColor,
            lineBreak: false,
            ellipsis: true,
        });
    });
    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, y, hdrH, {
        color: A.tableHeaderGridColor || '#3d5a80',
        weight: 0.3,
    });
    doc.y = y + hdrH;
    return y + hdrH;
}

function drawAuditItemTableDataRow(doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth, fmtMoney, currency) {
    const padY = A.tableCellPadY ?? 5;
    const bodySize = A.tableBodySize || 7.5;
    const codeSize = A.tableCodeSize || 7.25;
    const nameSize = A.tableNameSize || 7.5;

    doc.fillColor(BRAND_WHITE).rect(marginLeft, tableY, pageWidth, rowH).fill();

    const qty = parseFloat(row.qty) || 0;
    const displayName = sanitizePrintableText(row.itemName) || '—';
    const bodyFont = auditBody(doc, layout);
    const semiFont = auditSemiBold(doc, layout);

    columns.forEach((col, i) => {
        const cellLeft = auditTableColLeft(columns, marginLeft, i);
        const padX = A.tableCellPadX ?? 5;
        if (i === 0) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(row.index), align: col.align, font: bodyFont, fontSize: bodySize, color: '#334155',
                ellipsis: false,
            });
        } else if (i === 1) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(row.barcode || '—'), align: col.align, font: bodyFont, fontSize: codeSize, color: '#334155',
            });
        } else if (i === 2) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: displayName, align: col.align, font: bodyFont, fontSize: nameSize,
                color: A.tableNameColor || '#1e293b', lineBreak: true, ellipsis: true,
            });
        } else if (i === 3) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(qty), align: col.align, font: bodyFont, fontSize: bodySize, color: '#334155',
            });
        } else if (i === 4) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: row.unitCost != null ? fmtMoney(row.unitCost, currency) : '—',
                align: col.align, font: bodyFont, fontSize: bodySize, color: '#334155',
            });
        } else if (i === 5) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: row.lineLoss != null ? fmtMoney(row.lineLoss, currency) : '—',
                align: col.align, font: semiFont, fontSize: bodySize, color: LOSS_RED,
            });
        } else if (i === 6) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: sanitizePrintableText(row.location || '—'),
                align: col.align, font: bodyFont, fontSize: bodySize, color: '#475569',
            });
        } else if (i === 7) {
            drawAuditReasonCell(
                doc, layout, tableY, cellLeft + padX, auditTableCellInnerW(col, padX), row.reason, padY, rowH,
            );
        }
    });

    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, tableY, rowH);
    doc.y = tableY + rowH;
}

function resolveAuditSubtotalTextY(doc, layout, bandY, bandH, fontSize) {
    doc.fontSize(fontSize).font(auditBold(doc, layout));
    const lineH = doc.heightOfString('TOTAL', { lineBreak: false });
    return bandY + (bandH - lineH) / 2;
}

function drawAuditItemTableTotalRow(doc, layout, tableY, columns, marginLeft, pageWidth, totalQty, totalLoss, fmtMoney, currency) {
    const totalH = A.tableTotalH || 22;
    const subtotalSize = A.tableTotalSubtotalSize || 8.25;
    const padX = A.tableCellPadX ?? 5;
    const totalBg = A.tableTotalBg || '#f2f2f2';
    const topBorder = A.tableTotalTopBorder || '#9aa8b8';
    const right = marginLeft + pageWidth;
    const bold = auditBold(doc, layout);

    doc.strokeColor(topBorder).lineWidth(A.tableTotalTopBorderWeight ?? 0.75)
        .moveTo(marginLeft, tableY).lineTo(right, tableY).stroke();
    doc.fillColor(totalBg).rect(marginLeft, tableY, pageWidth, totalH).fill();
    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, tableY, totalH, {
        color: A.tableTotalGridColor || '#cbd5e1',
        weight: 0.35,
    });

    const labelLeft = auditTableColLeft(columns, marginLeft, 1);
    const labelW = Math.max(auditTableSpanWidth(columns, 1, 3), 24);
    drawAuditClippedCell(doc, {
        cellLeft: labelLeft,
        cellWidth: labelW,
        rowTop: tableY,
        rowH: totalH,
        text: 'TOTAL',
        align: 'left',
        font: bold,
        fontSize: subtotalSize,
        color: GOLDEN_NAVY,
        padX,
    });

    const qtyCol = columns[3];
    drawAuditClippedCell(doc, {
        cellLeft: auditTableColLeft(columns, marginLeft, 3),
        cellWidth: qtyCol.width,
        rowTop: tableY,
        rowH: totalH,
        text: String(totalQty),
        align: qtyCol.align,
        font: bold,
        fontSize: subtotalSize,
        color: GOLDEN_NAVY,
        padX,
    });

    const totalCol = columns[5];
    drawAuditClippedCell(doc, {
        cellLeft: auditTableColLeft(columns, marginLeft, 5),
        cellWidth: totalCol.width,
        rowTop: tableY,
        rowH: totalH,
        text: fmtMoney(totalLoss, currency),
        align: totalCol.align,
        font: bold,
        fontSize: subtotalSize,
        color: LOSS_RED,
        padX,
    });

    doc.y = tableY + totalH;
    return totalH;
}

function drawAuditItemDetailsTable(doc, layout, lineItems = [], perItem = [], header = {}, options = {}) {
    const { marginLeft, pageWidth, ensureSpace, formatMoney: fmtMoney } = layout;
    const rows = mergeAuditLineItems(lineItems, perItem, header);
    const currency = pdfCurrency(layout);
    const sectionTitle = options.sectionTitle || 'Item Details';

    drawGoldenSectionTitle(doc, layout, sectionTitle, 40);

    const columns = buildAuditItemTableColumns(pageWidth);
    const MIN_ROW_H = A.tableRowMin || 20;
    const padY = A.tableCellPadY ?? 5;
    const nameSize = A.tableNameSize || 7.5;
    const bodySize = A.tableBodySize || 7.5;
    const MAX_NAME_H = 34;
    let tableY = doc.y;

    const drawHeader = (y) => drawAuditItemTableHeader(doc, layout, y, columns, marginLeft, pageWidth);

    tableY = drawHeader(tableY);

    let totalQty = 0;
    let totalLoss = 0;

    rows.forEach((row) => {
        const nameCol = columns[2];
        const reasonCol = columns[7];
        const nameW = auditTableCellInnerW(nameCol, A.tableCellPadX ?? 5);
        const reasonW = auditTableCellInnerW(reasonCol, A.tableCellPadX ?? 5);
        const displayName = sanitizePrintableText(row.itemName) || '—';
        doc.fontSize(nameSize).font(auditBody(doc, layout));
        const nameH = Math.min(doc.heightOfString(displayName, { width: nameW, lineGap: 1 }), MAX_NAME_H);
        const { blockH: reasonH } = layoutAuditReasonLines(doc, layout, row.reason, reasonW);
        const rowH = Math.max(MIN_ROW_H, Math.ceil(Math.max(nameH, reasonH)) + padY * 2);

        tableY = beginAuditTableRow(doc, layout, tableY, rowH, drawHeader);

        const qty = parseFloat(row.qty) || 0;
        const loss = parseFloat(row.lineLoss) || 0;
        totalQty += qty;
        totalLoss += loss;

        drawAuditItemTableDataRow(doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth, fmtMoney, currency);
        tableY = finishAuditTableRow(doc, tableY, rowH);
    });

    const TOTAL_H = A.tableTotalH || 22;
    tableY = beginAuditTableRow(doc, layout, tableY, TOTAL_H, (y) => y);

    drawAuditItemTableTotalRow(
        doc, layout, tableY, columns, marginLeft, pageWidth, totalQty, totalLoss, fmtMoney, currency,
    );

    doc.y = tableY + TOTAL_H + (A.sectionGapBefore ?? 12);
    return { totalQty, totalLoss };
}

const AUDIT_GRN_TABLE_HEADERS = [
    '#', 'Item', 'Code', 'Qty', 'Unit Cost (SAR)', 'Line Value (SAR)', 'UOM',
];

function buildAuditGrnTableColumns(pageWidth) {
    const colRatios = [0.055, 0.29, 0.12, 0.08, 0.135, 0.14, 0.08];
    const minWidths = [28, 100, 48, 36, 58, 58, 32];
    const aligns = ['center', 'left', 'left', 'right', 'right', 'right', 'left'];
    const keys = ['index', 'name', 'code', 'qty', 'unit', 'total', 'uom'];

    const widths = colRatios.map((ratio) => Math.floor(pageWidth * ratio));
    widths[1] += pageWidth - widths.reduce((sum, w) => sum + w, 0);

    for (let i = 0; i < widths.length; i += 1) {
        if (i === 1 || widths[i] >= minWidths[i]) continue;
        const deficit = minWidths[i] - widths[i];
        widths[i] = minWidths[i];
        widths[1] = Math.max(widths[1] - deficit, minWidths[1]);
    }

    return widths.map((width, i) => ({ key: keys[i], width, align: aligns[i] }));
}

function drawAuditGrnTableHeader(doc, layout, y, columns, marginLeft, pageWidth) {
    const hdrH = A.tableHdrH || 22;
    const hdrSize = A.tableHeaderSize || 7;
    const hdrColor = A.tableHeaderTextColor || '#ffffff';

    doc.fillColor(GOLDEN_NAVY).rect(marginLeft, y, pageWidth, hdrH).fill();
    columns.forEach((col, i) => {
        drawAuditClippedCell(doc, {
            cellLeft: auditTableColLeft(columns, marginLeft, i),
            cellWidth: col.width,
            rowTop: y,
            rowH: hdrH,
            text: AUDIT_GRN_TABLE_HEADERS[i].toUpperCase(),
            align: col.align,
            font: auditBold(doc, layout),
            fontSize: hdrSize,
            color: hdrColor,
        });
    });
    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, y, hdrH, {
        color: A.tableHeaderGridColor || '#3d5a80',
        weight: 0.3,
    });
    doc.y = y + hdrH;
    return y + hdrH;
}

function drawAuditGrnTableDataRow(doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth, fmtMoney, currency) {
    const bodySize = A.tableBodySize || 7.5;
    const codeSize = A.tableCodeSize || 7.25;
    const nameSize = A.tableNameSize || 7.5;
    const bodyFont = auditBody(doc, layout);
    const semiFont = auditSemiBold(doc, layout);

    doc.fillColor(BRAND_WHITE).rect(marginLeft, tableY, pageWidth, rowH).fill();

    const qty = parseFloat(row.qty) || 0;
    const lineVal = parseFloat(row.lineValue) || 0;
    const displayName = sanitizePrintableText(row.itemName) || '—';

    columns.forEach((col, i) => {
        const cellLeft = auditTableColLeft(columns, marginLeft, i);
        if (i === 0) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(row.index), align: col.align, font: bodyFont, fontSize: bodySize, color: '#334155',
                ellipsis: false,
            });
        } else if (i === 1) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: displayName, align: col.align, font: bodyFont, fontSize: nameSize,
                color: A.tableNameColor || '#1e293b', lineBreak: true, ellipsis: true,
            });
        } else if (i === 2) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(row.barcode || row.itemCode || '—'),
                align: col.align, font: bodyFont, fontSize: codeSize, color: '#334155',
            });
        } else if (i === 3) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(qty), align: col.align, font: bodyFont, fontSize: bodySize, color: '#334155',
            });
        } else if (i === 4) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: row.unitCost != null ? fmtMoney(row.unitCost, currency) : '—',
                align: col.align, font: bodyFont, fontSize: bodySize, color: '#334155',
            });
        } else if (i === 5) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: fmtMoney(lineVal, currency),
                align: col.align, font: semiFont, fontSize: bodySize, color: GOLDEN_NAVY,
            });
        } else if (i === 6) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(row.uom || '—'),
                align: col.align, font: bodyFont, fontSize: bodySize, color: '#475569',
            });
        }
    });

    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, tableY, rowH);
    doc.y = tableY + rowH;
}

function drawAuditGrnTableTotalRow(doc, layout, tableY, columns, marginLeft, pageWidth, totalQty, totalValue, fmtMoney, currency) {
    const totalH = A.tableTotalH || 22;
    const subtotalSize = A.tableTotalSubtotalSize || 8.25;
    const padX = A.tableCellPadX ?? 5;
    const totalBg = A.tableTotalBg || '#f2f2f2';
    const topBorder = A.tableTotalTopBorder || '#9aa8b8';
    const right = marginLeft + pageWidth;
    const bold = auditBold(doc, layout);

    doc.strokeColor(topBorder).lineWidth(A.tableTotalTopBorderWeight ?? 0.75)
        .moveTo(marginLeft, tableY).lineTo(right, tableY).stroke();
    doc.fillColor(totalBg).rect(marginLeft, tableY, pageWidth, totalH).fill();
    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, tableY, totalH, {
        color: A.tableTotalGridColor || '#cbd5e1',
        weight: 0.35,
    });

    const labelLeft = auditTableColLeft(columns, marginLeft, 1);
    const labelW = Math.max(auditTableSpanWidth(columns, 1, 3), 24);
    drawAuditClippedCell(doc, {
        cellLeft: labelLeft,
        cellWidth: labelW,
        rowTop: tableY,
        rowH: totalH,
        text: 'TOTAL',
        align: 'left',
        font: bold,
        fontSize: subtotalSize,
        color: GOLDEN_NAVY,
        padX,
    });

    const qtyCol = columns[3];
    drawAuditClippedCell(doc, {
        cellLeft: auditTableColLeft(columns, marginLeft, 3),
        cellWidth: qtyCol.width,
        rowTop: tableY,
        rowH: totalH,
        text: String(totalQty),
        align: qtyCol.align,
        font: bold,
        fontSize: subtotalSize,
        color: GOLDEN_NAVY,
        padX,
    });

    const totalCol = columns[5];
    drawAuditClippedCell(doc, {
        cellLeft: auditTableColLeft(columns, marginLeft, 5),
        cellWidth: totalCol.width,
        rowTop: tableY,
        rowH: totalH,
        text: fmtMoney(totalValue, currency),
        align: totalCol.align,
        font: bold,
        fontSize: subtotalSize,
        color: GOLDEN_NAVY,
        padX,
    });

    doc.y = tableY + totalH;
}

function drawAuditGrnItemsTable(doc, layout, lineItems = [], options = {}) {
    const { marginLeft, pageWidth, ensureSpace, formatMoney: fmtMoney } = layout;
    const currency = pdfCurrency(layout);
    const sectionTitle = options.sectionTitle || 'Imported Items';

    drawGoldenSectionTitle(doc, layout, sectionTitle, 40);

    const columns = buildAuditGrnTableColumns(pageWidth);
    const MIN_ROW_H = A.tableRowMin || 20;
    const padY = A.tableCellPadY ?? 5;
    const nameSize = A.tableNameSize || 7.5;
    const MAX_NAME_H = 34;
    let tableY = doc.y;

    const drawHeader = (y) => drawAuditGrnTableHeader(doc, layout, y, columns, marginLeft, pageWidth);
    tableY = drawHeader(tableY);

    let totalQty = 0;
    let totalValue = 0;

    lineItems.forEach((line, idx) => {
        const row = {
            index: idx + 1,
            itemName: line.itemName,
            barcode: line.barcode,
            itemCode: line.itemCode,
            qty: line.qty,
            unitCost: line.unitCost,
            lineValue: line.lineValue,
            uom: line.uom,
        };

        const nameCol = columns[1];
        const nameW = auditTableCellInnerW(nameCol, A.tableCellPadX ?? 5);
        const displayName = sanitizePrintableText(row.itemName) || '—';
        doc.fontSize(nameSize).font(auditBody(doc, layout));
        const nameH = Math.min(doc.heightOfString(displayName, { width: nameW, lineGap: 1 }), MAX_NAME_H);
        const rowH = Math.max(MIN_ROW_H, Math.ceil(nameH) + padY * 2);

        tableY = beginAuditTableRow(doc, layout, tableY, rowH, drawHeader);

        const qty = parseFloat(row.qty) || 0;
        const lineVal = parseFloat(row.lineValue) || 0;
        totalQty += qty;
        totalValue += lineVal;

        drawAuditGrnTableDataRow(doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth, fmtMoney, currency);
        tableY = finishAuditTableRow(doc, tableY, rowH);
    });

    const TOTAL_H = A.tableTotalH || 22;
    tableY = beginAuditTableRow(doc, layout, tableY, TOTAL_H, (y) => y);

    drawAuditGrnTableTotalRow(doc, layout, tableY, columns, marginLeft, pageWidth, totalQty, totalValue, fmtMoney, currency);

    doc.y = tableY + TOTAL_H + (A.sectionGapBefore ?? 12);
    return { totalQty, totalValue };
}

const AUDIT_TRANSFER_TABLE_HEADERS = [
    '#', 'Item', 'Barcode / Code', 'Qty', 'Unit Cost (SAR)', 'Line Value (SAR)',
];

function buildAuditTransferTableColumns(pageWidth) {
    const colRatios = [0.055, 0.36, 0.16, 0.09, 0.135, 0.135];
    const minWidths = [28, 100, 48, 36, 58, 58];
    const aligns = ['center', 'left', 'left', 'right', 'right', 'right'];
    const keys = ['index', 'name', 'code', 'qty', 'unit', 'total'];

    const widths = colRatios.map((ratio) => Math.floor(pageWidth * ratio));
    widths[1] += pageWidth - widths.reduce((sum, w) => sum + w, 0);

    for (let i = 0; i < widths.length; i += 1) {
        if (i === 1 || widths[i] >= minWidths[i]) continue;
        const deficit = minWidths[i] - widths[i];
        widths[i] = minWidths[i];
        widths[1] = Math.max(widths[1] - deficit, minWidths[1]);
    }

    return widths.map((width, i) => ({ key: keys[i], width, align: aligns[i] }));
}

function drawAuditTransferTableHeader(doc, layout, y, columns, marginLeft, pageWidth) {
    const hdrH = A.tableHdrH || 22;
    const hdrSize = A.tableHeaderSize || 7;
    const hdrColor = A.tableHeaderTextColor || '#ffffff';

    doc.fillColor(GOLDEN_NAVY).rect(marginLeft, y, pageWidth, hdrH).fill();
    columns.forEach((col, i) => {
        drawAuditClippedCell(doc, {
            cellLeft: auditTableColLeft(columns, marginLeft, i),
            cellWidth: col.width,
            rowTop: y,
            rowH: hdrH,
            text: AUDIT_TRANSFER_TABLE_HEADERS[i].toUpperCase(),
            align: col.align,
            font: auditBold(doc, layout),
            fontSize: hdrSize,
            color: hdrColor,
        });
    });
    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, y, hdrH, {
        color: A.tableHeaderGridColor || '#3d5a80',
        weight: 0.3,
    });
    doc.y = y + hdrH;
    return y + hdrH;
}

function drawAuditTransferTableDataRow(doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth, fmtMoney, currency) {
    const bodySize = A.tableBodySize || 7.5;
    const codeSize = A.tableCodeSize || 7.25;
    const nameSize = A.tableNameSize || 7.5;
    const bodyFont = auditBody(doc, layout);
    const semiFont = auditSemiBold(doc, layout);

    doc.fillColor(BRAND_WHITE).rect(marginLeft, tableY, pageWidth, rowH).fill();

    const qty = parseFloat(row.qty) || 0;
    const lineVal = parseFloat(row.lineValue) || 0;
    const displayName = sanitizePrintableText(row.itemName) || '—';

    columns.forEach((col, i) => {
        const cellLeft = auditTableColLeft(columns, marginLeft, i);
        if (i === 0) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(row.index), align: col.align, font: bodyFont, fontSize: bodySize, color: '#334155',
                ellipsis: false,
            });
        } else if (i === 1) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: displayName, align: col.align, font: bodyFont, fontSize: nameSize,
                color: A.tableNameColor || '#1e293b', lineBreak: true, ellipsis: true,
            });
        } else if (i === 2) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(row.barcode || row.itemCode || '—'),
                align: col.align, font: bodyFont, fontSize: codeSize, color: '#334155',
            });
        } else if (i === 3) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: String(qty), align: col.align, font: bodyFont, fontSize: bodySize, color: '#334155',
            });
        } else if (i === 4) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: row.unitCost != null ? fmtMoney(row.unitCost, currency) : '—',
                align: col.align, font: bodyFont, fontSize: bodySize, color: '#334155',
            });
        } else if (i === 5) {
            drawAuditClippedCell(doc, {
                cellLeft, cellWidth: col.width, rowTop: tableY, rowH,
                text: fmtMoney(lineVal, currency),
                align: col.align, font: semiFont, fontSize: bodySize, color: GOLDEN_NAVY,
            });
        }
    });

    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, tableY, rowH);
    doc.y = tableY + rowH;
}

function drawAuditTransferItemsTable(doc, layout, lineItems = [], options = {}) {
    const { marginLeft, pageWidth, ensureSpace, formatMoney: fmtMoney } = layout;
    const currency = pdfCurrency(layout);
    const sectionTitle = options.sectionTitle || 'Transfer Items';

    drawGoldenSectionTitle(doc, layout, sectionTitle, 40);

    const columns = buildAuditTransferTableColumns(pageWidth);
    const MIN_ROW_H = A.tableRowMin || 20;
    const padY = A.tableCellPadY ?? 5;
    const nameSize = A.tableNameSize || 7.5;
    const MAX_NAME_H = 34;
    let tableY = doc.y;

    const drawHeader = (y) => drawAuditTransferTableHeader(doc, layout, y, columns, marginLeft, pageWidth);
    tableY = drawHeader(tableY);

    let totalQty = 0;
    let totalValue = 0;

    lineItems.forEach((line, idx) => {
        const row = {
            index: idx + 1,
            itemName: line.itemName,
            barcode: line.barcode,
            itemCode: line.itemCode,
            qty: line.qty,
            unitCost: line.unitCost,
            lineValue: line.lineValue,
        };

        const nameCol = columns[1];
        const nameW = auditTableCellInnerW(nameCol, A.tableCellPadX ?? 5);
        const displayName = sanitizePrintableText(row.itemName) || '—';
        doc.fontSize(nameSize).font(auditBody(doc, layout));
        const nameH = Math.min(doc.heightOfString(displayName, { width: nameW, lineGap: 1 }), MAX_NAME_H);
        const rowH = Math.max(MIN_ROW_H, Math.ceil(nameH) + padY * 2);

        tableY = beginAuditTableRow(doc, layout, tableY, rowH, drawHeader);

        const qty = parseFloat(row.qty) || 0;
        const lineVal = parseFloat(row.lineValue) || 0;
        totalQty += qty;
        totalValue += lineVal;

        drawAuditTransferTableDataRow(doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth, fmtMoney, currency);
        tableY = finishAuditTableRow(doc, tableY, rowH);
    });

    const TOTAL_H = A.tableTotalH || 22;
    tableY = beginAuditTableRow(doc, layout, tableY, TOTAL_H, (y) => y);

    drawAuditGrnTableTotalRow(doc, layout, tableY, columns, marginLeft, pageWidth, totalQty, totalValue, fmtMoney, currency);

    doc.y = tableY + TOTAL_H + (A.sectionGapBefore ?? 12);
    return { totalQty, totalValue };
}

/** PDF header labels (abbreviated where A4 width requires; data columns unchanged). */
const AUDIT_GET_PASS_TABLE_HEADERS = [
    '#', 'Item', 'Barcode', 'Src Location', 'Qty Out', 'Qty Ret.', 'Condition', 'Notes',
];

function parseGetPassLineQty(value) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** PDF Qty Returned column — good physical return only (not line.qtyReturned total processed). */
function resolveGetPassPdfGoodReturnedQty(line = {}) {
    return parseGetPassLineQty(line.returnedGoodQty);
}

/**
 * PDF Condition column — operational return outcome (presentation only).
 * Uses line.status, qty vs qtyReturned, and returnedGood/Damaged/Lost split fields.
 * Does not use conditionOut (checkout condition).
 */
function resolveGetPassPdfLineOutcome(line = {}) {
    const qtyOut = parseGetPassLineQty(line.qty ?? line.qtyOut);
    const qtyReturned = parseGetPassLineQty(line.qtyReturned);
    const good = parseGetPassLineQty(line.returnedGoodQty);
    const damaged = parseGetPassLineQty(line.returnedDamagedQty);
    const lost = parseGetPassLineQty(line.returnedLostQty);
    const outstanding = Math.max(0, qtyOut - qtyReturned);
    const eps = 1e-9;
    const status = String(line.status || '').toUpperCase();

    if (qtyOut <= eps) return '—';

    if (qtyReturned <= eps) {
        if (status === 'OUT' || status === 'PENDING') return 'Outstanding';
        if (status === 'PARTIALLY_RETURNED') return 'Partially Returned';
        return formatConditionLabel(status) || 'Outstanding';
    }

    if (outstanding > eps) {
        return 'Partially Returned';
    }

    if (status === 'LOST' || (lost >= qtyOut - eps && good <= eps && damaged <= eps)) {
        return 'Lost';
    }

    if (damaged > eps && good <= eps && lost <= eps) {
        return 'Damaged';
    }

    if (damaged > eps) {
        return 'Damaged';
    }

    if (lost > eps && good <= eps) {
        return 'Lost';
    }

    if (good > eps || status === 'RETURNED') {
        return 'Returned';
    }

    if (lost > eps) return 'Lost';
    if (damaged > eps) return 'Damaged';
    if (status === 'PARTIALLY_RETURNED') return 'Partially Returned';

    return 'Returned';
}

/** Presentation-only: operational outcome + line notes for comment. */
function resolveGetPassPdfLineDisplay(line = {}) {
    const comment = sanitizePrintableText(line.notes) || '—';
    return {
        condition: resolveGetPassPdfLineOutcome(line),
        comment,
    };
}

function buildAuditGetPassTableColumns(pageWidth) {
    // Barcode needs ~72pt for a 12-digit code at 7pt — keep on one line (no mid-digit wrap).
    const colRatios = [0.022, 0.148, 0.128, 0.110, 0.060, 0.078, 0.118, 0.080];
    const minWidths = [14, 54, 72, 52, 30, 42, 68, 34];
    const flexShrinkOrder = [7, 1, 3];
    const aligns = ['center', 'left', 'left', 'left', 'right', 'right', 'left', 'left'];
    const keys = ['index', 'name', 'code', 'location', 'qtyOut', 'qtyReturned', 'condition', 'comment'];

    const widths = colRatios.map((ratio) => Math.floor(pageWidth * ratio));
    let remainder = pageWidth - widths.reduce((sum, w) => sum + w, 0);
    widths[1] += remainder;
    remainder = 0;

    for (let i = 0; i < widths.length; i += 1) {
        if (widths[i] >= minWidths[i]) continue;
        let deficit = minWidths[i] - widths[i];
        widths[i] = minWidths[i];
        for (const shrinkIdx of flexShrinkOrder) {
            if (deficit <= 0) break;
            const canTake = widths[shrinkIdx] - minWidths[shrinkIdx];
            if (canTake <= 0) continue;
            const take = Math.min(canTake, deficit);
            widths[shrinkIdx] -= take;
            deficit -= take;
        }
    }

    return widths.map((width, i) => ({ key: keys[i], width, align: aligns[i] }));
}

function drawAuditGetPassTableHeader(doc, layout, y, columns, marginLeft, pageWidth) {
    const hdrH = A.getPassTableHdrH || A.tableHdrH || 22;
    const hdrSize = A.getPassTableHdrSize || 6.5;
    const padX = A.tableCellPadX ?? 5;
    const hdrColor = A.tableHeaderTextColor || '#ffffff';

    doc.fillColor(GOLDEN_NAVY).rect(marginLeft, y, pageWidth, hdrH).fill();
    const hdrTextY = y + (hdrH - hdrSize) / 2 - 0.5;
    columns.forEach((col, i) => {
        const innerW = auditTableCellInnerW(col, padX);
        doc.fillColor(hdrColor).fontSize(hdrSize).font(auditBold(doc, layout))
            .text(AUDIT_GET_PASS_TABLE_HEADERS[i].toUpperCase(), auditTableColLeft(columns, marginLeft, i) + padX, hdrTextY, {
                width: innerW,
                height: hdrH - 4,
                align: col.align,
                lineBreak: false,
                ellipsis: true,
            });
    });
    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, y, hdrH, {
        color: A.tableHeaderGridColor || '#3d5a80',
        weight: 0.3,
    });
    return y + hdrH;
}

function drawAuditGetPassTableDataRow(doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth) {
    const padX = A.tableCellPadX ?? 5;
    const padY = A.tableCellPadY ?? 5;
    const bodySize = A.tableBodySize || 7.5;
    const codeSize = A.tableCodeSize || 7.25;
    const nameSize = A.tableNameSize || 7.5;

    doc.fillColor(BRAND_WHITE).rect(marginLeft, tableY, pageWidth, rowH).fill();

    const singleLineY = auditTableTextY(tableY, rowH, bodySize);
    const displayName = sanitizePrintableText(row.itemName) || '—';
    const nameCol = columns[1];
    const nameW = auditTableCellInnerW(nameCol, padX);

    columns.forEach((col, i) => {
        const cellX = auditTableColLeft(columns, marginLeft, i) + padX;
        const cellW = auditTableCellInnerW(col, padX);
        const key = col.key;
        if (key === 'index') {
            doc.fillColor('#334155').fontSize(bodySize).font(auditBody(doc, layout))
                .text(String(row.index), cellX, singleLineY, { width: cellW, align: col.align, lineBreak: false });
        } else if (key === 'name') {
            doc.fillColor(A.tableNameColor || '#1e293b').fontSize(nameSize).font(auditBody(doc, layout))
                .text(displayName, cellX, tableY + padY, {
                    width: nameW, lineGap: 1, height: rowH - padY * 2, ellipsis: true,
                });
        } else if (key === 'code') {
            const barcodeText = String(row.barcode || row.itemCode || '—');
            drawAuditClippedCell(doc, {
                cellLeft: auditTableColLeft(columns, marginLeft, i),
                cellWidth: col.width,
                rowTop: tableY,
                rowH,
                text: barcodeText,
                align: col.align,
                font: auditBody(doc, layout),
                fontSize: Math.min(codeSize, 6.75),
                color: '#334155',
                lineBreak: false,
                ellipsis: true,
            });
        } else if (key === 'location') {
            doc.fillColor('#334155').fontSize(bodySize).font(auditBody(doc, layout))
                .text(String(row.sourceLocation || '—'), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false, ellipsis: true,
                });
        } else if (key === 'qtyOut') {
            doc.fillColor('#334155').fontSize(bodySize).font(auditBody(doc, layout))
                .text(String(row.qtyOut ?? 0), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false,
                });
        } else if (key === 'qtyReturned') {
            doc.fillColor('#334155').fontSize(bodySize).font(auditBody(doc, layout))
                .text(String(row.qtyReturned ?? 0), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false,
                });
        } else if (key === 'condition') {
            doc.fillColor('#475569').fontSize(bodySize).font(auditBody(doc, layout))
                .text(String(row.condition || '—'), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false,
                });
        } else if (key === 'comment') {
            doc.fillColor('#475569').fontSize(bodySize).font(auditBody(doc, layout))
                .text(String(row.comment || '—'), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false, ellipsis: true,
                });
        }
    });

    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, tableY, rowH);
}

function drawAuditGetPassTableTotalRow(doc, layout, tableY, columns, marginLeft, pageWidth, totalQtyOut, totalQtyReturned) {
    const totalH = A.tableTotalH || 22;
    const subtotalSize = A.tableTotalSubtotalSize || 8.25;
    const padX = A.tableCellPadX ?? 5;
    const totalBg = A.tableTotalBg || '#f2f2f2';
    const topBorder = A.tableTotalTopBorder || '#9aa8b8';
    const right = marginLeft + pageWidth;

    doc.strokeColor(topBorder).lineWidth(A.tableTotalTopBorderWeight ?? 0.75)
        .moveTo(marginLeft, tableY).lineTo(right, tableY).stroke();
    doc.fillColor(totalBg).rect(marginLeft, tableY, pageWidth, totalH).fill();
    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, tableY, totalH, {
        color: A.tableTotalGridColor || '#cbd5e1',
        weight: 0.35,
    });

    const textY = resolveAuditSubtotalTextY(doc, layout, tableY, totalH, subtotalSize);
    const labelX = auditTableColLeft(columns, marginLeft, 1) + padX;
    const labelW = Math.max(auditTableSpanWidth(columns, 1, 4) - padX * 2, 24);

    doc.fillColor(GOLDEN_NAVY).fontSize(subtotalSize).font(auditBold(doc, layout))
        .text('TOTAL', labelX, textY, {
            width: labelW, align: 'left', lineBreak: false,
            characterSpacing: A.tableTotalLabelTracking ?? 0.3,
        });

    const qtyOutCol = columns[4];
    doc.fillColor(GOLDEN_NAVY).fontSize(subtotalSize).font(auditBold(doc, layout))
        .text(String(totalQtyOut), auditTableColLeft(columns, marginLeft, 4) + padX, textY, {
            width: auditTableCellInnerW(qtyOutCol, padX), align: qtyOutCol.align, lineBreak: false,
        });

    const qtyRetCol = columns[5];
    doc.fillColor(GOLDEN_NAVY).fontSize(subtotalSize).font(auditBold(doc, layout))
        .text(String(totalQtyReturned), auditTableColLeft(columns, marginLeft, 5) + padX, textY, {
            width: auditTableCellInnerW(qtyRetCol, padX), align: qtyRetCol.align, lineBreak: false,
        });
}

function drawAuditGetPassItemsTable(doc, layout, lines = [], options = {}) {
    const { marginLeft, pageWidth, ensureSpace, bottomLimit } = layout;
    const sectionTitle = options.sectionTitle || 'Get Pass Items';
    const hdrH = A.getPassTableHdrH || A.tableHdrH || 22;

    drawGoldenSectionTitle(doc, layout, sectionTitle, 40);

    const columns = buildAuditGetPassTableColumns(pageWidth);
    const MIN_ROW_H = A.tableRowMin || 20;
    const padY = A.tableCellPadY ?? 5;
    const nameSize = A.tableNameSize || 7.5;
    const MAX_NAME_H = 34;
    let tableY = doc.y;

    const drawHeaderAt = (y) => drawAuditGetPassTableHeader(doc, layout, y, columns, marginLeft, pageWidth);
    tableY = drawHeaderAt(tableY);
    doc.y = tableY;

    let totalQtyOut = 0;
    let totalQtyReturned = 0;

    lines.forEach((line, idx) => {
        const { condition, comment } = resolveGetPassPdfLineDisplay(line);
        const row = {
            index: idx + 1,
            itemName: line.item?.name || line.itemName,
            barcode: line.item?.barcode || line.item?.code || line.barcode,
            itemCode: line.item?.barcode || line.item?.code || line.itemCode,
            sourceLocation: line.location?.name || line.sourceLocation,
            qtyOut: line.qty ?? line.qtyOut ?? 0,
            qtyReturned: resolveGetPassPdfGoodReturnedQty(line),
            condition,
            comment,
        };

        const nameCol = columns[1];
        const nameW = auditTableCellInnerW(nameCol, A.tableCellPadX ?? 5);
        const displayName = sanitizePrintableText(row.itemName) || '—';
        doc.fontSize(nameSize).font(auditBody(doc, layout));
        const nameH = Math.min(doc.heightOfString(displayName, { width: nameW, lineGap: 1 }), MAX_NAME_H);
        const rowH = Math.max(MIN_ROW_H, Math.ceil(nameH) + padY * 2);

        if (tableY + rowH > bottomLimit()) {
            ensureSpace(rowH + hdrH + 6);
            tableY = drawHeaderAt(doc.y);
        } else {
            ensureSpace(rowH + 4);
        }

        totalQtyOut += parseFloat(row.qtyOut) || 0;
        totalQtyReturned += parseFloat(row.qtyReturned) || 0;

        drawAuditGetPassTableDataRow(doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth);
        tableY += rowH;
        doc.y = tableY;
    });

    const TOTAL_H = A.tableTotalH || 22;
    if (tableY + TOTAL_H > bottomLimit()) {
        ensureSpace(TOTAL_H + 4);
        tableY = doc.y;
    } else {
        ensureSpace(TOTAL_H + 4);
    }

    drawAuditGetPassTableTotalRow(doc, layout, tableY, columns, marginLeft, pageWidth, totalQtyOut, totalQtyReturned);

    doc.y = tableY + TOTAL_H + (A.sectionGapBefore ?? 12);
    return { totalQtyOut, totalQtyReturned };
}

function drawAuditContextBand(doc, layout, sectionTitle, labels, values, bandOptions = {}) {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const padTop = bandOptions.padTop ?? A.lossTreatmentPadY ?? 2;
    const padBottom = bandOptions.padBottom ?? A.lossTreatmentPadBottom ?? 2;
    const labelSize = bandOptions.labelSize ?? A.lossTreatmentLabelSize ?? 5.25;
    const valueSize = bandOptions.valueSize ?? A.lossTreatmentValueSize ?? 7;
    const sectionTail = bandOptions.sectionTail ?? A.lossTreatmentSectionTail ?? 0;
    const labelH = bandOptions.labelH ?? A.lossTreatmentLabelH ?? 6;
    const valueH = bandOptions.valueH ?? A.lossTreatmentValueH ?? 8;
    const innerGap = bandOptions.innerGap ?? A.lossTreatmentInnerGap ?? 2;
    const valueOffset = padTop + labelH + innerGap;
    const panelH = padTop + labelH + innerGap + valueH + padBottom;
    const blockH = panelH + sectionTail;
    const gapBefore = bandOptions.gapBefore ?? A.lossTreatmentGapBefore ?? 8;
    const ensurePad = bandOptions.ensurePad ?? 8;

    const { colWidths, panelWidth } = measureReceiptContextColumnWidths(
        doc, layout, labels, values, labelSize, valueSize, pageWidth,
    );

    ensureSpace(blockH + ensurePad);
    const panelY = drawGoldenSectionTitle(doc, layout, sectionTitle, blockH, {
        gapBefore,
    });

    doc.fillColor(PANEL_FILL).rect(marginLeft, panelY, panelWidth, panelH).fill();
    doc.strokeColor(GRIDLINE).lineWidth(0.45).rect(marginLeft, panelY, panelWidth, panelH).stroke();

    let colX = marginLeft;
    labels.forEach((label, i) => {
        const colW = colWidths[i];
        const labelX = colX + 10;
        const innerW = colW - 20;
        doc.fillColor('#64748b').fontSize(labelSize).font(auditBold(doc, layout))
            .text(label, labelX, panelY + padTop, { width: innerW, height: labelH, lineBreak: false, characterSpacing: 0.15 });
        doc.fillColor(GOLDEN_NAVY).fontSize(valueSize).font(auditSemiBold(doc, layout))
            .text(values[i], labelX, panelY + valueOffset, {
                width: innerW, lineBreak: false, ellipsis: true,
            });
        if (i > 0) {
            doc.strokeColor('#e2e8f0').lineWidth(0.35)
                .moveTo(colX, panelY + 2).lineTo(colX, panelY + panelH - 2).stroke();
        }
        colX += colW;
    });

    doc.y = panelY + panelH + sectionTail;
}

function drawAuditTransferContext(doc, layout, header = {}) {
    drawAuditContextBand(doc, layout, 'Transfer Context', [
        'FROM LOCATION',
        'TO LOCATION',
        'TRANSFER TYPE',
    ], [
        sanitizePrintableText(header.sourceLocation) || '—',
        sanitizePrintableText(header.destLocation) || '—',
        sanitizePrintableText(header.transferType) || '—',
    ]);
}

function resolveGetPassContextReason(reason) {
    if (reason == null) return '';
    const raw = String(reason).trim();
    if (!raw || isEmptyReportField(raw)) return '';
    return sanitizePrintableText(raw.replace(/\s*\n\s*/g, ' · '));
}

function resolveGetPassContextReturnLabel(pass = {}) {
    const status = String(pass.status || '').toUpperCase();
    if (status === 'RETURNED') return 'Returned';
    if (status === 'PARTIALLY_RETURNED') return 'Partially Returned';
    return '';
}

function drawAuditGetPassContext(doc, layout, pass = {}) {
    const labels = [];
    const values = [];

    if (pass.expectedReturnDate) {
        labels.push('EXPECTED RETURN DATE');
        values.push(formatDate(pass.expectedReturnDate));
    }

    const reasonText = resolveGetPassContextReason(pass.reason);
    if (reasonText) {
        labels.push('REASON FOR TRANSFER');
        values.push(reasonText);
    }

    // Borrower confirmation (external acknowledgment) — kept out of Approval Workflow.
    const borrowerName = sanitizePrintableText(pass.borrowingEntity);
    if (borrowerName && !isEmptyReportField(borrowerName)) {
        labels.push('BORROWER CONFIRMATION');
        values.push(borrowerName);
    }
    if (pass.checkedOutAt && borrowerName && !isEmptyReportField(borrowerName)) {
        labels.push('BORROWER CONFIRMED AT');
        values.push(formatTimelineTimestamp(pass.checkedOutAt) || formatDate(pass.checkedOutAt));
    } else if (pass.checkedOutAt) {
        labels.push('CHECKED OUT');
        values.push(formatTimelineTimestamp(pass.checkedOutAt) || formatDate(pass.checkedOutAt));
    }

    const returnLabel = resolveGetPassContextReturnLabel(pass);
    if (returnLabel) {
        labels.push('RETURN STATUS');
        values.push(returnLabel);
    }

    if (!labels.length) return;

    drawAuditContextBand(doc, layout, 'Get Pass Context', labels, values);
}

/** Break table rows on page boundary; repeat header only after a real page break. */
function ensureAuditTableRowPage(doc, layout, tableY, rowH, hdrH, drawHeaderAt) {
    const { bottomLimit } = layout;
    const rowRenderSlack = 4;
    if (tableY + rowH + rowRenderSlack <= bottomLimit()) {
        return tableY;
    }
    doc.addPage();
    if (layout.onNewPage) layout.onNewPage(doc);
    const nextY = drawHeaderAt(doc.y);
    doc.y = nextY;
    return nextY;
}

function ensureAuditTableBlockPage(doc, layout, tableY, blockH) {
    const { bottomLimit } = layout;
    if (tableY + blockH <= bottomLimit()) {
        return tableY;
    }
    doc.addPage();
    if (layout.onNewPage) layout.onNewPage(doc);
    return doc.y;
}

function resolveInventoryCountTableStyle() {
    return {
        hdrH: A.inventoryCountTableHdrH ?? 20,
        hdrSize: A.inventoryCountTableHdrSize ?? 6.25,
        minRowH: A.inventoryCountTableRowMin ?? 18,
        padY: A.inventoryCountTableCellPadY ?? 4,
        maxNameH: A.inventoryCountTableMaxNameH ?? 26,
        nameLineGap: A.inventoryCountTableNameLineGap ?? 0.5,
        barcodeSize: A.inventoryCountBarcodeSize ?? 6.25,
        indexSize: A.inventoryCountTableIndexSize ?? 6.75,
        nameSize: A.tableNameSize || 7.5,
        bodySize: A.tableBodySize || 7.5,
    };
}

function resolveInventoryCountVarianceColor(varianceQty) {
    const n = Number(varianceQty) || 0;
    if (n > 0) return COUNT_VARIANCE_SURPLUS;
    if (n < 0) return COUNT_VARIANCE_SHORTAGE;
    return '#334155';
}

function formatInventoryCountQty(value) {
    return Number(value || 0).toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    });
}

function formatInventoryCountTotalQty(value) {
    return Number(value || 0).toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function drawAuditInventoryCountTotalNumeric(
    doc, layout, columns, marginLeft, index, padX, textY, value, color, fontSize,
) {
    const col = columns[index];
    const cellLeft = auditTableColLeft(columns, marginLeft, index);
    const cellRight = cellLeft + col.width - padX;
    const label = String(value);
    const cursorY = doc.y;
    const marginBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(color).fontSize(fontSize).font(auditBold(doc, layout));
    const textW = doc.widthOfString(label);
    const drawX = col.align === 'right'
        ? Math.max(cellLeft + padX, cellRight - textW)
        : cellLeft + padX;
    doc.text(label, drawX, textY, { lineBreak: false, ellipsis: false });
    doc.page.margins.bottom = marginBottom;
    doc.y = cursorY;
}

const AUDIT_INVENTORY_COUNT_TABLE_HEADERS = [
    '#', 'Item', 'Barcode', 'Location', 'Book Qty', 'Counted', 'Variance', 'Var. Value (SAR)',
];

function buildAuditInventoryCountTableColumns(pageWidth) {
    const colRatios = [0.034, 0.150, 0.106, 0.120, 0.078, 0.078, 0.078, 0.122];
    const minWidths = [28, 48, 72, 44, 36, 36, 36, 62];
    // Keep variance value wide enough for TOTAL e.g. "SAR -1711.27" on one line — do not shrink col 7.
    const flexShrinkOrder = [1, 3];
    const aligns = ['center', 'left', 'left', 'left', 'right', 'right', 'right', 'right'];
    const keys = ['index', 'name', 'barcode', 'location', 'bookQty', 'countedQty', 'varianceQty', 'varianceValue'];

    const widths = colRatios.map((ratio) => Math.floor(pageWidth * ratio));
    let remainder = pageWidth - widths.reduce((sum, w) => sum + w, 0);
    widths[1] += remainder;
    remainder = 0;

    for (let i = 0; i < widths.length; i += 1) {
        if (widths[i] >= minWidths[i]) continue;
        let deficit = minWidths[i] - widths[i];
        widths[i] = minWidths[i];
        for (const shrinkIdx of flexShrinkOrder) {
            if (deficit <= 0) break;
            const canTake = widths[shrinkIdx] - minWidths[shrinkIdx];
            if (canTake <= 0) continue;
            const take = Math.min(canTake, deficit);
            widths[shrinkIdx] -= take;
            deficit -= take;
        }
    }

    return widths.map((width, i) => ({ key: keys[i], width, align: aligns[i] }));
}

function drawAuditInventoryCountTableHeader(doc, layout, y, columns, marginLeft, pageWidth) {
    const icStyle = resolveInventoryCountTableStyle();
    const hdrH = icStyle.hdrH;
    const hdrSize = icStyle.hdrSize;
    const padX = A.tableCellPadX ?? 5;
    const hdrColor = A.tableHeaderTextColor || '#ffffff';

    doc.fillColor(GOLDEN_NAVY).rect(marginLeft, y, pageWidth, hdrH).fill();
    const hdrTextY = y + (hdrH - hdrSize) / 2 - 0.5;
    columns.forEach((col, i) => {
        doc.fillColor(hdrColor).fontSize(hdrSize).font(auditBold(doc, layout))
            .text(AUDIT_INVENTORY_COUNT_TABLE_HEADERS[i].toUpperCase(), auditTableColLeft(columns, marginLeft, i) + padX, hdrTextY, {
                width: auditTableCellInnerW(col, padX),
                height: hdrH - 4,
                align: col.align,
                lineBreak: false,
                ellipsis: true,
            });
    });
    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, y, hdrH, {
        color: A.tableHeaderGridColor || '#3d5a80',
        weight: 0.3,
    });
    return y + hdrH;
}

function drawAuditInventoryCountTableDataRow(doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth, fmtMoney, currency) {
    const icStyle = resolveInventoryCountTableStyle();
    const padX = A.tableCellPadX ?? 5;
    const padY = icStyle.padY;
    const bodySize = icStyle.bodySize;
    const nameSize = icStyle.nameSize;
    const barcodeSize = icStyle.barcodeSize;
    const varianceColor = resolveInventoryCountVarianceColor(row.varianceQty);
    const displayName = sanitizePrintableText(row.itemName) || '—';
    const nameCol = columns[1];
    const nameW = auditTableCellInnerW(nameCol, padX);
    const singleLineY = auditTableTextY(tableY, rowH, bodySize);
    const nameLineY = auditTableTextY(tableY, rowH, nameSize);
    const barcodeLineY = auditTableTextY(tableY, rowH, barcodeSize);
    const cursorY = doc.y;
    const marginBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.fillColor(BRAND_WHITE).rect(marginLeft, tableY, pageWidth, rowH).fill();

    columns.forEach((col, i) => {
        const cellX = auditTableColLeft(columns, marginLeft, i) + padX;
        const cellW = auditTableCellInnerW(col, padX);
        const key = col.key;
        if (key === 'index') {
            const indexSize = icStyle.indexSize ?? 6.75;
            const indexLineY = auditTableTextY(tableY, rowH, indexSize);
            doc.fillColor('#334155').fontSize(indexSize).font(auditBody(doc, layout))
                .text(String(row.index), cellX, indexLineY, {
                    width: cellW,
                    align: col.align,
                    lineBreak: false,
                    ellipsis: false,
                });
        } else if (key === 'name') {
            doc.fillColor(A.tableNameColor || '#1e293b').fontSize(nameSize).font(auditBody(doc, layout))
                .text(displayName, cellX, nameLineY, {
                    width: nameW,
                    align: 'left',
                    lineBreak: false,
                    ellipsis: true,
                });
        } else if (key === 'barcode') {
            doc.fillColor('#334155').fontSize(barcodeSize).font(auditBody(doc, layout))
                .text(String(row.barcode || '—'), cellX, barcodeLineY, {
                    width: cellW,
                    align: col.align,
                    lineBreak: false,
                    ellipsis: true,
                });
        } else if (key === 'location') {
            doc.fillColor('#334155').fontSize(bodySize).font(auditBody(doc, layout))
                .text(String(row.location || '—'), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false, ellipsis: true,
                });
        } else if (key === 'bookQty') {
            doc.fillColor('#334155').fontSize(bodySize).font(auditBody(doc, layout))
                .text(formatInventoryCountQty(row.bookQty), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false,
                });
        } else if (key === 'countedQty') {
            doc.fillColor('#334155').fontSize(bodySize).font(auditBody(doc, layout))
                .text(formatInventoryCountQty(row.countedQty), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false,
                });
        } else if (key === 'varianceQty') {
            doc.fillColor(varianceColor).fontSize(bodySize).font(auditBody(doc, layout))
                .text(formatInventoryCountQty(row.varianceQty), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false,
                });
        } else if (key === 'varianceValue') {
            doc.fillColor(varianceColor).fontSize(bodySize).font(auditBody(doc, layout))
                .text(fmtMoney(row.varianceValue, currency), cellX, singleLineY, {
                    width: cellW, align: col.align, lineBreak: false,
                });
        }
    });

    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, tableY, rowH);
    doc.page.margins.bottom = marginBottom;
    doc.y = cursorY;
}

function drawAuditInventoryCountTableTotalRow(
    doc, layout, tableY, columns, marginLeft, pageWidth,
    totalBook, totalCounted, totalVarianceQty, totalVarianceValue, fmtMoney, currency,
) {
    const totalH = A.tableTotalH || 22;
    const subtotalSize = A.tableTotalSubtotalSize || 8.25;
    const numericSize = A.inventoryCountTableTotalNumericSize ?? 7;
    const padX = A.tableCellPadX ?? 5;
    const totalBg = A.tableTotalBg || '#f2f2f2';
    const topBorder = A.tableTotalTopBorder || '#9aa8b8';
    const right = marginLeft + pageWidth;
    const varianceColor = resolveInventoryCountVarianceColor(totalVarianceQty);
    const cursorY = doc.y;
    const marginBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.strokeColor(topBorder).lineWidth(A.tableTotalTopBorderWeight ?? 0.75)
        .moveTo(marginLeft, tableY).lineTo(right, tableY).stroke();
    doc.fillColor(totalBg).rect(marginLeft, tableY, pageWidth, totalH).fill();
    drawAuditTableGridLines(doc, columns, marginLeft, pageWidth, tableY, totalH, {
        color: A.tableTotalGridColor || '#cbd5e1',
        weight: 0.35,
    });

    const textY = resolveAuditSubtotalTextY(doc, layout, tableY, totalH, subtotalSize);
    const labelX = auditTableColLeft(columns, marginLeft, 1) + padX;
    const labelW = Math.max(auditTableSpanWidth(columns, 1, 4) - padX * 2, 24);

    doc.fillColor(GOLDEN_NAVY).fontSize(subtotalSize).font(auditBold(doc, layout))
        .text('TOTAL', labelX, textY, {
            width: labelW, align: 'left', lineBreak: false,
            characterSpacing: A.tableTotalLabelTracking ?? 0.3,
        });

    const qtyCols = [
        { index: 4, value: formatInventoryCountTotalQty(totalBook), color: GOLDEN_NAVY },
        { index: 5, value: formatInventoryCountTotalQty(totalCounted), color: GOLDEN_NAVY },
        { index: 6, value: formatInventoryCountTotalQty(totalVarianceQty), color: varianceColor },
        { index: 7, value: fmtMoney(totalVarianceValue, currency), color: varianceColor },
    ];

    qtyCols.forEach(({ index, value, color }) => {
        drawAuditInventoryCountTotalNumeric(
            doc, layout, columns, marginLeft, index, padX, textY, value, color, numericSize,
        );
    });

    doc.page.margins.bottom = marginBottom;
    doc.y = cursorY;
}

function drawAuditInventoryCountLinesTable(doc, layout, lines = [], options = {}) {
    const { marginLeft, pageWidth, ensureSpace, bottomLimit, formatMoney } = layout;
    const currency = options.currency || 'SAR';
    const sectionTitle = options.sectionTitle || 'Count Lines';
    const icStyle = resolveInventoryCountTableStyle();
    const hdrH = icStyle.hdrH;
    const fmtMoneyFn = typeof formatMoney === 'function' ? formatMoney : (v) => formatMoney(v, currency);

    drawGoldenSectionTitle(doc, layout, sectionTitle, hdrH + 4);

    const columns = buildAuditInventoryCountTableColumns(pageWidth);
    const MIN_ROW_H = icStyle.minRowH;
    const padY = icStyle.padY;
    const nameSize = icStyle.nameSize;
    const MAX_NAME_H = icStyle.maxNameH;
    let tableY = doc.y;

    const drawHeaderAt = (y) => drawAuditInventoryCountTableHeader(doc, layout, y, columns, marginLeft, pageWidth);
    tableY = drawHeaderAt(tableY);
    doc.y = tableY;

    let totalBook = 0;
    let totalCounted = 0;
    let totalVarianceQty = 0;
    let totalVarianceValue = 0;

    lines.forEach((line, idx) => {
        const row = {
            index: idx + 1,
            itemName: line.item,
            barcode: line.barcode && line.barcode !== '—' ? line.barcode : (line.itemCode || '—'),
            location: line.location,
            bookQty: line.bookQty,
            countedQty: line.countedQty,
            varianceQty: line.varianceQty,
            varianceValue: line.varianceValueEstimate,
        };

        const nameCol = columns[1];
        const nameW = auditTableCellInnerW(nameCol, A.tableCellPadX ?? 5);
        const displayName = sanitizePrintableText(row.itemName) || '—';
        doc.fontSize(nameSize).font(auditBody(doc, layout));
        const nameH = Math.min(
            doc.heightOfString(displayName, { width: nameW, lineBreak: false }),
            MAX_NAME_H,
        );
        const rowH = Math.max(MIN_ROW_H, Math.ceil(nameH) + padY * 2);

        tableY = ensureAuditTableRowPage(doc, layout, tableY, rowH, hdrH, drawHeaderAt);

        totalBook += Number(row.bookQty) || 0;
        totalCounted += Number(row.countedQty) || 0;
        totalVarianceQty += Number(row.varianceQty) || 0;
        totalVarianceValue += Number(row.varianceValue) || 0;

        drawAuditInventoryCountTableDataRow(
            doc, layout, tableY, rowH, row, columns, marginLeft, pageWidth, fmtMoneyFn, currency,
        );
        tableY += rowH;
        doc.y = tableY;
    });

    const TOTAL_H = A.tableTotalH || 22;
    const FOOTNOTE_H = 10;
    tableY = ensureAuditTableBlockPage(doc, layout, tableY, TOTAL_H + FOOTNOTE_H);

    drawAuditInventoryCountTableTotalRow(
        doc, layout, tableY, columns, marginLeft, pageWidth,
        totalBook, totalCounted, totalVarianceQty, totalVarianceValue, fmtMoneyFn, currency,
    );
    tableY += TOTAL_H;

    doc.fillColor('#64748b').fontSize(5.5).font(auditBody(doc, layout))
        .text(
            'Table totals are net signed quantities and values.',
            marginLeft,
            tableY + 2,
            { width: pageWidth, lineBreak: false },
        );

    doc.y = tableY + FOOTNOTE_H + (A.sectionGapBefore ?? 12);
    return {
        totalBook,
        totalCounted,
        totalVarianceQty,
        totalVarianceValue,
    };
}

function resolveReceiptContextNotes(header = {}) {
    const raw = header.notes != null ? String(header.notes).trim() : '';
    if (!raw || isEmptyReportField(raw) || /^test$/i.test(raw)) return '';
    return sanitizePrintableText(raw.replace(/\s*\n\s*/g, ' · '));
}

function measureReceiptContextColumnWidths(doc, layout, labels, values, labelSize, valueSize, pageWidth) {
    const innerPad = 20;
    const minW = 72;
    doc.fontSize(labelSize).font(auditBold(doc, layout));
    const labelWidths = labels.map((label) => doc.widthOfString(String(label).toUpperCase()));
    doc.fontSize(valueSize).font(auditSemiBold(doc, layout));
    const valueWidths = values.map((value) => doc.widthOfString(String(value)));

    let colWidths = labels.map((_, i) => Math.max(
        minW,
        Math.ceil(Math.max(labelWidths[i], valueWidths[i]) + innerPad),
    ));

    let panelWidth = colWidths.reduce((sum, w) => sum + w, 0);
    if (panelWidth > pageWidth) {
        const scale = pageWidth / panelWidth;
        colWidths = colWidths.map((w) => Math.max(minW, Math.floor(w * scale)));
        panelWidth = colWidths.reduce((sum, w) => sum + w, 0);
        if (panelWidth > pageWidth) {
            const overflow = panelWidth - pageWidth;
            colWidths[colWidths.length - 1] = Math.max(minW, colWidths[colWidths.length - 1] - overflow);
            panelWidth = colWidths.reduce((sum, w) => sum + w, 0);
        }
    }

    return { colWidths, panelWidth };
}

function drawAuditReceiptContext(doc, layout, header = {}) {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const padTop = A.lossTreatmentPadY ?? 2;
    const padBottom = A.lossTreatmentPadBottom ?? 2;
    const labelSize = A.lossTreatmentLabelSize ?? 5.25;
    const valueSize = A.lossTreatmentValueSize ?? 7;
    const sectionTail = A.lossTreatmentSectionTail ?? 0;
    const labelH = A.lossTreatmentLabelH ?? 6;
    const valueH = A.lossTreatmentValueH ?? 8;
    const innerGap = A.lossTreatmentInnerGap ?? 2;
    const valueOffset = padTop + labelH + innerGap;
    const basePanelH = padTop + labelH + innerGap + valueH + padBottom;

    const noteText = resolveReceiptContextNotes(header);
    const hasNotes = noteText.length > 0;
    const notesBlockH = hasNotes ? padTop + labelH + innerGap + valueH + padBottom : 0;
    const notesDividerGap = hasNotes ? 1 : 0;

    const labels = ['SUPPLIER', 'INVOICE REFERENCE', 'RECEIVING LOCATION'];
    const values = [
        sanitizePrintableText(header.supplierName) || '—',
        sanitizePrintableText(header.invoiceRef) || '—',
        sanitizePrintableText(header.receivingLocation) || '—',
    ];

    const { colWidths, panelWidth } = measureReceiptContextColumnWidths(
        doc, layout, labels, values, labelSize, valueSize, pageWidth,
    );

    const panelH = basePanelH + notesDividerGap + notesBlockH;
    const blockH = panelH + sectionTail;

    ensureSpace(blockH + 8);
    const panelY = drawGoldenSectionTitle(doc, layout, 'Receipt Context', blockH, {
        gapBefore: A.lossTreatmentGapBefore ?? 8,
    });

    doc.fillColor(PANEL_FILL).rect(marginLeft, panelY, panelWidth, panelH).fill();
    doc.strokeColor(GRIDLINE).lineWidth(0.45).rect(marginLeft, panelY, panelWidth, panelH).stroke();

    let colX = marginLeft;
    labels.forEach((label, i) => {
        const colW = colWidths[i];
        const labelX = colX + 10;
        const innerW = colW - 20;
        doc.fillColor('#64748b').fontSize(labelSize).font(auditBold(doc, layout))
            .text(label, labelX, panelY + padTop, { width: innerW, height: labelH, lineBreak: false, characterSpacing: 0.15 });
        doc.fillColor(GOLDEN_NAVY).fontSize(valueSize).font(auditSemiBold(doc, layout))
            .text(values[i], labelX, panelY + valueOffset, {
                width: innerW, lineBreak: false, ellipsis: true,
            });
        if (i > 0) {
            doc.strokeColor('#e2e8f0').lineWidth(0.35)
                .moveTo(colX, panelY + 2).lineTo(colX, panelY + basePanelH - 2).stroke();
        }
        colX += colW;
    });

    if (hasNotes) {
        const dividerY = panelY + basePanelH;
        doc.strokeColor('#e2e8f0').lineWidth(0.35)
            .moveTo(marginLeft + 10, dividerY)
            .lineTo(marginLeft + panelWidth - 10, dividerY)
            .stroke();

        const notesLabelY = dividerY + notesDividerGap + padTop;
        const notesValueY = notesLabelY + labelH + innerGap;
        const notesPadX = 10;
        const notesInnerW = panelWidth - notesPadX * 2;

        doc.fillColor('#64748b').fontSize(labelSize).font(auditBold(doc, layout))
            .text('NOTES', marginLeft + notesPadX, notesLabelY, {
                width: notesInnerW, height: labelH, lineBreak: false, characterSpacing: 0.15,
            });
        doc.fillColor(GOLDEN_NAVY).fontSize(valueSize).font(auditSemiBold(doc, layout))
            .text(noteText, marginLeft + notesPadX, notesValueY, {
                width: notesInnerW, height: valueH, lineBreak: false, ellipsis: true,
            });
    }

    doc.y = panelY + panelH + sectionTail;
}

function resolveLossChargeTypeLabel(chargeTo) {
    if (chargeTo === 'employee') {
        return { label: LABEL_EMPLOYEE_DEDUCTION, accent: true };
    }
    if (chargeTo === 'hotel') {
        return { label: LABEL_HOTEL_EXPENSES, accent: false };
    }
    return { label: 'Not Specified', accent: false, muted: true };
}

function normalizeAccountabilityCompare(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function shouldShowAccountabilityNote(noteText, responsibleParty) {
    const note = String(noteText || '').trim();
    if (!note) return false;
    const noteNorm = normalizeAccountabilityCompare(note);
    const partyNorm = normalizeAccountabilityCompare(responsibleParty);
    if (!noteNorm) return false;
    if (partyNorm && noteNorm === partyNorm) return false;
    return true;
}

function drawAuditLossTreatment(doc, layout, header = {}, stockImpactSummary = {}, approvalHistory = []) {
    const { marginLeft, pageWidth, ensureSpace, formatMoney } = layout;
    const padTop = A.lossTreatmentPadY ?? 2;
    const padBottom = A.lossTreatmentPadBottom ?? 2;
    const labelSize = A.lossTreatmentLabelSize ?? 5.25;
    const valueSize = A.lossTreatmentValueSize ?? 7;
    const noteSize = A.lossTreatmentNoteSize ?? 5;
    const sectionTail = A.lossTreatmentSectionTail ?? 0;
    const labelH = A.lossTreatmentLabelH ?? 6;
    const valueH = A.lossTreatmentValueH ?? 8;
    const innerGap = A.lossTreatmentInnerGap ?? 2;
    const valueOffset = padTop + labelH + innerGap;
    const panelH = padTop + labelH + innerGap + valueH + padBottom;

    const treatment = resolveFinalLossTreatmentFromApprovalHistory(header, approvalHistory);
    const loss = resolveLossResponsibility(header, approvalHistory);
    const charge = resolveLossChargeTypeLabel(treatment.chargeTo);
    const currency = stockImpactSummary.currency || 'SAR';
    const totalLoss = stockImpactSummary.totalLossValue ?? 0;
    const financialImpact = formatMoney(totalLoss, currency);
    const responsibleParty =
        treatment.chargeTo === 'employee'
            ? (sanitizePrintableText(treatment.responsibleParty) || loss.employee || '—')
            : '—';
    const rawNote =
        treatment.chargeTo === 'employee' && loss.comment
            ? sanitizePrintableText(loss.comment)
            : '';
    const noteText = shouldShowAccountabilityNote(rawNote, responsibleParty) ? rawNote : '';
    const noteH = noteText ? 9 : 0;
    const blockH = panelH + noteH + sectionTail;

    ensureSpace(blockH + 8);
    const panelY = drawGoldenSectionTitle(doc, layout, 'Loss Treatment', blockH, {
        gapBefore: A.lossTreatmentGapBefore ?? 8,
    });

    doc.fillColor(PANEL_FILL).rect(marginLeft, panelY, pageWidth, panelH).fill();
    doc.strokeColor(GRIDLINE).lineWidth(0.45).rect(marginLeft, panelY, pageWidth, panelH).stroke();

    const colW = pageWidth / 3;
    const labels = ['CHARGE TYPE', 'FINANCIAL IMPACT', 'RESPONSIBLE PARTY'];
    const values = [charge.label, financialImpact, responsibleParty];
    const valueColors = [
        charge.muted ? '#64748b' : (charge.accent ? LOSS_RED : GOLDEN_NAVY),
        charge.accent ? LOSS_RED : GOLDEN_NAVY,
        '#334155',
    ];

    labels.forEach((label, i) => {
        const x = marginLeft + i * colW;
        const labelX = x + 10;
        const innerW = colW - 20;
        doc.fillColor('#64748b').fontSize(labelSize).font(auditBold(doc, layout))
            .text(label, labelX, panelY + padTop, { width: innerW, height: labelH, lineBreak: false, characterSpacing: 0.15 });
        doc.fillColor(valueColors[i]).fontSize(valueSize).font(auditSemiBold(doc, layout))
            .text(values[i], labelX, panelY + valueOffset, {
                width: innerW,
                align: i === 1 ? 'left' : 'left',
                lineBreak: false,
                ellipsis: true,
            });
        if (i > 0) {
            doc.strokeColor('#e2e8f0').lineWidth(0.35)
                .moveTo(x, panelY + 2).lineTo(x, panelY + panelH - 2).stroke();
        }
    });

    let endY = panelY + panelH;
    if (noteText) {
        doc.fillColor('#64748b').fontSize(noteSize).font(auditBody(doc, layout))
            .text(`Accountability note: ${noteText}`, marginLeft + 10, endY + 2, {
                width: pageWidth - 20, height: 7, lineBreak: false, ellipsis: true,
            });
        endY += noteH;
    }

    doc.y = endY + sectionTail;
}

function resolveTimelineStageTitle(slot) {
    const raw = String(slot.label || slot.labelEn || slot.role || '—').toUpperCase().trim();
    const passthroughTitles = [
        'VARIANCE REVIEW',
        'FINANCE APPROVED',
        'GENERAL MANAGER APPROVED',
        'POSTED TO INVENTORY',
        'RECEIVED & VALIDATED',
        'RESUBMITTED',
        'SENT BACK',
        'REJECTED',
        'RECOUNT REQUESTED',
        'CANCELLED',
    ];
    if (passthroughTitles.includes(raw)) return raw;
    if (raw === 'IMPORTED' || raw === 'IMPORT') return 'IMPORT';
    if (raw === 'POSTED') return 'POSTED';
    if (raw === 'RETURNED' || raw.includes('PARTIALLY RETURNED')) {
        return raw.includes('PARTIALLY') ? 'PARTIALLY RETURNED' : 'RETURNED';
    }
    if (raw.includes('SECURITY CLEARANCE')) return 'SECURITY CLEARANCE';
    if (raw.includes('PREPARED')) return 'PREPARED BY';
    if (raw.includes('DEPARTMENT HEAD')) return 'DEPARTMENT HEAD';
    if (raw === 'COST CONTROL' || (raw.includes('COST') && raw.includes('CONTROL') && !raw.includes('APPROVAL'))) {
        return 'COST CONTROL';
    }
    if (raw.includes('FINANCE MANAGER')) return 'FINANCE MANAGER';
    if (raw.includes('GENERAL MANAGER')) return 'GENERAL MANAGER';
    if (raw === 'SECURITY' || (raw.includes('SECURITY') && !raw.includes('CLEARANCE') && !raw.includes('EXIT'))) {
        return 'SECURITY';
    }
    if (raw.includes('REQUESTED')) return 'REQUESTED';
    if (raw.includes('DEPT')) return 'DEPARTMENT APPROVAL';
    if (raw.includes('FINANCE')) return 'FINANCE APPROVAL';
    if (raw.includes('STOREKEEPER')) return 'STOREKEEPER';
    if (raw.includes('HOD')) return 'HOD APPROVAL';
    if (raw.includes('COST') && raw.includes('CONTROL')) return 'COST CONTROL APPROVAL';
    if (raw.includes('GENERAL') || raw === 'GM') return 'GM APPROVAL';
    if (!raw.includes('APPROVAL')) return `${raw} APPROVAL`;
    return raw;
}

function drawTimelineStatusNode(doc, cx, cy, r, status) {
    const key = String(status || '').toUpperCase();
    if (key.includes('REJECT')) {
        doc.fillColor('#991b1b').circle(cx, cy, r).fill();
        return;
    }
    if (isWorkflowStepComplete(status)) {
        doc.fillColor('#15803d').circle(cx, cy, r).fill();
        doc.strokeColor('#ffffff').lineWidth(0.35)
            .moveTo(cx - r * 0.34, cy + r * 0.02)
            .lineTo(cx - r * 0.04, cy + r * 0.3)
            .lineTo(cx + r * 0.4, cy - r * 0.26)
            .stroke();
        return;
    }
    doc.strokeColor('#94a3b8').lineWidth(0.45).circle(cx, cy, r).stroke();
}

function drawTimelineConnectorRail(doc, stepCenters, railY, nodeR) {
    if (stepCenters.length < 2) return;
    const head = 2.8;
    doc.strokeColor('#b8c4d0').lineWidth(0.45);
    for (let i = 0; i < stepCenters.length - 1; i += 1) {
        const x1 = stepCenters[i] + nodeR + 0.5;
        const x2 = stepCenters[i + 1] - nodeR - 0.5;
        doc.moveTo(x1, railY).lineTo(x2 - head + 0.3, railY).stroke();
        doc.fillColor('#b8c4d0')
            .moveTo(x2, railY)
            .lineTo(x2 - head, railY - 1.4)
            .lineTo(x2 - head, railY + 1.4)
            .closePath()
            .fill();
    }
}

function formatTimelineTimestamp(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function filterChainApprovalSlots(slots = []) {
    return slots.filter((slot) => {
        const label = String(slot.label || slot.role || '').trim().toLowerCase();
        // Drop preparer bookend only ("Submitted by"). Keep Resubmitted / lifecycle rows.
        if (label.includes('resubmit')) return true;
        if (label === 'submitted by' || label.startsWith('submitted by ')) return false;
        return true;
    });
}

function approvalRowStepWidth(slotCount, innerW, connectorW, stageGap) {
    if (slotCount <= 0) return innerW;
    if (slotCount === 1) return innerW;
    const connectorZone = (slotCount - 1) * (connectorW + stageGap);
    return (innerW - connectorZone) / slotCount;
}

function approvalRowFits(slotCount, innerW, connectorW, stageGap, minStepW) {
    return approvalRowStepWidth(slotCount, innerW, connectorW, stageGap) >= minStepW;
}

function splitApprovalSlotsIntoRows(slots, rowCount) {
    const rows = [];
    const perRow = Math.ceil(slots.length / rowCount);
    for (let i = 0; i < slots.length; i += perRow) {
        rows.push(slots.slice(i, i + perRow));
    }
    return rows;
}

function planApprovalWorkflowRows(slots, innerW, connectorW, stageGap, minStepW) {
    if (!slots.length) return [];
    if (approvalRowFits(slots.length, innerW, connectorW, stageGap, minStepW)) {
        return [slots];
    }
    const twoRowSplit = splitApprovalSlotsIntoRows(slots, 2);
    if (twoRowSplit.every((row) => approvalRowFits(row.length, innerW, connectorW, stageGap, minStepW))) {
        return twoRowSplit;
    }
    return splitApprovalSlotsIntoRows(slots, Math.ceil(slots.length / 2));
}

function drawApprovalWorkflowRow(doc, layout, {
    rowSlots,
    innerX,
    innerW,
    rowTopY,
    timelineH,
    padY,
    connectorW,
    stageGap,
    titleSize,
    nameSize,
    dateSize,
    lineGap,
    nodeR,
    railGap,
    titleMaxLines = 2,
}) {
    const n = rowSlots.length;
    const connectorZone = n > 1 ? (n - 1) * (connectorW + stageGap) : 0;
    const stepW = n > 1 ? (innerW - connectorZone) / n : innerW;
    const railY = rowTopY + padY + nodeR;
    const titleY = railY + nodeR + railGap;
    const stepCenters = [];
    // Allow long stage titles to wrap (prevents overlap onto actor name).
    const titleLineH = titleSize + 0.75;
    const titleMaxH = titleLineH * Math.max(1, titleMaxLines);

    for (let i = 0; i < n; i += 1) {
        stepCenters.push(innerX + i * (stepW + connectorW + stageGap) + stepW / 2);
    }

    if (n > 1) {
        drawTimelineConnectorRail(doc, stepCenters, railY, nodeR);
    }

    rowSlots.forEach((slot, i) => {
        const stepX = innerX + i * (stepW + connectorW + stageGap);
        const cx = stepCenters[i];
        const done = isWorkflowStepComplete(slot.status);
        const title = resolveTimelineStageTitle(slot);
        const omitActorLine = slot.omitActorLine === true;
        const name = omitActorLine ? '' : (slot.name || (done ? '—' : 'Pending'));
        const dateStr = formatTimelineTimestamp(slot.date);

        drawTimelineStatusNode(doc, cx, railY, nodeR, slot.status);

        doc.fillColor(GOLDEN_NAVY).fontSize(titleSize).font(auditBold(doc, layout));
        const singleLineW = doc.widthOfString(title);
        // PDFKit heightOfString can under-report wrapped centered titles; detect wrap by width.
        const needsWrap = singleLineW > stepW * 0.98;
        const titleH = needsWrap ? titleMaxH : titleSize;
        doc.text(title, stepX, titleY, {
            width: stepW,
            align: 'center',
            height: titleH + 0.5,
            lineGap: 0.5,
        });

        // Extra gap after wrapped titles so actor name never collides with line 2.
        const afterTitleGap = needsWrap ? lineGap + 1.5 : lineGap;
        const nameY = titleY + titleH + afterTitleGap;
        const dateY = omitActorLine ? nameY : nameY + nameSize + lineGap;

        if (!omitActorLine) {
            doc.fillColor('#475569').fontSize(nameSize).font(auditBody(doc, layout))
                .text(name, stepX, nameY, {
                    width: stepW, align: 'center', ellipsis: true, lineBreak: false,
                });
        }

        if (dateStr) {
            doc.fillColor('#94a3b8').fontSize(dateSize).font(auditBody(doc, layout))
                .text(dateStr, stepX, dateY, {
                    width: stepW, align: 'center', lineBreak: false,
                });
        }
    });
}

function drawAuditApprovalWorkflow(doc, layout, slots = [], theme = {}, options = {}) {
    const chainSlots = filterChainApprovalSlots(slots);
    if (!chainSlots.length) return;

    const { marginLeft, pageWidth } = layout;
    const useCompact = options.compactWorkflow === true;
    const padY = useCompact
        ? (A.inventoryCountApprovalPadY ?? 3)
        : (A.approvalTimelinePadY ?? 6);
    const padX = useCompact
        ? (A.inventoryCountApprovalPadX ?? 5)
        : (A.approvalTimelinePadX ?? 6);
    const stageGap = options.stageGap ?? (useCompact ? 14 : (A.approvalTimelineStageGap ?? 10));
    const connectorW = options.connectorW ?? A.approvalTimelineConnectorW ?? 6;
    const minStepW = options.minStepWidth ?? (useCompact ? 56 : (A.approvalTimelineMinStepW ?? 68));
    const rowGap = useCompact ? 6 : (A.approvalTimelineRowGap ?? 8);
    const titleSize = useCompact
        ? (A.inventoryCountApprovalTitleSize ?? 5.5)
        : (A.approvalTimelineTitleSize || 6.25);
    const nameSize = useCompact
        ? (A.inventoryCountApprovalNameSize ?? 5)
        : (A.approvalTimelineNameSize || 5.75);
    const dateSize = useCompact
        ? (A.inventoryCountApprovalDateSize ?? 4.25)
        : (A.approvalTimelineDateSize || 4.5);
    const lineGap = useCompact
        ? (A.inventoryCountApprovalLineGap ?? 1)
        : (A.approvalTimelineLineGap ?? 2);
    const nodeR = useCompact
        ? (A.inventoryCountApprovalNodeR ?? 2)
        : (A.approvalTimelineNodeR ?? 2.5);
    const railGap = useCompact
        ? (A.inventoryCountApprovalRailGap ?? 2)
        : (A.approvalTimelineRailGap ?? 2.5);
    const sectionTail = useCompact
        ? (A.inventoryCountApprovalSectionTail ?? 1)
        : (A.approvalSectionTail ?? 2);
    const titleMaxLines = useCompact ? 2 : 2;
    const titleLineH = titleSize + 0.75;
    const titleBlockH = titleLineH * titleMaxLines;
    const textStackH = titleBlockH + lineGap + nameSize + lineGap + dateSize;
    const timelineH = useCompact
        ? Math.max(
            A.inventoryCountApprovalTimelineH ?? 26,
            padY * 2 + nodeR * 2 + railGap + textStackH + 2,
        )
        : Math.max(
            A.approvalTimelineH || 36,
            padY * 2 + nodeR * 2 + railGap + textStackH + 3,
        );

    const innerW = pageWidth - padX * 2;
    const innerX = marginLeft + padX;
    const rowLayouts = planApprovalWorkflowRows(chainSlots, innerW, connectorW, stageGap, minStepW);
    const rowCount = rowLayouts.length;
    const panelH = rowCount * timelineH + (rowCount > 1 ? (rowCount - 1) * rowGap : 0) + padY * 2;

    const panelY = drawGoldenSectionTitle(doc, layout, 'Approval Workflow', panelH + sectionTail, {
        gapBefore: useCompact
            ? (A.inventoryCountApprovalGapBefore ?? 4)
            : (A.lossTreatmentGapBeforeApproval ?? 6),
    });

    doc.fillColor(PANEL_FILL).rect(marginLeft, panelY, pageWidth, panelH).fill();
    doc.strokeColor(GRIDLINE).lineWidth(0.45).rect(marginLeft, panelY, pageWidth, panelH).stroke();

    rowLayouts.forEach((rowSlots, rowIndex) => {
        const rowTopY = panelY + padY + rowIndex * (timelineH + rowGap);
        drawApprovalWorkflowRow(doc, layout, {
            rowSlots,
            innerX,
            innerW,
            rowTopY,
            timelineH,
            padY,
            connectorW,
            stageGap,
            titleSize,
            nameSize,
            dateSize,
            lineGap,
            nodeR,
            railGap,
            titleMaxLines,
        });
    });

    doc.y = panelY + panelH + sectionTail;
}

function shortenCaption(caption = '', max = 52) {
    const text = String(caption).trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

function drawAuditMiniHeader(doc, options = {}, layout = {}) {
    drawAuditEvidencePageHeader(doc, layout, {
        title: options.title || options.packTitle || 'EVIDENCE PHOTOS',
        subtitle: options.reportReference || options.documentNo,
        classification: options.classification,
    }, 0);
}

function drawAuditEvidencePageHeader(doc, layout, meta = {}, photoCount = 0) {
    drawGoldenPageHeader(doc, layout, {
        title: meta.title || 'EVIDENCE PHOTOS',
        subtitle: meta.subtitle || meta.reportReference || meta.documentNo || null,
        classification: meta.classification || 'INTERNAL AUDIT',
    });
}

function drawAuditEvidenceContextStrip(doc, layout, meta = {}, photoCount = 0) {
    const { marginLeft, pageWidth } = layout;
    const bandH = A.photoContextBandH || 38;
    const startY = doc.y;

    doc.fillColor(GOLDEN_NAVY).rect(marginLeft, startY, pageWidth, bandH).fill();

    const attachmentLabel = photoCount === 1 ? '1 file(s)' : `${photoCount} file(s)`;
    const cols = [
        { key: 'document', label: 'DOCUMENT', value: meta.documentNo || '—' },
        { key: 'date', label: 'REPORT DATE', value: formatDate(meta.documentDate || meta.createdAt) },
        { key: 'attachments', label: 'ATTACHMENTS', value: attachmentLabel },
        { key: 'classification', label: 'CLASSIFICATION', value: meta.classification || 'INTERNAL AUDIT' },
    ];
    const colW = pageWidth / cols.length;

    cols.forEach((col, i) => {
        const x = marginLeft + i * colW;
        const iconFn = META_BAR_ICONS[col.key];
        const iconX = x + 14;
        const iconY = startY + 11;
        if (iconFn) iconFn(doc, iconX, iconY, 11, BRAND_WHITE);

        doc.fillColor(BRAND_WHITE).fontSize(5).font(auditBold(doc, layout))
            .text(col.label, iconX + 15, startY + 9, { width: colW - 30, height: 7 });
        doc.fillColor(BRAND_WHITE).fontSize(6.5).font(auditBody(doc, layout))
            .text(String(col.value), iconX + 15, startY + 20, { width: colW - 30, ellipsis: true, height: 9 });

        if (i > 0) {
            doc.strokeColor('#ffffff').lineWidth(0.35)
                .moveTo(x, startY + 7).lineTo(x, startY + bandH - 7).stroke();
        }
    });

    doc.y = startY + bandH + 12;
}

function formatAuditFigureLabel(index) {
    return `FIGURE ${String(index + 1).padStart(2, '0')}`;
}

function drawAuditEvidenceAttestation(doc, layout) {
    const { marginLeft, pageWidth, bottomLimit } = layout;
    const bandH = A.photoAttestationH || 18;
    const padX = A.photoAttestationPadX ?? 20;
    const textSize = A.photoAttestationTextSize ?? 5;
    const y = Math.min(doc.y + 4, bottomLimit() - bandH - 3);

    doc.fillColor('#f2f5f8').rect(marginLeft, y, pageWidth, bandH).fill();
    doc.strokeColor('#cbd5e1').lineWidth(0.4).rect(marginLeft, y, pageWidth, bandH).stroke();

    drawIconShield(doc, marginLeft + 7, y + 3, 10, GOLDEN_NAVY);
    doc.fillColor('#64748b').fontSize(textSize).font(auditBody(doc, layout))
        .text(
            'These photos are supporting evidence attached to this operational audit record. Images are system-indexed and retained as part of the controlled evidence pack.',
            marginLeft + padX,
            y + 4,
            { width: pageWidth - padX - 7, height: bandH - 7, align: 'left' },
        );
    doc.y = y + bandH + 1;
}

function drawAuditEvidenceImage(doc, buffer, x, y, w, h) {
    try {
        doc.image(buffer, x, y, { fit: [w, h], align: 'center', valign: 'center' });
    } catch { /* unavailable */ }
}

function buildAuditPhotoGridMetrics(pageWidth) {
    const cols = A.photoGridCols ?? 2;
    const gap = A.photoGridGap || 10;
    const cellH = A.photoCardH || 152;
    const cellW = (pageWidth - gap * (cols - 1)) / cols;
    return { cols, gap, cellW, cellH, rowBlock: cellH + gap };
}

function resolvePhotoPageCapacity(docY, bottomLimitFn, grid, reserveAttestation) {
    const noteReserve = reserveAttestation
        ? (A.photoAttestationH || 18) + 8
        : (A.photoPageBottomGap ?? 4);
    const available = bottomLimitFn() - docY - noteReserve;
    const maxRows = Math.max(0, Math.floor((available + grid.gap) / grid.rowBlock));
    return maxRows * grid.cols;
}

function resolvePhotoPageLimit(isFirstGalleryPage) {
    const target = A.photoPageCapacity ?? A.photoFirstPageCapacity ?? 8;
    if (isFirstGalleryPage) return A.photoFirstPageCapacity ?? target;
    return A.photoContinuationPageCapacity ?? target;
}

function resolvePhotoBatchCount(docY, bottomLimitFn, grid, remaining, pageLimit) {
    const capacityOpen = Math.min(resolvePhotoPageCapacity(docY, bottomLimitFn, grid, false), pageLimit);
    const capacityFinal = Math.min(resolvePhotoPageCapacity(docY, bottomLimitFn, grid, true), pageLimit);
    if (remaining <= capacityFinal) return remaining;
    return Math.min(remaining, capacityOpen);
}

function normalizePhotoCaption(caption) {
    return String(caption || '').trim();
}

function drawAuditGalleryCell(doc, layout, x, y, cellW, cellH, buffer, figIndex, caption) {
    const captionBand = A.photoCaptionBand || 28;
    const framePad = A.photoFramePad ?? 3;
    const badgeH = A.photoFigureBadgeH || 14;
    const capLabelSize = A.photoCaptionLabelSize ?? 5.25;
    const capTextSize = A.photoCaptionTextSize ?? 7.25;
    const figLabel = formatAuditFigureLabel(figIndex);
    const captionText = normalizePhotoCaption(caption);
    const hasCaption = captionText.length > 0;

    doc.fillColor(BRAND_WHITE).rect(x, y, cellW, cellH).fill();
    doc.strokeColor(GOLDEN_NAVY).lineWidth(0.85).rect(x, y, cellW, cellH).stroke();
    doc.strokeColor('#cbd5e1').lineWidth(0.35).rect(x + 1.5, y + 1.5, cellW - 3, cellH - 3).stroke();

    const imgX = x + framePad;
    const imgY = y + framePad;
    const imgW = cellW - framePad * 2;
    const imgH = cellH - captionBand - framePad - 1;

    doc.fillColor('#f8fafc').rect(imgX, imgY, imgW, imgH).fill();
    doc.strokeColor('#94a3b8').lineWidth(0.55).rect(imgX, imgY, imgW, imgH).stroke();

    if (buffer) {
        drawAuditEvidenceImage(doc, buffer, imgX, imgY, imgW, imgH);
    }

    doc.fontSize(5.25).font(auditBold(doc, layout));
    const badgeW = Math.min(Math.max(doc.widthOfString(figLabel) + 10, 52), imgW - 8);
    doc.fillColor(GOLDEN_NAVY).rect(imgX, imgY, badgeW, badgeH).fill();
    doc.strokeColor('#ffffff').lineWidth(0.35).rect(imgX, imgY, badgeW, badgeH).stroke();
    doc.fillColor(BRAND_WHITE).fontSize(5.25).font(auditBold(doc, layout))
        .text(figLabel, imgX + 5, imgY + 3.5, { width: badgeW - 10, height: badgeH - 5, lineBreak: false });

    if (!buffer) {
        doc.fillColor('#94a3b8').fontSize(6.5).font(auditBody(doc, layout))
            .text('Image unavailable', imgX, imgY + imgH / 2 - 4, { width: imgW, align: 'center', height: 8 });
    }

    const capBlockY = y + cellH - captionBand;
    doc.fillColor('#f2f5f8').rect(x + 1, capBlockY, cellW - 2, captionBand - 1).fill();
    doc.strokeColor('#cbd5e1').lineWidth(0.45).moveTo(x + 1, capBlockY).lineTo(x + cellW - 1, capBlockY).stroke();

    if (hasCaption) {
        const capPadX = framePad + 3;
        const capTextW = cellW - capPadX * 2;
        doc.fillColor('#475569').fontSize(capLabelSize).font(auditBold(doc, layout))
            .text('CAPTION', x + capPadX, capBlockY + 4, {
                width: capTextW, height: 6, lineBreak: false, characterSpacing: 0.2,
            });
        doc.fillColor('#1e293b').fontSize(capTextSize).font(auditSemiBold(doc, layout))
            .text(shortenCaption(captionText, 64), x + capPadX, capBlockY + 12, {
                width: capTextW, height: captionBand - 14, ellipsis: true, lineBreak: false,
            });
    }
}

async function drawAuditEvidencePhotos(doc, layout, sources, loadImageBuffer, meta = {}) {
    if (!sources.length) return;

    const { marginLeft, pageWidth, bottomLimit } = layout;
    const grid = buildAuditPhotoGridMetrics(pageWidth);
    const { cols, gap, cellW, cellH, rowBlock } = grid;
    const pageBottomGap = A.photoPageBottomGap ?? 4;

    let index = 0;
    let galleryPageIndex = 0;

    while (index < sources.length) {
        const isFirstGalleryPage = galleryPageIndex === 0;
        const pageLimit = resolvePhotoPageLimit(isFirstGalleryPage);

        if (isFirstGalleryPage) {
            doc.addPage();
            drawAuditEvidencePageHeader(doc, layout, {
                title: 'EVIDENCE PHOTOS',
                subtitle: meta.reportReference || meta.documentNo,
                classification: meta.classification,
            }, sources.length);
            drawAuditEvidenceContextStrip(doc, layout, meta, sources.length);
        } else {
            doc.addPage();
            if (layout.onNewPage) layout.onNewPage(doc);
            doc.y += A.photoContinuationGap ?? 6;
        }

        const remaining = sources.length - index;
        let batchCount = resolvePhotoBatchCount(doc.y, bottomLimit, grid, remaining, pageLimit);

        if (batchCount === 0) {
            doc.addPage();
            if (layout.onNewPage) layout.onNewPage(doc);
            doc.y += A.photoContinuationGap ?? 6;
            batchCount = resolvePhotoBatchCount(doc.y, bottomLimit, grid, remaining, pageLimit);
        }

        batchCount = Math.max(Math.min(batchCount, pageLimit), 1);

        let col = 0;
        let rowY = doc.y;

        for (let b = 0; b < batchCount; b += 1) {
            const x = marginLeft + col * (cellW + gap);
            const item = sources[index];
            let buffer = null;
            try {
                buffer = await loadImageBuffer(item.src);
            } catch { /* skip */ }

            drawAuditGalleryCell(doc, layout, x, rowY, cellW, cellH, buffer, index, item.caption);
            index += 1;
            col += 1;
            if (col >= cols) {
                col = 0;
                rowY += rowBlock;
            }
        }

        doc.y = rowY + (col > 0 ? rowBlock : 0) + pageBottomGap;
        galleryPageIndex += 1;
    }

    drawAuditEvidenceAttestation(doc, layout);
}

function stampAuditEvidenceFooters(doc, layout, meta = {}) {
    const range = doc.bufferedPageRange();
    const count = range.count;
    const marginLeft = layout.marginLeft ?? 40;
    const pageWidth = layout.pageWidth ?? doc.page.width - 80;

    const line1 = 'DX OSE – Internal Operational Governance Platform';
    const line2 = 'CONFIDENTIAL – Internal Use Only';

    for (let i = 0; i < count; i++) {
        doc.switchToPage(range.start + i);
        const fy = doc.page.height - 42;

        doc.save();
        doc.strokeColor(GRIDLINE).lineWidth(0.45)
            .moveTo(marginLeft, fy - 8).lineTo(marginLeft + pageWidth, fy - 8).stroke();

        doc.fillColor('#64748b').fontSize(5.5).font(auditBody(doc, layout))
            .text(line1, marginLeft, fy, { width: pageWidth * 0.38, align: 'left', height: 7 });

        doc.fillColor('#64748b').fontSize(5.5).font(auditBold(doc, layout))
            .text(line2, marginLeft + pageWidth * 0.28, fy, { width: pageWidth * 0.44, align: 'center', height: 7 });

        doc.fillColor('#64748b').fontSize(5.5).font(auditBody(doc, layout))
            .text(`Page ${i + 1} of ${count}`, marginLeft + pageWidth * 0.72, fy, { width: pageWidth * 0.28, align: 'right', height: 7 });

        doc.restore();
        doc.x = marginLeft;
        doc.y = Math.min(doc.y, fy - 10);
    }
}

module.exports = {
    drawAuditReportHeader,
    drawAuditMetadataBlock,
    drawAuditGrnMetadataBlock,
    drawAuditTransferMetadataBlock,
    drawAuditGetPassMetadataBlock,
    drawAuditInventoryCountMetadataBlock,
    drawAuditSummaryKpiStrip,
    drawAuditItemDetailsTable,
    drawAuditGrnItemsTable,
    drawAuditTransferItemsTable,
    drawAuditGetPassItemsTable,
    drawAuditInventoryCountLinesTable,
    drawAuditReceiptContext,
    drawAuditTransferContext,
    drawAuditGetPassContext,
    drawAuditLossTreatment,
    drawAuditApprovalWorkflow,
    drawAuditEvidencePhotos,
    drawAuditMiniHeader,
    stampAuditEvidenceFooters,
    mergeAuditLineItems,
    buildAuditInventoryCountTableColumns,
    filterChainApprovalSlots,
    resolveGetPassContextReason,
    resolveGetPassContextReturnLabel,
    resolveGetPassPdfGoodReturnedQty,
    resolveGetPassPdfLineOutcome,
    resolveGetPassPdfLineDisplay,
    planApprovalWorkflowRows,
};
