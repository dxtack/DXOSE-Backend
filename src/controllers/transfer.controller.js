'use strict';

const svc = require('../services/transfer.service');
const { generateTransferEvidencePDF } = require('../services/pdf.service');
const {
    buildEnrichedEvidence,
    logEvidenceExport,
    resolveEvidencePdfFilename,
} = require('../utils/evidenceExport.util');
const { parseVersionFromRequest } = require('../platform/concurrency.service');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const err = (res, e) => res.status(e.status || e.statusCode || 500).json({ success: false, message: e.message, details: e.details });

const createTransfer = async (req, res) => {
    try {
        ok(
            res,
            await svc.createTransfer({
                tenantId: req.user.tenantId,
                userId: req.user.id,
                user: req.user,
                ...req.body,
            }),
            201,
        );
    } catch (e) {
        err(res, e);
    }
};
const listTransfers = async (req, res) => {
    try {
        ok(
            res,
            await svc.listTransfers(
                req.user.tenantId,
                { ...req.query, page: +req.query.page || 1, limit: +req.query.limit || 20 },
                req.user,
            ),
        );
    } catch (e) {
        err(res, e);
    }
};
const getTransfer = async (req, res) => {
    try {
        ok(res, await svc.getTransfer(req.params.id, req.user.tenantId, req.user));
    } catch (e) {
        err(res, e);
    }
};
const updateTransfer = async (req, res) => {
    try {
        ok(res, await svc.updateTransfer(req.params.id, req.user.tenantId, req.body, req.user, parseVersionFromRequest(req)));
    } catch (e) {
        err(res, e);
    }
};
const deleteTransfer = async (req, res) => {
    try {
        await svc.deleteTransfer(req.params.id, req.user.tenantId, req.user, parseVersionFromRequest(req));
        res.json({ success: true, message: 'Transfer deleted.' });
    } catch (e) {
        err(res, e);
    }
};

const submitTransfer = async (req, res) => {
    try {
        ok(res, await svc.submitTransfer(req.params.id, req.user.tenantId, req.user, parseVersionFromRequest(req)));
    } catch (e) {
        err(res, e);
    }
};
const approveTransfer = async (req, res) => {
    try {
        ok(res, await svc.approveTransfer(req.params.id, req.user.tenantId, req.user, parseVersionFromRequest(req)));
    } catch (e) {
        err(res, e);
    }
};
const rejectTransfer = async (req, res) => {
    try {
        ok(res, await svc.rejectTransfer(req.params.id, req.user.tenantId, req.user, req.body.reason, parseVersionFromRequest(req)));
    } catch (e) {
        err(res, e);
    }
};
const sendBackTransfer = async (req, res) => {
    try {
        ok(
            res,
            await svc.sendBackTransfer(
                req.params.id,
                req.user.tenantId,
                req.user,
                req.body.reason,
                parseVersionFromRequest(req),
                req.body.targetStepNumber ?? null,
            ),
        );
    } catch (e) {
        err(res, e);
    }
};

/** GET /api/transfers/:id/evidence */
const getEvidence = async (req, res) => {
    try {
        const evidence = await buildEnrichedEvidence(req, 'TRANSFER', () =>
            svc.getEvidence(req.params.id, req.user.tenantId, req.user),
        );
        await logEvidenceExport(req, 'TRANSFER', evidence, 'JSON');
        res.status(200).json({ success: true, data: evidence, message: 'Evidence pack generated.' });
    } catch (e) {
        err(res, e);
    }
};

/** GET /api/transfers/:id/evidence/pdf */
const getEvidencePDF = async (req, res) => {
    try {
        const evidence = await buildEnrichedEvidence(req, 'TRANSFER', () =>
            svc.getEvidence(req.params.id, req.user.tenantId, req.user),
        );
        await logEvidenceExport(req, 'TRANSFER', evidence, 'PDF');
        const pdfBuffer = await generateTransferEvidencePDF(evidence);

        if (!pdfBuffer || pdfBuffer.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'PDF generation produced an empty file. Please contact support.',
            });
        }

        const filename = resolveEvidencePdfFilename(evidence, 'Transfer-Report');
        res.status(200)
            .set('Content-Type', 'application/pdf')
            .set('Content-Disposition', `attachment; filename="${filename}"`)
            .set('Content-Length', String(pdfBuffer.length))
            .end(pdfBuffer);
    } catch (e) {
        console.error('[Transfer PDF ERROR]', e.message);
        err(res, e);
    }
};

module.exports = {
    createTransfer,
    listTransfers,
    getTransfer,
    updateTransfer,
    deleteTransfer,
    submitTransfer,
    approveTransfer,
    rejectTransfer,
    sendBackTransfer,
    getEvidence,
    getEvidencePDF,
};
