'use strict';

const { stampEnterpriseDocumentFooters } = require('./report-pdf-enterprise');

const BRAND_NAVY = '#0f172a';
const BRAND_SLATE = '#475569';
const BRAND_MUTED = '#64748b';
const BRAND_BORDER = '#cbd5e1';
const BRAND_PANEL = '#f8fafc';
const BRAND_WHITE = '#ffffff';
const FOOTER_RESERVE = 42;
const SECTION_GAP = 0.15;

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-GB') : '—');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-GB') : '—');
const formatMoney = (value, currency = 'SAR') => {
    const formatted = parseFloat(value || 0).toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${currency} ${formatted}`;
};

/** Normalize text for Helvetica PDF output (print-safe ASCII-friendly). */
function sanitizePrintableText(value) {
    if (value == null) return '';
    let s = String(value).normalize('NFKC');
    s = s
        .replace(/\u2192/g, ' to ')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\u00D8/g, 'Dia. ')
        .replace(/\u00F8/g, 'dia. ')
        .replace(/\u00D0/g, 'D')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/!\s*['\u2019]/g, ' to ')
        .replace(/\s*->\s*/g, ' to ')
        .replace(/\s+/g, ' ')
        .trim();
    return s;
}

function isEmptyReportField(value) {
    if (value == null) return true;
    const s = String(value).trim();
    return !s || s === '—' || s === '-' || /^n\/?a$/i.test(s);
}

function formatRouteText(source, dest) {
    const left = sanitizePrintableText(source) || '—';
    const right = sanitizePrintableText(dest) || '—';
    if (left === '—' && right === '—') return '—';
    return `${left} to ${right}`;
}

const printableValue = (value) => {
    if (value == null || value === '') return '—';
    if (Array.isArray(value)) return value.map((v) => sanitizePrintableText(v)).filter(Boolean).join(', ') || '—';
    const s = sanitizePrintableText(value);
    return s === '' ? '—' : s;
};

/**
 * Standard A4 evidence-pack layout context.
 * @param {import('pdfkit').PDFDocument} doc
 * @param {object} [options]
 */
function createEvidenceLayout(doc, options = {}) {
    const marginLeft = options.marginLeft ?? 40;
    const marginRight = options.marginRight ?? 40;
    const pageWidth = doc.page.width - marginLeft - marginRight;
    const bottomLimit = () => doc.page.height - FOOTER_RESERVE;

    const ensureSpace = (needed) => {
        if (doc.y + needed > bottomLimit()) {
            doc.addPage();
            if (options.onNewPage) options.onNewPage(doc);
            return true;
        }
        return false;
    };

    const drawSectionTitle = (title, accent = '#1e3a5f') => {
        doc.moveDown(SECTION_GAP);
        const y = doc.y;
        doc.fillColor(BRAND_NAVY).fontSize(8).font('Helvetica-Bold').text(title, marginLeft, y);
        doc.strokeColor(accent).lineWidth(0.75)
            .moveTo(marginLeft, y + 11).lineTo(marginLeft + pageWidth, y + 11).stroke();
        doc.y = y + 14;
        return doc.y;
    };

    /** Reserve space for title + block, then draw title (avoids orphan headings). */
    const beginSection = (title, contentHeight, accent = '#1e3a5f') => {
        const block = 18 + contentHeight + 4;
        ensureSpace(block);
        drawSectionTitle(title, accent);
        return doc.y;
    };

    const section = (title, accent = '#1e3a5f') => {
        ensureSpace(22);
        drawSectionTitle(title, accent);
    };

    return {
        marginLeft,
        pageWidth,
        bottomLimit,
        ensureSpace,
        section,
        beginSection,
        drawSectionTitle,
        formatDate,
        formatDateTime,
        formatMoney,
        printableValue,
        FOOTER_RESERVE,
        onNewPage: options.onNewPage,
    };
}

function buildEvidenceLayoutObject(doc, layout, headerOptions) {
    return {
        marginLeft: layout.marginLeft,
        pageWidth: layout.pageWidth,
        headerOptions,
        drawMiniHeader: (d, opts) => drawEvidenceMiniHeader(d, { ...headerOptions, ...opts }, layout),
    };
}

/** Continuation page header for evidence packs. */
function drawEvidenceMiniHeader(doc, options = {}, layout = {}) {
    const marginLeft = layout.marginLeft ?? 40;
    const pageWidth = layout.pageWidth ?? doc.page.width - 80;
    const title = options.title || options.packTitle || 'Operational Report';
    const reportRef = options.reportReference || options.documentNo || '';
    const generatedBy = options.generatedBy || 'System';
    const generatedAt = options.generatedAt || new Date().toISOString();
    const accent = options.accent || '#1e3a5f';

    doc.fillColor(BRAND_PANEL).rect(marginLeft, 28, pageWidth, 30).fill();
    doc.fillColor(accent).rect(marginLeft, 28, 3, 30).fill();
    doc.strokeColor(BRAND_BORDER).lineWidth(0.5).rect(marginLeft, 28, pageWidth, 30).stroke();
    doc.fillColor(BRAND_NAVY).fontSize(9).font('Helvetica-Bold').text(String(title), marginLeft + 10, 35, {
        width: pageWidth * 0.42,
        ellipsis: true,
    });
    doc.fillColor(BRAND_MUTED).fontSize(7).font('Helvetica').text(
        [reportRef, `Generated ${formatDateTime(generatedAt)}`, `By ${generatedBy}`].filter(Boolean).join('  |  '),
        marginLeft + pageWidth * 0.4,
        37,
        { width: pageWidth * 0.58, align: 'right' },
    );
    doc.y = 62;
}

/**
 * Stamp footers on existing pages (unified enterprise footer system).
 */
function stampEvidenceFooters(doc, layout, meta = {}) {
    stampEnterpriseDocumentFooters(doc, layout, {
        mode: 'evidence',
        generatedAt: meta.generatedAt,
        printedAt: meta.generatedAt,
        classification: meta.classification || 'INTERNAL AUDIT',
        reportReference: meta.reportReference,
        documentNo: meta.reportReference,
        tenantName: meta.tenantName,
        goldenShellRev: meta.goldenShellRev,
    });
}

/**
 * @deprecated Wave 6 preview watermark removed — kept as no-op for any legacy callers.
 */
function stampEvidencePreviewWatermark(_doc, _meta = {}) {
    // Intentionally empty: no diagonal overlay on evidence PDFs at any lifecycle stage.
}

module.exports = {
    BRAND_NAVY,
    BRAND_SLATE,
    BRAND_MUTED,
    BRAND_BORDER,
    BRAND_PANEL,
    BRAND_WHITE,
    FOOTER_RESERVE,
    formatDate,
    formatDateTime,
    formatMoney,
    printableValue,
    sanitizePrintableText,
    isEmptyReportField,
    formatRouteText,
    createEvidenceLayout,
    buildEvidenceLayoutObject,
    drawEvidenceMiniHeader,
    stampEvidenceFooters,
    stampEvidencePreviewWatermark,
};
