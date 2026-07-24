const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const {
    formatReportCell,
    buildReportReference,
    isTotalsFooterRow,
    fmtSar,
    fmtQty,
} = require('../utils/report-format.util');
const { resolveFamily } = require('./report-family-registry');
const {
    isGroupedExportData,
    renderGroupedReportTable,
    tryLoadLogo,
    drawClassificationBadge,
    drawEnterpriseFooter,
    drawEnhancedSignatures,
} = require('./pdf/report-pdf-presenter');
const { TOKENS } = require('./pdf/report-pdf-design-tokens');
const { ENTERPRISE_BRAND, stampEnterpriseDocumentFooters } = require('./pdf/report-pdf-enterprise');
const { createEvidenceLayout, drawEvidenceMiniHeader } = require('./pdf/report-pdf-layout');
const { drawEvidencePackHeader, drawCompactApprovalProgress } = require('./pdf/report-pdf-components');
const { resolvePdfProfile, filterDetailProfileByVisibleGroups } = require('./pdf/report-pdf-profiles');
const { registerPdfFonts } = require('./pdf/report-pdf-fonts');
const { renderFlatProfileTable } = require('./pdf/report-pdf-table.engine');
const {
    drawReportKpiStrip,
    drawCompactApprovalStrip,
    drawGoldenApprovalStrip,
    stampThreeZoneFooters,
} = require('./pdf/report-pdf-chrome');
const { generateSummaryInventoryPDF } = require('./pdf/report-summary-pdf.document');
const { enrichGoldenTotals } = require('./pdf/report-golden-kpi.registry');
const { resolveGoldenShellRev } = require('./pdf/report-golden-language');
const {
    WORKSPACE_LANDSCAPE_MARGINS,
    createWorkspaceLayout,
    renderWorkspaceReportChrome,
    renderFlatAnalyticsTable,
    drawFinancialTotalsSummary,
    stampWorkspaceFooters,
    renderLegacyStockCountEvidencePdf,
} = require('./pdf/report-document.facade');

const BRAND_NAVY = '#0f172a';
const BRAND_BLUE = '#1d4ed8';
const BRAND_SLATE = '#475569';
const BRAND_MUTED = '#64748b';
const BRAND_BORDER = '#cbd5e1';
const BRAND_PANEL = '#f8fafc';
const BRAND_WHITE = '#ffffff';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-GB') : '—');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-GB') : '—');
const formatMoney = (value, currency = 'SAR') => {
    const code = String(currency || 'SAR').toUpperCase();
    return `${code} ${parseFloat(value || 0).toFixed(2)}`;
};

const printableValue = (value) => {
    if (value == null || value === '') return '—';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
};

const activeFilterEntries = (filters = {}) =>
    Object.entries(filters)
        .filter(([, value]) => value != null && value !== '' && !(Array.isArray(value) && value.length === 0))
        .map(([key, value]) => ({
            label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()),
            value: printableValue(value),
        }));

const drawReportBanner = (doc, options = {}) => {
    const marginLeft = 40;
    const pageWidth = doc.page.width - 80;
    const title = options.title || 'Report';
    const subtitle = options.subtitle || 'Unified DX OSE reviewer-grade report';
    const tenantName = options.tenantName || 'DX OSE';
    const reportCode = options.reportCode || '';
    const generatedBy = options.generatedBy || 'System';
    const generatedAt = options.generatedAt || new Date().toISOString();

    doc.fillColor(BRAND_NAVY).rect(marginLeft, 30, pageWidth, 68).fill();

    const logoBuf = options.logoBuffer || tryLoadLogo(options);
    if (logoBuf) {
        try {
            doc.image(logoBuf, marginLeft + pageWidth - 52, 34, { width: 40, height: 40, fit: [40, 40] });
        } catch { /* optional logo */ }
    }
    doc.fillColor(BRAND_WHITE).fontSize(10).font('Helvetica-Bold').text('DX OSE', marginLeft + 14, 40);
    doc.fillColor('#cbd5f5').fontSize(8).font('Helvetica').text('Unified reviewer-grade report identity', marginLeft + 14, 54);
    doc.fillColor(BRAND_WHITE).fontSize(17).font('Helvetica-Bold').text(String(title).toUpperCase(), marginLeft + 14, 66, {
        width: pageWidth - 170,
    });

    doc.fillColor(BRAND_WHITE).roundedRect(marginLeft + pageWidth - 136, 40, 122, 18, 9).fill();
    doc.fillColor(BRAND_NAVY).fontSize(8).font('Helvetica-Bold').text(tenantName, marginLeft + pageWidth - 132, 45, {
        width: 114,
        align: 'center',
    });

    if (reportCode) {
        doc.fillColor('#cbd5f5').fontSize(8).font('Helvetica').text(reportCode, marginLeft + pageWidth - 136, 66, {
            width: 122,
            align: 'center',
        });
    }

    doc.fillColor('#cbd5f5').fontSize(8).font('Helvetica').text(
        `${subtitle}  |  Generated ${formatDateTime(generatedAt)} by ${generatedBy}`,
        marginLeft + 14,
        84,
        { width: pageWidth - 28 },
    );

    doc.y = 110;
};

