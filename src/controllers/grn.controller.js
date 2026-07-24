'use strict';
const multer = require('multer');
const grnService = require('../services/grn.service');
const { generateGrnEvidencePDF } = require('../services/pdf.service');
const {
    buildEnrichedEvidence,
    logEvidenceExport,
    resolveEvidencePdfFilename,
} = require('../utils/evidenceExport.util');
const periodGuard = require('../services/periodGuard.service');
const { normalizeRole } = require('../services/rbac.service');
const { hasPermission } = require('../middleware/authorize');
const { putBuffer, buildGrnPdfKey } = require('../middleware/upload.middleware');
const { parseVersionFromRequest } = require('../platform/concurrency.service');

/** Roles allowed to create GRNs (POST /api/grn) — enforced via GRN_MANAGE at controller. */
// ─── Multer (memory-backed; bytes are forwarded to storage.put below) ────────
const memoryStorage = multer.memoryStorage();

const invoiceUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
        cb(null, file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')),
});
const uploadInvoice = invoiceUpload.single('invoice');

const excelUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = file.mimetype.includes('spreadsheet') ||
            file.mimetype.includes('excel') ||
            file.originalname.endsWith('.xlsx') ||
            file.originalname.endsWith('.xls') ||
            file.originalname.endsWith('.csv');
        cb(null, ok);
    },
});
const uploadExcel = excelUpload.single('file');

const pdfUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
        cb(null, file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')),
});
const uploadPdf = pdfUpload.single('file');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sendSuccess = (res, data, status = 200) =>
    res.status(status).json({ success: true, data });

const sendError = (res, err) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ success: false, message: err.message, details: err.details });
};

const assertFinance = (req) => {
    const role = req.user?.role;
    if (!['FINANCE_MANAGER', 'COST_CONTROL'].includes(role))
        throw Object.assign(
            new Error('Insufficient permissions. Finance role required.'),
            { status: 403 }
        );
};

const assertPatchGrnStatusRole = (req) => {
    if (!hasPermission(req.user, 'GRN_MANAGE')) {
        throw Object.assign(
            new Error('Insufficient permissions to update GRN status at this stage.'),
            { status: 403 },
        );
    }
};

const { isGrnCreateActorRole } = require('../services/grnWorkflowContext.util');

