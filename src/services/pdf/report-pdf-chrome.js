'use strict';



const { TOKENS } = require('./report-pdf-design-tokens');

const { ENTERPRISE_BRAND } = require('./report-pdf-enterprise');

const { fmtSar, fmtQty } = require('../../utils/report-format.util');

const { registerPdfFonts } = require('./report-pdf-fonts');

const { sanitizePdfText } = require('./report-pdf-cell.util');



const C = TOKENS.color;

const R = TOKENS.color.reporting;

const T = TOKENS;



const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-GB') : '—');

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-GB') : '—');



const { formatGoldenKpiValue, getGoldenKpiDefs } = require('./report-golden-kpi.registry');
const { resolveGoldenPurposeLine } = require('./report-golden-language');

const { DENSITY } = require('./report-pdf-density');

const { GOLDEN_KPI_GAP_AFTER } = DENSITY;



/**

 * Golden Reference — compact enterprise shell (not dashboard hero).

 * Gold position #1: 1px hairline above navy band only.

 */

function drawGoldenPremiumShell(doc, layout, metadata = {}) {
    const fonts = registerPdfFonts(doc);
    const { marginLeft, pageWidth } = layout;
    const bandTop = 28;
    const compact = Boolean(metadata.shellCompact);
    const navyH = compact ? 48 : 57;
    const metaH = compact ? 17 : 20;
    const suppressPurpose = Boolean(metadata.suppressPurposeLine);
    const purposeH = suppressPurpose ? 0 : 10;
    const fmtDate = formatDate;
    const navyY = bandTop + 1;
    const navyColor = compact ? '#243047' : R.brandNavy;

    doc.fillColor(R.gold.accent).rect(marginLeft, bandTop, pageWidth, 1).fill();
    doc.fillColor(navyColor).rect(marginLeft, navyY, pageWidth, navyH).fill();

    const brandX = marginLeft + 18;
    const rowTop = navyY + (compact ? 8 : 11);
    doc.fillColor(C.text.onNavy).font(fonts.body).fontSize(7.5)
        .text(ENTERPRISE_BRAND.platformName, brandX, rowTop, { width: pageWidth * 0.2, lineBreak: false });
    doc.fillColor(C.text.onNavy).font(fonts.body).fontSize(6)
        .text(ENTERPRISE_BRAND.platformTagline, brandX, rowTop + 11, { width: pageWidth * 0.2, lineBreak: false });

    const title = String(metadata.title || 'OPERATIONAL REPORT').toUpperCase();
    const classification = metadata.classification || 'INTERNAL USE';
    const titleX = marginLeft + pageWidth * 0.17;
    const titleW = pageWidth * 0.66;
    doc.fillColor('#ffffff').font(fonts.bold).fontSize(15)
        .text(title, titleX, rowTop - 1, { width: titleW, align: 'center', lineBreak: false });
    doc.fillColor(R.gold.accent).font(fonts.bold).fontSize(7)
        .text(classification, titleX, rowTop + 16, { width: titleW, align: 'center', lineBreak: false });

    const rightX = marginLeft + pageWidth - 142;
    const rightW = 130;
    const docLine = metadata.documentNo ? `Doc: ${metadata.documentNo}` : null;
    const dateByLine = [
        metadata.generatedAt ? fmtDate(metadata.generatedAt) : null,
        metadata.generatedBy ? `By ${metadata.generatedBy}` : null,
    ].filter(Boolean).join(' · ');
    doc.fillColor(C.text.onNavy).font(fonts.body).fontSize(6);
    if (docLine) {
        doc.text(docLine, rightX, rowTop, { width: rightW, align: 'right', lineBreak: false });
    }
    if (dateByLine) {
        doc.text(dateByLine, rightX, rowTop + 11, { width: rightW, align: 'right', lineBreak: false });
    }

    const metaY = navyY + navyH;
    doc.fillColor(C.surface.page).rect(marginLeft, metaY, pageWidth, metaH).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35)
        .moveTo(marginLeft, metaY + metaH).lineTo(marginLeft + pageWidth, metaY + metaH).stroke();

    const scopeParts = [];
    if (metadata.filters?.departments) scopeParts.push(String(metadata.filters.departments));
    else scopeParts.push('All departments');
    if (metadata.filters?.locations) scopeParts.push(`${metadata.filters.locations} locations`);
    else scopeParts.push('All locations');
    const scope = metadata.reportScope || scopeParts.join(' · ');

    const metaPadX = 17;
    const metaTextY = metaY + (compact ? 5 : 7);
    const periodLabel = metadata.periodMetaLabel || 'Period:';
    const metaCols = [
        { label: 'Property:', value: String(metadata.tenantName || 'DX OSE') },
        { label: periodLabel, value: String(metadata.reportBasis || '—') },
        { label: 'Scope:', value: scope },
        { label: 'Classification:', value: String(classification) },
    ];
    const colCount = metaCols.length;
    const colW = pageWidth / colCount;
    metaCols.forEach((col, i) => {
        const x = marginLeft + i * colW;
        if (i > 0) {
            doc.strokeColor('#cbd5e1').lineWidth(0.75).moveTo(x, metaY + 1).lineTo(x, metaY + metaH - 1).stroke();
        }
        doc.font(fonts.body).fontSize(6);
        doc.fillColor(R.slate).text(col.label, x + metaPadX, metaTextY, { lineBreak: false });
        const labelW = doc.widthOfString(col.label);
        doc.fillColor(C.text.primary).font(fonts.bold).fontSize(7)
            .text(col.value, x + metaPadX + labelW + 3, metaTextY, {
                width: colW - metaPadX * 2 - labelW - 3,
                ellipsis: true,
                lineBreak: false,
            });
    });

    const purposeY = metaY + metaH + (suppressPurpose ? 0 : 3);
    if (!suppressPurpose) {
        const purposeLine = resolveGoldenPurposeLine(metadata.reportType, metadata);
        if (purposeLine) {
            doc.fillColor(R.slate).font(fonts.body).fontSize(6.25)
                .text(purposeLine, marginLeft + 10, purposeY, {
                    width: pageWidth - 20,
                    oblique: true,
                    lineBreak: false,
                });
        }
    }

    doc.x = marginLeft;
    doc.y = purposeY + purposeH + 4;
}

