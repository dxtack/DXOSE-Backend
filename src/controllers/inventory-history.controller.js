'use strict';

const inventoryHistoryService = require('../services/inventory-history.service');
const { success } = require('../utils/response');

/**
 * @desc    Paginated inventory movement history
 * @route   GET /api/inventory-history
 * @access  Private — INVENTORY_HISTORY_VIEW
 */
const getInventoryHistory = async (req, res, next) => {
    try {
        const result = await inventoryHistoryService.getInventoryHistory(
            req.user.tenantId,
            req.query,
            req.user,
        );
        const { entries, total, page, limit, scope, scopeApplied, scopeLabel, reason, status, obStatus } =
            result;
        return success(res, entries, 'Inventory history fetched successfully', 200, {
            total,
            page,
            limit,
            scope,
            scopeApplied,
            scopeLabel,
            reason,
            status,
            obStatus,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getInventoryHistory,
};
