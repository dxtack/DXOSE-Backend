'use strict';

const { TOKENS } = require('./report-pdf-design-tokens');
const { resolveTheme } = require('./report-pdf-theme');
const { levelLabel } = require('./report-pdf-labels');
const {
    formatPdfCell,
    measureCellHeight,
    shouldSkipSubtotalCell,
    sanitizePdfText,
    preparePdfCellText,
    isCodeColumn,
    getMovementTypeColor,
} = require('./report-pdf-cell.util');
const { registerPdfFonts } = require('./report-pdf-fonts');
const { profileLineColumns, buildDetailHeaderGroups } = require('./report-pdf-profiles');
const { DENSITY } = require('./report-pdf-density');
const { isTotalsFooterRow, fmtSar, fmtQty } = require('../../utils/report-format.util');

const C = TOKENS.color;
const R = TOKENS.color.reporting;

const {
    MIN_ROW_H,
    HEADER_H,
    GROUP_HEADER_H,
    SUBTOTAL_H,
    GRAND_TOTAL_H,
    CONTINUATION_H,
    BOTTOM_RESERVE,
    BODY_FONT_SIZE,
    CODE_FONT_SIZE,
    HEADER_FONT_SIZE,
    CELL_PAD_V,
    CELL_PAD_H,
    LINE_GAP,
    GROUP_GAP,
    SUBTOTAL_GAP,
    GRAND_TOTAL_GAP,
    GRAND_TOTAL_CLOSE_GAP,
    GRAND_TOTAL_H_GOLDEN,
    GRAND_TOTAL_CLOSE_GAP_GOLDEN,
    SUBTOTAL_LOC_H,
    SUBTOTAL_DEPT_H,
    GOLDEN_MIN_ROW_H,
    GOLDEN_HEADER_H,
    GOLDEN_BODY_FONT_SIZE,
    GOLDEN_ZEBRA,
    GOLDEN_LOC_SUBTOTAL_TAIL_GAP,
    GOLDEN_CELL_PAD_V,
    GOLDEN_GROUP_HEADER_H,
    GOLDEN_SIGNATURE_RESERVE,
    GOLDEN_BODY_BOTTOM_RESERVE,
} = DENSITY;

function numericCellColor(format, raw, golden = false, col = null) {
    const n = Number(raw);
    // Semantic role override — movement columns (qty) and variance columns (qty + sar)
    if (col?.semanticRole && (format === 'qty' || format === 'sar') && !Number.isNaN(n) && n !== 0) {
        if (col.semanticRole === 'inbound')  return '#166534';
        if (col.semanticRole === 'outbound') return n > 0 ? '#9b2c2c' : C.text.primary;
        if (col.semanticRole === 'adj')      return n < 0 ? R.negative : '#15803d';
    }
    if (format !== 'sar' && format !== 'qty') return C.text.primary;
    if (Number.isNaN(n) || n === 0) return C.text.primary;
    if (n < 0) return R.negative;
    if (golden) return C.text.primary;
    if (format === 'sar' && n > 0) return R.positiveSar;
    return C.text.primary;
}

function formatContinuationPath(stack) {
    if (!stack.length) return '';
    return stack.map((s) => s.label).join(' > ');
}

function computeLineRowHeight(doc, row, columns, fonts, profile) {
    const golden = Boolean(profile?.goldenReference);
    const minH = golden ? GOLDEN_MIN_ROW_H : MIN_ROW_H;
    const bodySize = golden ? GOLDEN_BODY_FONT_SIZE : BODY_FONT_SIZE;
    let h = minH;
    columns.forEach((col) => {
        if (isCodeColumn(col)) {
            h = Math.max(h, minH);
            return;
        }
        const text = preparePdfCellText(row, col, profile);
        const maxLines = col.maxLines ?? 1;
        const cellH = measureCellHeight(doc, text, col.widthPt, {
            font: fonts.body,
            fontSize: bodySize,
            maxLines,
            lineGap: LINE_GAP,
            padding: (golden ? GOLDEN_CELL_PAD_V : CELL_PAD_V) * 2 + 2,
        });
        h = Math.max(h, cellH);
    });
    return h;
}

function drawPdfCell(doc, x, y, w, rowH, text, col, fonts, color, golden = false) {
    const code = isCodeColumn(col);
    const fontSize = code ? CODE_FONT_SIZE : golden ? GOLDEN_BODY_FONT_SIZE : BODY_FONT_SIZE;
    const padX = CELL_PAD_H;
    const padY = golden ? GOLDEN_CELL_PAD_V : CELL_PAD_V;
    const align = col.align === 'right' || col.format === 'qty' || col.format === 'sar' ? 'right' : 'left';
    const innerH = Math.max(4, rowH - padY * 2);

    doc.save();
    doc.rect(x, y, w, rowH).clip();
    doc.font(fonts.body).fontSize(fontSize);
    doc.fillColor(color).text(text, x + padX, y + padY, {
        width: w - padX * 2,
        align,
        lineBreak: false,
        ellipsis: true,
        height: innerH,
    });
    doc.restore();
    doc.x = x;
    doc.y = y + rowH;
}