const drawMetadataStrip = (doc, items = []) => {
    if (!items.length) return;

    const marginLeft = 40;
    const pageWidth = doc.page.width - 80;
    const itemWidth = pageWidth / items.length;
    const startY = doc.y;

    items.forEach((item, index) => {
        const x = marginLeft + index * itemWidth;
        doc.fillColor(BRAND_PANEL).rect(x, startY, itemWidth, 38).fill();
        doc.strokeColor(BRAND_BORDER).lineWidth(0.5).rect(x, startY, itemWidth, 38).stroke();
        doc.fillColor(BRAND_MUTED).fontSize(7.5).font('Helvetica-Bold').text(item.label, x + 8, startY + 7, {
            width: itemWidth - 16,
        });
        doc.fillColor(BRAND_NAVY).fontSize(8.5).font('Helvetica-Bold').text(printableValue(item.value), x + 8, startY + 18, {
            width: itemWidth - 16,
            ellipsis: true,
        });
    });

    doc.y = startY + 46;
};

/** Compact header for continuation pages (identity without full metadata strip). */
const drawMiniReportHeader = (doc, options = {}) => {
    const marginLeft = 40;
    const pageWidth = doc.page.width - 80;
    const title = options.title || 'Report';
    const reportRef = options.reportReference || '';
    const generatedBy = options.generatedBy || 'System';
    const generatedAt = options.generatedAt || new Date().toISOString();

    doc.fillColor(BRAND_PANEL).rect(marginLeft, 28, pageWidth, 28).fill();
    doc.strokeColor(BRAND_BORDER).lineWidth(0.5).rect(marginLeft, 28, pageWidth, 28).stroke();
    doc.fillColor(BRAND_NAVY).fontSize(9).font('Helvetica-Bold').text(String(title), marginLeft + 10, 34, {
        width: pageWidth * 0.45,
        ellipsis: true,
    });
    doc.fillColor(BRAND_MUTED).fontSize(7).font('Helvetica').text(
        [reportRef, `Generated ${formatDateTime(generatedAt)}`, `By ${generatedBy}`].filter(Boolean).join('  |  '),
        marginLeft + pageWidth * 0.42,
        36,
        { width: pageWidth * 0.56, align: 'right' },
    );
    doc.y = 64;
};

