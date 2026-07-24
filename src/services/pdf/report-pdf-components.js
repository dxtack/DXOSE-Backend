'use strict';

const { TOKENS, getStatusColors, getClassificationColors } = require('./report-pdf-design-tokens');
const { ENTERPRISE_BRAND, drawEnterpriseWorkflowTimeline } = require('./report-pdf-enterprise');
const {
    formatDate,
    formatDateTime,
    formatMoney,
    printableValue,
    sanitizePrintableText,
    isEmptyReportField,
    formatRouteText,
} = require('./report-pdf-layout');

const T = TOKENS;
const C = T.color;
const R = C.reporting;
const BRAND_NAVY = C.navy.tableHeader;
const BRAND_WHITE = C.surface.page;
const BRAND_BORDER = C.border.default;
const BRAND_MUTED = C.text.muted;
const BRAND_SLATE = C.text.secondary;

function pdfCurrency(layout) {
    return String(layout?.displayCurrency || 'SAR').toUpperCase();
}

function resolveDisplayStatus(header = {}) {
    if (header.postedAt) return 'POSTED';
    const raw = String(header.status || 'PENDING').toUpperCase();
    return raw.replace(/_/g, ' ');
}

function sectionAccent(theme) {
    return theme?.sectionAccent || theme?.accent || C.navy.primary;
}

/**
 * Analytics reporting header — navy brand bar, white type, steel classification (reference).
 */
function drawReportingAnalyticsHeader(doc, layout, theme, meta = {}) {
    const { marginLeft, pageWidth, formatDate: fmtDate } = layout;
    const bandTop = 28;
    const headerH = 58;
    const metaH = T.space.metadataBarHeight;
    const totalH = headerH + metaH + 4;

    doc.fillColor(R.brandNavy).rect(marginLeft, bandTop, pageWidth, headerH).fill();
    doc.fillColor(R.gold.accent).rect(marginLeft, bandTop, pageWidth, 2).fill();

    const markSize = 16;
    const brandTop = bandTop + 11;
    const markX = marginLeft + 12;
    const contentLeft = markX + markSize + 7;

    doc.fillColor('#ffffff').opacity(0.12).roundedRect(markX, brandTop, markSize, markSize, 2).fill();
    doc.opacity(1);
    doc.fillColor('#ffffff').rect(markX + 6, brandTop + 4, 4, markSize - 8).fill();

    doc.fillColor('#ffffff').fontSize(T.type.brand).font('Helvetica-Bold')
        .text(ENTERPRISE_BRAND.platformName, contentLeft, brandTop);
    doc.fillColor(R.gold.hairline).fontSize(T.type.tagline).font('Helvetica')
        .text(ENTERPRISE_BRAND.platformTagline, contentLeft, brandTop + 11);

    const title = meta.title || 'OPERATIONAL REPORT';
    const titleX = marginLeft + pageWidth * 0.18;
    const titleW = pageWidth * 0.56;
    doc.fillColor('#ffffff').fontSize(T.type.title).font('Helvetica-Bold')
        .text(String(title).toUpperCase(), titleX, bandTop + 16, { width: titleW, align: 'center' });

    const classification = meta.classification || 'INTERNAL USE';
    const classW = 88;
    const classH = 18;
    const classX = marginLeft + pageWidth - classW - 10;
    const classY = bandTop + 18;
    doc.fillColor(R.classification.bg).roundedRect(classX, classY, classW, classH, 9).fill();
    doc.strokeColor(R.classification.border).lineWidth(0.35).roundedRect(classX, classY, classW, classH, 9).stroke();
    doc.fillColor(R.classification.text).fontSize(7).font('Helvetica-Bold')
        .text(classification, classX, classY + 4, { width: classW, align: 'center' });

    const metaY = bandTop + headerH;
    doc.fillColor(C.surface.panel).rect(marginLeft, metaY, pageWidth, metaH).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35).rect(marginLeft, metaY, pageWidth, metaH).stroke();

    const metaParts = [
        meta.tenantName ? `Property: ${meta.tenantName}` : null,
        meta.documentNo ? `Doc: ${meta.documentNo}` : null,
        meta.generatedAt ? fmtDate(meta.generatedAt) : null,
        meta.generatedBy ? `By ${meta.generatedBy}` : null,
    ].filter(Boolean);
    const metaTextY = metaY + (metaH - 7) / 2;

    doc.fillColor(C.text.secondary).fontSize(T.type.metadata).font('Helvetica')
        .text(metaParts.join('   '), marginLeft + 10, metaTextY, {
            width: pageWidth - 20,
            ellipsis: true,
            height: 8,
        });

    doc.y = bandTop + totalH;
}

/**
 * Light enterprise header (reference): white surface, navy title, status pill, metadata bar.
 */
function drawEvidencePackHeader(doc, layout, theme, meta = {}) {
    if (meta.reportingChrome) {
        return drawReportingAnalyticsHeader(doc, layout, theme, meta);
    }
    const { marginLeft, pageWidth } = layout;
    const bandTop = 28;
    const headerH = T.space.evidenceHeaderHeight || 42;
    const totalH = headerH + 2;

    doc.fillColor(C.surface.page).rect(marginLeft, bandTop, pageWidth, headerH).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.3)
        .moveTo(marginLeft, bandTop + headerH).lineTo(marginLeft + pageWidth, bandTop + headerH).stroke();
    doc.fillColor(C.navy.primary).rect(marginLeft, bandTop, pageWidth, 1).fill();

    const markSize = 11;
    const brandTop = bandTop + 5;
    const markX = marginLeft + 10;
    const leftZoneW = 112;
    const contentLeft = markX + markSize + 4;

    doc.fillColor(C.surface.muted).roundedRect(markX, brandTop, markSize, markSize, 2).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.3).roundedRect(markX, brandTop, markSize, markSize, 2).stroke();
    doc.fillColor(C.navy.primary).rect(markX + 4, brandTop + 2, 3, markSize - 4).fill();

    const brandSize = T.type.brandEvidence || T.type.brand;
    const taglineSize = T.type.taglineEvidence || T.type.tagline;
    doc.fillColor(C.navy.primary).fontSize(brandSize).font('Helvetica-Bold')
        .text(ENTERPRISE_BRAND.platformName, contentLeft, brandTop, { width: leftZoneW, height: 9 });
    doc.fillColor(C.text.label || C.text.muted).fontSize(taglineSize).font('Helvetica')
        .text(ENTERPRISE_BRAND.platformTagline, contentLeft, brandTop + 9, {
            width: leftZoneW,
            height: 9,
            lineGap: 0,
        });

    const displayStatus = meta.displayStatus || 'PENDING';
    const statusStyle = getStatusColors(displayStatus);
    const statusW = 62;
    const statusH = 12;
    const statusX = marginLeft + pageWidth - statusW - 8;
    const titleSize = T.type.titleEvidence || T.type.title;
    const titleY = bandTop + 14;
    const titleX = marginLeft + leftZoneW + 8;
    const titleW = Math.max(statusX - titleX - 6, 120);
    const title = sanitizePrintableText(meta.title || 'BREAKAGE REPORT') || 'BREAKAGE REPORT';
    const titleCapCenterY = titleY + titleSize * 0.38;

    doc.fillColor(C.navy.primary).fontSize(titleSize).font('Helvetica-Bold')
        .text(String(title).toUpperCase(), titleX, titleY, { width: titleW, align: 'center', lineBreak: false });

    const statusY = titleCapCenterY - statusH / 2;
    doc.fillColor(statusStyle.bg).roundedRect(statusX, statusY, statusW, statusH, 2).fill();
    if (statusStyle.border) {
        doc.strokeColor(statusStyle.border).lineWidth(0.4).roundedRect(statusX, statusY, statusW, statusH, 2).stroke();
    }
    const statusTextY = statusY + (statusH - 5.5) / 2;
    doc.fillColor(statusStyle.text).fontSize(5.5).font('Helvetica-Bold')
        .text(String(displayStatus), statusX, statusTextY, { width: statusW, align: 'center', lineBreak: false });

    doc.y = bandTop + totalH;
}

function resolveCardValueStyle(card = {}) {
    const labelColor = C.text.label || C.text.muted;
    if (card.valueStyle === 'loss') {
        return { label: labelColor, value: C.loss.accent, labelFont: 'Helvetica', valueFont: 'Helvetica-Bold' };
    }
    if (card.valueStyle === 'status') {
        const statusStyle = getStatusColors(card.value);
        return { label: labelColor, value: statusStyle.text || C.text.primary, labelFont: 'Helvetica', valueFont: 'Helvetica-Bold' };
    }
    if (card.valueStyle === 'emphasis') {
        return { label: labelColor, value: C.navy.primary, labelFont: 'Helvetica', valueFont: 'Helvetica-Bold' };
    }
    return { label: labelColor, value: C.text.primary, labelFont: 'Helvetica', valueFont: 'Helvetica-Bold' };
}

/**
 * Golden metadata grid — uniform cells, muted labels, dense finance-grade alignment.
 */