function resolveTableHeaderHeight(profile, golden) {
    if (golden && profile?.detailTwoRowHeader) {
        return (profile.detailGroupRowHeightPt ?? 12) + (profile.detailSubRowHeightPt ?? 14);
    }
    if (golden) return profile?.goldenHeaderHeightPt ?? GOLDEN_HEADER_H;
    return HEADER_H;
}

function drawDetailTwoRowTableHeader(doc, y, columns, marginLeft, fonts, profile) {
    const groupH = profile?.detailGroupRowHeightPt ?? 12;
    const subH = profile?.detailSubRowHeightPt ?? 14;
    const totalH = groupH + subH;
    const totalW = columns.totalWidth;
    const groups = buildDetailHeaderGroups(columns.list);

    doc.fillColor('#475569').rect(marginLeft, y, totalW, groupH).fill();
    doc.fillColor(C.navy.tableHeader).rect(marginLeft, y + groupH, totalW, subH).fill();
    doc.strokeColor('#64748b').lineWidth(0.5)
        .moveTo(marginLeft, y + groupH).lineTo(marginLeft + totalW, y + groupH).stroke();
    doc.strokeColor('#334155').lineWidth(0.5)
        .moveTo(marginLeft, y + totalH).lineTo(marginLeft + totalW, y + totalH).stroke();

    let gx = marginLeft;
    groups.forEach((group, idx) => {
        if (idx > 0) {
            doc.strokeColor('#64748b').lineWidth(0.5)
                .moveTo(gx, y + 2).lineTo(gx, y + groupH - 2).stroke();
        }
        doc.fillColor('#ffffff').font(fonts.bold).fontSize(7)
            .text(group.label, gx + 2, y + 3, {
                width: group.width - 4,
                align: 'center',
                lineBreak: false,
            });
        gx += group.width;
    });

    let x = marginLeft;
    columns.list.forEach((col) => {
        const w = col.widthPt;
        const align = col.align === 'right' ? 'right' : 'left';
        const label = col.subHeader || col.header || col.key;
        doc.fillColor('#ffffff').font(fonts.bold).fontSize(7.5)
            .text(label, x + CELL_PAD_H, y + groupH + 4, {
                width: w - CELL_PAD_H * 2,
                align,
                lineBreak: false,
            });
        x += w;
    });

    return y + totalH;
}

function drawTableHeader(doc, y, columns, marginLeft, fonts, golden = false, profile = null) {
    if (golden && profile?.detailTwoRowHeader) {
        return drawDetailTwoRowTableHeader(doc, y, columns, marginLeft, fonts, profile);
    }

    const totalW = columns.totalWidth;
    const detailHeader = golden && profile?.id === 'detail-report';
    const headerH = resolveTableHeaderHeight(profile, golden);
    doc.fillColor(C.navy.tableHeader).rect(marginLeft, y, totalW, headerH).fill();
    if (!golden) {
        doc.fillColor(R.gold.accent).rect(marginLeft, y + headerH - 1, totalW, 1).fill();
    } else {
        doc.strokeColor('#475569').lineWidth(0.4)
            .moveTo(marginLeft, y + headerH).lineTo(marginLeft + totalW, y + headerH).stroke();
    }
    let x = marginLeft;
    const headerFontSize = detailHeader ? 7 : (golden ? 6.5 : HEADER_FONT_SIZE);
    const headerColor = detailHeader ? '#f1f5f9' : (golden ? '#e2e8f0' : C.text.onDark);
    const headerFont = golden ? fonts.bold : fonts.body;
    const headerPadY = detailHeader ? 5 : (golden ? 4 : 3);
    columns.list.forEach((col) => {
        const w = col.widthPt;
        const align = col.align === 'right' ? 'right' : 'left';
        doc.fillColor(headerColor).font(headerFont).fontSize(headerFontSize)
            .text(col.header, x + CELL_PAD_H, y + headerPadY, {
                width: w - CELL_PAD_H * 2,
                align,
                lineBreak: false,
                characterSpacing: detailHeader ? 0.15 : (golden ? 0.3 : 0),
            });
        x += w;
    });
    return y + headerH;
}

const TOTALS_KEY_MAP = {
    varianceQty: 'totalVarianceQty',
    varianceValue: 'totalVarianceValue',
    bookQty: 'totalBookQty',
    countedQty: 'totalCountedQty',
    qtyOnHand: 'totalQty',
    value: 'totalValue',
    lineValue: 'totalValue',
    unitCost: 'totalWacBlended',
    qtyIn: 'totalQtyIn',
    qtyOut: 'totalQtyOut',
    openingQty: 'totalOpeningQty',
    closingQty: 'totalClosingQty',
    inQty: 'totalInQty',
    outQty: 'totalOutQty',
    openingValue: 'totalOpeningValue',
    closingValue: 'totalClosingValue',
    qty: 'totalQty',
    // OMC explicit movement columns
    grnQty:      'totalGrnQty',
    tfrInQty:    'totalTfrInQty',
    returnQty:   'totalReturnQty',
    breakageQty: 'totalBreakageQty',
    lostQty:     'totalLostQty',
    tfrOutQty:   'totalTfrOutQty',
    issueQty:    'totalIssueQty',
    getPassOutQty: 'totalGetPassOutQty',
    adjQty:      'totalAdjQty',
    exposureValue: 'exposureValue',
    qtyOutstanding: 'outstandingQty',
};