/** Reviewer signature block for export PDFs. */
const drawReportSignatures = (doc, metadata = {}, layout = {}) => {
    const marginLeft = layout.marginLeft ?? 40;
    const pageWidth = layout.pageWidth ?? doc.page.width - 80;
    const generatedBy = metadata.generatedBy || 'System';
    const generatedAt = metadata.generatedAt || new Date().toISOString();

    const needed = 130;
    if (doc.y + needed > doc.page.height - 50) {
        doc.addPage();
        drawMiniReportHeader(doc, metadata);
    }

    doc.moveDown(1.2);
    const sigStartY = doc.y;
    const slots = [
        { label: 'Prepared By', name: generatedBy, date: generatedAt },
        { label: 'Reviewed By', name: metadata.reviewedBy || '', date: metadata.reviewedAt || null },
        { label: 'Approved By', name: metadata.approvedBy || '', date: metadata.approvedAt || null },
    ];
    const sigW = pageWidth / slots.length;

    slots.forEach((sig, i) => {
        const sx = marginLeft + i * sigW;
        doc.strokeColor('#94a3b8').lineWidth(1)
            .moveTo(sx + 10, sigStartY + 52).lineTo(sx + sigW - 14, sigStartY + 52).stroke();
        doc.fillColor(BRAND_NAVY).fontSize(8.5).font('Helvetica-Bold')
            .text(sig.name || '_________________________', sx + 10, sigStartY + 56, {
                width: sigW - 20,
                align: 'center',
                ellipsis: true,
            });
        doc.fillColor(BRAND_MUTED).fontSize(7.5).font('Helvetica')
            .text(sig.label, sx + 10, sigStartY + 70, { width: sigW - 20, align: 'center' });
        doc.fillColor(BRAND_SLATE).fontSize(7).font('Helvetica')
            .text(sig.date ? formatDateTime(sig.date) : 'Date / Time: _______________', sx + 10, sigStartY + 84, {
                width: sigW - 20,
                align: 'center',
            });
        if (i < slots.length - 1) {
            doc.strokeColor(BRAND_BORDER).lineWidth(0.5)
                .moveTo(sx + sigW, sigStartY + 42).lineTo(sx + sigW, sigStartY + 96).stroke();
        }
    });
    doc.y = sigStartY + 108;
};

/** Financial totals summary above signatures when metadata.totals is provided. */
const drawPdfFinancialTotalsSummary = (doc, totals = {}, cardId = '', layout = {}) => {
    if (!totals || !Object.keys(totals).length) return;
    const marginLeft = layout.marginLeft ?? 40;
    const pageWidth = layout.pageWidth ?? doc.page.width - 80;

    const lines = [];
    if (totals.totalBookQty != null) lines.push({ label: 'Total book qty / إجمالي الدفتر', value: fmtQty(totals.totalBookQty) });
    if (totals.totalCountedQty != null) lines.push({ label: 'Total counted qty / إجمالي الجرد', value: fmtQty(totals.totalCountedQty) });
    if (totals.totalVarianceQty != null) lines.push({ label: 'Total variance qty / فرق الكمية', value: fmtQty(totals.totalVarianceQty) });
    if (totals.totalVarianceValue != null) lines.push({ label: 'Total variance value / قيمة الفرق', value: fmtSar(totals.totalVarianceValue) });
    if (totals.totalQtyIn != null) lines.push({ label: 'Total qty in / وارد', value: fmtQty(totals.totalQtyIn) });
    if (totals.totalQtyOut != null) lines.push({ label: 'Total qty out / صادر', value: fmtQty(totals.totalQtyOut) });
    if (totals.totalNetQty != null) lines.push({ label: 'Net qty / صافي الكمية', value: fmtQty(totals.totalNetQty) });
    if (totals.totalLineValue != null) lines.push({ label: 'Total line value / قيمة الأسطر', value: fmtSar(totals.totalLineValue) });
    if (totals.totalLossValue != null) lines.push({ label: 'Total loss value / إجمالي الخسارة', value: fmtSar(totals.totalLossValue) });
    if (totals.totalLossQty != null) lines.push({ label: 'Total loss qty / كمية الخسارة', value: fmtQty(totals.totalLossQty) });
    if (totals.totalClosingQty != null) lines.push({ label: 'Closing qty / كمية ختامية', value: fmtQty(totals.totalClosingQty) });
    if (totals.totalClosingValue != null) lines.push({ label: 'Closing value / قيمة ختامية', value: fmtSar(totals.totalClosingValue) });
    if (totals.totalInQty != null) lines.push({ label: 'Inbound qty / وارد', value: fmtQty(totals.totalInQty) });
    if (totals.totalOutQty != null) lines.push({ label: 'Outbound qty / صادر', value: fmtQty(totals.totalOutQty) });
    if (totals.totalQty != null && totals.totalBookQty == null) lines.push({ label: 'Total qty', value: fmtQty(totals.totalQty) });
    if (totals.totalValue != null && totals.totalVarianceValue == null && totals.totalLineValue == null) {
        lines.push({ label: 'Total value / القيمة', value: fmtSar(totals.totalValue) });
    }
    if (totals.wacMissingCount != null && Number(totals.wacMissingCount) > 0) {
        lines.push({ label: 'WAC missing lines', value: String(totals.wacMissingCount), warn: true });
    }
    if (!lines.length) return;

    if (doc.y + 36 + lines.length * 14 > doc.page.height - 80) {
        doc.addPage();
        drawMiniReportHeader(doc, layout.headerOptions || {});
    }

    doc.fillColor(BRAND_MUTED).fontSize(8).font('Helvetica-Bold').text('Financial totals', marginLeft, doc.y);
    doc.moveDown(0.3);
    const boxY = doc.y;
    doc.fillColor(BRAND_PANEL).rect(marginLeft, boxY, pageWidth, lines.length * 16 + 10).fill();
    doc.strokeColor(BRAND_BORDER).lineWidth(0.5).rect(marginLeft, boxY, pageWidth, lines.length * 16 + 10).stroke();

    lines.forEach((line, idx) => {
        const y = boxY + 6 + idx * 16;
        doc.fillColor(line.warn ? '#b45309' : BRAND_SLATE).fontSize(8).font('Helvetica-Bold')
            .text(line.label, marginLeft + 10, y, { width: pageWidth * 0.45 });
        doc.fillColor(BRAND_NAVY).fontSize(8.5).font('Helvetica-Bold')
            .text(line.value, marginLeft + pageWidth * 0.48, y, { width: pageWidth * 0.48, align: 'right' });
    });
    doc.y = boxY + lines.length * 16 + 18;
};