/** GRN create: GRN_MANAGE + create-actor role (Storekeeper / Org / Super). Finance cannot create. */
const assertGrnCreateRole = (req) => {
    if (!hasPermission(req.user, 'GRN_MANAGE')) {
        throw Object.assign(new Error('Permission denied. You cannot create goods receipt notes.'), {
            status: 403,
        });
    }
    if (!isGrnCreateActorRole(req.user?.role)) {
        throw Object.assign(
            new Error(
                'Only Storekeeper (or Org/Super governance) may create goods receipt notes. Finance and Cost Control review after submit.',
            ),
            { status: 403 },
        );
    }
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/** POST /api/grn — create a new GRN using items from Item Master */
const createGrn = async (req, res) => {
    try {
        await periodGuard.assertOperationalTransactionsAllowed(req.user.tenantId);
        assertGrnCreateRole(req);

        const invoiceFile = req.file;
        if (!invoiceFile)
            return res.status(400).json({ success: false, message: 'Invoice attachment (PDF or image) is required.' });

        const { supplierId, locationId, grnNumber, supplierInvoiceNumber, receivingDate, notes, lines } = req.body;

        if (!supplierId) return res.status(400).json({ success: false, message: 'supplierId is required.' });
        if (!locationId) return res.status(400).json({ success: false, message: 'locationId is required.' });
        const invoiceRef = (supplierInvoiceNumber || grnNumber || '').trim();
        if (!invoiceRef) {
            return res.status(400).json({ success: false, message: 'Supplier invoice number is required.' });
        }

        // lines comes as JSON string from multipart
        let parsedLines;
        try {
            parsedLines = typeof lines === 'string' ? JSON.parse(lines) : lines;
        } catch {
            return res.status(400).json({ success: false, message: 'Invalid lines format — expected JSON array.' });
        }

        // Persist the invoice via the storage provider. Under local driver the key
        // looks like `/uploads/attachments/grn-...` (legacy format), under r2 it's
        // `tenants/{tenantId}/grn/...`.
        const invoiceKey = buildGrnPdfKey(req.user.tenantId, null, invoiceFile.originalname);
        await putBuffer(invoiceKey, invoiceFile);

        const created = await grnService.createGrn({
            supplierId,
            locationId,
            supplierInvoiceNumber: invoiceRef,
            grnNumber: invoiceRef,
            receivingDate,
            invoiceUrl: invoiceKey,
            notes,
            lines: parsedLines,
            tenantId: req.user.tenantId,
            userId: req.user.id,
            creatorRole: normalizeRole(req.user.role),
        });

        // One-shot create for storekeepers: start ACC workflow here (no separate Validate/Submit UI).
        const submitted = await grnService.submitForApproval(
            created.id,
            req.user.tenantId,
            req.user.id,
            created.concurrencyVersion,
        );

        sendSuccess(res, submitted, 201);
    } catch (err) {
        sendError(res, err);
    }
};

/** GET /api/grn */
const listGrns = async (req, res) => {
    try {
        const { status, page, limit } = req.query;
        const result = await grnService.listGrns(
            req.user.tenantId,
            {
                status,
                page: +page || 1,
                limit: +limit || 20,
            },
            req.user,
        );
        sendSuccess(res, result);
    } catch (err) {
        sendError(res, err);
    }
};

/** GET /api/grn/:id */
const getGrn = async (req, res) => {
    try {
        const grn = await grnService.getGrn(req.params.id, req.user.tenantId, req.user);
        sendSuccess(res, grn);
    } catch (err) {
        sendError(res, err);
    }
};

/** POST /api/grn/:id/validate */
const validateGrn = async (req, res) => {
    try {
        const grn = await grnService.validateGrn(req.params.id, req.user.tenantId);
        sendSuccess(res, grn);
    } catch (err) {
        sendError(res, err);
    }
};

/** POST /api/grn/:id/submit */
const submitGrn = async (req, res) => {
    try {
        const grn = await grnService.submitForApproval(
            req.params.id, req.user.tenantId, req.user.id, parseVersionFromRequest(req),
        );
        sendSuccess(res, grn);
    } catch (err) {
        sendError(res, err);
    }
};

/** POST /api/grn/:id/approve — ACC dual gate */
const approveGrn = async (req, res) => {
    try {
        const grn = await grnService.approveGrn(
            req.params.id, req.user.tenantId, req.user, req.body.comment, parseVersionFromRequest(req),
        );
        sendSuccess(res, grn);
    } catch (err) {
        sendError(res, err);
    }
};

/** POST /api/grn/:id/reject — ACC dual gate */
const rejectGrn = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason)
            return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
        const grn = await grnService.rejectGrn(
            req.params.id, req.user.tenantId, req.user, reason, parseVersionFromRequest(req),
        );
        sendSuccess(res, grn);
    } catch (err) {
        sendError(res, err);
    }
};

/** POST /api/grn/:id/send-back — Ch.3.4 Send Back to creator (Returned workflow) */
const sendBackGrn = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Send Back reason is required.' });
        }
        const grn = await grnService.sendBackGrn(
            req.params.id,
            req.user.tenantId,
            req.user,
            reason,
            parseVersionFromRequest(req),
            req.body.targetStepNumber ?? null,
        );
        sendSuccess(res, grn);
    } catch (err) {
        sendError(res, err);
    }
};

/** POST /api/grn/:id/post — deprecated; Finance approval auto-posts via POST /approve */
const postGrn = async (req, res) => {
    try {
        await grnService.postGrn(req.params.id, req.user.tenantId, req.user.id);
    } catch (err) {
        sendError(res, err);
    }
};

/** PATCH /api/grn/:id/status — VALIDATED→PENDING_FINANCE | PENDING_FINANCE→POSTED (auto-post) | REJECTED */
const updateGrnStatus = async (req, res) => {
    try {
        const { status, reason } = req.body || {};
        const normalized =
            String(status || '').toUpperCase() === 'APPROVED' ? 'PENDING_FINANCE' : String(status || '').toUpperCase();
        if (!['PENDING_FINANCE', 'POSTED', 'REJECTED'].includes(normalized)) {
            return res.status(400).json({
                success: false,
                message: 'status must be PENDING_FINANCE, POSTED, or REJECTED.',
            });
        }
        assertPatchGrnStatusRole(req);
        if (normalized === 'REJECTED') {
            const r = typeof reason === 'string' ? reason.trim() : '';
            if (!r) {
                return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
            }
        }
        const grn = await grnService.updateStatus(
            req.params.id,
            req.user.tenantId,
            normalized,
            normalized === 'REJECTED' ? String(reason).trim() : null,
            req.user.id,
            req.user,
            parseVersionFromRequest(req),
        );
        sendSuccess(res, grn);
    } catch (err) {
        sendError(res, err);
    }
};

