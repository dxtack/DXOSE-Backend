'use strict';

/**
 * Wave 1A — Enterprise PDF facade for Reporting Workspace + legacy report PDFs.
 * Presentation only: shared header/footer, tokens, SAR formatting, density, continuation.
 */
const PDFDocument = require('pdfkit');
const { TOKENS } = require('./report-pdf-design-tokens');
const { ENTERPRISE_BRAND, stampEnterpriseDocumentFooters } = require('./report-pdf-enterprise');
const {
    createEvidenceLayout,
    drawEvidenceMiniHeader,
    printableValue,
} = require('./report-pdf-layout');
const { drawEvidencePackHeader, drawCompactApprovalProgress } = require('./report-pdf-components');
const { drawGoldenPremiumShell, drawGoldenContinuationRail } = require('./report-pdf-chrome');
const {
    formatReportCell,
    buildReportReference,
    isTotalsFooterRow,
    fmtSar,
    fmtQty,
} = require('../../utils/report-format.util');

const C = TOKENS.color;
const T = TOKENS;

/** Landscape workspace / analytics PDF margins (aligned with inventory count final PDF). */
const WORKSPACE_LANDSCAPE_MARGINS = { top: 24, bottom: 36, left: 36, right: 36 };

const TABLE_HEADER_H = 13;
const TABLE_ROW_H = 13;
const FOOTER_RESERVE = 46;

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-GB') : '—');

function activeFilterEntries(filters = {}) {
    const printable = (value) => {
        if (value == null || value === '') return '—';
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
    };
    return Object.entries(filters)
        .filter(([, value]) => value != null && value !== '' && !(Array.isArray(value) && value.length === 0))
        .map(([key, value]) => ({
            label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()),
            value: printable(value),
        }));
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 * @param {object} meta
 */
function createWorkspaceLayout(doc, meta = {}) {
    const marginLeft = WORKSPACE_LANDSCAPE_MARGINS.left;
    const marginRight = WORKSPACE_LANDSCAPE_MARGINS.right;
    const pageWidth = doc.page.width - marginLeft - marginRight;
    const headerOptions = meta.headerOptions || meta;

    const layout = createEvidenceLayout(doc, {
        marginLeft,
        marginRight,
        onNewPage: (d) => drawWorkspaceContinuationHeader(d, headerOptions, layout),
    });

    layout.pageWidth = pageWidth;
    layout.marginLeft = marginLeft;
    layout.headerOptions = headerOptions;
    layout.drawMiniHeader = (d, opts) => drawWorkspaceContinuationHeader(d, { ...headerOptions, ...opts }, layout);
    layout.bottomLimit = () => doc.page.height - FOOTER_RESERVE;

    return layout;
}

function drawWorkspaceContinuationHeader(doc, options = {}, layout = {}) {
    if (options.goldenReference) {
        drawGoldenContinuationRail(doc, layout, options);
        return;
    }
    drawEvidenceMiniHeader(
        doc,
        {
            title: options.title || 'Report',
            reportReference: options.reportReference || options.documentNo || '',
            generatedBy: options.generatedBy || 'System',
            generatedAt: options.generatedAt || new Date().toISOString(),
            accent: C.navy.primary,
        },
        layout,
    );
}

function drawInlineMetaStrip(doc, layout, items) {
    if (!items.length) return;
    const h = 24;
    layout.ensureSpace(h + 4);
    const y = doc.y;
    const w = layout.pageWidth / items.length;
    items.forEach((item, i) => {
        const x = layout.marginLeft + i * w;
        doc.fillColor(C.surface.panel).rect(x, y, w, h).fill();
        doc.strokeColor(C.border.subtle).lineWidth(0.35).rect(x, y, w, h).stroke();
        doc.fillColor(C.text.muted).fontSize(5.5).font('Helvetica')
            .text(item.label, x + 6, y + 5, { width: w - 12, height: 7 });
        doc.fillColor(C.navy.primary).fontSize(7.5).font('Helvetica-Bold')
            .text(String(item.value ?? '—'), x + 6, y + 13, { width: w - 12, ellipsis: true, height: 10 });
    });
    doc.y = y + h + 4;
}

