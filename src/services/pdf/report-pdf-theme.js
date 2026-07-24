'use strict';

const { TOKENS } = require('./report-pdf-design-tokens');
const { resolveFamily } = require('../report-family-registry');

const R = TOKENS.color.reporting;

/** Unified audit-grade palette for all operational analytics PDFs. */
const REPORTING_BASE = {
    accent: R.tableNavy,
    headerBands: [R.band.department, R.band.location, R.band.depth2],
    stripeColors: [R.stripe.department, R.stripe.location, R.stripe.depth2],
    subtotalBg: R.subtotal.bg,
    subtotalBorder: R.subtotal.border,
};

function reportingTheme(name) {
    return { ...REPORTING_BASE, name };
}

/** Visual identity per report family — same colors, name only differs. */
const FAMILY_THEMES = {
    'count-variance': reportingTheme('Count Variance'),
    'stock-balance': reportingTheme('Stock Balance'),
    ledger: reportingTheme('Inventory Ledger'),
    breakage: reportingTheme('Breakage'),
    omc: reportingTheme('Opening / Movement / Closing'),
    transfers: reportingTheme('Transfers'),
    governance: reportingTheme('Audit & Governance'),
    generic: reportingTheme('Operational Report'),
    evidence: reportingTheme('DX OSE Evidence Pack'),
};

function resolveTheme(cardIdOrFamily) {
    if (FAMILY_THEMES[cardIdOrFamily]) return FAMILY_THEMES[cardIdOrFamily];
    const family = resolveFamily(cardIdOrFamily);
    return FAMILY_THEMES[family?.familyId] || FAMILY_THEMES.generic;
}

const { resolveEvidenceTheme } = require('./report-pdf-design-tokens');

module.exports = {
    FAMILY_THEMES,
    REPORTING_BASE,
    resolveTheme,
    resolveEvidenceTheme,
};