function shouldShowGrandTotalValue(raw, profile) {
    if (raw == null || raw === '') return false;
    if (profile?.grandTotalSuppressZero) {
        const n = Number(raw);
        if (!Number.isNaN(n) && n === 0) return false;
    }
    return true;
}

function resolveGrandTotalRaw(col, grandRow, totals) {
    let raw = grandRow?.[col.key];
    if ((raw == null || raw === '') && totals && TOTALS_KEY_MAP[col.key]) {
        raw = totals[TOTALS_KEY_MAP[col.key]];
    }
    return raw;
}

function drawGrandTotalBand(doc, y, columns, grandRow, marginLeft, fonts, profile, totals) {
    const totalW = columns.totalWidth;
    const golden = Boolean(profile?.goldenReference);

    // KPI-block mode: workspace-style summary strip (e.g. OMC grand total)
    if (golden && profile?.grandTotalKpiDefs?.length) {
        const kpiDefs = profile.grandTotalKpiDefs;
        const closeGap = profile?.grandTotalCloseGapPt ?? GRAND_TOTAL_CLOSE_GAP_GOLDEN;
        const bandY = y + closeGap + 2;
        const bandH = 28;
        // Gold rule + navy band
        doc.strokeColor(R.gold.accent).lineWidth(1.5)
            .moveTo(marginLeft, bandY).lineTo(marginLeft + totalW, bandY).stroke();
        doc.fillColor(C.navy.tableHeader).rect(marginLeft, bandY, totalW, bandH).fill();
        // "GRAND TOTAL" badge
        const badgeW = 80;
        doc.fillColor('#94a3b8').font(fonts.bold).fontSize(5)
            .text('GRAND TOTAL', marginLeft + 8, bandY + 8, {
                width: badgeW - 10, characterSpacing: 0.5, lineBreak: false,
            });
        // KPI blocks
        const kpiZoneX = marginLeft + badgeW;
        const kpiZoneW = totalW - badgeW;
        const kpiW = Math.floor(kpiZoneW / kpiDefs.length);
        kpiDefs.forEach((def, i) => {
            const kx = kpiZoneX + i * kpiW;
            const rawVal = totals?.[def.key];
            const text = rawVal == null ? '—'
                : def.format === 'sar' ? fmtSar(rawVal) : fmtQty(rawVal);
            doc.strokeColor('#334155').lineWidth(0.5)
                .moveTo(kx, bandY + 4).lineTo(kx, bandY + bandH - 4).stroke();
            // save/restore ensures doc.y does not advance between horizontal blocks
            doc.save();
            doc.fillColor('#94a3b8').font(fonts.body).fontSize(5)
                .text(String(def.label).toUpperCase(), kx + 6, bandY + 7, {
                    width: kpiW - 10, characterSpacing: 0.3, lineBreak: false,
                });
            doc.fillColor(C.text.onDark).font(fonts.bold).fontSize(def.format === 'sar' ? 8 : 8.5)
                .text(text, kx + 6, bandY + 16, { width: kpiW - 10, lineBreak: false });
            doc.restore();
        });
        doc.x = marginLeft;
        doc.y = bandY + bandH;
        return y + closeGap + 2 + bandH + GRAND_TOTAL_GAP + 2;
    }

    const closeGap = golden ? GRAND_TOTAL_CLOSE_GAP_GOLDEN : 2;
    const bandH = golden ? GRAND_TOTAL_H_GOLDEN : GRAND_TOTAL_H;
    const bandY = y + closeGap + (golden ? 2 : 0);
    const cols = columns.list;
    const labelSpan = columns.labelSpan != null ? columns.labelSpan : Math.min(2, cols.length);

    if (golden) {
        const ruleY = bandY - 3;
        doc.strokeColor(R.subtotal.border).lineWidth(1.0)
            .moveTo(marginLeft, ruleY).lineTo(marginLeft + totalW, ruleY).stroke();
        doc.strokeColor(R.gold.accent).lineWidth(2.5)
            .moveTo(marginLeft, bandY).lineTo(marginLeft + totalW, bandY).stroke();
    } else {
        doc.strokeColor(R.gold.accent).lineWidth(1.25).moveTo(marginLeft, bandY).lineTo(marginLeft + totalW, bandY).stroke();
    }
    doc.fillColor(C.navy.tableHeader).rect(marginLeft, bandY, totalW, bandH).fill();

    const labelW = cols.slice(0, labelSpan).reduce((s, c) => s + c.widthPt, 0);
    doc.save();
    doc.fillColor(C.text.onDark).font(fonts.bold).fontSize(golden ? 12 : 9.5)
        .text('GRAND TOTAL', marginLeft + CELL_PAD_H, bandY + (golden ? 9 : 10), {
            width: Math.max(60, labelW - CELL_PAD_H * 2),
            lineBreak: false,
            height: 13,
        });
    doc.restore();

    let x = marginLeft + labelW;
    for (let idx = labelSpan; idx < cols.length; idx++) {
        const col = cols[idx];
        const w = col.widthPt;
        let text = '';
        if (col.format === 'qty' || col.format === 'sar') {
            let raw = resolveGrandTotalRaw(col, grandRow, totals);
            if (
                golden &&
                col.key === 'unitCost' &&
                profile?.grandTotalShowWac &&
                (raw == null || raw === '') &&
                totals?.totalWacBlended != null
            ) {
                raw = totals.totalWacBlended;
            }
            if (shouldShowGrandTotalValue(raw, profile)) {
                text = formatPdfCell(raw, col.format, {
                    sarNumbersOnly: col.sarNumbersOnly || profile?.sarNumbersOnly,
                });
            }
        }
        const align = col.align === 'right' || col.format === 'qty' || col.format === 'sar' ? 'right' : 'left';
        doc.save();
        doc.fillColor(C.text.onDark).font(fonts.bold).fontSize(golden ? 11.5 : 9)
            .text(text, x + CELL_PAD_H, bandY + (golden ? 9 : 11), {
                width: w - CELL_PAD_H * 2,
                align,
                lineBreak: false,
                height: 13,
            });
        doc.restore();
        x += w;
    }

    doc.x = marginLeft;
    doc.y = bandY + bandH;

    if (!golden) {
        doc.strokeColor(C.navy.tableHeader).lineWidth(1.5)
            .moveTo(marginLeft, bandY + bandH).lineTo(marginLeft + totalW, bandY + bandH).stroke();
    }

    const preBreath = golden ? 2 : 0;
    return y + closeGap + preBreath + bandH + GRAND_TOTAL_GAP + 2;
}

