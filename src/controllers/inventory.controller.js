const itemService = require('../services/item.service');
const settingService = require('../services/setting.service');
const { logAction, EntityType } = require('../services/auditTrail.service');
const { success } = require('../utils/response');
const { hasPermission } = require('../middleware/authorize');
const { isScopeEngineEnabled, resolveUserScope, assertLocationInScope } = require('../services/scope/scope.service');

const canManageTenantOpeningBalance = (user) => hasPermission(user, 'SETTINGS_MANAGE');

/**
 * PATCH /inventory/status — align tenant OB phase with `isOpeningBalanceAllowed` (API contract).
 * When true: same as POST /settings/ob-enable (OPEN + DB flag; snapshot preserved).
 */
const patchInventoryStatus = async (req, res, next) => {
    try {
        const { isOpeningBalanceAllowed, reason } = req.body;
        const { tenantId, id: userId, role } = req.user;

        if (!canManageTenantOpeningBalance(req.user)) {
            const e = new Error('Only tenant administrators can update inventory status.');
            e.statusCode = 403;
            throw e;
        }

        if (typeof isOpeningBalanceAllowed !== 'boolean') {
            const e = new Error('Request body must include isOpeningBalanceAllowed (boolean).');
            e.statusCode = 400;
            throw e;
        }

        if (isOpeningBalanceAllowed === false) {
            const e = new Error('To disable opening balance import, use POST /settings/ob-lock with a reason.');
            e.statusCode = 400;
            throw e;
        }

        const normalizedReason = (reason && String(reason).trim()) || 'Initial Setup';

        await settingService.enableOpeningBalanceStage(tenantId, userId, normalizedReason);

        await logAction({
            tenantId,
            entityType: EntityType.SETTINGS,
            entityId: 'allowOpeningBalance',
            action: 'UPDATE',
            changedBy: userId,
            note: `OB_IMPORT_ENABLED via PATCH /inventory/status (not fiscal period reopen) — reason: ${normalizedReason}`,
        });

        const data = await settingService.getInventoryStatus(tenantId);
        return success(res, data, 'Opening balance stage enabled.');
    } catch (err) {
        next(err);
    }
};

/**
 * GET /inventory/items-by-locations/:locationId
 * Query: mode=receiving (default, GRN) | mode=operational (StockBalance only)
 */
const getItemsByLocation = async (req, res, next) => {
    try {
        const { locationId } = req.params;
        if (isScopeEngineEnabled()) {
            const scope = await resolveUserScope(req.user, req.user.tenantId);
            await assertLocationInScope(locationId, req.user.tenantId, scope, 'list');
        }
        const query = { ...req.query, mode: req.query.mode || 'receiving' };
        const data = await itemService.getItemsByLocationId(req.user.tenantId, locationId, query);
        return success(res, data, 'Items fetched successfully');
    } catch (err) {
        next(err);
    }
};

/**
 * GET /inventory/items-by-locations/:locationId/select
 * Query: mode=operational (default) | mode=receiving (GRN expanded catalog)
 */
const getItemsByLocationSelect = async (req, res, next) => {
    try {
        const { locationId } = req.params;
        if (isScopeEngineEnabled()) {
            const scope = await resolveUserScope(req.user, req.user.tenantId);
            await assertLocationInScope(locationId, req.user.tenantId, scope, 'list');
        }
        const query = { ...req.query, mode: req.query.mode || 'operational' };
        const data = await itemService.getAllItemsByLocationId(req.user.tenantId, locationId, query);
        return success(res, data, 'Items fetched successfully');
    } catch (err) {
        next(err);
    }
};

module.exports = {
    patchInventoryStatus,
    getItemsByLocation,
    getItemsByLocationSelect,
};
