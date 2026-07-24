'use strict';

const path = require('path');
const fs = require('fs');

const FONT_DIR = path.join(__dirname, '../../../assets/fonts');

/** Corporate reporting stack: Calibri (licensed) → Carlito (open) → Noto → Arial → Helvetica. */
const FONT_CANDIDATES = {
    regular: [
        path.join(FONT_DIR, 'calibri.ttf'),
        path.join(FONT_DIR, 'Calibri.ttf'),
        path.join(FONT_DIR, 'Carlito-Regular.ttf'),
        path.join(FONT_DIR, 'NotoSans-Regular.ttf'),
        path.join(FONT_DIR, 'ArialUnicode.ttf'),
        path.join(FONT_DIR, 'DejaVuSans.ttf'),
    ],
    bold: [
        path.join(FONT_DIR, 'calibrib.ttf'),
        path.join(FONT_DIR, 'Calibri-Bold.ttf'),
        path.join(FONT_DIR, 'Carlito-Bold.ttf'),
        path.join(FONT_DIR, 'NotoSans-Bold.ttf'),
        path.join(FONT_DIR, 'ArialBold.ttf'),
        path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
    ],
    semibold: [
        path.join(FONT_DIR, 'calibrisbi.ttf'),
        path.join(FONT_DIR, 'Calibri-Semibold.ttf'),
        path.join(FONT_DIR, 'calibri-semibold.ttf'),
        path.join(FONT_DIR, 'Carlito-Medium.ttf'),
        path.join(FONT_DIR, 'NotoSans-Medium.ttf'),
    ],
};

/** Disable OpenType ligatures — PDFKit/fontkit subsetting drops liga glyphs (Coffee→Cofee, etc.). */
const NO_LIGATURE_FEATURES = Object.freeze({
    liga: false,
    clig: false,
    dlig: false,
    hlig: false,
    calt: false,
});

function resolveFontFile(candidates) {
    for (const p of candidates) {
        try {
            if (p && fs.existsSync(p) && fs.statSync(p).size > 1000) {
                return p;
            }
        } catch {
            /* skip */
        }
    }
    return null;
}

function withNoLigatureFeatures(options) {
    if (options == null || typeof options !== 'object') {
        return { features: { ...NO_LIGATURE_FEATURES } };
    }
    const next = { ...options };
    if (Array.isArray(next.features)) {
        next.features = next.features.filter(
            (f) => !['liga', 'clig', 'dlig', 'hlig', 'calt'].includes(String(f).toLowerCase()),
        );
    } else if (next.features && typeof next.features === 'object') {
        next.features = { ...next.features, ...NO_LIGATURE_FEATURES };
    } else {
        next.features = { ...NO_LIGATURE_FEATURES };
    }
    return next;
}

/**
 * Patch PDFDocument text metrics so embedded Calibri/Carlito never emit broken liga glyphs.
 */
function patchDocDisableLigatures(doc) {
    if (doc._oseNoLigaPatched) return;
    doc._oseNoLigaPatched = true;

    const origText = doc.text.bind(doc);
    doc.text = function patchedText(text, x, y, options) {
        // PDFKit signatures: (str) | (str, opts) | (str, x, y) | (str, x, y, opts)
        if (typeof x === 'object') {
            return origText(text, withNoLigatureFeatures(x));
        }
        if (typeof y === 'object' && options === undefined && typeof x === 'number') {
            // (str, x, opts) — uncommon; treat y as options
            return origText(text, x, withNoLigatureFeatures(y));
        }
        if (options !== undefined) {
            return origText(text, x, y, withNoLigatureFeatures(options));
        }
        if (arguments.length >= 3) {
            return origText(text, x, y, withNoLigatureFeatures({}));
        }
        if (arguments.length === 1) {
            return origText(text, withNoLigatureFeatures({}));
        }
        return origText(text, x, y);
    };

    if (typeof doc.widthOfString === 'function') {
        const origWidth = doc.widthOfString.bind(doc);
        doc.widthOfString = function patchedWidthOfString(text, options) {
            return origWidth(text, withNoLigatureFeatures(options || {}));
        };
    }

    if (typeof doc.heightOfString === 'function') {
        const origHeight = doc.heightOfString.bind(doc);
        doc.heightOfString = function patchedHeightOfString(text, options) {
            return origHeight(text, withNoLigatureFeatures(options || {}));
        };
    }
}

/**
 * Register embedded Unicode-capable fonts on each PDFDocument instance.
 */
function registerPdfFonts(doc) {
    if (doc._pdfFontMeta) {
        patchDocDisableLigatures(doc);
        doc.font(doc._pdfFontMeta.body);
        return doc._pdfFontMeta;
    }

    const regularPath = resolveFontFile(FONT_CANDIDATES.regular);
    const boldPath = resolveFontFile(FONT_CANDIDATES.bold);
    const semiboldPath = resolveFontFile(FONT_CANDIDATES.semibold);

    if (regularPath) {
        doc.registerFont('PDFBody', regularPath);
        doc.registerFont('PDFBodyBold', boldPath || regularPath);
        doc.registerFont('PDFBodySemiBold', semiboldPath || regularPath);
        doc._pdfFontMeta = {
            body: 'PDFBody',
            bold: 'PDFBodyBold',
            semibold: 'PDFBodySemiBold',
            embedded: true,
            path: regularPath,
        };
    } else {
        doc._pdfFontMeta = {
            body: 'Helvetica',
            bold: 'Helvetica-Bold',
            semibold: 'Helvetica',
            embedded: false,
        };
    }

    patchDocDisableLigatures(doc);
    doc.font(doc._pdfFontMeta.body);
    return doc._pdfFontMeta;
}

module.exports = {
    registerPdfFonts,
    resolveFontFile,
    FONT_CANDIDATES,
    NO_LIGATURE_FEATURES,
    withNoLigatureFeatures,
    patchDocDisableLigatures,
};