function drawFilterScope(doc, layout, filterEntries) {
    if (!filterEntries.length) return;
    layout.ensureSpace(20);
    doc.fillColor(C.text.muted).fontSize(T.type.cardLabel).font('Helvetica-Bold')
        .text('Scope / filters', layout.marginLeft, doc.y);
    doc.moveDown(0.15);
    doc.fillColor(C.text.secondary).fontSize(T.type.bodyCompact).font('Helvetica')
        .text(
            filterEntries.map((e) => `${e.label}: ${e.value}`).join('  |  '),
            layout.marginLeft,
            doc.y,
            { width: layout.pageWidth },
        );
    doc.moveDown(0.5);
}

function drawFinancialTotalsSummary(doc, layout, totals = {}, options = {}) {
    if (!totals || !Object.keys(totals).length) return;

    const lines = [];
    if (totals.totalBookQty != null) lines.push({ label: 'Total snapshot qty', value: fmtQty(totals.totalBookQty) });
    if (totals.totalCountedQty != null) lines.push({ label: 'Total counted qty', value: fmtQty(totals.totalCountedQty) });
    if (totals.totalVarianceQty != null) lines.push({ label: 'Total variance qty', value: fmtQty(totals.totalVarianceQty) });
    if (totals.totalVarianceValue != null) lines.push({ label: 'Total variance value', value: fmtSar(totals.totalVarianceValue) });
    if (totals.totalQtyIn != null) lines.push({ label: 'Total qty in', value: fmtQty(totals.totalQtyIn) });
    if (totals.totalQtyOut != null) lines.push({ label: 'Total qty out', value: fmtQty(totals.totalQtyOut) });
    if (totals.totalNetQty != null) lines.push({ label: 'Net qty', value: fmtQty(totals.totalNetQty) });
    if (totals.totalLineValue != null) lines.push({ label: 'Total line value', value: fmtSar(totals.totalLineValue) });
    if (totals.totalLossValue != null) lines.push({ label: 'Total loss value', value: fmtSar(totals.totalLossValue) });
    if (totals.totalLossQty != null) lines.push({ label: 'Total loss qty', value: fmtQty(totals.totalLossQty) });
    if (totals.totalClosingQty != null) lines.push({ label: 'Closing qty', value: fmtQty(totals.totalClosingQty) });
    if (totals.totalClosingValue != null) lines.push({ label: 'Closing value', value: fmtSar(totals.totalClosingValue) });
    if (totals.totalInQty != null) lines.push({ label: 'Inbound qty', value: fmtQty(totals.totalInQty) });
    if (totals.totalOutQty != null) lines.push({ label: 'Outbound qty', value: fmtQty(totals.totalOutQty) });
    if (totals.totalQty != null && totals.totalBookQty == null) lines.push({ label: 'Total qty', value: fmtQty(totals.totalQty) });
    if (totals.totalValue != null && totals.totalVarianceValue == null && totals.totalLineValue == null) {
        lines.push({ label: 'Total value', value: fmtSar(totals.totalValue) });
    }
    if (totals.rowCount != null) lines.push({ label: 'Row count', value: String(totals.rowCount) });
    if (totals.wacMissingCount != null && Number(totals.wacMissingCount) > 0) {
        lines.push({ label: 'WAC missing lines', value: String(totals.wacMissingCount), warn: true });
    }
    if (!lines.length) return;

    const blockH = lines.length * 14 + 14;
    if (doc.y + blockH > layout.bottomLimit()) {
        doc.addPage();
        drawWorkspaceContinuationHeader(doc, layout.headerOptions, layout);
    }

    doc.fillColor(C.text.muted).fontSize(T.type.cardLabel).font('Helvetica-Bold')
        .text(options.sectionTitle || 'Financial totals', layout.marginLeft, doc.y);
    doc.moveDown(0.2);
    const boxY = doc.y;
    doc.fillColor(C.surface.panel).rect(layout.marginLeft, boxY, layout.pageWidth, blockH).fill();
    doc.strokeColor(C.border.subtle).lineWidth(0.35)
        .rect(layout.marginLeft, boxY, layout.pageWidth, blockH).stroke();

    lines.forEach((line, idx) => {
        const y = boxY + 6 + idx * 14;
        doc.fillColor(line.warn ? '#b45309' : C.text.secondary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(line.label, layout.marginLeft + 8, y, { width: layout.pageWidth * 0.5 });
        doc.fillColor(C.navy.primary).fontSize(T.type.cardValue).font('Helvetica-Bold')
            .text(line.value, layout.marginLeft + layout.pageWidth * 0.5, y, {
                width: layout.pageWidth * 0.48,
                align: 'right',
            });
    });
    doc.y = boxY + blockH + 6;
}

function drawWorkspaceSignatures(doc, layout, metadata = {}) {
    const marginLeft = layout.marginLeft;
    const pageWidth = layout.pageWidth;
    const generatedBy = metadata.generatedBy || 'System';
    const generatedAt = metadata.generatedAt || new Date().toISOString();
    const slots = Array.isArray(metadata.signatureSlots)
        ? metadata.signatureSlots
        : [
              { labelEn: 'Prepared by', name: generatedBy, date: generatedAt, status: 'PREPARED' },
              { labelEn: 'Reviewed by', name: metadata.reviewedBy || '', date: metadata.reviewedAt || null, status: metadata.reviewedBy ? 'REVIEWED' : 'PENDING' },
              { labelEn: 'Approved by', name: metadata.approvedBy || '', date: metadata.approvedAt || null, status: metadata.approvedBy ? 'APPROVED' : 'PENDING' },
          ];

    const needed = 100;
    if (doc.y + needed > layout.bottomLimit()) {
        doc.addPage();
        drawWorkspaceContinuationHeader(doc, layout.headerOptions, layout);
    }

    doc.moveDown(0.6);
    const sigStartY = doc.y;
    const sigW = pageWidth / slots.length;

    slots.forEach((sig, i) => {
        const sx = marginLeft + i * sigW;
        const done = ['APPROVED', 'REVIEWED', 'PREPARED', 'POSTED', 'SUBMITTED'].includes(String(sig.status || '').toUpperCase());
        doc.strokeColor(C.border.default).lineWidth(0.75)
            .moveTo(sx + 4, sigStartY + 44).lineTo(sx + sigW - 6, sigStartY + 44).stroke();
        doc.fillColor(C.text.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
            .text(sig.name || '_________________________', sx + 8, sigStartY + 48, {
                width: sigW - 16,
                align: 'center',
                ellipsis: true,
            });
        doc.fillColor(C.text.muted).fontSize(T.type.approvalLabel).font('Helvetica-Bold')
            .text(sig.labelEn || sig.label || '—', sx + 8, sigStartY + 66, { width: sigW - 16, align: 'center' });
        doc.fillColor(done ? '#166534' : C.text.muted).fontSize(T.type.approvalDate).font('Helvetica')
            .text(sig.date ? formatDateTime(sig.date) : 'Date: _______________', sx + 8, sigStartY + 78, {
                width: sigW - 16,
                align: 'center',
            });
    });
    doc.y = sigStartY + 92;
}

function renderFlatAnalyticsTable(doc, layout, data, columns, metadata = {}) {
    const totalExcelW = columns.reduce((sum, column) => sum + (column.width || 15), 0);
    const colWidths = columns.map((column) => ((column.width || 15) / totalExcelW) * layout.pageWidth);
    const bottomReserve = metadata.totals ? 200 : 120;

    const drawTableHeader = (y) => {
        doc.fillColor(C.navy.tableHeader).rect(layout.marginLeft, y, layout.pageWidth, TABLE_HEADER_H).fill();
        let x = layout.marginLeft;
        columns.forEach((column, index) => {
            const align = column.align === 'right' ? 'right' : 'left';
            doc.fillColor(C.text.onDark).fontSize(T.type.tableHeader).font('Helvetica-Bold')
                .text(column.header, x + 3, y + 2, {
                    width: colWidths[index] - 6,
                    ellipsis: true,
                    align,
                });
            x += colWidths[index];
        });
        doc.strokeColor('#b8954a').lineWidth(0.5)
            .moveTo(layout.marginLeft, y + TABLE_HEADER_H - 0.5)
            .lineTo(layout.marginLeft + layout.pageWidth, y + TABLE_HEADER_H - 0.5)
            .stroke();
        return y + TABLE_HEADER_H;
    };

    const newPageForTable = () => {
        doc.addPage();
        drawWorkspaceContinuationHeader(doc, layout.headerOptions, layout);
        return drawTableHeader(doc.y);
    };

    let tableY = drawTableHeader(doc.y);
    let rowIndex = 0;

    data.forEach((row) => {
        const isTotals = isTotalsFooterRow(row, columns);
        if (tableY + TABLE_ROW_H > doc.page.height - bottomReserve) {
            tableY = newPageForTable();
        }

        const bg = isTotals ? C.navy.tableHeader : rowIndex % 2 === 0 ? C.surface.page : C.surface.panel;
        doc.fillColor(bg).rect(layout.marginLeft, tableY, layout.pageWidth, TABLE_ROW_H).fill();
        let x = layout.marginLeft;
        columns.forEach((column, colIndex) => {
            const cellFormat = column.format || 'text';
            const text = formatReportCell(row[column.key], cellFormat);
            let align =
                column.align === 'right' || cellFormat === 'qty' || cellFormat === 'sar' || cellFormat === 'date'
                    ? 'right'
                    : 'left';
            let cellColor = isTotals ? C.text.onDark : C.text.primary;
            let cellFont = isTotals ? 'Helvetica-Bold' : 'Helvetica';

            if (!isTotals) {
                if (column.key === 'status') {
                    const sv = String(row[column.key] || '').toUpperCase();
                    if (sv === 'POSTED' || sv === 'COMPLETED') cellColor = '#166534';
                    else if (sv === 'COUNTING' || sv === 'IN_PROGRESS') cellColor = '#d97706';
                    else cellColor = C.text.secondary;
                }
                if (column.key === 'blindMode') {
                    cellColor = '#64748b';
                    align = 'center';
                }
            }

            doc.fillColor(cellColor).fontSize(T.type.bodyCompact).font(cellFont)
                .text(text, x + 3, tableY + 2, {
                    width: colWidths[colIndex] - 6,
                    ellipsis: true,
                    align,
                });
            x += colWidths[colIndex];
        });

        doc.strokeColor(C.border.subtle).lineWidth(0.35)
            .moveTo(layout.marginLeft, tableY + TABLE_ROW_H)
            .lineTo(layout.marginLeft + layout.pageWidth, tableY + TABLE_ROW_H)
            .stroke();

        tableY += TABLE_ROW_H;
        if (!isTotals) rowIndex += 1;
    });

    doc.y = tableY + 4;
}

function stampWorkspaceFooters(doc, layout, metadata) {
    const generatedAt = metadata.generatedAt || new Date().toISOString();
    stampEnterpriseDocumentFooters(doc, layout, {
        mode: 'controlled',
        generatedAt,
        printedAt: generatedAt,
        classification: metadata.classification || 'INTERNAL USE',
        reportReference: metadata.reportReference,
        documentNo: metadata.reportReference,
        documentSuffix: metadata.documentSuffix || 'Analytics Report',
        tenantName: metadata.tenantName || ENTERPRISE_BRAND.platformName,
        footerPrimaryLine: ENTERPRISE_BRAND.footerControlledLine,
    });
}

/**
 * Draw first-page chrome (enterprise header + meta + optional filters).
 */
function renderWorkspaceReportChrome(doc, layout, title, metadata = {}) {
    const theme = { sectionAccent: C.navy.primary, accent: C.navy.primary };
    const generatedAt = metadata.generatedAt || new Date().toISOString();
    const reportReference = metadata.reportReference || buildReportReference(metadata.reportType, generatedAt);

    const reportingChrome = Boolean(metadata.compactChrome);
    const headerMeta = {
        title: String(title || 'Report').toUpperCase(),
        displayStatus: metadata.classification || 'INTERNAL USE',
        classification: metadata.classification || 'INTERNAL USE',
        tenantName: metadata.tenantName || ENTERPRISE_BRAND.platformName,
        documentNo: reportReference,
        generatedAt,
        generatedBy: metadata.generatedBy || 'System',
        reportingChrome,
    };

    if (metadata.goldenReference) {
        drawGoldenPremiumShell(doc, layout, { ...headerMeta, ...metadata });
        return;
    }

    drawEvidencePackHeader(doc, layout, theme, headerMeta);

    if (!reportingChrome) {
        drawInlineMetaStrip(doc, layout, [
            { label: 'Property', value: metadata.tenantName || ENTERPRISE_BRAND.platformName },
            { label: 'Report ref', value: reportReference },
            { label: 'Generated by', value: metadata.generatedBy || 'System' },
            { label: 'Generated at', value: formatDateTime(generatedAt) },
        ]);
        if (metadata.reportBasis) {
            drawInlineMetaStrip(doc, layout, [{ label: 'Period / basis', value: metadata.reportBasis }]);
        }
        drawFilterScope(doc, layout, activeFilterEntries(metadata.filters));
    } else if (metadata.reportBasis) {
        const periodY = doc.y;
        doc.fillColor(C.text.muted).fontSize(T.type.cardLabel).font('Helvetica-Bold')
            .text('Period', layout.marginLeft, periodY, { lineBreak: false });
        doc.fillColor(C.text.primary).fontSize(T.type.bodyCompact).font('Helvetica')
            .text(String(metadata.reportBasis), layout.marginLeft + 52, periodY, {
                width: layout.pageWidth - 52,
                lineBreak: false,
            });
        doc.y = periodY + 14;
    }
}

/**
 * Legacy stock-count evidence → enterprise landscape controlled document (presentation only).
 */
function renderLegacyStockCountEvidencePdf(evidence) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margins: WORKSPACE_LANDSCAPE_MARGINS,
            bufferPages: true,
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const generatedAt = new Date().toISOString();
        const sessionNo = evidence.sessionInfo?.sessionNo || 'COUNT';
        const meta = {
            generatedAt,
            generatedBy: evidence.sessionInfo?.createdBy || 'System',
            tenantName: evidence.sessionInfo?.location || ENTERPRISE_BRAND.platformName,
            reportReference: `DX-LEGACY-SC-${sessionNo}`,
            classification: 'INTERNAL AUDIT',
            reportType: 'legacy-stock-count-evidence',
        };

        const layout = createWorkspaceLayout(doc, {
            headerOptions: {
                title: 'STOCK COUNT EVIDENCE PACK',
                ...meta,
            },
        });

        const theme = { sectionAccent: C.navy.primary, accent: C.navy.primary };
        renderWorkspaceReportChrome(doc, layout, 'STOCK COUNT EVIDENCE PACK', {
            ...meta,
            title: 'STOCK COUNT EVIDENCE PACK',
        });

        layout.beginSection('Session', 48, C.navy.primary);
        const kv = (label, value) => {
            doc.fillColor(C.text.muted).fontSize(T.type.bodyCompact).font('Helvetica')
                .text(`${label}: `, layout.marginLeft, doc.y, { continued: true, width: 120 });
            doc.fillColor(C.text.primary).font('Helvetica-Bold').text(printableValue(value), { width: layout.pageWidth - 120 });
            doc.moveDown(0.15);
        };
        kv('Session', evidence.sessionInfo.sessionNo);
        kv('Status', evidence.sessionInfo.status);
        kv('Location', evidence.sessionInfo.location);
        kv('Snapshot', evidence.sessionInfo.snapshotAt ? formatDateTime(evidence.sessionInfo.snapshotAt) : '—');
        kv('Posted', evidence.sessionInfo.postedAt ? formatDateTime(evidence.sessionInfo.postedAt) : 'Not posted');

        layout.beginSection('Variance summary', 36, C.navy.primary);
        kv('Items counted', `${evidence.varianceSummary.itemsCounted} / ${evidence.varianceSummary.totalItems}`);
        kv('Overage qty', evidence.varianceSummary.overQty);
        kv('Shortage qty', evidence.varianceSummary.shortQty);
        kv('Net variance value', fmtSar(evidence.varianceSummary.netVarianceValue));

        const lineRows = (evidence.lines || []).map((line) => ({
            item: line.item,
            unitCost: fmtSar(line.unitCost),
            bookQty: fmtQty(line.bookQty),
            countedQty: line.countedQty != null ? fmtQty(line.countedQty) : '—',
            varianceQty: fmtQty(line.varianceQty),
            varianceValue: fmtSar(line.varianceValue),
        }));

        const columns = [
            { header: 'Item', key: 'item', width: 28, align: 'left', format: 'text' },
            { header: 'WAC', key: 'unitCost', width: 14, align: 'right', format: 'text' },
            { header: 'Snapshot', key: 'bookQty', width: 12, align: 'right', format: 'text' },
            { header: 'Counted', key: 'countedQty', width: 12, align: 'right', format: 'text' },
            { header: 'Variance', key: 'varianceQty', width: 12, align: 'right', format: 'text' },
            { header: 'Value', key: 'varianceValue', width: 14, align: 'right', format: 'text' },
        ];

        layout.beginSection('Count lines', TABLE_HEADER_H + TABLE_ROW_H * 2, C.navy.primary);
        renderFlatAnalyticsTable(doc, layout, lineRows, columns, {});

        if (evidence.approvalHistory?.length) {
            const slots = evidence.approvalHistory.map((step) => ({
                labelEn: step.role || `Step ${step.step}`,
                name: step.actedBy || 'Pending',
                date: step.actedAt,
                status: step.status,
            }));
            drawCompactApprovalProgress(doc, layout, theme, slots, { sectionTitle: 'Approval workflow' });
        }

        if (evidence.ledgerEntries?.length) {
            layout.beginSection('Ledger reference', 40, C.navy.primary);
            evidence.ledgerEntries.forEach((entry, idx) => {
                doc.fillColor(C.text.primary).fontSize(T.type.bodyCompact).font('Helvetica-Bold')
                    .text(`Entry ${idx + 1}: ${entry.type}`, layout.marginLeft, doc.y);
                doc.moveDown(0.1);
                kv('Qty in', entry.qtyIn);
                kv('Qty out', entry.qtyOut);
                kv('Value', fmtSar(entry.totalValue));
            });
        }

        stampWorkspaceFooters(doc, layout, { ...meta, documentSuffix: 'Legacy Stock Count Evidence' });
        doc.end();
    });
}

module.exports = {
    WORKSPACE_LANDSCAPE_MARGINS,
    TABLE_HEADER_H,
    TABLE_ROW_H,
    FOOTER_RESERVE,
    createWorkspaceLayout,
    drawWorkspaceContinuationHeader,
    renderWorkspaceReportChrome,
    renderFlatAnalyticsTable,
    drawFinancialTotalsSummary,
    drawWorkspaceSignatures,
    stampWorkspaceFooters,
    renderLegacyStockCountEvidencePdf,
    formatDateTime,
    activeFilterEntries,
};
