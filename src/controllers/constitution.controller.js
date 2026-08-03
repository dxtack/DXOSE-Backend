'use strict';

const { getDocumentTimeline } = require('../platform/documentTimeline.service');
const {
    getDisplayCurrency,
    setDisplayCurrency,
    formatAmount,
} = require('../platform/displayCurrency.service');
const { getPeriodResolutionWorkspace } = require('../platform/periodResolution.service');
const {
    createGrnServerDraft,
    saveGrnDraft,
    loadGrnDraftForRecovery,
    deleteGrnServerDraft,
    listFamilyDrafts,
    expireStaleDrafts,
    getDraftOwnerPolicy,
    getDraftRetentionPolicy,
    transferDraftOwnership,
} = require('../platform/draftGovernance.service');
const { parseVersionFromRequest } = require('../platform/concurrency.service');

const sendSuccess = (res, data, status = 200) =>
    res.status(status).json({ success: true, data });

const sendError = (res, err) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        success: false,
        message: err.message,
        code: err.code,
        details: err.details,
    });
};

async function getTimeline(req, res) {
    try {
        const { moduleKey, id } = req.params;
        const data = await getDocumentTimeline(moduleKey, id, req.user.tenantId);
        sendSuccess(res, data);
    } catch (err) {
        sendError(res, err);
    }
}

async function getCurrency(req, res) {
    try {
        const { getTenantCurrencyContext } = require('../platform/displayCurrency.service');
        const ctx = await getTenantCurrencyContext(req.user.tenantId);
        sendSuccess(res, {
            displayCurrency: ctx.displayCurrency,
            currency: ctx.currency,
            symbol: ctx.symbol,
            symbolIso: ctx.symbolIso,
        });
    } catch (err) {
        sendError(res, err);
    }
}

async function putCurrency(req, res) {
    try {
        // SUPER_ADMIN-only (enforced by route). Tenant target: body.tenantId | x-tenant-id | JWT tenantId.
        const headerTenant =
            typeof req.headers['x-tenant-id'] === 'string' ? req.headers['x-tenant-id'].trim() : '';
        const bodyTenant =
            req.body?.tenantId != null ? String(req.body.tenantId).trim() : '';
        const tenantId = bodyTenant || headerTenant || req.user?.tenantId || null;
        if (!tenantId) {
            const err = Object.assign(
                new Error('tenantId is required (body.tenantId or x-tenant-id) for SUPER_ADMIN currency updates.'),
                { statusCode: 400, status: 400 },
            );
            throw err;
        }
        const { displayCurrency, currency } = req.body || {};
        const code = displayCurrency || currency;
        const ctx = await setDisplayCurrency(tenantId, code);
        sendSuccess(res, {
            displayCurrency: ctx.displayCurrency,
            currency: ctx.currency,
            symbol: ctx.symbol,
            symbolIso: ctx.symbolIso,
            tenantId,
        });
    } catch (err) {
        sendError(res, err);
    }
}

async function formatCurrencyPreview(req, res) {
    try {
        const code = await getDisplayCurrency(req.user.tenantId);
        const { amount } = req.query;
        sendSuccess(res, { formatted: formatAmount(amount, code), displayCurrency: code });
    } catch (err) {
        sendError(res, err);
    }
}

async function createGrnDraft(req, res) {
    try {
        const { isGrnCreateActorRole } = require('../services/grnWorkflowContext.util');
        const { hasPermission } = require('../middleware/authorize');
        if (!hasPermission(req.user, 'GRN_MANAGE') || !isGrnCreateActorRole(req.user?.role)) {
            const err = Object.assign(
                new Error(
                    'Only Storekeeper (or Org/Super governance) may create GRN drafts.',
                ),
                { status: 403 },
            );
            throw err;
        }
        const draft = await createGrnServerDraft({
            tenantId: req.user.tenantId,
            userId: req.user.id,
            ...req.body,
        });
        sendSuccess(res, draft, 201);
    } catch (err) {
        sendError(res, err);
    }
}

async function patchGrnDraft(req, res) {
    try {
        const draft = await saveGrnDraft(
            req.params.id,
            req.user.tenantId,
            req.user,
            req.body,
            parseVersionFromRequest(req),
        );
        sendSuccess(res, draft);
    } catch (err) {
        sendError(res, err);
    }
}

async function getGrnDraftForRecovery(req, res) {
    try {
        const draft = await loadGrnDraftForRecovery(req.params.id, req.user.tenantId, req.user);
        sendSuccess(res, draft);
    } catch (err) {
        sendError(res, err);
    }
}

async function deleteGrnDraft(req, res) {
    try {
        const result = await deleteGrnServerDraft(
            req.params.id,
            req.user.tenantId,
            req.user,
            parseVersionFromRequest(req),
        );
        sendSuccess(res, result);
    } catch (err) {
        sendError(res, err);
    }
}

async function listDrafts(req, res) {
    try {
        const { family } = req.params;
        const ownerId = req.query.mine === 'true' ? req.user.id : req.query.ownerId || undefined;
        const drafts = await listFamilyDrafts(req.user.tenantId, family, { ownerId });
        sendSuccess(res, { family, drafts, policy: getDraftRetentionPolicy() });
    } catch (err) {
        sendError(res, err);
    }
}

async function postExpireDrafts(req, res) {
    try {
        const result = await expireStaleDrafts(req.user.tenantId);
        sendSuccess(res, result);
    } catch (err) {
        sendError(res, err);
    }
}

async function getDraftPolicy(req, res) {
    try {
        sendSuccess(res, {
            ownership: getDraftOwnerPolicy(),
            retention: getDraftRetentionPolicy(),
        });
    } catch (err) {
        sendError(res, err);
    }
}

async function postTransferDraftOwnership(req, res) {
    try {
        const { family, documentId, toUserId } = req.body || {};
        if (!family || !documentId || !toUserId) {
            return sendError(
                res,
                Object.assign(new Error('family, documentId, and toUserId are required.'), { status: 400 }),
            );
        }
        const updated = await transferDraftOwnership({
            family,
            documentId,
            tenantId: req.user.tenantId,
            toUserId,
            actor: req.user,
        });
        sendSuccess(res, updated);
    } catch (err) {
        sendError(res, err);
    }
}

async function getPeriodResolution(req, res) {
    try {
        const data = await getPeriodResolutionWorkspace(req.user.tenantId, req.query);
        sendSuccess(res, data);
    } catch (err) {
        sendError(res, err);
    }
}

module.exports = {
    getTimeline,
    getCurrency,
    putCurrency,
    formatCurrencyPreview,
    createGrnDraft,
    patchGrnDraft,
    getGrnDraftForRecovery,
    deleteGrnDraft,
    listDrafts,
    postExpireDrafts,
    getDraftPolicy,
    postTransferDraftOwnership,
    getPeriodResolution,
};