const {
    renderBreakageEvidencePack,
    renderLostEvidencePack,
    renderTransferEvidencePack,
    renderGrnEvidencePack,
} = require('./pdf/evidence-pack-pdf');

/**
 * Generate Evidence PDF for a Breakage document.
 * @param {object} evidence - The output of breakage.service.getEvidence()
 * @returns {Buffer} - PDF buffer
 */
const generateBreakageEvidencePDF = (evidence) => renderBreakageEvidencePack(evidence);

/**
 * Generate Evidence PDF for a Lost Items document.
 * @param {object} evidence - The output of lostItems.service.getEvidence()
 * @returns {Buffer} - PDF buffer
 */
const generateLostEvidencePDF = (evidence) => renderLostEvidencePack(evidence);

/**
 * @param {object} evidence - transfer.service getEvidence()
 * @returns {Promise<Buffer>}
 */
const generateTransferEvidencePDF = (evidence) => renderTransferEvidencePack(evidence);

/**
 * @param {object} evidence - grn.service getEvidence()
 * @returns {Promise<Buffer>}
 */
const generateGrnEvidencePDF = (evidence) => renderGrnEvidencePack(evidence);

/** Wave 1A — legacy /api/stock-count evidence PDF via enterprise facade (data unchanged). */
const generateStockCountEvidencePDF = (evidence) => renderLegacyStockCountEvidencePdf(evidence);

/**
 * Generic Report PDF Generator
 * Mirrors the ExcelService pattern: takes data + column definitions + title + metadata
 * and produces a clean A4 landscape PDF with styled table.
 *
 * @param {Array} data        - Array of row objects (same shape as excel export)
 * @param {Array} columns     - Column defs [{header, key, width}]
 * @param {String} title      - Report title
 * @param {Object} metadata   - {generatedBy, generatedAt, filters: {}}
 * @returns {Promise<Buffer>}
 */
