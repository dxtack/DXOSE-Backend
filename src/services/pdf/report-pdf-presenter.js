'use strict';

const path = require('path');
const fs = require('fs');
const { formatReportCell, fmtSar, fmtQty } = require('../../utils/report-format.util');
const { resolveTheme } = require('./report-pdf-theme');
const { bilingual, columnHeaderBilingual, DOC_LABELS, levelLabel } = require('./report-pdf-labels');
const { TOKENS } = require('./report-pdf-design-tokens');

const C = TOKENS.color;
const BRAND_NAVY = C.navy.primary;
const BRAND_WHITE = C.text.onDark;
const BRAND_BORDER = C.border.subtle;
const BRAND_MUTED = C.text.muted;
const BRAND_PANEL = C.surface.panel;

const GROUP_META_KEYS = new Set(['rowType', 'groupLevel', 'groupLabel', 'depth']);

const { renderGroupedProfileTable } = require('./report-pdf-table.engine');
const { resolvePdfProfile } = require('./report-pdf-profiles');

const BOTTOM_RESERVE = 200;

function isGroupedExportData(data) {
    if (!Array.isArray(data) || !data.length) return false;
    return data.some((r) => r && r.rowType && r.rowType !== 'LINE');
}

function extractLineColumns(columns) {
    return (columns || []).filter((c) => c?.key && !GROUP_META_KEYS.has(c.key));
}

function classifyPdfRow(row) {
    const t = row?.rowType || 'LINE';
    if (t === 'GROUP_HEADER') return 'header';
    if (t === 'GROUP_SUBTOTAL') return 'subtotal';
    if (t === 'GRAND_TOTAL') return 'grand';
    return 'line';
}

/**
 * Build active group stack at row index (for continuation banners).
 */
function buildGroupStackAt(flatRows, index) {
    const stack = [];
    for (let i = 0; i <= index && i < flatRows.length; i++) {
        const r = flatRows[i];
        if (r.rowType === 'GROUP_HEADER') {
            const depth = Number(r.depth ?? stack.length);
            stack.length = depth;
            stack.push({ level: r.groupLevel, label: r.groupLabel });
        }
    }
    return stack;
}

function formatContinuationPath(stack) {
    if (!stack.length) return '';
    return stack.map((s) => s.label).join(' › ');
}

function numericCellColor(key, raw, format) {
    const n = Number(raw);
    if (format !== 'sar' && format !== 'qty') return BRAND_NAVY;
    if (Number.isNaN(n) || n === 0) return BRAND_NAVY;
    if (n < 0) return '#b91c1c';
    if (format === 'sar' && n > 0) return '#0f766e';
    return BRAND_NAVY;
}

function buildFallbackProfile(lineColumns, pageWidth) {
    const total = lineColumns.reduce((sum, c) => sum + (c.width || 12), 0) || 1;
    const scale = pageWidth / total;
    return {
        lineColumns: lineColumns.map((c) => ({
            key: c.key,
            header: c.header || c.key,
            widthPt: Math.max(36, Math.floor((c.width || 12) * scale)),
            format: c.format || 'text',
            align: c.align || (c.format === 'qty' || c.format === 'sar' ? 'right' : 'left'),
            cellRole: c.key === 'itemCode' ? 'code' : c.key === 'itemName' ? 'itemName' : undefined,
            maxLines: 1,
            maxLength: c.key === 'itemName' ? 56 : c.key === 'itemCode' ? 22 : undefined,
            sarNumbersOnly: c.format === 'sar',
        })),
        grandTotalBand: true,
        sarNumbersOnly: true,
    };
}

/**
 * Render grouped flatRows — Phase 1 profile engine (dynamic row heights).
 * @returns {{ tableEndY: number }}
 */
function renderGroupedReportTable(doc, flatRows, allColumns, options = {}) {
    const pageWidth = options.pageWidth ?? doc.page.width - 80;
    let profile = options.profile || resolvePdfProfile(options.reportType);
    if (!profile?.lineColumns?.length) {
        const lineColumns = extractLineColumns(allColumns);
        if (!lineColumns.length) return { tableEndY: doc.y };
        profile = buildFallbackProfile(lineColumns, pageWidth);
    }
    return renderGroupedProfileTable(doc, flatRows, { ...options, profile, totals: options.totals });
}

function tryLoadLogo(metadata = {}) {
    const candidates = [
        metadata.logoPath,
        path.join(__dirname, '../../../uploads/branding/logo.png'),
        path.join(__dirname, '../../../uploads/logo.png'),
    ].filter(Boolean);
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return fs.readFileSync(p);
        } catch { /* skip */ }
    }
    return null;
}

function drawClassificationBadge(doc, metadata, layout) {
    const classification = metadata.classification || 'INTERNAL USE';
    const isAudit = String(classification).toUpperCase().includes('AUDIT');
    const marginLeft = layout.marginLeft ?? 40;
    const pageWidth = layout.pageWidth ?? doc.page.width - 80;
    const y = doc.y;
    doc.fillColor(isAudit ? '#fef2f2' : '#fef3c7').rect(marginLeft + pageWidth - 118, y, 118, 18).fill();
    doc.strokeColor(isAudit ? '#dc2626' : '#d97706').lineWidth(0.5).rect(marginLeft + pageWidth - 118, y, 118, 18).stroke();
    doc.fillColor(isAudit ? '#991b1b' : '#92400e').fontSize(7).font('Helvetica-Bold')
        .text(classification, marginLeft + pageWidth - 114, y + 5, { width: 110, align: 'center' });
    doc.y = y + 22;
}