function drawGoldenMetadataCardGrid(doc, layout, cards = []) {
    if (!cards.length) return;

    const { marginLeft, pageWidth, ensureSpace } = layout;
    const cols = 4;
    const cardH = T.space.cardHeightDense || 22;
    const gap = T.space.cardGapDense || 2;
    const padX = T.space.cardPadX || 8;
    const cardW = (pageWidth - gap * (cols - 1)) / cols;
    const rows = Math.ceil(cards.length / cols);
    ensureSpace(rows * (cardH + gap) + 4);

    const startY = doc.y;
    const labelYOff = 3;
    const valueYOff = 11;

    cards.forEach((card, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = marginLeft + col * (cardW + gap);
        const y = startY + row * (cardH + gap);
        doc.fillColor(C.surface.panel).roundedRect(x, y, cardW, cardH, T.space.radius.card).fill();
        doc.strokeColor(C.border.subtle).lineWidth(0.3).roundedRect(x, y, cardW, cardH, T.space.radius.card).stroke();

        const styles = resolveCardValueStyle(card);
        doc.fillColor(styles.label).fontSize(T.type.cardLabelMuted || T.type.cardLabel).font(styles.labelFont)
            .text(card.label, x + padX, y + labelYOff, { width: cardW - padX * 2, height: 7 });
        doc.fillColor(styles.value).fontSize(T.type.cardValueDense || T.type.cardValue).font(styles.valueFont)
            .text(printableValue(card.value), x + padX, y + valueYOff, { width: cardW - padX * 2, ellipsis: true, height: 8 });
    });

    doc.y = startY + rows * (cardH + gap) + 2;
}

function buildGoldenEvidenceMetadataCards(evidence, layout) {
    const { header, stockImpactSummary = {} } = evidence;
    const currency = stockImpactSummary.currency || 'SAR';
    const totalLoss = formatMoney(stockImpactSummary.totalLossValue ?? 0, currency);
    const department = header.department || '—';
    const displayStatus = resolveDisplayStatus(header);
    const preparedBy = header.preparedBy || header.createdBy || '—';

    return [
        { label: 'Property', value: header.tenantName || 'DX OSE' },
        { label: 'Department', value: department },
        { label: 'Document No', value: header.documentNo || '—' },
        { label: 'Status', value: displayStatus, valueStyle: 'status' },
        { label: 'Document Date', value: layout.formatDate(header.documentDate) },
        { label: 'Posted At', value: header.postedAt ? layout.formatDateTime(header.postedAt) : '—' },
        { label: 'Prepared By', value: preparedBy },
        { label: 'Total Loss', value: totalLoss, valueStyle: 'loss' },
    ];
}

const AUTO_APPROVAL_COMMENT_MARKERS = [
    'auto-approved by system due to high-level authority',
];

const {
    resolveFinalLossTreatmentFromApprovalHistory,
    toLossResponsibilityShape,
} = require('../../utils/resolveFinalLossTreatment');

function isAutoApprovalComment(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return false;
    return AUTO_APPROVAL_COMMENT_MARKERS.some((m) => text.includes(m));
}

function findLastAccountabilityStep(approvalHistory = []) {
    for (let i = approvalHistory.length - 1; i >= 0; i -= 1) {
        const step = approvalHistory[i];
        if (String(step?.status || '').trim().toUpperCase() !== 'APPROVED') continue;
        const acct = step?.accountabilityType;
        if (acct && String(acct).trim()) return step;
    }
    return null;
}

function resolveLossResponsibility(header = {}, approvalHistory = []) {
    const treatment = resolveFinalLossTreatmentFromApprovalHistory(header, approvalHistory);
    return toLossResponsibilityShape(treatment);
}

/**
 * Golden shell: incident details (left) + loss responsibility (right).
 */