/** Wave 1A — workspace analytics PDF via enterprise document facade. */
const generateReportPDF = (data, columns, title = 'Report', metadata = {}) => {
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

        const generatedAt = metadata.generatedAt || new Date().toISOString();
        const generatedBy = metadata.generatedBy || 'System';
        const reportType = metadata.reportType || metadata.cardId || '';
        const family = resolveFamily(reportType);
        const familyId = metadata.familyId || family?.familyId || 'generic';
        const reportReference = metadata.reportReference || buildReportReference(reportType, generatedAt);

        const profileRaw = resolvePdfProfile(reportType);
        const goldenReference = Boolean(profileRaw?.goldenReference);

        const headerBase = {
            title,
            tenantName: metadata.tenantName || ENTERPRISE_BRAND.platformName,
            reportReference,
            generatedBy,
            generatedAt,
            classification: metadata.classification || 'INTERNAL USE',
            reportType,
            reportBasis: metadata.reportBasis,
            filters: metadata.filters,
            goldenReference,
        };
        const pdfTotals = goldenReference
            ? enrichGoldenTotals(reportType, metadata.totals, data, metadata)
            : metadata.totals;

        registerPdfFonts(doc);

        const layout = createWorkspaceLayout(doc, { headerOptions: headerBase });
        layout.displayCurrency = metadata.displayCurrency || 'SAR';
        layout.formatMoney = (value) => formatMoney(value, layout.displayCurrency);
        const profile =
            reportType === 'detail-report' && Array.isArray(metadata.visibleGroupIds)
                ? filterDetailProfileByVisibleGroups(profileRaw, metadata.visibleGroupIds, layout.pageWidth)
                : profileRaw;
        renderWorkspaceReportChrome(doc, layout, title, {
            ...metadata,
            ...headerBase,
            reportType,
            compactChrome: Boolean(profile?.compactChrome),
            shellCompact: Boolean(profile?.shellCompact),
            goldenReference,
        });

        if (profile) {
            drawReportKpiStrip(doc, layout, pdfTotals, profile);
        }

        const useGroupedPresenter =
            profile?.mode !== 'flat' &&
            metadata.groupingEnabled !== false &&
            isGroupedExportData(data);

        if (useGroupedPresenter) {
            renderGroupedReportTable(doc, data, columns, {
                marginLeft: layout.marginLeft,
                pageWidth: layout.pageWidth,
                familyId,
                reportType,
                profile,
                totals: pdfTotals,
                headerOptions: headerBase,
                drawMiniHeader: layout.drawMiniHeader,
            });
        } else if (profile) {
            renderFlatProfileTable(doc, layout, data, columns, { ...metadata, profile });
        } else {
            renderFlatAnalyticsTable(doc, layout, data, columns, metadata);
        }

        if (!profile?.grandTotalBand) {
            const isSessionsHistory = reportType === 'count-sessions-history';
            drawFinancialTotalsSummary(doc, layout, metadata.totals, {
                sectionTitle: isSessionsHistory ? 'Session summary' : 'Financial totals',
            });
        }

        if (profile) {
            drawCompactApprovalStrip(doc, layout, {
                ...metadata,
                generatedBy,
                generatedAt,
                goldenReference,
            });
            stampThreeZoneFooters(doc, layout, {
                ...metadata,
                generatedBy,
                generatedAt,
                reportReference,
                documentSuffix: metadata.documentSuffix ||
                    (reportType === 'count-sessions-history' ? 'Operational Governance Report'
                    : reportType === 'count-approval-history' ? 'Approval History Report'
                    : 'Analytics Report'),
                goldenShellRev: goldenReference ? resolveGoldenShellRev(reportType) : undefined,
            });
        } else {
            drawGoldenApprovalStrip(doc, layout, { ...metadata, generatedBy, generatedAt });
            stampWorkspaceFooters(doc, layout, {
                ...metadata,
                generatedBy,
                generatedAt,
                reportReference,
                documentSuffix: metadata.documentSuffix ||
                    (reportType === 'count-sessions-history' ? 'Operational Governance Report'
                    : reportType === 'count-approval-history' ? 'Approval History Report'
                    : 'Analytics Report'),
            });
        }

        doc.end();
    });
};

/**
 * Generate PDF for a Saved Stock Report (Variance & Approval)
 * @param {object} report - The output of stockReport.service.getSavedReportById()
 * @returns {Buffer} - PDF buffer
 */
