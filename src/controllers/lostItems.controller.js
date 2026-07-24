const lostItemsService = require('../services/lostItems.service');
const { generateLostEvidencePDF } = require('../services/pdf.service');
const { success } = require('../utils/response');
const {
    buildEnrichedEvidence,
    logEvidenceExport,
    resolveEvidencePdfFilename,
} = require('../utils/evidenceExport.util');
const { formatMovementDocumentNotes } = require('../utils/formatMovementNotes');
const { parseVersionFromRequest } = require('../platform/concurrency.service');

const createLost = async (req, res, next) => {
    try {
        const doc = await lostItemsService.createLost(req.user.tenantId, req.user, req.body);
        return success(res, doc, 'Lost document created.', 201);
    } catch (e) {
        next(e);
    }
};

/** GET /api/lost-items */
const listLostItems = async (req, res, next) => {
    try {
        const result = await lostItemsService.listLostItems(req.user.tenantId, req.query, req.user);
        const {
            items,
            total,
            scope,
            scopeApplied,
            scopeLabel,
            reason,
            totalUnscoped,
            totalAfterScope,
            scopeDebug,
        } = result;
        return success(res, items, 'Lost items fetched.', 200, {
            total,
            skip: Number.parseInt(String(req.query.skip), 10) || 0,
            take: Number.parseInt(String(req.query.take), 10) || 20,
            scope,
            scopeApplied,
            scopeLabel,
            reason,
            totalUnscoped,
            totalAfterScope,
            ...(scopeDebug ? { scopeDebug } : {}),
        });
    } catch (e) {
        next(e);
    }
};

/** GET /api/lost-items/:id */
const getLostItem = async (req, res, next) => {
    try {
        const doc = await lostItemsService.getLostById(req.params.id, req.user.tenantId, req.user);
        return success(res, formatMovementDocumentNotes(doc), 'Lost document fetched.');
    } catch (e) {
        next(e);
    }
};

/** POST /api/lost-items/:id/submit — enter ACC pipeline from Draft (residual / save-as-draft path). */
const submitLost = async (req, res, next) => {
    try {
        const doc = await lostItemsService.submitLost(
            req.params.id,
            req.user.tenantId,
            req.user,
            parseVersionFromRequest(req),
        );
        return success(res, formatMovementDocumentNotes(doc), 'Lost document submitted for approval.');
    } catch (e) {
        next(e);
    }
};

/** POST /api/lost-items/:id/approve — ACC workflow step approval. */
const approveLostApprovalStep = async (req, res, next) => {
    try {
        const { comment, accountability } = req.body;
        const doc = await lostItemsService.processLostApprovalStep(
            req.params.id,
            req.user.tenantId,
            req.user,
            'APPROVE',
            comment,
            accountability,
            parseVersionFromRequest(req),
        );
        return success(res, doc, 'Step approved.');
    } catch (e) {
        next(e);
    }
};

/** POST /api/lost-items/:id/reject */
const rejectLostApprovalStep = async (req, res, next) => {
    try {
        const { comment } = req.body;
        if (!comment?.trim()) {
            return res.status(400).json({ success: false, message: 'Rejection comment is required.' });
        }
        const doc = await lostItemsService.rejectLost(
            req.params.id,
            req.user.tenantId,
            req.user,
            comment,
            parseVersionFromRequest(req),
        );
        return success(res, formatMovementDocumentNotes(doc), 'Step rejected.');
    } catch (e) {
        next(e);
    }
};

/** POST /api/lost-items/:id/send-back */
const sendBackLostApprovalStep = async (req, res, next) => {
    try {
        const doc = await lostItemsService.sendBackLostItem(
            req.params.id,
            req.user.tenantId,
            req.user,
            req.body?.reason,
            parseVersionFromRequest(req),
            req.body?.targetStepNumber,
        );
        return success(res, formatMovementDocumentNotes(doc), 'Lost item document sent back.');
    } catch (e) {
        next(e);
    }
};

/** PUT /api/lost-items/:id — edit DRAFT / Returned document. */
const updateLost = async (req, res, next) => {
    try {
        const doc = await lostItemsService.updateLost(
            req.params.id,
            req.user.tenantId,
            req.user,
            req.body,
            parseVersionFromRequest(req),
        );
        return success(res, formatMovementDocumentNotes(doc), 'Lost document updated.');
    } catch (e) {
        next(e);
    }
};

const getEvidence = async (req, res, next) => {
    try {
        const evidence = await buildEnrichedEvidence(req, 'LOST', () =>
            lostItemsService.getEvidence(req.params.id, req.user.tenantId, req.user),
        );
        await logEvidenceExport(req, 'LOST', evidence, 'JSON');
        return success(res, evidence, 'Evidence pack generated.');
    } catch (e) {
        next(e);
    }
};

const getEvidencePDF = async (req, res, next) => {
    try {
        const evidence = await buildEnrichedEvidence(req, 'LOST', () =>
            lostItemsService.getEvidence(req.params.id, req.user.tenantId, req.user),
        );
        await logEvidenceExport(req, 'LOST', evidence, 'PDF');
        const pdfBuffer = await generateLostEvidencePDF(evidence);

        if (!pdfBuffer || pdfBuffer.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'PDF generation produced an empty file. Please contact support.',
            });
        }

        const filename = resolveEvidencePdfFilename(evidence, 'Lost-Items-Report');
        res.status(200)
            .set('Content-Type', 'application/pdf')
            .set('Content-Disposition', `attachment; filename="${filename}"`)
            .set('Content-Length', String(pdfBuffer.length))
            .end(pdfBuffer);
    } catch (e) {
        console.error('[Lost PDF ERROR]', e.message);
        next(e);
    }
};

module.exports = {
    createLost,
    listLostItems,
    getLostItem,
    submitLost,
    updateLost,
    approveLostApprovalStep,
    rejectLostApprovalStep,
    sendBackLostApprovalStep,
    getEvidence,
    getEvidencePDF,
};