function isLocationSubtotalRow(row) {
    const lvl = String(row.groupLevel || '').toLowerCase();
    return lvl === 'location' || Number(row.depth) >= 1;
}

function isLastDeptSubtotalBeforeGrand(flatRows, idx) {
    const row = flatRows[idx];
    if ((row.rowType || '') !== 'GROUP_SUBTOTAL' || isLocationSubtotalRow(row)) return false;
    for (let j = idx + 1; j < flatRows.length; j++) {
        const next = flatRows[j];
        if ((next.rowType || '') === 'GRAND_TOTAL') return true;
        if ((next.rowType || '') === 'GROUP_SUBTOTAL' && !isLocationSubtotalRow(next)) return false;
    }
    return false;
}

function transferGroupHeaderHeight(golden, groupLevel) {
    if (groupLevel === 'transfer' && golden) return 22;
    return golden ? GOLDEN_GROUP_HEADER_H : GROUP_HEADER_H;
}

function resolveTransferGroupHeader(flatRows, rowIdx, fallbackLabel) {
    for (let i = rowIdx + 1; i < flatRows.length; i++) {
        const next = flatRows[i];
        const kind = next.rowType || 'LINE';
        if (kind === 'GROUP_HEADER' || kind === 'GROUP_SUBTOTAL' || kind === 'GRAND_TOTAL') break;
        if (kind !== 'LINE') continue;

        const from = next.fromLocation || next.source || '';
        const to = next.toLocation || next.destination || '';
        const route =
            from || to
                ? sanitizePdfText(`${from || '—'} → ${to || '—'}`, { maxLength: 72 })
                : sanitizePdfText(String(fallbackLabel || '—'), { maxLength: 72 });
        const no = next.transferNo || fallbackLabel || '—';
        const status = String(next.status || '').replace(/_/g, ' ') || '—';
        const meta = sanitizePdfText(`${no} · ${status}`, { maxLength: 72 });
        return { route, meta };
    }
    return {
        route: sanitizePdfText(String(fallbackLabel || '—'), { maxLength: 72 }),
        meta: '',
    };
}

