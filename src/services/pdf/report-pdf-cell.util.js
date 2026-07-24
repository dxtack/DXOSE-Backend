'use strict';

const { formatReportCell, fmtSar, fmtQty } = require('../../utils/report-format.util');
const { DENSITY } = require('./report-pdf-density');

const UNICODE_REPLACEMENTS = [
    [/\u00B0/g, ' deg '],
    [/\u00D8/g, ' Dia '],
    [/\u00F8/g, ' dia '],
    [/\u2013|\u2014/g, '-'],
    [/\u2018|\u2019/g, "'"],
    [/\u201C|\u201D/g, '"'],
    [/\u00A0/g, ' '],
];

/** Presentation-only: strip catalog dimension / spec tails from item names. */
const ITEM_SPEC_TAIL = [
    /\s+\/-\/\s+.*$/i,
    /\s+-\s+H\s*[:=]?\s*\d/i,
    /\s+-\s+D\s*[:=]?\s*\d/i,
    /\s+-\s+Dia\s/i,
    /\s+-\s+Max\s/i,
    /\s+-\s+Height\s/i,
    /\s+-\s*Floz\b/i,
    /\s+-\s*\d+[\d.,]*\s*mm\b/i,
    /\s+h\s+\d+[\d.,]*\s*mm\b/i,
    /\s+Ø\s*\d/i,
    /\s+-\s*\d+\s*\/\s*\d+\s*["']?\s*-\s*/i,
];

const MOVEMENT_TYPE_LABELS = {
    OPENING_BALANCE:         'OPENING',
    OPENING_BALANCE_ENTRY:   'OPENING',
    RECEIVE:                 'RECEIVE',
    ISSUE:                   'ISSUE',
    RETURN:                  'RETURN',
    TRANSFER_IN:             'TRANSFER IN',
    TRANSFER_OUT:            'TRANSFER OUT',
    BREAKAGE:                'BREAKAGE',
    LOST:                    'LOST',
    COUNT_ADJUSTMENT:        'COUNT ADJ',
    ADJUSTMENT:              'COUNT ADJ',
    GET_PASS_OUT:            'GP OUT',
    GET_PASS_RETURN:         'GP RETURN',
};

const MOVEMENT_TYPE_COLORS = {
    RECEIVE:                 '#15803d',
    RETURN:                  '#047857',
    GET_PASS_RETURN:         '#047857',
    TRANSFER_IN:             '#1d4ed8',
    OPENING_BALANCE:         '#334155',
    OPENING_BALANCE_ENTRY:   '#334155',
    COUNT_ADJUSTMENT:        '#b45309',
    ADJUSTMENT:              '#b45309',
    TRANSFER_OUT:            '#3730a3',
    GET_PASS_OUT:            '#3730a3',
    ISSUE:                   '#6d28d9',
    BREAKAGE:                '#b91c1c',
    LOST:                    '#991b1b',
};

function isCodeColumn(col) {
    if (!col) return false;
    return col.cellRole === 'code' || col.key === 'itemCode' || col.key === 'item_code';
}

function getMovementTypeColor(rawValue, fallback) {
    if (!rawValue) return fallback ?? null;
    return MOVEMENT_TYPE_COLORS[String(rawValue).toUpperCase()] ?? fallback ?? null;
}

function isItemNameColumn(col) {
    if (!col) return false;
    return col.cellRole === 'itemName' || col.key === 'itemName' || col.key === 'item_name';
}

/**
 * Presentation-only text cleanup for PDF cells (does not mutate source data).
 */
function sanitizePdfText(value, options = {}) {
    if (value == null || value === '') return '';
    let s = String(value);
    s = s.replace(/\r\n|\n|\r/g, ' ');
    for (const [pattern, replacement] of UNICODE_REPLACEMENTS) {
        s = s.replace(pattern, replacement);
    }
    s = s.replace(/\s+/g, ' ').trim();
    const maxLen = options.maxLength ?? 0;
    if (maxLen > 0 && s.length > maxLen) {
        if (options.hardTruncate) {
            return `${s.slice(0, maxLen - 1)}…`;
        }
        const cut = s.slice(0, maxLen);
        const lastSpace = cut.lastIndexOf(' ');
        if (lastSpace > maxLen * 0.55) {
            return `${cut.slice(0, lastSpace)}…`;
        }
        return `${cut}…`;
    }
    return s;
}

/**
 * Compact commercial identity: keep short description, drop dimension/spec chains.
 */
function truncateItemNameForPdf(value, options = {}) {
    let s = sanitizePdfText(value, {});
    if (!s) return '';

    let cutAt = s.length;
    for (const re of ITEM_SPEC_TAIL) {
        const idx = s.search(re);
        if (idx >= 14 && idx < cutAt) cutAt = idx;
    }
    s = s.slice(0, cutAt).replace(/\s+-\s*$/, '').trim();

    const maxLen = options.maxLength ?? 56;
    return sanitizePdfText(s, { maxLength: maxLen });
}

/**
 * Format cell for PDF display (may differ from Excel export strings).
 */
function formatPdfCell(value, format = 'text', options = {}) {
    if (value == null || value === '') {
        return options.emptyDisplay ?? '—';
    }
    if (format === 'sar' && options.sarNumbersOnly) {
        const n = Number(value);
        if (Number.isNaN(n)) return '—';
        const abs = Math.abs(n).toLocaleString('en-SA', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return n < 0 ? `(${abs})` : abs;
    }
    if (format === 'qty') return fmtQty(value);
    if (format === 'sar') return fmtSar(value);
    if (format === 'text') return sanitizePdfText(value, options);
    return formatReportCell(value, format, options);
}

function preparePdfCellText(row, col, profile) {
    const raw = row[col.key];
    const empty = profile?.emptyDisplay ?? '—';

    if (isCodeColumn(col)) {
        const code = sanitizePdfText(raw, {
            maxLength: col.maxLength || 22,
            hardTruncate: true,
        });
        return code || empty;
    }

    if (isItemNameColumn(col)) {
        const name = truncateItemNameForPdf(raw, { maxLength: col.maxLength || 56 });
        return name || empty;
    }

    if (col.cellRole === 'movementType') {
        const label = MOVEMENT_TYPE_LABELS[String(raw || '').toUpperCase()]
            ?? sanitizePdfText(String(raw || ''), { maxLength: 16 });
        return label || empty;
    }

    return formatPdfCell(raw, col.format || 'text', {
        maxLength: col.maxLength,
        sarNumbersOnly: col.sarNumbersOnly || profile?.sarNumbersOnly,
        emptyDisplay: empty,
    });
}

/**
 * Measure rendered text height for dynamic row sizing (overlap-safe, compact).
 */
function measureCellHeight(doc, text, widthPt, opts = {}) {
    if (opts.fixedHeight) return opts.fixedHeight;

    const font = opts.font || 'PDFBody';
    const fontSize = opts.fontSize ?? DENSITY.BODY_FONT_SIZE;
    const lineGap = opts.lineGap ?? DENSITY.LINE_GAP;
    const maxLines = opts.maxLines ?? 1;
    const padding = opts.padding ?? DENSITY.CELL_PAD_V * 2 + 2;

    doc.font(font).fontSize(fontSize);
    const content = text == null || text === '' ? '—' : String(text);
    const measured = doc.heightOfString(content, {
        width: Math.max(16, widthPt - DENSITY.CELL_PAD_H * 2),
        lineGap,
    });
    const lineHeight = doc.currentLineHeight(true);
    const maxAllowed = lineHeight * maxLines + lineGap * Math.max(0, maxLines - 1);
    return Math.ceil(Math.min(measured, maxAllowed) + padding);
}

function shouldSkipSubtotalCell(col, raw) {
    if (raw == null || raw === '') return true;
    if (col.format === 'qty' || col.format === 'sar') return false;
    return true;
}

module.exports = {
    sanitizePdfText,
    truncateItemNameForPdf,
    formatPdfCell,
    preparePdfCellText,
    measureCellHeight,
    shouldSkipSubtotalCell,
    isCodeColumn,
    isItemNameColumn,
    getMovementTypeColor,
};