function drawGoldenIncidentResponsibilityRow(doc, layout, theme, data = {}) {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const leftPad = 10;
    const rightPad = 8;
    const gap = 12;
    const leftW = (pageWidth - gap) * 0.64;
    const rightW = pageWidth - gap - leftW;
    const leftX = marginLeft;
    const rightX = marginLeft + leftW + gap;
    const gutterX = marginLeft + leftW + gap / 2;
    const innerLeftW = leftW - leftPad * 2;
    const innerRightW = rightW - rightPad * 2;

    const hasReason = !isEmptyReportField(data.reason);
    const reasonText = hasReason ? sanitizePrintableText(data.reason) : null;
    const notesRaw = data.notes ? String(data.notes).trim() : '';
    const hasNotes = notesRaw.length > 0 && !isEmptyReportField(notesRaw);
    const notes = hasNotes ? sanitizePrintableText(notesRaw) : null;
    const loss = resolveLossResponsibility(data.header || {}, data.approvalHistory || []);

    doc.fontSize(T.type.body).font('Helvetica');
    let reasonH = 0;
    if (hasReason) {
        reasonH = doc.heightOfString(`Reason: ${reasonText}`, { width: innerLeftW, lineGap: 1 });
    }
    let notesBlockH = 0;
    if (notes) {
        notesBlockH = 8 + doc.heightOfString(notes, { width: innerLeftW, lineGap: 2 });
    }

    let rightContentH = 12;
    if (loss.chargedTo === 'HOTEL') {
        rightContentH = 10;
    } else if (loss.chargedTo === 'EMPLOYEE') {
        rightContentH = 10;
        if (loss.employee && !isEmptyReportField(loss.employee)) rightContentH += 9;
        if (loss.comment) {
            doc.fontSize(T.type.bodyCompact).font('Helvetica');
            rightContentH += 8 + doc.heightOfString(loss.comment, { width: innerRightW, lineGap: 1.5 });
        }
    } else {
        rightContentH = 10;
    }

    const leftContentH = reasonH + notesBlockH + (hasReason || notes ? 14 : 8);
    const rowH = Math.max(leftContentH + leftPad, rightContentH + rightPad + 10, 40);
    ensureSpace(rowH + 6);

    const startY = doc.y;

    doc.fillColor(C.surface.panel).roundedRect(leftX, startY, leftW, rowH, T.space.radius.card).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35).roundedRect(leftX, startY, leftW, rowH, T.space.radius.card).stroke();
    doc.fillColor('#fafbfc').roundedRect(rightX, startY, rightW, rowH, T.space.radius.card).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35).roundedRect(rightX, startY, rightW, rowH, T.space.radius.card).stroke();
    doc.strokeColor('#e8ecf0').lineWidth(0.3)
        .moveTo(gutterX, startY + 5).lineTo(gutterX, startY + rowH - 5).stroke();

    const titleY = startY + 6;
    doc.fillColor(C.navy.primary).fontSize(T.type.sectionTitle).font('Helvetica-Bold')
        .text('Incident Details', leftX + leftPad, titleY, { width: innerLeftW });
    doc.fillColor(C.navy.soft || C.text.secondary).fontSize(7).font('Helvetica-Bold')
        .text('Loss Responsibility', rightX + rightPad, titleY, { width: innerRightW });

    let leftY = titleY + 10;
    if (hasReason) {
        doc.fillColor(C.text.secondary).fontSize(T.type.body).font('Helvetica-Bold')
            .text(`Reason: ${reasonText}`, leftX + leftPad, leftY, { width: innerLeftW, lineGap: 1 });
        leftY += reasonH + 3;
    }

    if (notes) {
        doc.fillColor(C.text.label || C.text.muted).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text('Notes:', leftX + leftPad, leftY, { width: innerLeftW });
        doc.fillColor(C.text.secondary).font('Helvetica')
            .text(notes, leftX + leftPad, leftY + 7, { width: innerLeftW, lineGap: 2 });
    }

    let rightY = titleY + 10;
    if (loss.chargedTo === 'HOTEL') {
        doc.fillColor(C.text.secondary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text('Charged To: ', rightX + rightPad, rightY, { continued: true, width: innerRightW });
        doc.fillColor(C.navy.primary).font('Helvetica-Bold').text('HOTEL');
    } else if (loss.chargedTo === 'EMPLOYEE') {
        doc.fillColor(C.text.secondary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text('Charged To: ', rightX + rightPad, rightY, { continued: true, width: innerRightW });
        doc.fillColor(C.loss.accent).font('Helvetica-Bold').text('EMPLOYEE');
        rightY += 9;
        if (loss.employee && !isEmptyReportField(loss.employee)) {
            doc.fillColor(C.text.secondary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
                .text(`Employee: ${sanitizePrintableText(loss.employee)}`, rightX + rightPad, rightY, {
                    width: innerRightW,
                    lineGap: 1.5,
                });
            rightY += 9;
        }
        if (loss.comment) {
            doc.fillColor(C.text.label || C.text.muted).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
                .text('Comment:', rightX + rightPad, rightY, { width: innerRightW });
            doc.fillColor(C.text.secondary).fontSize(T.type.bodyCompact).font('Helvetica')
                .text(sanitizePrintableText(loss.comment), rightX + rightPad, rightY + 7, {
                    width: innerRightW,
                    lineGap: 1.5,
                });
        }
    } else {
        doc.fillColor(C.text.muted).fontSize(T.type.bodyCompact).font('Helvetica')
            .text('Not specified', rightX + rightPad, rightY, { width: innerRightW });
    }

    doc.y = startY + rowH + T.space.sectionGap;
}

/**
 * Compact horizontal financial impact strip (golden operational evidence shell).
 */
function drawGoldenFinancialImpactStrip(doc, layout, theme, stockImpactSummary = {}, lineItemCount = 0, options = {}) {
    const { marginLeft, pageWidth, beginSection } = layout;
    const perItem = stockImpactSummary.perItem || [];
    const currency = stockImpactSummary.currency || 'SAR';
    const totalQty = perItem.reduce((sum, item) => sum + (parseFloat(item.qtyDeducted ?? item.qty) || 0), 0);
    const panelH = 20;

    const accent = sectionAccent(theme);
    const sectionTitle = options.sectionTitle || 'Financial Impact';
    const panelY = beginSection(sectionTitle, panelH, accent);
    doc.fillColor(C.surface.muted).rect(marginLeft, panelY, pageWidth, panelH).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35).rect(marginLeft, panelY, pageWidth, panelH).stroke();

    const metrics = options.metrics || [
        { label: 'Line Items', value: String(lineItemCount || perItem.length) },
        { label: 'Qty Deducted', value: String(totalQty) },
        { label: 'Basis', value: 'WAC at posting' },
        { label: 'Currency', value: currency },
    ];
    const metricW = pageWidth / metrics.length;
    const padX = 12;
    const labelY = panelY + 3;
    const valueY = panelY + 10;
    metrics.forEach((metric, i) => {
        const x = marginLeft + i * metricW;
        const innerW = metricW - padX * 2;
        doc.fillColor(C.text.label || C.text.muted).fontSize(5.5).font('Helvetica')
            .text(metric.label, x + padX, labelY, { width: innerW, height: 6 });
        doc.fillColor(C.text.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(metric.value, x + padX, valueY, { width: innerW, height: 8, ellipsis: true });
        if (i > 0) {
            doc.strokeColor('#eceff3').lineWidth(0.2)
                .moveTo(x, panelY + 2).lineTo(x, panelY + panelH - 2).stroke();
        }
    });

    doc.y = panelY + panelH + 1;
}

/**
 * Legacy split row: incident details (left) + total loss hero card (right).
 * Used by transfer packs until golden shell rollout.
 */
function drawIncidentAndLossRow(doc, layout, theme, data = {}) {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const notes = data.notes
        ? String(data.notes).replace(/\s*\n\s*/g, ' · ').trim()
        : null;
    const rowH = notes ? 42 : 38;
    const gap = 6;
    const pad = 12;
    ensureSpace(rowH + 4);

    const startY = doc.y;
    const leftW = pageWidth * 0.62 - gap / 2;
    const rightW = pageWidth * 0.38 - gap / 2;
    const leftX = marginLeft;
    const rightX = marginLeft + leftW + gap;
    const innerW = leftW - pad * 2;

    doc.fillColor(C.surface.panel).roundedRect(leftX, startY, leftW, rowH, T.space.radius.card).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.5).roundedRect(leftX, startY, leftW, rowH, T.space.radius.card).stroke();

    const titleY = startY + 7;
    doc.fillColor(C.navy.primary).fontSize(T.type.sectionTitle).font('Helvetica-Bold')
        .text('Incident Details', leftX + pad, titleY, { width: innerW });

    const reason = data.reason || '—';
    doc.fillColor(C.text.secondary).fontSize(T.type.body).font('Helvetica-Bold')
        .text(`Reason: ${reason}`, leftX + pad, titleY + 11, { width: innerW, height: 9, ellipsis: true });
    if (notes) {
        doc.fillColor(C.text.muted).fontSize(T.type.bodyCompact).font('Helvetica')
            .text(`Notes: ${notes}`, leftX + pad, titleY + 21, { width: innerW, height: 9, ellipsis: true });
    }

    doc.fillColor(C.loss.heroBg).roundedRect(rightX, startY, rightW, rowH, T.space.radius.card).fill();
    doc.strokeColor(C.loss.heroBorder).lineWidth(0.5).roundedRect(rightX, startY, rightW, rowH, T.space.radius.card).stroke();

    const lossLabel = data.totalLossLabel || 'Total Loss';
    const lossAmount = formatMoney(data.totalLossValue ?? 0, data.currency || 'SAR');
    const lossPad = 12;
    const lossInnerW = rightW - lossPad * 2;
    const labelBlockH = 8;
    const amountBlockH = 14;
    const lossBlockH = labelBlockH + 2 + amountBlockH;
    const lossTop = startY + (rowH - lossBlockH) / 2;

    doc.fillColor(C.text.muted).fontSize(T.type.cardLabel).font('Helvetica-Bold')
        .text(lossLabel, rightX + lossPad, lossTop, { width: lossInnerW, align: 'left' });
    doc.fillColor(C.loss.accent).fontSize(T.type.moneyLoss).font('Helvetica-Bold')
        .text(lossAmount, rightX + lossPad, lossTop + labelBlockH + 2, { width: lossInnerW, align: 'left' });

    doc.y = startY + rowH + T.space.sectionGap;
}

function drawSummaryCardGrid(doc, layout, cards = [], theme = {}, options = {}) {
    if (!cards.length) return;

    const { marginLeft, pageWidth, ensureSpace } = layout;
    const cols = options.columns ?? 4;
    const cardH = T.space.cardHeight;
    const gap = T.space.cardGap;
    const cardW = (pageWidth - gap * (cols - 1)) / cols;
    const rows = Math.ceil(cards.length / cols);
    ensureSpace(rows * (cardH + gap) + 8);

    const startY = doc.y;
    cards.forEach((card, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = marginLeft + col * (cardW + gap);
        const y = startY + row * (cardH + gap);
        doc.fillColor(C.surface.panel).roundedRect(x, y, cardW, cardH, T.space.radius.card).fill();
        doc.strokeColor(C.border.subtle).lineWidth(0.5).roundedRect(x, y, cardW, cardH, T.space.radius.card).stroke();

        const styles = resolveCardValueStyle(card);
        doc.fillColor(styles.label).fontSize(T.type.cardLabel).font('Helvetica-Bold')
            .text(card.label, x + 6, y + 4, { width: cardW - 12 });
        doc.fillColor(styles.value).fontSize(T.type.cardValue).font('Helvetica-Bold')
            .text(printableValue(card.value), x + 6, y + 13, { width: cardW - 12, ellipsis: true });
    });

    doc.y = startY + rows * (cardH + gap) + 4;
}

/**
 * Compact valuation metrics / mini breakdown (no duplicate total-loss hero).
 */
function drawFinancialImpactSection(doc, layout, theme, stockImpactSummary = {}) {
    const { marginLeft, pageWidth, beginSection } = layout;
    const perItem = stockImpactSummary.perItem || [];
    const currency = stockImpactSummary.currency || 'SAR';
    const lineCount = perItem.length;
    const totalQty = perItem.reduce((sum, item) => sum + (parseFloat(item.qtyDeducted ?? item.qty) || 0), 0);
    const showBreakdown = lineCount > 1;
    const panelH = showBreakdown ? (lineCount > 3 ? 64 : 48) : 30;

    const accent = sectionAccent(theme);
    const panelY = beginSection('Financial Impact', panelH, accent);
    doc.fillColor(C.surface.muted).rect(marginLeft, panelY, pageWidth, panelH).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.5).rect(marginLeft, panelY, pageWidth, panelH).stroke();

    const metrics = [
        { label: 'Line items', value: String(lineCount) },
        { label: 'Qty deducted', value: String(totalQty) },
        { label: 'Basis', value: 'WAC at posting' },
        { label: 'Currency', value: currency },
    ];
    const metricW = pageWidth / metrics.length;
    metrics.forEach((metric, i) => {
        const x = marginLeft + i * metricW;
        doc.fillColor(C.text.muted).fontSize(6).font('Helvetica-Bold')
            .text(metric.label, x + 8, panelY + 6, { width: metricW - 12, height: 7 });
        doc.fillColor(C.text.primary).fontSize(T.type.body).font('Helvetica-Bold')
            .text(metric.value, x + 8, panelY + 14, { width: metricW - 12, height: 9, ellipsis: true });
        if (i > 0) {
            doc.strokeColor(C.border.subtle).lineWidth(0.35)
                .moveTo(x, panelY + 4).lineTo(x, panelY + panelH - 4).stroke();
        }
    });

    if (showBreakdown) {
        const miniY = panelY + 28;
        doc.strokeColor(C.border.subtle).lineWidth(0.35)
            .moveTo(marginLeft + 8, miniY - 3).lineTo(marginLeft + pageWidth - 8, miniY - 3).stroke();

        const colW = [pageWidth * 0.44, pageWidth * 0.18, pageWidth * 0.2, pageWidth * 0.14];
        const headers = ['Item', 'Qty', 'WAC', 'Line loss'];
        let cx = marginLeft + 8;
        doc.fillColor(C.text.muted).fontSize(6).font('Helvetica-Bold');
        headers.forEach((h, i) => {
            doc.text(h, cx, miniY, { width: colW[i] - 4, align: i >= 1 ? 'right' : 'left' });
            cx += colW[i];
        });

        const showItems = perItem.slice(0, lineCount > 3 ? 3 : lineCount);
        showItems.forEach((item, idx) => {
            const rowY = miniY + 9 + idx * 10;
            cx = marginLeft + 8;
            const vals = [
                item.itemName || '—',
                String(item.qtyDeducted ?? item.qty ?? '—'),
                formatMoney(item.wacAtPosting ?? 0, currency),
                formatMoney(item.totalLoss ?? 0, currency),
            ];
            doc.fillColor(C.text.primary).fontSize(6.5).font('Helvetica');
            vals.forEach((v, i) => {
                const color = i === 3 ? C.loss.accent : C.text.primary;
                doc.fillColor(color).text(v, cx, rowY, { width: colW[i] - 4, align: i >= 1 ? 'right' : 'left', ellipsis: true });
                cx += colW[i];
            });
        });
        if (lineCount > showItems.length) {
            doc.fillColor(C.text.muted).fontSize(6).font('Helvetica-Oblique')
                .text('See Broken Items table for full valuation detail.', marginLeft + 8, panelY + panelH - 9, {
                    width: pageWidth - 16,
                    height: 7,
                });
        }
    }

    doc.y = panelY + panelH + 4;
}