function drawGoldenSubtotalRow(doc, tableY, row, columns, marginLeft, pageWidth, fonts, profile) {
    const indent = marginLeft + Math.min(Number(row.depth ?? 0), 2) * 10;
    const bandW = marginLeft + pageWidth - indent;
    const locSub = isLocationSubtotalRow(row);
    const detailPolish = profile?.id === 'detail-report';
    const rowH = locSub ? SUBTOTAL_LOC_H : SUBTOTAL_DEPT_H;
    const cellTextY = detailPolish ? 5 : 4;

    if (locSub) {
        const bandX = marginLeft;
        const bandWFull = pageWidth;
        doc.strokeColor('#cdd5e0').lineWidth(0.4)
            .moveTo(bandX, tableY).lineTo(bandX + bandWFull, tableY).stroke();
        doc.fillColor('#e4ebf4').rect(bandX, tableY, bandWFull, rowH).fill();
        doc.strokeColor('#cdd5e0').lineWidth(0.4)
            .moveTo(bandX, tableY + rowH).lineTo(bandX + bandWFull, tableY + rowH).stroke();
    } else if (detailPolish) {
        doc.fillColor('#e4ebf4').rect(indent, tableY, bandW, rowH).fill();
        doc.strokeColor('#cdd5e0').lineWidth(0.5)
            .moveTo(indent, tableY).lineTo(marginLeft + pageWidth, tableY).stroke();
        doc.strokeColor('#cdd5e0').lineWidth(0.5)
            .moveTo(indent, tableY + rowH).lineTo(marginLeft + pageWidth, tableY + rowH).stroke();
    } else {
        doc.fillColor('#d4def0').rect(indent, tableY, bandW, rowH).fill();
        doc.strokeColor('#b0bdd4').lineWidth(0.6)
            .moveTo(indent, tableY).lineTo(marginLeft + pageWidth, tableY).stroke();
        doc.strokeColor('#b0bdd4').lineWidth(0.6)
            .moveTo(indent, tableY + rowH).lineTo(marginLeft + pageWidth, tableY + rowH).stroke();
    }

    doc.save();
    const labelFont = locSub || detailPolish ? fonts.body : fonts.bold;
    const subLabel = locSub
        ? `Subtotal · ${sanitizePdfText(row.groupLabel || '', { maxLength: 40 })}`
        : `Subtotal — ${sanitizePdfText(row.groupLabel || '', { maxLength: 40 })}`;
    const labelX = locSub ? marginLeft : indent;
    const labelW = locSub ? pageWidth : bandW;
    const labelSize = locSub ? 7 : (detailPolish ? 7.25 : 7.5);
    doc.fillColor(locSub ? '#334155' : '#1e293b').font(labelFont).fontSize(labelSize)
        .text(subLabel, labelX + (locSub ? 6 : 8), tableY + cellTextY, {
            width: labelW * 0.38,
            lineBreak: false,
            height: 10,
        });

    let x = marginLeft;
    columns.list.forEach((col) => {
        const raw = row[col.key];
        const w = col.widthPt;
        if (!shouldSkipSubtotalCell(col, raw) && (col.format === 'qty' || col.format === 'sar')) {
            const text = formatPdfCell(raw, col.format, {
                sarNumbersOnly: col.sarNumbersOnly || profile?.sarNumbersOnly,
            });
            const align = col.align === 'right' ? 'right' : 'left';
            const numFont = locSub || detailPolish ? fonts.body : fonts.bold;
            doc.fillColor(C.text.primary).font(numFont).fontSize(7.25)
                .text(text, x + CELL_PAD_H, tableY + cellTextY, {
                    width: w - CELL_PAD_H * 2,
                    align,
                    lineBreak: false,
                    height: 10,
                });
        }
        x += w;
    });
    doc.restore();

    return rowH;
}

/**
 * Grouped audit table with dynamic row heights and profile-driven columns.
 */
