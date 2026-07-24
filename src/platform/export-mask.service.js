'use strict';

const { hasPermission } = require('../middleware/authorize');

const SENSITIVE_FIELD_KEYS = new Set([
    'unitCost',
    'unitPrice',
    'wacAtPosting',
    'totalLoss',
    'totalValue',
    'value',
    'netVarianceValue',
]);

const MASK = '***';

/**
 * Canonical ACC permission for unmasked cost/financial fields on export/print (Ch.26.4).
 * Catalog: MOVEMENTS + READ → LEDGER_VIEW ("View Ledger").
 */
const EXPORT_COST_VIEW_PERMISSION = 'LEDGER_VIEW';

/**
 * Ch.26.4 — mask sensitive financial fields on export/print when user lacks view-cost permission.
 * ACC-only: role name must not grant unmasking.
 *
 * Callers (PDF + Excel) must pass the authenticated `req.user`. If `user` is omitted,
 * rows are left unmasked — missing context must not blank every financial cell to "***"
 * while the same report PDF still shows real numbers.
 */
function userMayViewSensitiveExport(user = {}) {
    if (!user || typeof user !== 'object') return false;
    return hasPermission(user, EXPORT_COST_VIEW_PERMISSION);
}

function maskExportRow(row, user) {
    if (!row || typeof row !== 'object') return row;
    if (user == null) return row;
    if (userMayViewSensitiveExport(user)) return row;
    const out = { ...row };
    for (const key of Object.keys(out)) {
        if (SENSITIVE_FIELD_KEYS.has(key)) {
            out[key] = MASK;
        }
    }
    return out;
}

function maskExportRows(rows = [], user) {
    if (!Array.isArray(rows)) return rows;
    if (user == null || userMayViewSensitiveExport(user)) return rows;
    return rows.map((row) => maskExportRow(row, user));
}

module.exports = {
    EXPORT_COST_VIEW_PERMISSION,
    userMayViewSensitiveExport,
    maskExportRow,
    maskExportRows,
    SENSITIVE_FIELD_KEYS,
};