function mergeLineItemsWithImpact(lineItems = [], perItem = []) {
    const impactByItem = new Map(perItem.map((p) => [p.itemId, p]));
    return lineItems.map((line, idx) => {
        const impact = impactByItem.get(line.itemId) || perItem[idx] || {};
        return {
            index: idx + 1,
            itemName: line.itemName,
            barcode: line.barcode || '—',
            qty: line.qty,
            unitCost: impact.wacAtPosting ?? null,
            lineLoss: impact.totalLoss ?? null,
        };
    });
}

/**
 * Items table with financial columns and integrated totals row.
 */
function drawEvidenceItemsTable(doc, layout, theme, lineItems = [], perItem = [], sectionTitle = 'Broken Items') {
    const { marginLeft, pageWidth, ensureSpace, section, formatMoney: fmtMoney } = layout;
    const rows = mergeLineItemsWithImpact(lineItems, perItem);
    const currency = pdfCurrency(layout);

    section(sectionTitle, sectionAccent(theme));

    const colWidths = [20, pageWidth * 0.38, pageWidth * 0.16, pageWidth * 0.09, pageWidth * 0.135, pageWidth * 0.135];
    const headers = ['#', 'Item Name', 'Barcode', 'Qty', 'Unit Cost (SAR)', 'Line Loss (SAR)'];
    const HDR_H = T.space.tableHdrH || 13;
    const MIN_ROW_H = T.space.tableRowMin || 13;
    const cellPadY = T.space.tableCellPadY || 2;
    const cellPadX = 4;
    const cellInnerW = (i) => Math.max(colWidths[i] - cellPadX * 2, 4);
    const MAX_NAME_H = 20;
    let tableY = doc.y;

    const drawHeader = (y) => {
        doc.fillColor(BRAND_NAVY).rect(marginLeft, y, pageWidth, HDR_H).fill();
        let cx = marginLeft;
        headers.forEach((h, i) => {
            const align = i >= 3 ? 'right' : 'left';
            doc.fillColor(BRAND_WHITE).fontSize(T.type.tableHeader).font('Helvetica-Bold')
                .text(h, cx + cellPadX, y + 3, { width: cellInnerW(i), align });
            cx += colWidths[i];
        });
        return y + HDR_H;
    };

    tableY = drawHeader(tableY);

    let totalQty = 0;
    let totalLoss = 0;

    rows.forEach((row, idx) => {
        const nameW = cellInnerW(1);
        const displayName = sanitizePrintableText(row.itemName) || '—';
        doc.fontSize(T.type.body).font('Helvetica');
        const nameH = Math.min(
            doc.heightOfString(displayName, { width: nameW, lineGap: 1 }),
            MAX_NAME_H,
        );
        const rowH = Math.max(MIN_ROW_H, Math.ceil(nameH) + cellPadY * 2);

        ensureSpace(rowH + 4);
        if (doc.y > tableY + 2) tableY = doc.y;

        const bg = idx % 2 === 0 ? BRAND_WHITE : '#f8fafc';
        doc.fillColor(bg).rect(marginLeft, tableY, pageWidth, rowH).fill();
        doc.strokeColor('#cbd5e1').lineWidth(0.35)
            .moveTo(marginLeft, tableY + rowH).lineTo(marginLeft + pageWidth, tableY + rowH).stroke();

        const qty = parseFloat(row.qty) || 0;
        const loss = parseFloat(row.lineLoss) || 0;
        totalQty += qty;
        totalLoss += loss;

        const textY = tableY + cellPadY;
        let cx = marginLeft;

        doc.fillColor(C.text.primary).fontSize(T.type.body).font('Helvetica-Bold')
            .text(String(row.index), cx + cellPadX, textY, { width: cellInnerW(0), align: 'left' });
        cx += colWidths[0];

        doc.fillColor(C.text.primary).fontSize(T.type.body).font('Helvetica')
            .text(displayName, cx + cellPadX, textY, {
                width: nameW,
                lineGap: 1,
                height: MAX_NAME_H,
                ellipsis: true,
            });
        cx += colWidths[1];

        doc.fillColor(C.text.muted).fontSize(T.type.bodyCompact).font('Helvetica')
            .text(String(row.barcode), cx + cellPadX, textY, { width: cellInnerW(2), align: 'left', ellipsis: true });
        cx += colWidths[2];

        doc.fillColor(C.text.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(String(qty), cx + cellPadX, textY, { width: cellInnerW(3), align: 'right' });
        cx += colWidths[3];

        doc.fillColor(C.text.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(row.unitCost != null ? fmtMoney(row.unitCost, currency) : '—', cx + cellPadX, textY, {
                width: cellInnerW(4),
                align: 'right',
            });
        cx += colWidths[4];

        doc.fillColor(C.loss.accent).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(row.lineLoss != null ? fmtMoney(row.lineLoss, currency) : '—', cx + cellPadX, textY, {
                width: cellInnerW(5),
                align: 'right',
            });

        tableY += rowH;
    });

    const TOTAL_H = T.space.tableTotalH || 13;
    ensureSpace(TOTAL_H + 4);
    if (doc.y > tableY + 2) tableY = doc.y;

    doc.strokeColor(C.navy.primary).lineWidth(1.25)
        .moveTo(marginLeft, tableY).lineTo(marginLeft + pageWidth, tableY).stroke();
    doc.fillColor('#dde4ec').rect(marginLeft, tableY, pageWidth, TOTAL_H).fill();

    let cx = marginLeft;
    const totalVals = ['', 'TOTAL', '', String(totalQty), '', fmtMoney(totalLoss, currency)];
    const totalTextY = tableY + (TOTAL_H - 6.5) / 2;
    totalVals.forEach((v, i) => {
        const align = i >= 3 ? 'right' : 'left';
        const color = i === 5 ? C.loss.accent : C.navy.primary;
        doc.fillColor(color).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(v, cx + cellPadX, totalTextY, { width: cellInnerW(i), align });
        cx += colWidths[i];
    });

    doc.y = tableY + TOTAL_H + 3;
    return { totalQty, totalLoss };
}

function isImageEvidenceAttachmentMeta(a) {
    if (!a) return false;
    const mime = String(a.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    const src = String(a.url || a.key || a.filename || '').split('?')[0];
    const ext = src.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
}

function collectPhotoSources(evidence = {}, packMeta = {}) {
    const imageAttachments = (evidence.attachments || []).filter((a) => isImageEvidenceAttachmentMeta(a));

    const primarySource = evidence.photoEvidence?.photoUrl || evidence.photoEvidence?.photoKey || null;
    const sources = [];
    const seenSrc = new Set();

    const pushSource = (src, caption) => {
        const key = src ? String(src) : '';
        if (!key || seenSrc.has(key)) return;
        seenSrc.add(key);
        sources.push({ src: key, caption });
    };

    if (primarySource) {
        pushSource(primarySource, packMeta.primaryPhotoCaption || 'Primary breakage photo');
    }

    imageAttachments.forEach((att) => {
        const src = att.url || att.key || att.filename || '';
        pushSource(src, att.originalName || att.filename || 'Attachment');
    });

    return sources;
}

function shortenCaption(caption = '', max = 42) {
    const text = String(caption).trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

function drawGalleryCell(doc, x, y, cellW, cellH, buffer, figLabel, caption) {
    doc.fillColor(C.surface.page).rect(x, y, cellW, cellH).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.5).rect(x, y, cellW, cellH).stroke();

    const pad = 4;
    const captionBand = T.space.photoCaptionBand;
    const imgH = cellH - captionBand - pad;
    const imgW = cellW - pad * 2;
    const imgX = x + pad;
    const imgY = y + pad;

    if (buffer) {
        try {
            doc.image(buffer, imgX, imgY, { width: imgW, height: imgH, fit: [imgW, imgH], align: 'center', valign: 'center' });
        } catch {
            doc.fillColor(C.surface.muted).rect(imgX, imgY, imgW, imgH).fill();
            doc.fillColor(C.text.muted).fontSize(6).font('Helvetica')
                .text('Unavailable', imgX, imgY + imgH / 2 - 3, { width: imgW, align: 'center', height: 7 });
        }
    } else {
        doc.fillColor(C.surface.muted).rect(imgX, imgY, imgW, imgH).fill();
        doc.fillColor(C.text.muted).fontSize(6).font('Helvetica')
            .text('Unavailable', imgX, imgY + imgH / 2 - 3, { width: imgW, align: 'center', height: 7 });
    }

    const capLine = `${figLabel} · ${shortenCaption(caption)}`;
    doc.fillColor(C.text.muted).fontSize(5.5).font('Helvetica')
        .text(capLine, x + pad, y + cellH - captionBand + 2, { width: cellW - pad * 2, height: captionBand - 3, ellipsis: true });
}

/**
 * Photo evidence on dedicated attachment page(s) — audit gallery grid.
 */
async function drawPhotoEvidenceGalleryPages(doc, layout, theme, sources, loadImageBuffer, meta = {}) {
    if (!sources.length) return;

    const { marginLeft, pageWidth, bottomLimit } = layout;
    const cols = sources.length >= 5 ? 3 : 2;
    const gap = T.space.photoGridGap;
    const cellW = (pageWidth - gap * (cols - 1)) / cols;
    const cellH = Math.round(cellW / T.space.photoCellRatio) + T.space.photoCaptionBand + 6;
    const rowBlock = cellH + gap;

    doc.addPage();
    if (layout.onNewPage) layout.onNewPage(doc);

    const titleY = doc.y;
    doc.fillColor(C.navy.primary).fontSize(T.type.sectionTitle).font('Helvetica-Bold')
        .text('Photo Evidence — Attachment Sheet', marginLeft, titleY, { width: pageWidth });
    doc.fillColor(C.text.muted).fontSize(6.5).font('Helvetica')
        .text(
            [meta.documentNo ? `Doc ${meta.documentNo}` : null, `${sources.length} file(s)`, 'Audit attachment archive'].filter(Boolean).join('  ·  '),
            marginLeft,
            titleY + 11,
            { width: pageWidth, height: 8 },
        );
    doc.y = titleY + 22;

    let col = 0;
    let rowY = doc.y;

    for (let i = 0; i < sources.length; i += 1) {
        if (col === 0 && rowY + rowBlock > bottomLimit()) {
            doc.addPage();
            if (layout.onNewPage) layout.onNewPage(doc);
            rowY = doc.y;
            col = 0;
        }

        const x = marginLeft + col * (cellW + gap);
        const item = sources[i];
        let buffer = null;
        try {
            buffer = await loadImageBuffer(item.src);
        } catch { /* skip */ }

        drawGalleryCell(doc, x, rowY, cellW, cellH, buffer, `Fig. ${i + 1}`, item.caption);

        col += 1;
        if (col >= cols) {
            col = 0;
            rowY += rowBlock;
        }
    }

    doc.y = col > 0 ? rowY + rowBlock + gap : rowY + gap;
}

function shortApprovalLabel(label = '') {
    const text = String(label);
    if (text.length <= 14) return text;
    const first = text.split(' ')[0];
    return first.length <= 14 ? first : text.slice(0, 12) + '…';
}

function isApprovalNodeComplete(status) {
    return ['APPROVED', 'REVIEWED', 'PREPARED', 'POSTED'].includes(String(status || '').toUpperCase());
}

/**
 * Compact horizontal approval progress — unified enterprise timeline.
 */
function drawCompactApprovalProgress(doc, layout, theme, slots = [], options = {}) {
    if (!slots.length) return;
    const mapped = slots.map((slot) => ({
        ...slot,
        label: slot.label || slot.labelEn || slot.role,
        date: slot.date || slot.actedAt || null,
    }));
    drawEnterpriseWorkflowTimeline(doc, layout, theme, mapped, {
        sectionTitle: 'Approval Workflow',
        showStatusWhenNoDate: true,
        compactEvidence: true,
        ...options,
    });
}

const ROLE_LABELS = {
    DEPT_MANAGER: 'Head of Department',
    COST_CONTROL: 'Cost Control',
    FINANCE_MANAGER: 'Finance Manager',
    GENERAL_MANAGER: 'General Manager',
};

/**
 * Build signature slots for drawEnhancedSignatures from evidence payload.
 */
function buildEvidenceSignatureSlots(evidence) {
    const { header, approvalHistory = [], approvalChainDefinition = [] } = evidence;

    const slots = [{
        label: 'Submitted by',
        name: header.createdBy || '',
        role: header.createdByRole || 'Requester',
        date: header.createdAt,
        status: 'PREPARED',
    }];

    const historyByStep = new Map(approvalHistory.map((h) => [h.step, h]));

    for (const chain of approvalChainDefinition) {
        const hist = historyByStep.get(chain.step) || approvalHistory.find((h) => h.role === chain.role);
        const status = hist?.status || 'PENDING';
        slots.push({
            label: chain.label || ROLE_LABELS[chain.role] || chain.role,
            name: hist?.actedBy ? String(hist.actedBy).split(' (')[0] : '',
            role: ROLE_LABELS[chain.role] || chain.role,
            date: hist?.actedAt || null,
            status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'PENDING',
        });
    }

    return slots;
}

function buildSummaryCards(evidence, layout) {
    const { header, lineItems = [], stockImpactSummary = {} } = evidence;
    const displayStatus = resolveDisplayStatus(header);
    const location = stockImpactSummary.perItem?.[0]?.locationName
        || stockImpactSummary.perItem?.map((p) => p.locationName).filter(Boolean).join(', ')
        || '—';

    return [
        { label: 'Property', value: header.tenantName || 'DX OSE' },
        { label: 'Document No', value: header.documentNo },
        { label: 'Document Date', value: layout.formatDate(header.documentDate) },
        { label: 'Status', value: displayStatus },
        { label: 'Location', value: location },
        { label: 'Created By', value: header.createdBy || '—' },
        { label: 'Posted At', value: header.postedAt ? layout.formatDateTime(header.postedAt) : 'Not posted' },
        { label: 'Line Items', value: String(lineItems.length) },
    ];
}

function buildGoldenTransferMetadataCards(evidence, layout) {
    const { header, transferSummary = {} } = evidence;
    const currency = transferSummary.currency || 'SAR';
    const totalValue = formatMoney(transferSummary.totalValue ?? 0, currency);
    const route = formatRouteText(header.sourceLocation, header.destLocation);
    const displayStatus = resolveDisplayStatus(header);
    const preparedBy = header.preparedBy || header.createdBy || '—';

    return [
        { label: 'Property', value: header.tenantName || 'DX OSE' },
        { label: 'Route', value: route },
        { label: 'Document No', value: header.documentNo || '—' },
        { label: 'Status', value: displayStatus, valueStyle: 'status' },
        { label: 'Transfer Date', value: layout.formatDate(header.documentDate) },
        { label: 'Posted At', value: header.postedAt ? layout.formatDateTime(header.postedAt) : '—' },
        { label: 'Prepared By', value: preparedBy },
        { label: 'Total Value', value: totalValue, valueStyle: 'emphasis' },
    ];
}

/**
 * Golden shell: transfer details (left) + movement context (right).
 */
function drawGoldenTransferMovementRow(doc, layout, theme, evidence = {}) {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const { header } = evidence;
    const leftPad = 10;
    const rightPad = 8;
    const gap = 10;
    const leftW = pageWidth * 0.64 - gap / 2;
    const rightW = pageWidth * 0.36 - gap / 2;
    const leftX = marginLeft;
    const rightX = marginLeft + leftW + gap;
    const innerLeftW = leftW - leftPad * 2;
    const innerRightW = rightW - rightPad * 2;

    const hasReason = !isEmptyReportField(header.reason);
    const reasonText = hasReason ? sanitizePrintableText(header.reason) : null;
    const notesRaw = header.notes ? String(header.notes).trim() : '';
    const hasNotes = notesRaw.length > 0 && !isEmptyReportField(notesRaw);
    const notes = hasNotes ? sanitizePrintableText(notesRaw) : null;
    const route = formatRouteText(header.sourceLocation, header.destLocation);

    doc.fontSize(T.type.body).font('Helvetica');
    let reasonH = 0;
    if (hasReason) {
        reasonH = doc.heightOfString(`Reason: ${reasonText}`, { width: innerLeftW, lineGap: 1 });
    }
    let notesBlockH = 0;
    if (notes) {
        notesBlockH = 8 + doc.heightOfString(notes, { width: innerLeftW, lineGap: 2 });
    }

    const rightLines = [
        `Route: ${route}`,
        header.transferType && !isEmptyReportField(header.transferType)
            ? `Type: ${sanitizePrintableText(header.transferType)}`
            : null,
        header.postedBy && !isEmptyReportField(header.postedBy)
            ? `Posted By: ${sanitizePrintableText(header.postedBy)}`
            : null,
    ].filter(Boolean);
    let rightContentH = 10;
    rightLines.forEach((line) => {
        rightContentH += doc.heightOfString(line, { width: innerRightW, lineGap: 1 }) + 3;
    });

    const leftContentH = reasonH + notesBlockH + (hasReason || notes ? 14 : 8);
    const rowH = Math.max(leftContentH + leftPad, rightContentH + rightPad + 10, 38);
    ensureSpace(rowH + 6);

    const startY = doc.y;

    doc.fillColor(C.surface.panel).roundedRect(leftX, startY, leftW, rowH, T.space.radius.card).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35).roundedRect(leftX, startY, leftW, rowH, T.space.radius.card).stroke();
    doc.fillColor('#fafbfc').roundedRect(rightX, startY, rightW, rowH, T.space.radius.card).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35).roundedRect(rightX, startY, rightW, rowH, T.space.radius.card).stroke();

    const titleY = startY + 6;
    doc.fillColor(C.navy.primary).fontSize(T.type.sectionTitle).font('Helvetica-Bold')
        .text('Transfer Details', leftX + leftPad, titleY, { width: innerLeftW });
    doc.fillColor(C.navy.soft || C.text.secondary).fontSize(7).font('Helvetica-Bold')
        .text('Movement Context', rightX + rightPad, titleY, { width: innerRightW });

    let leftY = titleY + 10;
    if (hasReason) {
        doc.fillColor(C.text.secondary).fontSize(T.type.body).font('Helvetica-Bold')
            .text(`Reason: ${reasonText}`, leftX + leftPad, leftY, { width: innerLeftW, lineGap: 1 });
        leftY += reasonH + 3;
    }

    if (notes) {
        doc.fillColor(C.text.label || C.text.muted).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text('Notes:', leftX + leftPad, leftY, { width: innerLeftW });
        doc.fillColor(C.text.secondary).font('Helvetica')
            .text(notes, leftX + leftPad, leftY + 7, { width: innerLeftW, lineGap: 2 });
    }

    let rightY = titleY + 10;
    rightLines.forEach((line) => {
        doc.fillColor(C.text.secondary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(line, rightX + rightPad, rightY, { width: innerRightW, lineGap: 1 });
        rightY += doc.heightOfString(line, { width: innerRightW, lineGap: 1 }) + 3;
    });

    doc.y = startY + rowH + T.space.sectionGap;
}

function buildGoldenGetPassMetadataCards(pass, layout, displayStatus) {
    const preparedBy = formatPerson(pass.createdByUser) || 'System';
    const transferType = String(pass.transferType || '—').replace(/_/g, ' ');
    return [
        { label: 'Property', value: 'DX OSE Hotels' },
        { label: 'Department', value: pass.department?.name || '—' },
        { label: 'Pass No', value: pass.passNo || '—' },
        { label: 'Status', value: displayStatus, valueStyle: 'status' },
        { label: 'Borrower', value: pass.borrowingEntity || '—' },
        { label: 'Type', value: transferType },
        { label: 'Created On', value: layout.formatDateTime(pass.createdAt) },
        { label: 'Prepared By', value: preparedBy },
    ];
}

function formatPerson(user) {
    if (!user) return null;
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return name || user.email || null;
}

/**
 * Golden shell: request details (left) + custody context (right) for Get Pass.
 */
function drawGoldenGetPassDetailsRow(doc, layout, data = {}) {
    const { marginLeft, pageWidth, ensureSpace } = layout;
    const leftPad = 10;
    const rightPad = 8;
    const gap = 10;
    const leftW = pageWidth * 0.64 - gap / 2;
    const rightW = pageWidth * 0.36 - gap / 2;
    const leftX = marginLeft;
    const rightX = marginLeft + leftW + gap;
    const innerLeftW = leftW - leftPad * 2;
    const innerRightW = rightW - rightPad * 2;

    const hasReason = !isEmptyReportField(data.reason);
    const reasonText = hasReason ? sanitizePrintableText(data.reason) : null;
    const returnDate = data.returnDate && !isEmptyReportField(data.returnDate) ? data.returnDate : null;
    const transferType = data.transferType && !isEmptyReportField(data.transferType)
        ? sanitizePrintableText(data.transferType)
        : null;

    doc.fontSize(T.type.body).font('Helvetica');
    let reasonH = 0;
    if (hasReason) {
        reasonH = doc.heightOfString(`Reason: ${reasonText}`, { width: innerLeftW, lineGap: 1 });
    }
    const rightLines = [
        returnDate ? `Expected Return: ${returnDate}` : null,
        transferType ? `Transfer Type: ${transferType}` : null,
    ].filter(Boolean);
    let rightContentH = 10;
    rightLines.forEach((line) => {
        rightContentH += doc.heightOfString(line, { width: innerRightW, lineGap: 1 }) + 3;
    });

    const rowH = Math.max(reasonH + leftPad + (hasReason ? 14 : 8), rightContentH + rightPad + 10, 32);
    ensureSpace(rowH + 6);
    const startY = doc.y;

    doc.fillColor(C.surface.panel).roundedRect(leftX, startY, leftW, rowH, T.space.radius.card).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35).roundedRect(leftX, startY, leftW, rowH, T.space.radius.card).stroke();
    doc.fillColor('#fafbfc').roundedRect(rightX, startY, rightW, rowH, T.space.radius.card).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35).roundedRect(rightX, startY, rightW, rowH, T.space.radius.card).stroke();

    const titleY = startY + 6;
    doc.fillColor(C.navy.primary).fontSize(T.type.sectionTitle).font('Helvetica-Bold')
        .text('Request Details', leftX + leftPad, titleY, { width: innerLeftW });
    doc.fillColor(C.navy.soft || C.text.secondary).fontSize(7).font('Helvetica-Bold')
        .text('Custody Context', rightX + rightPad, titleY, { width: innerRightW });

    if (hasReason) {
        doc.fillColor(C.text.secondary).fontSize(T.type.body).font('Helvetica-Bold')
            .text(`Reason: ${reasonText}`, leftX + leftPad, titleY + 10, { width: innerLeftW, lineGap: 1 });
    }

    let rightY = titleY + 10;
    rightLines.forEach((line) => {
        doc.fillColor(C.text.secondary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(line, rightX + rightPad, rightY, { width: innerRightW, lineGap: 1 });
        rightY += doc.heightOfString(line, { width: innerRightW, lineGap: 1 }) + 3;
    });

    doc.y = startY + rowH + T.space.sectionGap;
}

/** Executive summary grid — aligned with breakage evidence pack. */
function buildTransferPackSummaryCards(evidence, layout) {
    const { header, transferSummary = {} } = evidence;
    const displayStatus = resolveDisplayStatus(header);
    const route = `${header.sourceLocation || '—'} → ${header.destLocation || '—'}`;
    const currency = transferSummary.currency || 'SAR';

    return [
        { label: 'Property', value: header.tenantName || 'DX OSE' },
        { label: 'Document No', value: header.documentNo },
        { label: 'Transfer Date', value: layout.formatDate(header.documentDate) },
        { label: 'Status', value: displayStatus },
        { label: 'Route', value: route },
        { label: 'Requested By', value: header.createdBy || '—' },
        { label: 'Posted At', value: header.postedAt ? layout.formatDateTime(header.postedAt) : '—' },
        { label: 'Line Items', value: String(transferSummary.lineCount ?? evidence.lineItems?.length ?? 0) },
        { label: 'Total Qty', value: String(transferSummary.totalQty ?? 0) },
        { label: 'Total Value', value: formatMoney(transferSummary.totalValue ?? 0, currency) },
        { label: 'Currency', value: currency },
    ];
}

function buildTransferMetricCards(evidence) {
    const ts = evidence.transferSummary || {};
    const currency = ts.currency || 'SAR';
    return [
        { label: 'Line items', value: String(ts.lineCount ?? evidence.lineItems?.length ?? 0) },
        { label: 'Total qty', value: String(ts.totalQty ?? 0) },
        { label: 'Total value', value: formatMoney(ts.totalValue ?? 0, currency) },
        { label: 'Currency', value: currency },
    ];
}

/** Compact transfer context row (breakage incident-row pattern). */
function drawTransferContextRow(doc, layout, theme, evidence = {}) {
    const { header, transferSummary = {} } = evidence;
    const route = `${header.sourceLocation || '—'} → ${header.destLocation || '—'}`;
    const notesParts = [
        header.reason ? `Reason: ${header.reason}` : null,
        header.notes ? String(header.notes).replace(/\s*\n\s*/g, ' · ').trim() : null,
    ].filter(Boolean);
    drawIncidentAndLossRow(doc, layout, theme, {
        reason: route,
        notes: notesParts.length ? notesParts.join(' · ') : null,
        totalLossValue: transferSummary.totalValue ?? 0,
        currency: transferSummary.currency || 'SAR',
        totalLossLabel: 'Total Transfer Value',
    });
}

function drawLegacyWorkflowNote(doc, layout, note) {
    if (!note) return;
    const { marginLeft, pageWidth, ensureSpace } = layout;
    ensureSpace(16);
    const y = doc.y;
    doc.fillColor('#fffbeb').roundedRect(marginLeft, y, pageWidth, 14, 2).fill();
    doc.strokeColor('#fde68a').lineWidth(0.4).roundedRect(marginLeft, y, pageWidth, 14, 2).stroke();
    doc.fillColor('#92400e').fontSize(6.5).font('Helvetica-Bold')
        .text(String(note), marginLeft + 8, y + 4, { width: pageWidth - 16, height: 8 });
    doc.y = y + 18;
}

/**
 * Transfer items table — Line Value column (not loss).
 */
function drawTransferItemsTable(doc, layout, theme, lineItems = [], sectionTitle = 'Transfer Items') {
    const { marginLeft, pageWidth, ensureSpace, section, formatMoney: fmtMoney } = layout;
    const currency = pdfCurrency(layout);
    section(sectionTitle, sectionAccent(theme));

    const colWidths = [20, pageWidth * 0.38, pageWidth * 0.16, pageWidth * 0.09, pageWidth * 0.135, pageWidth * 0.135];
    const headers = ['#', 'Item Name', 'Barcode', 'Qty', 'Unit Cost (SAR)', 'Line Value (SAR)'];
    const HDR_H = T.space.tableHdrH || 13;
    const MIN_ROW_H = T.space.tableRowMin || 14;
    const cellPadY = T.space.tableCellPadY || 3;
    const MAX_NAME_H = 20;
    let tableY = doc.y;

    const drawHeader = (y) => {
        doc.fillColor(BRAND_NAVY).rect(marginLeft, y, pageWidth, HDR_H).fill();
        let cx = marginLeft;
        headers.forEach((h, i) => {
            const align = i >= 3 ? 'right' : 'left';
            doc.fillColor(BRAND_WHITE).fontSize(T.type.tableHeader).font('Helvetica-Bold')
                .text(h, cx + 4, y + 3, { width: colWidths[i] - 8, align });
            cx += colWidths[i];
        });
        return y + HDR_H;
    };

    tableY = drawHeader(tableY);

    let totalQty = 0;
    let totalValue = 0;

    lineItems.forEach((row, idx) => {
        const nameW = colWidths[1] - 8;
        const displayName = sanitizePrintableText(row.itemName) || '—';
        doc.fontSize(T.type.body).font('Helvetica');
        const nameH = Math.min(
            doc.heightOfString(displayName, { width: nameW, lineGap: 1 }),
            MAX_NAME_H,
        );
        const rowH = Math.max(MIN_ROW_H, Math.ceil(nameH) + cellPadY * 2);

        ensureSpace(rowH + 4);
        if (doc.y > tableY + 2) tableY = doc.y;

        const bg = idx % 2 === 0 ? BRAND_WHITE : '#f8fafc';
        doc.fillColor(bg).rect(marginLeft, tableY, pageWidth, rowH).fill();
        doc.strokeColor('#cbd5e1').lineWidth(0.35)
            .moveTo(marginLeft, tableY + rowH).lineTo(marginLeft + pageWidth, tableY + rowH).stroke();

        const qty = parseFloat(row.qty) || 0;
        const lineVal = parseFloat(row.lineValue) || 0;
        totalQty += qty;
        totalValue += lineVal;

        const textY = tableY + cellPadY;
        let cx = marginLeft;

        doc.fillColor(C.text.primary).fontSize(T.type.body).font('Helvetica-Bold')
            .text(String(idx + 1), cx + 4, textY, { width: colWidths[0] - 8, align: 'left' });
        cx += colWidths[0];

        doc.fillColor(C.text.primary).fontSize(T.type.body).font('Helvetica')
            .text(displayName, cx + 4, textY, {
                width: nameW,
                lineGap: 1,
                height: MAX_NAME_H,
                ellipsis: true,
            });
        cx += colWidths[1];

        doc.fillColor(C.text.muted).fontSize(T.type.bodyCompact).font('Helvetica')
            .text(String(row.barcode || '—'), cx + 4, textY, { width: colWidths[2] - 8, align: 'left', ellipsis: true });
        cx += colWidths[2];

        doc.fillColor(C.text.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(String(qty), cx + 4, textY, { width: colWidths[3] - 8, align: 'right' });
        cx += colWidths[3];

        doc.fillColor(C.text.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(row.unitCost != null ? fmtMoney(row.unitCost, currency) : '—', cx + 4, textY, {
                width: colWidths[4] - 8,
                align: 'right',
            });
        cx += colWidths[4];

        doc.fillColor(C.navy.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(fmtMoney(lineVal, currency), cx + 4, textY, {
                width: colWidths[5] - 8,
                align: 'right',
            });

        tableY += rowH;
    });

    const TOTAL_H = T.space.tableTotalH || 14;
    ensureSpace(TOTAL_H + 4);
    if (doc.y > tableY + 2) tableY = doc.y;

    doc.strokeColor(C.navy.primary).lineWidth(1.25)
        .moveTo(marginLeft, tableY).lineTo(marginLeft + pageWidth, tableY).stroke();
    doc.fillColor('#dde4ec').rect(marginLeft, tableY, pageWidth, TOTAL_H).fill();

    let cx = marginLeft;
    const totalVals = ['', 'TOTAL', '', String(totalQty), '', fmtMoney(totalValue, currency)];
    totalVals.forEach((v, i) => {
        const align = i >= 3 ? 'right' : 'left';
        doc.fillColor(C.navy.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(v, cx + 4, tableY + 2.5, { width: colWidths[i] - 8, align });
        cx += colWidths[i];
    });

    doc.y = tableY + TOTAL_H + 4;
}

function buildTransferSignatureSlots(evidence) {
    const { header, approvalHistory = [], approvalChainDefinition = [], workflowGeneration } = evidence;

    const slots = [{
        label: 'Requested by',
        name: header.createdBy || '',
        role: 'Requester',
        date: header.createdAt,
        status: 'PREPARED',
    }];

    if (workflowGeneration === 'LEGACY') {
        slots.push({
            label: 'Legacy workflow',
            name: 'Migrated',
            role: 'System',
            date: header.updatedAt,
            status: 'APPROVED',
        });
    } else {
        const historyByStep = new Map(approvalHistory.map((h) => [h.stepNumber, h]));
        for (const chain of approvalChainDefinition) {
            const hist = historyByStep.get(chain.step)
                || approvalHistory.find((h) => h.role === chain.role);
            const status = hist?.status || 'PENDING';
            slots.push({
                label: chain.label || ROLE_LABELS[chain.role] || chain.role,
                name: hist?.actedBy ? String(hist.actedBy).split(' (')[0] : '',
                role: ROLE_LABELS[chain.role] || chain.role,
                date: hist?.actedAt || null,
                status: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'PENDING',
            });
        }
    }

    if (header.postedAt) {
        slots.push({
            label: 'Posted',
            name: header.postedBy || '',
            role: 'Posted',
            date: header.postedAt,
            status: 'POSTED',
        });
    }

    return slots;
}

function drawAuditTrailSection(doc, layout, theme, auditTrail = {}) {
    const { marginLeft, pageWidth, ensureSpace, formatDateTime } = layout;
    const rows = [
        ['Created by', auditTrail.createdBy, auditTrail.createdAt],
        ['Last updated', auditTrail.updatedAt ? formatDateTime(auditTrail.updatedAt) : null, null],
        ['Posted by', auditTrail.postedBy, auditTrail.postedAt],
    ].filter((r) => !isEmptyReportField(r[1]) || r[2]);

    if (!rows.length) return;

    const rowStep = 9;
    const blockH = 10 + rows.length * rowStep;
    ensureSpace(blockH + 6);
    const startY = doc.y + 1;
    const pad = 8;
    const auditAccent = C.text.faint || '#94a3b8';

    doc.fillColor(auditAccent).fontSize(6).font('Helvetica-Bold')
        .text('Audit Trail', marginLeft, startY, { width: pageWidth });
    doc.strokeColor('#e5e7eb').lineWidth(0.35)
        .moveTo(marginLeft, startY + 8).lineTo(marginLeft + pageWidth, startY + 8).stroke();

    const bodyY = startY + 11;
    doc.fillColor('#fafbfc').roundedRect(marginLeft, bodyY, pageWidth, blockH - 6, T.space.radius.card).fill();
    doc.strokeColor('#e5e7eb').lineWidth(0.3).roundedRect(marginLeft, bodyY, pageWidth, blockH - 6, T.space.radius.card).stroke();

    let y = bodyY + 5;
    rows.forEach(([label, who, when]) => {
        const whoText = sanitizePrintableText(who) || '—';
        const whenText = when ? formatDateTime(when) : '';
        doc.fillColor(C.text.faint || C.text.muted).fontSize(5.5).font('Helvetica')
            .text(`${label}: `, marginLeft + pad, y, { continued: true, width: pageWidth - pad * 2 });
        doc.fillColor(C.text.muted).font('Helvetica')
            .text(`${whoText}${whenText ? ` · ${whenText}` : ''}`, { width: pageWidth - pad * 2 });
        y += rowStep;
    });

    doc.y = bodyY + blockH - 4;
}

function buildGrnPackSummaryCards(evidence, layout) {
    const { header, costSummary = {} } = evidence;
    const displayStatus = resolveDisplayStatus(header);
    const currency = costSummary.currency || 'SAR';

    return [
        { label: 'Property', value: header.tenantName || 'DX OSE' },
        { label: 'GRN No', value: header.documentNo },
        { label: 'Receiving Date', value: layout.formatDate(header.documentDate) },
        { label: 'Status', value: displayStatus },
        { label: 'Supplier', value: header.supplierName || '—' },
        { label: 'Receiving Location', value: header.receivingLocation || '—' },
        { label: 'Invoice Ref', value: header.invoiceRef || '—' },
        { label: 'Imported By', value: header.createdBy || '—' },
        { label: 'Line Items', value: String(costSummary.lineCount ?? evidence.lineItems?.length ?? 0) },
        { label: 'Total Qty', value: String(costSummary.totalQty ?? 0) },
        { label: 'Total Cost', value: formatMoney(costSummary.totalValue ?? 0, currency) },
        { label: 'Currency', value: currency },
    ];
}

function drawGrnContextRow(doc, layout, theme, evidence = {}) {
    const { header, costSummary = {} } = evidence;
    const notesParts = [
        header.supplierName ? `Supplier: ${header.supplierName}` : null,
        header.invoiceRef ? `Invoice: ${header.invoiceRef}` : null,
        header.notes ? String(header.notes).replace(/\s*\n\s*/g, ' · ').trim() : null,
    ].filter(Boolean);
    drawIncidentAndLossRow(doc, layout, theme, {
        reason: header.receivingLocation || 'Receiving location',
        notes: notesParts.length ? notesParts.join(' · ') : null,
        totalLossValue: costSummary.totalValue ?? 0,
        currency: costSummary.currency || 'SAR',
        totalLossLabel: 'Total GRN Value',
    });
}

function drawGrnItemsTable(doc, layout, theme, lineItems = [], sectionTitle = 'Imported Items') {
    const { marginLeft, pageWidth, ensureSpace, section, formatMoney: fmtMoney } = layout;
    const currency = pdfCurrency(layout);
    section(sectionTitle, sectionAccent(theme));

    const colWidths = [18, pageWidth * 0.34, pageWidth * 0.14, pageWidth * 0.1, pageWidth * 0.14, pageWidth * 0.14, pageWidth * 0.14];
    const headers = ['#', 'Item', 'Code', 'Qty', 'Unit Cost', 'Line Value', 'UOM'];
    const HDR_H = 15;
    const MIN_ROW_H = 13;
    let tableY = doc.y;

    const drawHeader = (y) => {
        doc.fillColor(BRAND_NAVY).rect(marginLeft, y, pageWidth, HDR_H).fill();
        let cx = marginLeft;
        headers.forEach((h, i) => {
            const align = i >= 3 ? 'right' : 'left';
            doc.fillColor(BRAND_WHITE).fontSize(T.type.tableHeader).font('Helvetica-Bold')
                .text(h, cx + 3, y + 3, { width: colWidths[i] - 6, align });
            cx += colWidths[i];
        });
        return y + HDR_H;
    };

    tableY = drawHeader(tableY);
    let totalQty = 0;
    let totalValue = 0;

    lineItems.forEach((row, idx) => {
        const rowH = MIN_ROW_H;
        ensureSpace(rowH + 3);
        if (doc.y > tableY + 2) tableY = doc.y;

        const bg = idx % 2 === 0 ? BRAND_WHITE : '#f8fafc';
        doc.fillColor(bg).rect(marginLeft, tableY, pageWidth, rowH).fill();
        doc.strokeColor('#e2e8f0').lineWidth(0.35)
            .moveTo(marginLeft, tableY + rowH).lineTo(marginLeft + pageWidth, tableY + rowH).stroke();

        const qty = parseFloat(row.qty) || 0;
        const lineVal = parseFloat(row.lineValue) || 0;
        totalQty += qty;
        totalValue += lineVal;

        const vals = [
            String(idx + 1),
            String(row.itemName || '—'),
            String(row.barcode || row.itemCode || '—'),
            String(qty),
            row.unitCost != null ? fmtMoney(row.unitCost, currency) : '—',
            fmtMoney(lineVal, currency),
            String(row.uom || '—'),
        ];
        let cx = marginLeft;
        vals.forEach((v, i) => {
            const align = i >= 3 ? 'right' : 'left';
            doc.fillColor(C.text.primary).fontSize(T.type.bodyCompact).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
                .text(v, cx + 3, tableY + 3, { width: colWidths[i] - 6, align, ellipsis: true });
            cx += colWidths[i];
        });
        tableY += rowH;
    });

    const TOTAL_H = 16;
    ensureSpace(TOTAL_H + 4);
    doc.strokeColor(C.navy.primary).lineWidth(0.75).moveTo(marginLeft, tableY).lineTo(marginLeft + pageWidth, tableY).stroke();
    doc.fillColor('#e8eef4').rect(marginLeft, tableY, pageWidth, TOTAL_H).fill();
    let cx = marginLeft;
    ['', 'TOTAL', '', String(totalQty), '', fmtMoney(totalValue, currency), ''].forEach((v, i) => {
        doc.fillColor(C.navy.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(v, cx + 3, tableY + 4, { width: colWidths[i] - 6, align: i >= 3 ? 'right' : 'left' });
        cx += colWidths[i];
    });
    doc.y = tableY + TOTAL_H + 4;
}

function buildGrnSignatureSlots(evidence) {
    const { header, approvalHistory = [], approvalChainDefinition = [] } = evidence;
    const byStep = new Map(approvalHistory.map((h) => [h.stepNumber, h]));
    const chainRows = approvalChainDefinition.length
        ? approvalChainDefinition
        : [{ step: 1, role: 'MILESTONE', label: 'Received & validated' }];

    return chainRows.map((chain) => {
        const hist = byStep.get(chain.step);
        const omitActorLine = hist?.kind === 'POSTING' || chain.role === 'POSTING' || chain.role === 'SYSTEM';
        const statusRaw = String(hist?.status || '').toUpperCase();
        const status =
            statusRaw === 'APPROVED' || statusRaw === 'POSTED' || statusRaw === 'COMPLETED'
                ? statusRaw
                : (chain.role === 'POSTING' || chain.role === 'SYSTEM') && header.postedAt
                  ? 'POSTED'
                  : 'PENDING';
        const pending = status === 'PENDING';
        let name = '';
        if (!omitActorLine) {
            const actor = hist?.actedBy || hist?.actor;
            name = actor && actor !== '—' && actor !== 'Pending' ? String(actor) : pending ? 'Pending' : '—';
        }
        return {
            label: chain.label,
            name,
            role: chain.role,
            date: hist?.actedAt || null,
            status,
            omitActorLine,
        };
    });
}

function drawNotesBox(doc, layout, theme, notes) {
    const text = notes ? String(notes).trim() : '';
    if (!text) return;

    const { marginLeft, pageWidth, beginSection } = layout;
    const boxH = 36;
    const startY = beginSection('Notes', boxH, sectionAccent(theme));
    const pad = 10;

    doc.fillColor(C.surface.panel).roundedRect(marginLeft, startY, pageWidth, boxH, T.space.radius.card).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.5).roundedRect(marginLeft, startY, pageWidth, boxH, T.space.radius.card).stroke();
    doc.fillColor(C.text.secondary).fontSize(T.type.body).font('Helvetica')
        .text(text.replace(/\s*\n\s*/g, '\n'), marginLeft + pad, startY + 8, {
            width: pageWidth - pad * 2,
            height: boxH - 14,
        });

    doc.y = startY + boxH + 4;
}

module.exports = {
    resolveDisplayStatus,
    drawEvidencePackHeader,
    drawIncidentAndLossRow,
    drawGoldenMetadataCardGrid,
    drawGoldenIncidentResponsibilityRow,
    drawGoldenFinancialImpactStrip,
    drawSummaryCardGrid,
    drawFinancialImpactSection,
    buildGoldenEvidenceMetadataCards,
    buildGoldenTransferMetadataCards,
    buildGoldenGetPassMetadataCards,
    drawGoldenTransferMovementRow,
    drawGoldenGetPassDetailsRow,
    formatPerson,
    drawEvidenceItemsTable,
    collectPhotoSources,
    drawPhotoEvidenceGalleryPages,
    buildEvidenceSignatureSlots,
    buildSummaryCards,
    buildTransferPackSummaryCards,
    buildTransferMetricCards,
    drawTransferContextRow,
    drawLegacyWorkflowNote,
    drawTransferItemsTable,
    buildTransferSignatureSlots,
    drawAuditTrailSection,
    drawNotesBox,
    buildGrnPackSummaryCards,
    drawGrnContextRow,
    drawGrnItemsTable,
    buildGrnSignatureSlots,
    mergeLineItemsWithImpact,
    drawCompactApprovalProgress,
    resolveLossResponsibility,
};