/** Wave 1A — legacy saved stock report PDF via generateReportPDF (same line/total values). */
const generateStockReportVariancePDF = (report) => {
    const columns = [
        { header: 'Item Name', key: 'itemName', width: 35, align: 'left', format: 'text' },
        { header: 'System Qty', key: 'bookQty', width: 13, align: 'right', format: 'qty' },
        { header: 'Counted Qty', key: 'countedQty', width: 13, align: 'right', format: 'qty' },
        { header: 'Variance Qty', key: 'varianceQty', width: 13, align: 'right', format: 'qty' },
        { header: 'Unit Price (SAR)', key: 'unitPrice', width: 11, align: 'right', format: 'sar' },
        { header: 'Variance Value', key: 'varianceValue', width: 15, align: 'right', format: 'sar' },
    ];

        let totalVarQty = 0;
        let totalVarVal = 0;
    const rows = [];

    for (const line of report.lines || []) {
            const openQty = Number(line.openingQty || 0);
            const openVal = Number(line.openingValue || 0);
            const bookQty = Number(line.closingQty || 0);
            const countQty = Number(line.inwardQty || 0);
            const countVal = Number(line.inwardValue || 0);
            const varQty = Number(line.outwardQty || (countQty - bookQty));
            const varVal = Number(line.outwardValue || 0);
        const unitPrice =
            Math.abs(varQty) > 0
                ? Math.abs(varVal / varQty)
                : countQty > 0
                    ? countVal / countQty
                    : openQty > 0
                        ? openVal / openQty
                        : 0;

            totalVarQty += varQty;
            totalVarVal += varVal;

        rows.push({
            itemName: line.item?.name || '—',
            bookQty,
            countedQty: countQty,
            varianceQty: varQty,
            unitPrice,
            varianceValue: varVal,
        });
    }

    const totalsRow = {
        itemName: 'Totals',
        bookQty: '',
        countedQty: '',
        varianceQty: totalVarQty,
        unitPrice: '',
        varianceValue: totalVarVal,
        _isTotalsRow: true,
    };

        const history = report.approvalRequest?.steps || [];
    const signatureSlots = [
        {
            labelEn: 'Prepared by',
            name: `${report.createdByUser?.firstName || ''} ${report.createdByUser?.lastName || ''}`.trim() || 'System User',
            date: report.createdAt,
            status: 'SUBMITTED',
        },
        ...history.map((s) => ({
            labelEn:
                s.role === 'DEPT_MANAGER'
                    ? 'Head of Department'
                    : s.role === 'COST_CONTROL'
                        ? 'Cost Control'
                        : 'Finance Manager',
            name: s.actedByUser
                ? `${s.actedByUser.firstName} ${s.actedByUser.lastName}`.trim()
                : s.actedBy?.split(' (')[0] || '',
            date: s.actedAt,
                status: s.status,
            })),
        ];

    const generatedAt = new Date().toISOString();
    return generateReportPDF([...rows, totalsRow], columns, 'STOCK REPORT VARIANCE', {
        generatedAt,
        generatedBy:
            `${report.createdByUser?.firstName || ''} ${report.createdByUser?.lastName || ''}`.trim() || 'System',
        tenantName: report.location?.name || ENTERPRISE_BRAND.platformName,
        reportType: 'stock-report-variance',
        reportReference: buildReportReference('stock-report-variance', generatedAt),
        classification: 'INTERNAL USE',
        groupingEnabled: false,
        documentSuffix: `Stock Report ${report.reportNo || ''}`.trim(),
        reportBasis: report.reportNo
            ? `Report ${report.reportNo} · ${report.status || ''}`
            : report.status,
        filters: {
            'Report no': report.reportNo,
            Location: report.location?.name,
            Status: report.status,
            'Total items': report.lines?.length,
            Notes: report.notes || '',
        },
        totals: {
            totalVarianceQty: totalVarQty,
            totalVarianceValue: totalVarVal,
        },
        signatureSlots,
    });
};

/**
     * Generate PDF for an Asset Transfer(Asset Loan)
    * @param { object } loan - The output of assetLoan.service.getLoanById()
        * @returns { Buffer } - PDF buffer
            */