/**
 * Golden continuation pages — compact rail (~24pt), path merged, no ERP box.
 */
function drawGoldenContinuationRail(doc, layout, options = {}) {
    const fonts = registerPdfFonts(doc);
    const marginLeft = layout.marginLeft ?? 36;
    const pageWidth = layout.pageWidth ?? doc.page.width - 72;
    const railTop = 28;
    const railH = 24;

    const title = sanitizePdfText(String(options.title || 'Report'), { maxLength: 64 });
    const reportRef = sanitizePdfText(options.reportReference || options.documentNo || '', { maxLength: 40 });
    const generatedBy = sanitizePdfText(options.generatedBy || 'System', { maxLength: 24 });
    const generatedAt = options.generatedAt || new Date().toISOString();
    const metaParts = [
        reportRef,
        `Generated ${formatDateTime(generatedAt)}`,
        `By ${generatedBy}`,
    ].filter(Boolean);

    let pathText = '';
    if (options.continuationPath) {
        pathText = sanitizePdfText(String(options.continuationPath), { maxLength: 120 });
    }

    doc.strokeColor(C.border.subtle).lineWidth(0.5).moveTo(marginLeft, railTop).lineTo(marginLeft + pageWidth, railTop).stroke();

    doc.fillColor(R.slate).font(fonts.body).fontSize(6.5)
        .text(title, marginLeft, railTop + 5, { width: pageWidth * 0.38, lineBreak: false });
    doc.fillColor(R.slate).font(fonts.body).fontSize(5.5)
        .text(metaParts.join(' · '), marginLeft + pageWidth * 0.38, railTop + 6, {
            width: pageWidth * 0.62,
            align: 'right',
            lineBreak: false,
        });

    if (pathText) {
        // Left accent marker + strong contrast path for clarity on continuation pages
        doc.fillColor('#94a3b8').rect(marginLeft, railTop + 14, 1.5, 8).fill();
        doc.fillColor('#334155').font(fonts.bold).fontSize(6.5)
            .text(pathText, marginLeft + 5, railTop + 14.5, { width: pageWidth - 6, lineBreak: false });
    }

    const bottomY = railTop + railH;
    doc.strokeColor(C.border.subtle).lineWidth(0.35).moveTo(marginLeft, bottomY).lineTo(marginLeft + pageWidth, bottomY).stroke();
    doc.x = marginLeft;
    doc.y = bottomY + 5;
}