function drawEnterpriseFooter(doc, metadata, layout, pageIndex, pageCount) {
    const marginLeft = layout.marginLeft ?? 40;
    const pageWidth = layout.pageWidth ?? doc.page.width - 80;
    const footerY = doc.page.height - 34;
    const generatedAt = metadata.generatedAt || new Date().toISOString();
    const generatedBy = metadata.generatedBy || 'System';
    const reportReference = metadata.reportReference || '';

    doc.strokeColor(BRAND_BORDER).lineWidth(0.5)
        .moveTo(marginLeft, footerY - 8).lineTo(marginLeft + pageWidth, footerY - 8).stroke();

    doc.fillColor(BRAND_MUTED).fontSize(6).font('Helvetica-Bold')
        .text(
            `${DOC_LABELS.confidential.en} · ${DOC_LABELS.confidential.ar}  |  ${DOC_LABELS.generatedFrom.en}`,
            marginLeft,
            footerY - 2,
            { width: pageWidth, align: 'center' },
        );
    doc.fillColor(BRAND_MUTED).fontSize(6).font('Helvetica')
        .text(
            [
                metadata.tenantName || 'Property',
                reportReference,
                `Generated ${new Date(generatedAt).toLocaleString('en-GB')}`,
                `By ${generatedBy}`,
                `${DOC_LABELS.page.en} ${pageIndex} ${DOC_LABELS.of.en} ${pageCount}`,
            ].join('  |  '),
            marginLeft,
            footerY + 8,
            { width: pageWidth, align: 'center' },
        );
}

function drawEnhancedSignatures(doc, metadata, layout) {
    const marginLeft = layout.marginLeft ?? 40;
    const pageWidth = layout.pageWidth ?? doc.page.width - 80;
    const generatedBy = metadata.generatedBy || 'System';
    const generatedAt = metadata.generatedAt || new Date().toISOString();

    const workflowSlots = Array.isArray(metadata.signatureSlots) ? metadata.signatureSlots : null;
    const slots = workflowSlots || [
        {
            labelEn: DOC_LABELS.preparedBy.en,
            labelAr: DOC_LABELS.preparedBy.ar,
            name: generatedBy,
            role: metadata.preparedRole || 'Preparer',
            date: generatedAt,
            status: 'PREPARED',
        },
        {
            labelEn: DOC_LABELS.reviewedBy.en,
            labelAr: DOC_LABELS.reviewedBy.ar,
            name: metadata.reviewedBy || '',
            role: metadata.reviewedRole || 'Reviewer',
            date: metadata.reviewedAt || null,
            status: metadata.reviewedBy ? 'REVIEWED' : 'PENDING',
        },
        {
            labelEn: DOC_LABELS.approvedBy.en,
            labelAr: DOC_LABELS.approvedBy.ar,
            name: metadata.approvedBy || '',
            role: metadata.approvedRole || 'Approver',
            date: metadata.approvedAt || null,
            status: metadata.approvedBy ? 'APPROVED' : 'PENDING',
        },
    ];

    const needed = 120;
    if (doc.y + needed > doc.page.height - 55) {
        doc.addPage();
        if (layout.drawMiniHeader) layout.drawMiniHeader(doc, layout.headerOptions || {});
    }

    doc.moveDown(0.8);
    const sigStartY = doc.y;
    const sigW = pageWidth / slots.length;

    slots.forEach((sig, i) => {
        const sx = marginLeft + i * sigW;
        const statusColor = ['APPROVED', 'REVIEWED', 'PREPARED', 'POSTED'].includes(String(sig.status || '').toUpperCase())
            ? '#16a34a'
            : '#94a3b8';

        doc.strokeColor('#94a3b8').lineWidth(1)
            .moveTo(sx + 10, sigStartY + 50).lineTo(sx + sigW - 14, sigStartY + 50).stroke();
        doc.fillColor(BRAND_NAVY).fontSize(8.5).font('Helvetica-Bold')
            .text(sig.name || '_________________________', sx + 10, sigStartY + 54, {
                width: sigW - 20,
                align: 'center',
                ellipsis: true,
            });
        doc.fillColor(BRAND_MUTED).fontSize(7).font('Helvetica-Bold')
            .text(`${sig.labelEn || sig.label} / ${sig.labelAr || ''}`, sx + 10, sigStartY + 68, {
                width: sigW - 20,
                align: 'center',
            });
        if (sig.role) {
            doc.fillColor(BRAND_MUTED).fontSize(6.5).font('Helvetica')
                .text(sig.role, sx + 10, sigStartY + 80, { width: sigW - 20, align: 'center' });
        }
        doc.fillColor(statusColor).fontSize(7).font('Helvetica-Bold')
            .text(sig.status || 'PENDING', sx + 10, sigStartY + 90, { width: sigW - 20, align: 'center' });
        doc.fillColor(BRAND_MUTED).fontSize(6.5).font('Helvetica')
            .text(sig.date ? new Date(sig.date).toLocaleString('en-GB') : 'Date / التاريخ: _______________', sx + 10, sigStartY + 102, {
                width: sigW - 20,
                align: 'center',
            });
    });
    doc.y = sigStartY + 118;
}

module.exports = {
    isGroupedExportData,
    extractLineColumns,
    classifyPdfRow,
    buildGroupStackAt,
    formatContinuationPath,
    renderGroupedReportTable,
    tryLoadLogo,
    drawClassificationBadge,
    drawEnterpriseFooter,
    drawEnhancedSignatures,
    GROUP_META_KEYS,
};