function renderGroupedProfileTable(doc, flatRows, options = {}) {
    const fonts = registerPdfFonts(doc);
    const profile = options.profile;
    const golden = Boolean(profile?.goldenReference);
    const lineCols = profileLineColumns(profile, options.pageWidth);
    const totalWidth = lineCols.reduce((s, c) => s + c.widthPt, 0);
    const columns = { list: lineCols, totalWidth };

    const theme = resolveTheme(options.familyId || options.reportType || 'generic');
    const marginLeft = options.marginLeft ?? 40;
    const pageWidth = options.pageWidth ?? doc.page.width - 80;
    const headerBase = options.headerOptions || {};
    const useGrandBand = profile?.grandTotalBand !== false;

    let tableY = doc.y;
    let rowIndex = 0;
    let groupStack = [];
    let pendingContinuation = null;
    let grandRow = null;

    const pageBottom = () =>
        doc.page.height - (golden ? GOLDEN_BODY_BOTTOM_RESERVE : BOTTOM_RESERVE);

    const ensureGoldenClosingFits = () => {
        const closingNeed =
            GRAND_TOTAL_CLOSE_GAP_GOLDEN + 2 + GRAND_TOTAL_H_GOLDEN + GRAND_TOTAL_GAP + 2 + GOLDEN_SIGNATURE_RESERVE;
        if (tableY + closingNeed > doc.page.height - 46) {
            newPage();
        }
    };

    const drawContinuationBar = (y) => {
        // Golden: continuation path is already rendered in drawMiniHeader chrome — skip here
        if (golden) return y;
        const path = pendingContinuation || formatContinuationPath(groupStack);
        if (!path) return y;
        doc.fillColor(R.band.location).rect(marginLeft, y, pageWidth, CONTINUATION_H).fill();
        const stripe = theme.stripeColors?.[0] || R.stripe.department;
        doc.fillColor(stripe).rect(marginLeft, y, 2, CONTINUATION_H).fill();
        doc.fillColor(C.text.primary).font(fonts.bold).fontSize(7)
            .text(`Continued: ${sanitizePdfText(path, { maxLength: 120 })}`, marginLeft + 8, y + 3, {
                width: pageWidth - 12,
                lineBreak: false,
            });
        return y + CONTINUATION_H + 1;
    };

    const newPage = () => {
        doc.addPage();
        const path = formatContinuationPath(groupStack);
        if (options.drawMiniHeader) {
            options.drawMiniHeader(doc, { ...headerBase, continuationPath: path || undefined });
        }
        pendingContinuation = golden ? null : path;
        tableY = drawTableHeader(doc, drawContinuationBar(doc.y), columns, marginLeft, fonts, golden, profile);
    };

    const ensureSpace = (needed) => {
        if (tableY + needed <= pageBottom()) return;
        newPage();
    };

    const syncTableCursor = () => {
        doc.x = marginLeft;
        doc.y = tableY;
    };

    tableY = drawContinuationBar(doc.y);
    tableY = drawTableHeader(doc, tableY, columns, marginLeft, fonts, golden, profile);

    flatRows.forEach((row, rowIdx) => {
        const kind = row.rowType || 'LINE';

        if (kind === 'GROUP_HEADER') {
            const depth = Math.min(Number(row.depth ?? 0), 2);
            groupStack.length = depth;
            groupStack.push({ level: row.groupLevel, label: row.groupLabel });

            const isTransferGroup = row.groupLevel === 'transfer';
            const transferHeader = isTransferGroup
                ? resolveTransferGroupHeader(flatRows, rowIdx, row.groupLabel)
                : null;
            const groupH = transferGroupHeaderHeight(golden, row.groupLevel);
            ensureSpace(groupH + GROUP_GAP);
            // depth 0 = Session → dark navy (matches Workspace session header)
            // depth 1 = Location → light bg with strong left accent stripe
            const band =
                golden && depth === 0
                    ? C.navy.tableHeader
                    : theme.headerBands[depth] || theme.headerBands[0];
            const indent = marginLeft + depth * 12;
            const bandW = marginLeft + pageWidth - indent;

            const stripeW = golden ? (depth === 0 ? 0 : 3) : 3;
            doc.fillColor(band).rect(indent, tableY, bandW, groupH).fill();
            if (stripeW > 0) {
                const stripeColor = golden
                    ? '#64748b'
                    : (theme.stripeColors?.[depth] || theme.stripeColors?.[0] || R.stripe.department);
                doc.fillColor(stripeColor).rect(indent, tableY, stripeW, groupH).fill();
            }

            const lvl = levelLabel(row.groupLevel);
            const labelOnly = sanitizePdfText(row.groupLabel || '—', { maxLength: 96 });
            const title = golden
                ? sanitizePdfText(`${lvl.en} · ${row.groupLabel || '—'}`, { maxLength: 96 })
                : sanitizePdfText(`${lvl.en}: ${row.groupLabel || '—'}`, { maxLength: 96 });
            const groupFont = golden && depth >= 1 ? fonts.body : fonts.bold;
            doc.save();
            if (golden && isTransferGroup && transferHeader) {
                const textX = indent + 8 + stripeW;
                doc.fillColor('#f1f5f9').font(groupFont).fontSize(8)
                    .text(transferHeader.route, textX, tableY + 3, {
                        width: bandW - 16 - stripeW,
                        lineBreak: false,
                    });
                if (transferHeader.meta) {
                    doc.fillColor('#94a3b8').font(fonts.body).fontSize(6.5)
                        .text(transferHeader.meta, textX, tableY + 12, {
                            width: bandW - 16 - stripeW,
                            lineBreak: false,
                        });
                }
            } else if (golden) {
                const textX = indent + 8 + stripeW;
                const prefix = `${lvl.en} · `;
                doc.font(fonts.body).fontSize(6.5);
                const prefixW = doc.widthOfString(prefix);
                // On dark navy (session), use light muted text; on light bg (location) use slate
                const onDark = depth === 0;
                doc.fillColor(onDark ? '#94a3b8' : R.slate).font(fonts.body).fontSize(6.5)
                    .text(prefix, textX, tableY + 5, { lineBreak: false });
                doc.fillColor(onDark ? '#f1f5f9' : C.text.primary).font(groupFont).fontSize(depth === 0 ? 8 : 7.75)
                    .text(labelOnly, textX + prefixW, tableY + (depth === 0 ? 4 : 5), {
                        width: bandW - 16 - stripeW - prefixW,
                        lineBreak: false,
                        height: 10,
                    });
            } else {
                doc.fillColor(C.text.primary).font(groupFont).fontSize(depth === 0 ? 8.5 : 7.75)
                    .text(title, indent + 8 + stripeW, tableY + 5, {
                        width: bandW - 16 - stripeW,
                        lineBreak: false,
                        height: 10,
                    });
            }
            doc.restore();

            tableY += groupH + GROUP_GAP;
            syncTableCursor();
            return;
        }

        if (kind === 'GROUP_SUBTOTAL') {
            const subH = profile?.goldenReference
                ? isLocationSubtotalRow(row)
                    ? SUBTOTAL_LOC_H
                    : SUBTOTAL_DEPT_H
                : SUBTOTAL_H;
            ensureSpace(subH + SUBTOTAL_GAP);

            if (profile?.goldenReference) {
                if (!isLocationSubtotalRow(row) && isLastDeptSubtotalBeforeGrand(flatRows, rowIdx)) {
                    doc.strokeColor(R.gold.accent).lineWidth(1)
                        .moveTo(marginLeft, tableY).lineTo(marginLeft + pageWidth, tableY).stroke();
                }
                const usedH = drawGoldenSubtotalRow(
                    doc,
                    tableY,
                    row,
                    columns,
                    marginLeft,
                    pageWidth,
                    fonts,
                    profile,
                );
                tableY += usedH + SUBTOTAL_GAP;
                if (isLocationSubtotalRow(row)) {
                    tableY += GOLDEN_LOC_SUBTOTAL_TAIL_GAP;
                }
            } else {
                const indent = marginLeft + Math.min(Number(row.depth ?? 0), 2) * 10;
                const bandW = marginLeft + pageWidth - indent;

                doc.fillColor(theme.subtotalBg).rect(indent, tableY, bandW, SUBTOTAL_H).fill();
                doc.strokeColor(theme.subtotalBorder).lineWidth(0.75)
                    .moveTo(indent, tableY).lineTo(marginLeft + pageWidth, tableY).stroke();

                doc.save();
                doc.fillColor(R.steel).font(fonts.bold).fontSize(7.5)
                    .text(`Subtotal — ${sanitizePdfText(row.groupLabel || '', { maxLength: 40 })}`, indent + 8, tableY + 4, {
                        width: bandW * 0.38,
                        lineBreak: false,
                        height: 10,
                    });

                let x = marginLeft;
                columns.list.forEach((col) => {
                    const raw = row[col.key];
                    const w = col.widthPt;
                    if (!shouldSkipSubtotalCell(col, raw) && (col.format === 'qty' || col.format === 'sar')) {
                        const text = formatPdfCell(raw, col.format, {
                            sarNumbersOnly: col.sarNumbersOnly || profile?.sarNumbersOnly,
                        });
                        const align = col.align === 'right' ? 'right' : 'left';
                        doc.fillColor(C.text.primary).font(fonts.bold).fontSize(7.5)
                            .text(text, x + CELL_PAD_H, tableY + 4, {
                                width: w - CELL_PAD_H * 2,
                                align,
                                lineBreak: false,
                                height: 10,
                            });
                    }
                    x += w;
                });
                doc.restore();

                tableY += SUBTOTAL_H + SUBTOTAL_GAP;
            }
            syncTableCursor();
            return;
        }

        if (kind === 'GRAND_TOTAL') {
            if (useGrandBand) {
                grandRow = row;
                return;
            }
        }

        if (kind !== 'LINE') return;

        const rowH = computeLineRowHeight(doc, row, columns.list, fonts, profile);
        ensureSpace(rowH);

        const bg = golden
            ? rowIndex % 2 === 0
                ? C.surface.page
                : GOLDEN_ZEBRA
            : rowIndex % 2 === 0
              ? C.surface.page
              : C.surface.panel;

        doc.fillColor(bg).rect(marginLeft, tableY, pageWidth, rowH).fill();

        let x = marginLeft;
        columns.list.forEach((col) => {
            const w = col.widthPt;
            const text = preparePdfCellText(row, col, profile);
            const movTypeColor = col.cellRole === 'movementType'
                ? getMovementTypeColor(row[col.key], null)
                : null;
            const color = movTypeColor ?? numericCellColor(col.format, row[col.key], golden, col);
            drawPdfCell(doc, x, tableY, w, rowH, text, col, fonts, color, golden);
            x += w;
        });

        doc.strokeColor(golden ? '#d1d9e0' : C.border.subtle).lineWidth(golden ? 0.4 : 0.35)
            .moveTo(marginLeft, tableY + rowH).lineTo(marginLeft + pageWidth, tableY + rowH).stroke();

        tableY += rowH;
        rowIndex += 1;
        syncTableCursor();

        const next = flatRows[rowIdx + 1];
        const nextGroupH = transferGroupHeaderHeight(golden, next?.groupLevel);
        if (next?.rowType === 'GROUP_HEADER' && tableY + nextGroupH + resolveTableHeaderHeight(profile, golden) > pageBottom()) {
            newPage();
        }
    });

    if (useGrandBand && (grandRow || options.totals)) {
        if (golden) {
            ensureGoldenClosingFits();
        } else {
            ensureSpace(GRAND_TOTAL_H + GRAND_TOTAL_GAP + 4);
        }
        tableY = drawGrandTotalBand(doc, tableY, columns, grandRow || {}, marginLeft, fonts, profile, options.totals);
    }

    doc.x = marginLeft;
    doc.y = tableY;
    return { tableEndY: tableY, grandRow };
}