/**

 * @deprecated Use drawGoldenPremiumShell — kept for tests importing the symbol.

 */

function drawGoldenReportContext(doc, layout, metadata = {}) {

    drawGoldenPremiumShell(doc, layout, metadata);

}



/**

 * Golden Reference — flat executive information rail (no dashboard cards).

 */

function drawGoldenExecutiveStrip(doc, layout, totals = {}, profile = null) {
    const fonts = registerPdfFonts(doc);
    const reportType = profile?.id || 'current-stock-balance';
    const cards = getGoldenKpiDefs(reportType, profile).map((def) => ({
        key: def.key,
        label: def.label,
        value: formatGoldenKpiValue(totals, def),
        footnote: def.format === 'wac',
        hero: Boolean(def.hero),
    }));

    const h = 40;
    layout.ensureSpace(h + GOLDEN_KPI_GAP_AFTER);
    const y = doc.y;
    const ml = layout.marginLeft;
    const pw = layout.pageWidth;
    const heroKey = cards.find((c) => c.hero)?.key || 'totalValue';
    // 4+ KPI cards: equal-width blocks for uniform executive strip
    const useEqualWidths = cards.length >= 4;
    const eqW = Math.floor(pw / cards.length);
    const valueW = useEqualWidths ? eqW : Math.floor(pw * 0.27);
    const otherW = useEqualWidths ? eqW : Math.floor((pw - valueW) / Math.max(1, cards.length - 1));

    doc.fillColor('#f4f7fb').rect(ml, y, pw, h).fill();
    doc.strokeColor('#d1d9e6').lineWidth(0.5).moveTo(ml, y).lineTo(ml + pw, y).stroke();
    doc.strokeColor('#d1d9e6').lineWidth(0.35).moveTo(ml, y + h).lineTo(ml + pw, y + h).stroke();

    let x = ml;
    cards.forEach((card, i) => {
        const isMutedZeroCritical =
            profile?.id === 'inventory-health-aging' &&
            card.key === 'criticalCount' &&
            Number(totals.criticalCount ?? card.value) === 0;
        const isHero = card.key === heroKey && !useEqualWidths && !isMutedZeroCritical;
        const w = isHero ? valueW : (useEqualWidths ? eqW : otherW);
        if (i > 0) {
            doc.strokeColor('#d1d9e6').lineWidth(0.4).moveTo(x, y + 6).lineTo(x, y + h - 6).stroke();
        }
        // save/restore ensures doc.y does not advance between horizontal KPI blocks
        doc.save();
        doc.fillColor(isMutedZeroCritical ? '#94a3b8' : R.slate).font(fonts.body).fontSize(5.5)
            .text(card.label.toUpperCase(), x + 10, y + 8, { width: w - 14, characterSpacing: 0.5, lineBreak: false });
        const valueSize = isMutedZeroCritical ? 9 : (isHero ? 13 : 10);
        const valueY = isHero ? y + 21 : y + 23;
        doc.fillColor(isMutedZeroCritical ? '#94a3b8' : R.brandNavy).font(fonts.bold).fontSize(valueSize)
            .text(card.value, x + 10, valueY, { width: w - 14, lineBreak: false });
        if (card.footnote) {
            doc.fillColor(R.slate).font(fonts.body).fontSize(5)
                .text('Blended WAC = Total Value ÷ Total Qty', x + 10, y + 33, {
                    width: w - 14,
                    lineBreak: false,
                });
        }
        doc.restore();
        x += w;
    });

    doc.y = y + h + GOLDEN_KPI_GAP_AFTER;
}



