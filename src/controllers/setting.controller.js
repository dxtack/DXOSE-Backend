const settingService = require('../services/setting.service');
const { logAction, EntityType } = require('../services/auditTrail.service');
const { success } = require('../utils/response');
const { hasPermission } = require('../middleware/authorize');

const canManageTenantOpeningBalance = (user) => hasPermission(user, 'SETTINGS_MANAGE');

// ── GET Setting ────────────────────────────────────────────────────────────────
const getSetting = async (req, res, next) => {
    try {
        const { key } = req.params;
        const value = await settingService.getSetting(req.user.tenantId, key);
        return success(res, { key, value });
    } catch (err) { next(err); }
};

// ── PUT Setting ────────────────────────────────────────────────────────────────
const setSetting = async (req, res, next) => {
    try {
        const { key } = req.params;
        const { value, reason } = req.body;

        if (value === undefined || value === null) {
            const e = new Error('Value is required'); e.statusCode = 400; throw e;
        }

        // OB setting requires SETTINGS_MANAGE (ORG_MANAGER / GENERAL_MANAGER / SUPER_ADMIN) + mandatory reason
        if (key === 'allowOpeningBalance') {
            if (!canManageTenantOpeningBalance(req.user)) {
                const e = new Error('Only tenant administrators can modify Opening Balance setting');
                e.statusCode = 403; throw e;
            }
            if (value === 'OPEN' && !reason) {
                const e = new Error('A reason is required when unlocking Opening Balance');
                e.statusCode = 400; throw e;
            }
        }

        const result = await settingService.setSetting(
            req.user.tenantId, key, value, req.user.id, reason || null
        );
        return success(res, result, `Setting '${key}' updated.`);
    } catch (err) { next(err); }
};

// ── GET OB Eligibility ─────────────────────────────────────────────────────────
const getOBEligibility = async (req, res, next) => {
    try {
        const result = await settingService.isOpeningBalanceAllowed(req.user.tenantId);
        return success(res, result);
    } catch (err) { next(err); }
};

// ── GET /settings/inventory-status — OB gate + finalize snapshot (UI) ─────────
const getInventoryStatus = async (req, res, next) => {
    try {
        const result = await settingService.getInventoryStatus(req.user.tenantId);
        return success(res, result);
    } catch (err) { next(err); }
};

// ── GET /settings/tenant — active tenant currency + presentation ─────────────
const getTenantSettings = async (req, res, next) => {
    try {
        const result = await settingService.getTenantSettings(req.user.tenantId);
        return success(res, result);
    } catch (err) { next(err); }
};

// ── POST /settings/ob-lock — Lock OB import (SUPER_ADMIN / ADMIN / ORG_MANAGER) ─
const lockOB = async (req, res, next) => {
    try {
        const { reason } = req.body;
        const { tenantId, id: userId, role } = req.user;

        // Defense-in-depth role check (route middleware also enforces this).
        if (!canManageTenantOpeningBalance(req.user)) {
            const e = new Error('Only tenant administrators can lock or unlock Opening Balance.');
            e.statusCode = 403; throw e;
        }

        if (!reason || !reason.trim()) {
            const e = new Error('A reason is required when locking Opening Balance import.');
            e.statusCode = 400; throw e;
        }

        await settingService.setSetting(
            tenantId, 'allowOpeningBalance', 'LOCKED', userId, reason
        );
        await settingService.setSetting(
            tenantId, 'isOpeningBalanceAllowed', 'false', userId, reason
        );

        await logAction({
            tenantId,
            entityType: EntityType.SETTINGS,
            entityId: 'allowOpeningBalance',
            action: 'LOCK_OB',
            changedBy: userId,
            note: reason,
        });

        return success(
            res,
            { key: 'allowOpeningBalance', value: 'LOCKED' },
            'Opening Balance import has been locked.'
        );
    } catch (err) { next(err); }
};

// ── POST /settings/ob-enable — Enable OB import (SUPER_ADMIN / ADMIN / ORG_MANAGER) ─
const enableOB = async (req, res, next) => {
    try {
        const { reason } = req.body;
        const { tenantId, id: userId, role } = req.user;
        const normalizedReason = (reason && String(reason).trim()) || 'Initial Setup';

        // Defense-in-depth role check (route middleware also enforces this).
        if (!canManageTenantOpeningBalance(req.user)) {
            const e = new Error('Only tenant administrators can lock or unlock Opening Balance.');
            e.statusCode = 403; throw e;
        }

        await settingService.enableOpeningBalanceStage(tenantId, userId, normalizedReason);

        await logAction({
            tenantId,
            entityType: EntityType.SETTINGS,
            entityId: 'allowOpeningBalance',
            action: 'UPDATE',
            changedBy: userId,
            note: `OB_IMPORT_ENABLED (not fiscal period reopen) — reason: ${normalizedReason}`,
        });

        return success(
            res,
            { key: 'allowOpeningBalance', value: 'OPEN' },
            'Opening Balance import has been enabled.'
        );
    } catch (err) { next(err); }
};

// ── POST /settings/ob-finalize — Strictly finalize Opening Balance ────────────
const finalizeOpeningBalance = async (req, res, next) => {
    try {
        const { tenantId, id: userId, role } = req.user;
        if (!canManageTenantOpeningBalance(req.user)) {
            const e = new Error('Only tenant administrators can finalize Opening Balance.');
            e.statusCode = 403; throw e;
        }

        const result = await settingService.finalizeOpeningBalance(tenantId, userId);
        return success(res, result, 'Opening Balance finalized successfully.');
    } catch (err) {
        if (err.details) {
            const status = err.statusCode || err.status || 400;
            return res.status(status).json({
                success: false,
                message: err.message,
                code: err.code,
                details: err.details,
            });
        }
        next(err);
    }
};

module.exports = {
    getSetting,
    setSetting,
    getOBEligibility,
    getInventoryStatus,
    getTenantSettings,
    lockOB,
    enableOB,
    finalizeOpeningBalance,
};