function drawContinuationBar(doc, y, path, marginLeft, pageWidth, theme, fonts) {
    if (!path) return y;
    doc.fillColor(R.band.location).rect(marginLeft, y, pageWidth, CONTINUATION_H).fill();
    const stripe = theme.stripeColors?.[0] || R.stripe.department;
    doc.fillColor(stripe).rect(marginLeft, y, 2, CONTINUATION_H).fill();
    doc.fillColor(C.text.primary).font(fonts.bold).fontSize(7)
        .text(`Continued: ${sanitizePdfText(path, { maxLength: 120 })}`, marginLeft + 8, y + 3, {
            width: pageWidth - 12,
            lineBreak: false,
        });
    return y + CONTINUATION_H + 2;
}

/**
 * Flat table with fixed pt columns and dynamic row height.
 */
function renderFlatProfileTable(doc, layout, data, columns, metadata = {}) {
    const fonts = registerPdfFonts(doc);
    const profile = metadata.profile;
    const lineCols = profile?.lineColumns
        ? profileLineColumns(profile, layout.pageWidth)
        : columns.map((c) => ({
              ...c,
              widthPt: ((c.width || 12) / columns.reduce((s, x) => s + (x.width || 12), 0)) * layout.pageWidth,
              maxLines: c.maxLines ?? 1,
          }));

    const totalWidth = lineCols.reduce((s, c) => s + (c.widthPt || 60), 0);
    const colSpec = { list: lineCols, totalWidth };
    const bottomReserve = metadata.totals ? BOTTOM_RESERVE + 40 : BOTTOM_RESERVE;
    const marginLeft = layout.marginLeft;

    const drawHeader = (y) => drawTableHeader(doc, y, colSpec, marginLeft, fonts);

    const newPage = () => {
        doc.addPage();
        if (layout.drawMiniHeader) layout.drawMiniHeader(doc, layout.headerOptions, layout);
        return drawHeader(doc.y);
    };

    let tableY = drawHeader(doc.y);
    let rowIndex = 0;
    let grandRow = null;

    data.forEach((row) => {
        if (row.rowType === 'GRAND_TOTAL' && profile?.grandTotalBand) {
            grandRow = row;
            return;
        }
        if (row.rowType === 'GROUP_HEADER' || row.rowType === 'GROUP_SUBTOTAL') {
            return;
        }
        const isTotals = isTotalsFooterRow(row, lineCols);
        if (isTotals && profile?.grandTotalBand) {
            grandRow = row;
            return;
        }

        const rowH = computeLineRowHeight(doc, row, colSpec.list, fonts, profile);
        if (tableY + rowH > doc.page.height - bottomReserve) {
            tableY = newPage();
        }

        const bg = isTotals ? C.navy.tableHeader : rowIndex % 2 === 0 ? C.surface.page : C.surface.panel;
        doc.fillColor(bg).rect(marginLeft, tableY, layout.pageWidth, rowH).fill();

        let x = marginLeft;
        colSpec.list.forEach((col) => {
            const w = col.widthPt;
            const text = preparePdfCellText(row, col, profile);
            const color = isTotals ? C.text.onDark : numericCellColor(col.format, row[col.key]);
            if (isTotals) {
                const align = col.align === 'right' || col.format === 'qty' || col.format === 'sar' ? 'right' : 'left';
                doc.fillColor(color).font(fonts.bold).fontSize(BODY_FONT_SIZE)
                    .text(text, x + CELL_PAD_H, tableY + CELL_PAD_V, {
                        width: w - CELL_PAD_H * 2,
                        align,
                        lineBreak: false,
                        ellipsis: true,
                    });
            } else {
                drawPdfCell(doc, x, tableY, w, rowH, text, col, fonts, color);
            }
            x += w;
        });

        doc.strokeColor(C.border.subtle).lineWidth(0.35)
            .moveTo(marginLeft, tableY + rowH).lineTo(marginLeft + layout.pageWidth, tableY + rowH).stroke();

        tableY += rowH;
        if (!isTotals) rowIndex += 1;
    });

    if (grandRow && profile?.grandTotalBand) {
        if (tableY + GRAND_TOTAL_H > doc.page.height - bottomReserve) {
            tableY = newPage();
        }
        tableY = drawGrandTotalBand(doc, tableY, colSpec, grandRow, marginLeft, fonts, profile, metadata.totals);
    }

    doc.y = tableY + 4;
}

module.exports = {
    renderGroupedProfileTable,
    renderFlatProfileTable,
    drawGrandTotalBand,
    MIN_ROW_H,
    HEADER_H,
    GRAND_TOTAL_H,
};
