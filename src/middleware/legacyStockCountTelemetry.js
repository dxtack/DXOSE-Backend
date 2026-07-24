const logger = require('../utils/logger');

const envTruthy = (v) => v === '1' || v === 'true' || v === 'yes';

/**
 * When LEGACY_STOCK_COUNT_TELEMETRY=1|true|yes, logs one structured line per request
 * to /api/stock-count/* (mounted after authenticate).
 */
function legacyStockCountTelemetry(req, res, next) {
    if (!envTruthy(process.env.LEGACY_STOCK_COUNT_TELEMETRY)) {
        return next();
    }
    logger.info(
        JSON.stringify({
            event: 'legacy_stock_count_api',
            method: req.method,
            path: req.originalUrl || req.path,
            tenantId: req.user?.tenantId,
            userId: req.user?.id,
            role: req.user?.role,
        }),
    );
    next();
}

module.exports = { legacyStockCountTelemetry };