/** PATCH /api/grn/:id — notes and/or lines (lines only when REJECTED) */
const updateGrn = async (req, res) => {
    try {
        const { notes, lines } = req.body || {};
        const updated = await grnService.updateGrn(
            req.params.id, req.user.tenantId, { notes, lines }, req.user.id,
            parseVersionFromRequest(req),
        );
        sendSuccess(res, updated);
    } catch (err) {
        sendError(res, err);
    }
};

/** DELETE /api/grn/:id — DRAFT only */
const deleteGrn = async (req, res) => {
    try {
        await grnService.deleteGrn(
            req.params.id,
            req.user.tenantId,
            req.user.id,
            parseVersionFromRequest(req),
        );
        res.status(200).json({ success: true, message: 'GRN deleted.' });
    } catch (err) {
        sendError(res, err);
    }
};

/** GET /api/grn/template */
const downloadTemplate = async (req, res) => {
    try {
        const wb = await grnService.generateGrnTemplate();
        const buffer = await wb.xlsx.writeBuffer();
        res.setHeader('Content-Disposition', 'attachment; filename="GRN_Template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (err) {
        sendError(res, err);
    }
};

/** POST /api/grn/import/preview — parse Excel and validate rows */
const previewExcel = async (req, res) => {
    try {
        const xlFile = req.file;
        if (!xlFile)
            return res.status(400).json({ success: false, message: 'Excel file is required.' });
        const locationId = typeof req.body?.locationId === 'string' ? req.body.locationId.trim() : '';
        const result = await grnService.previewGrnExcel(
            xlFile.buffer,
            req.user.tenantId,
            locationId || null,
        );
        sendSuccess(res, result);
    } catch (err) {
        sendError(res, err);
    }
};

/** POST /api/grn/import/pdf-preview — parse PDF and validate rows */
const previewPdf = async (req, res) => {
    try {
        const pdfFile = req.file;
        if (!pdfFile)
            return res.status(400).json({ success: false, message: 'PDF file is required.' });
        const result = await grnService.previewGrnPdf(pdfFile.buffer, req.user.tenantId);
        sendSuccess(res, result);
    } catch (err) {
        sendError(res, err);
    }
};

/** GET /api/grn/:id/evidence */
const getEvidence = async (req, res) => {
    try {
        const evidence = await buildEnrichedEvidence(req, 'GRN', () =>
            grnService.getEvidence(req.params.id, req.user.tenantId, req.user),
        );
        await logEvidenceExport(req, 'GRN', evidence, 'JSON');
        sendSuccess(res, evidence, 'Evidence pack generated.');
    } catch (err) {
        sendError(res, err);
    }
};

/** GET /api/grn/:id/evidence/pdf */
const getEvidencePDF = async (req, res) => {
    try {
        const evidence = await buildEnrichedEvidence(req, 'GRN', () =>
            grnService.getEvidence(req.params.id, req.user.tenantId, req.user),
        );
        await logEvidenceExport(req, 'GRN', evidence, 'PDF');
        const pdfBuffer = await generateGrnEvidencePDF(evidence);

        if (!pdfBuffer || pdfBuffer.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'PDF generation produced an empty file. Please contact support.',
            });
        }

        const filename = resolveEvidencePdfFilename(evidence, 'GRN-Report');
        res.status(200)
            .set('Content-Type', 'application/pdf')
            .set('Content-Disposition', `attachment; filename="${filename}"`)
            .set('Content-Length', String(pdfBuffer.length))
            .end(pdfBuffer);
    } catch (err) {
        console.error('[GRN PDF ERROR]', err.message);
        sendError(res, err);
    }
};

module.exports = {
    uploadInvoice,
    uploadExcel,
    uploadPdf,
    createGrn,
    listGrns,
    getGrn,
    getEvidence,
    getEvidencePDF,
    validateGrn,
    submitGrn,
    approveGrn,
    rejectGrn,
    sendBackGrn,
    postGrn,
    updateGrn,
    deleteGrn,
    downloadTemplate,
    previewExcel,
    previewPdf,
};

