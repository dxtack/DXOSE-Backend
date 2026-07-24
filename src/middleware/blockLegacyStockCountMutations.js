const envTruthy = (v) => v === '1' || v === 'true' || v === 'yes';

/**
 * Pilot stabilization: legacy /api/stock-count mutations are blocked by default.
 * Read-only GET (list, detail, evidence export) remains for historical sessions.
 *
 * Opt-out (emergency only): ALLOW_LEGACY_STOCK_COUNT_MUTATIONS=1
 * Explicit opt-in (backward compatible): BLOCK_LEGACY_STOCK_COUNT_MUTATIONS=1
 */
function isLegacyStockCountBlocked() {
    if (envTruthy(process.env.ALLOW_LEGACY_STOCK_COUNT_MUTATIONS)) {
        return false;
    }
    return (
        envTruthy(process.env.BLOCK_LEGACY_STOCK_COUNT_MUTATIONS) ||
        envTruthy(process.env.BLOCK_LEGACY_STOCK_COUNT_CREATE) ||
        true
    );
}

function blockLegacyStockCountMutations(req, res, next) {
    if (!isLegacyStockCountBlocked()) {
        return next();
    }
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
        return next();
    }
    return res.status(403).json({
        status: 'error',
        message:
            'Legacy stock-count mutations are disabled. Use the canonical Inventory Count API at /api/inventory-count.',
        error: {
            code: 'LEGACY_STOCK_COUNT_MUTATIONS_DISABLED',
            canonicalBasePath: '/api/inventory-count',
            canonicalCreate: 'POST /api/inventory-count/sessions',
            attempted: `${method} ${req.originalUrl || req.path}`,
        },
    });
}

function legacyStockCountDeprecationHeaders(req, res, next) {
    res.set('Deprecation', 'true');
    res.set('Link', '</api/inventory-count>; rel="successor-version"');
    res.set('X-Canonical-Inventory-Count-API', '/api/inventory-count');
    res.set('X-Legacy-Stock-Count', 'read-only');
    next();
}

module.exports = {
    blockLegacyStockCountMutations,
    legacyStockCountDeprecationHeaders,
    isLegacyStockCountBlocked,
};