function drawReportKpiStrip(doc, layout, totals = {}, profile = null) {

    if (profile?.goldenReference) {

        drawGoldenExecutiveStrip(doc, layout, totals, profile);

        return;

    }

    const keys = profile?.kpiKeys;

    if (!keys?.length || !totals) return;



    const cards = [];

    if (keys.includes('totalVarianceQty') && totals.totalVarianceQty != null) {

        cards.push({ label: 'Total variance qty', value: fmtQty(totals.totalVarianceQty) });

    }

    if (keys.includes('totalVarianceValue') && totals.totalVarianceValue != null) {

        cards.push({ label: 'Total variance (SAR)', value: fmtSar(totals.totalVarianceValue) });

    }

    if (keys.includes('totalValue') && totals.totalValue != null) {

        cards.push({ label: 'Total value (SAR)', value: fmtSar(totals.totalValue) });

    }

    if (keys.includes('totalQty') && totals.totalQty != null) {

        cards.push({ label: 'Total qty', value: fmtQty(totals.totalQty) });

    }

    if (keys.includes('rowCount') && totals.rowCount != null) {

        cards.push({ label: 'Lines', value: String(totals.rowCount) });

    }

    if (keys.includes('wacMissingCount') && Number(totals.wacMissingCount) > 0) {

        cards.push({ label: 'WAC missing lines', value: String(totals.wacMissingCount), warn: true });

    }



    if (!cards.length) return;



    const fonts = registerPdfFonts(doc);

    const h = 24;

    layout.ensureSpace(h + 4);

    const y = doc.y;

    const gap = 4;

    const w = (layout.pageWidth - gap * (cards.length - 1)) / cards.length;



    cards.forEach((card, i) => {

        const x = layout.marginLeft + i * (w + gap);

        doc.fillColor(R.kpi.surface).roundedRect(x, y, w, h, 4).fill();

        doc.strokeColor(R.kpi.border).lineWidth(0.5).roundedRect(x, y, w, h, 4).stroke();

        doc.strokeColor(R.gold.hairline).lineWidth(0.5)

            .moveTo(x + 6, y + h - 3).lineTo(x + w - 6, y + h - 3).stroke();

        doc.fillColor(card.warn ? '#b45309' : R.slate).font(fonts.bold).fontSize(T.type.cardLabel)

            .text(card.label, x + 6, y + 5, { width: w - 12, lineBreak: false });

        doc.fillColor(R.brandNavy).font(fonts.bold).fontSize(8)

            .text(card.value, x + 6, y + 13, { width: w - 12, align: 'left', lineBreak: false });

    });

    doc.y = y + h + 4;

}



/**

 * Flat audit approval strip (golden) — no bordered cards or pills.

 */

function drawGoldenApprovalStrip(doc, layout, metadata = {}) {

    const fonts = registerPdfFonts(doc);

    const generatedBy = metadata.generatedBy || 'System';

    const generatedAt = metadata.generatedAt || new Date().toISOString();

    const slots = Array.isArray(metadata.signatureSlots)

        ? metadata.signatureSlots

        : [

              { labelEn: 'Prepared by', name: generatedBy, date: generatedAt, status: 'PREPARED' },

              { labelEn: 'Reviewed by', name: metadata.reviewedBy || '', date: metadata.reviewedAt || null, status: metadata.reviewedBy ? 'REVIEWED' : 'PENDING' },

              { labelEn: 'Approved by', name: metadata.approvedBy || '', date: metadata.approvedAt || null, status: metadata.approvedBy ? 'APPROVED' : 'PENDING' },

          ];



    const needed = 28;

    if (doc.y + needed > layout.bottomLimit()) {
        doc.addPage();
        if (layout.drawMiniHeader) layout.drawMiniHeader(doc, layout.headerOptions, layout);
    }

    const y = doc.y + 3;
    const h = 36;
    const ml = layout.marginLeft;
    const pw = layout.pageWidth;

    doc.fillColor('#f8fafc').rect(ml, y, pw, h).fill();
    doc.strokeColor('#e2e8f0').lineWidth(0.25)
        .moveTo(ml, y).lineTo(ml + pw, y).stroke();

    const slotW = pw / slots.length;
    slots.forEach((sig, i) => {
        const sx = ml + i * slotW;
        const lineX1 = sx + slotW * 0.06;
        const lineX2 = sx + slotW * 0.94;

        if (i > 0) {
            doc.strokeColor('#e2e8f0').lineWidth(0.25)
                .moveTo(sx, y + 4).lineTo(sx, y + h - 4).stroke();
        }

        const labelText = (sig.labelEn || sig.label || '—').toUpperCase();
        doc.fillColor('#94a3b8').font(fonts.body).fontSize(5)
            .text(labelText, sx + 6, y + 6, { width: slotW - 12, characterSpacing: 0.5, lineBreak: false, align: 'center' });

        doc.strokeColor('#cbd5e1').lineWidth(0.5)
            .moveTo(lineX1, y + 22).lineTo(lineX2, y + 22).stroke();

        doc.fillColor('#cbd5e1').font(fonts.body).fontSize(4)
            .text('Signature / Date', sx + 6, y + 26, { width: slotW - 12, lineBreak: false, align: 'center' });
    });

    doc.strokeColor('#e2e8f0').lineWidth(0.25).moveTo(ml, y + h).lineTo(ml + pw, y + h).stroke();

    doc.x = ml;

    doc.y = y + h + 2;

}