const generateAssetTransferPDF = (loan) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 60, left: 40, right: 40 }, bufferPages: true });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const PW = doc.page.width - 80;
        const ML = 40;
        const NAVY = '#1a3a5c';
        const BLUE = '#2563eb';
        const LGRAY = '#f1f5f9';
        const GRAY = '#64748b';
        const RED = '#dc2626';
        const GREEN = '#16a34a';
        const WHITE = '#ffffff';
        const BDR = '#cbd5e1';

        const fmtDT = (d) => d ? new Date(d).toLocaleString('en-GB') : '—';
        const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

        const ensureSpace = (needed) => {
            if (doc.y + needed > doc.page.height - 70) doc.addPage();
        };

        const section = (title) => {
            ensureSpace(30);
            doc.moveDown(0.6);
            doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text(title, ML, doc.y);
            doc.moveDown(0.15);
            doc.strokeColor(BLUE).lineWidth(1.5).moveTo(ML, doc.y).lineTo(ML + PW, doc.y).stroke();
            doc.moveDown(0.4);
        };

        const kv = (label, value, x, y, w) => {
            doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(label + ':', x, y, { width: 90 });
            doc.fillColor('#1e293b').fontSize(8.5).font('Helvetica-Bold').text(String(value || '—'), x + 92, y, { width: w - 92, ellipsis: true });
        };

        // 1. HEADER BANNER
        doc.fillColor(NAVY).rect(0, 0, doc.page.width, 60).fill();
        doc.fillColor(WHITE).fontSize(18).font('Helvetica-Bold').text('ASSET TRANSFER REPORT', ML, 20, { align: 'left' });

        let statusColor = GRAY;
        if (loan.status === 'RETURNED') statusColor = GREEN;
        if (loan.status === 'NOT_RETURNED') statusColor = RED;
        if (loan.status === 'OUT_ON_LOAN') statusColor = '#f59e0b'; // Amber

        doc.fillColor(statusColor).rect(ML + PW - 100, 18, 100, 24).fill();
        doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold').text(loan.status.replace(/_/g, ' '), ML + PW - 100, 24, { width: 100, align: 'center' });

        doc.y = 80;

        // 2. TRANSFER DETAILS
        section('Transfer Details');
        let detailsY = doc.y;
        const colW = PW / 2;

        kv('Transfer No', loan.loanNo, ML, detailsY, colW);
        kv('Transfer Type', loan.status === 'NOT_RETURNED' ? 'Permanent' : 'Temporary', ML + colW, detailsY, colW);
        detailsY += 16;

        kv('Borrowing Entity', loan.borrowingEntity, ML, detailsY, colW);
        kv('From Location', loan.location?.name || '—', ML + colW, detailsY, colW);
        detailsY += 16;

        kv('Item Name', loan.item?.name || '—', ML, detailsY, colW);
        kv('Quantity', Number(loan.qty).toString(), ML + colW, detailsY, colW);
        detailsY += 16;

        kv('Out Date', fmtD(loan.outDate), ML, detailsY, colW);
        kv('Expected Return', loan.expectedReturnDate ? fmtD(loan.expectedReturnDate) : 'N/A', ML + colW, detailsY, colW);
        detailsY += 16;

        kv('Created By', `${loan.createdByUser?.firstName || ''} ${loan.createdByUser?.lastName || ''}`.trim() || 'System User', ML, detailsY, colW);
        kv('Created At', fmtDT(loan.createdAt), ML + colW, detailsY, colW);
        detailsY += 24;
        doc.y = detailsY;

        if (loan.notes) {
            kv('Notes', loan.notes, ML, doc.y, PW);
            doc.y += 24;
        }

        // 3. ITEM PHOTO (IF ANY)
        if (loan.photoUrl || loan.item?.imageUrl) {
            section('Item Photo');
            const imgW = 120;
            const imgH = 120;
            let imgY = doc.y;
            try {
                const imgPathUrl = loan.photoUrl || loan.item?.imageUrl;
                if (imgPathUrl) {
                    const filename = imgPathUrl.split('/').pop();
                    const filePath = path.join(__dirname, '../../uploads', imgPathUrl.includes('attachments') ? 'attachments' : 'items', filename);
                    if (fs.existsSync(filePath)) {
                        doc.image(filePath, ML, imgY, { width: imgW, height: imgH, fit: [imgW, imgH], align: 'left' });
                        doc.y = imgY + imgH + 20;
                    }
                }
            } catch { /* ignore */ }
        }

        // 4. SIGNATURES (CIRCULAR APPROVAL)
        // Asset Loans do not formally exist in ApprovalRequest yet, but we need a signature block starting with Department Manager.
        const sigSlots = [
            { label: 'Prepared By (Store)', name: `${loan.createdByUser?.firstName || ''} ${loan.createdByUser?.lastName || ''}`.trim() || 'System', role: 'Preparer', actedAt: loan.createdAt },
            { label: 'Department Manager', name: '', role: 'Dept. Manager', actedAt: null },
            { label: 'Cost Control / Security', name: '', role: 'Cost Control', actedAt: null },
            { label: 'Receiving Entity', name: loan.borrowingEntity, role: 'Receiver', actedAt: null }
        ];

        ensureSpace(145);
        if (doc.y > doc.page.height - 210) doc.addPage();

        doc.moveDown(2);
        section('Approval Workflow & Signatures');

        const sigCount = sigSlots.length;
        const sigW = PW / sigCount;
        const sigStartY = doc.y + 10;

        sigSlots.forEach((sig, i) => {
            const sx = ML + i * sigW;

            // Signature line
            doc.strokeColor('#94a3b8').lineWidth(1)
                .moveTo(sx + 8, sigStartY + 60).lineTo(sx + sigW - 12, sigStartY + 60).stroke();

            // Name
            doc.fillColor('#1e293b').fontSize(8.5).font('Helvetica-Bold')
                .text(sig.name || '_______________', sx + 8, sigStartY + 64, { width: sigW - 16, align: 'center', ellipsis: true });

            // Role/Position
            doc.fillColor(GRAY).fontSize(7.5).font('Helvetica')
                .text(sig.label, sx + 8, sigStartY + 78, { width: sigW - 16, align: 'center' });

            // Date
            doc.fillColor(GRAY).fontSize(7).font('Helvetica')
                .text(sig.actedAt ? fmtD(sig.actedAt) : 'Date: ___/___/20__', sx + 8, sigStartY + 90, { width: sigW - 16, align: 'center' });

            if (i < sigCount - 1) {
                doc.strokeColor(BDR).lineWidth(0.5)
                    .moveTo(sx + sigW, sigStartY + 50).lineTo(sx + sigW, sigStartY + 118).stroke();
            }
        });

        doc.y = sigStartY + 140;

        // FOOTER
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            const fy = doc.page.height - 28;
            doc.strokeColor(BDR).lineWidth(0.5).moveTo(ML, fy - 6).lineTo(ML + PW, fy - 6).stroke();
            doc.fillColor(GRAY).fontSize(7).font('Helvetica')
                .text(`OS&E Inventory System  |  Asset Transfer — ${loan.loanNo}  |  Generated: ${fmtDT(new Date())}  |  Page ${i - range.start + 1} of ${range.count}`, ML, fy, { width: PW, align: 'center' });
        }

        doc.end();
    });
};

const { renderInventoryCountEvidencePdf } = require('./pdf/inventory-count-pdf.renderer');

/** @deprecated Prefer inventory-count-pdf.renderer; kept for legacy imports. */
const generateInventoryCountWorkflowPDF = (payload) => renderInventoryCountEvidencePdf(payload);

module.exports = {
    generateBreakageEvidencePDF,
    generateLostEvidencePDF,
    generateTransferEvidencePDF,
    generateGrnEvidencePDF,
    generateStockCountEvidencePDF,
    generateReportPDF,
    generateSummaryInventoryPDF,
    generateStockReportVariancePDF,
    generateAssetTransferPDF,
    generateInventoryCountWorkflowPDF,
};