function drawCompactApprovalStrip(doc, layout, metadata = {}) {

    drawGoldenApprovalStrip(doc, layout, metadata);

}



/**

 * Reset cursor before footer pass so PDFKit text() does not flow from a low doc.y and add pages.

 */

function prepareDocForFooterStamp(doc, layout) {

    const range = doc.bufferedPageRange();

    const lastIdx = range.start + range.count - 1;

    doc.switchToPage(lastIdx);

    doc.x = layout.marginLeft ?? 40;

    doc.y = 0;

}



/**

 * Stamp footers on buffered pages only — absolute coordinates, no flow, no addPage.

 */

function stampThreeZoneFooters(doc, layout, metadata) {

    const fonts = registerPdfFonts(doc);

    prepareDocForFooterStamp(doc, layout);

    const range = doc.bufferedPageRange();

    const pageCount = range.count;

    const generatedAt = metadata.generatedAt || new Date().toISOString();

    const ref = sanitizePdfText(metadata.reportReference || '', { maxLength: 48 });

    const classification = sanitizePdfText(metadata.classification || 'INTERNAL USE', { maxLength: 24 });

    const shellTag = metadata.goldenShellRev ? ` · Shell ${metadata.goldenShellRev}` : '';
    const generatedLine = sanitizePdfText(
        `Generated ${formatDateTime(generatedAt)} · ${metadata.generatedBy || 'System'}${shellTag}`,
        { maxLength: 96 },
    );

    const ml = layout.marginLeft;

    const pw = layout.pageWidth;



    for (let i = range.start; i < range.start + pageCount; i++) {

        doc.switchToPage(i);

        doc.save();



        const pageH = doc.page.height;

        const footerY = pageH - 26;

        const lineY = footerY - 4;



        doc.x = ml;

        doc.y = footerY;



        doc.strokeColor(C.border.subtle).lineWidth(0.5).moveTo(ml, lineY).lineTo(ml + pw, lineY).stroke();



        const pageNum = i - range.start + 1;

        const pageLabel = `Page ${pageNum} of ${pageCount}`;



        doc.font(fonts.body).fontSize(6);

        doc.fillColor(C.text.muted).text(ref, ml, footerY, {

            width: pw * 0.32,

            lineBreak: false,

            height: 8,

        });

        doc.font(fonts.body).fontSize(6).fillColor(R.steel).text(classification, ml + pw * 0.34, footerY, {

            width: pw * 0.32,

            align: 'center',

            lineBreak: false,

            height: 8,

        });

        doc.font(fonts.body).fontSize(6).fillColor(C.text.muted).text(pageLabel, ml + pw * 0.68, footerY, {

            width: pw * 0.32,

            align: 'right',

            lineBreak: false,

            height: 8,

        });

        const generatedFooterSize = metadata.goldenShellRev ? 5 : 5.5;
        const generatedFooterColor = metadata.goldenShellRev ? '#e2e8f0' : C.text.muted;
        doc.font(fonts.body).fontSize(generatedFooterSize).fillColor(generatedFooterColor).text(generatedLine, ml, footerY + 7, {
            width: pw,
            align: 'center',
            lineBreak: false,
            height: 7,
        });



        doc.restore();

    }



    doc.switchToPage(range.start + pageCount - 1);

    doc.x = ml;

    doc.y = 0;

}



module.exports = {

    drawReportKpiStrip,

    drawGoldenPremiumShell,

    drawGoldenContinuationRail,

    drawGoldenReportContext,

    drawGoldenExecutiveStrip,

    drawGoldenApprovalStrip,

    drawCompactApprovalStrip,

    prepareDocForFooterStamp,

    stampThreeZoneFooters,

    formatDateTime,

};

