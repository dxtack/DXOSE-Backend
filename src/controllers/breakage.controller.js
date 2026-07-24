const breakageService = require('../services/breakage.service');
const { generateBreakageEvidencePDF } = require('../services/pdf.service');
const { success } = require('../utils/response');
const {
    buildEnrichedEvidence,
    logEvidenceExport,
    resolveEvidencePdfFilename,
} = require('../utils/evidenceExport.util');
const { formatMovementDocumentNotes } = require('../utils/formatMovementNotes');
const { putBuffer, buildAttachmentKey } = require('../middleware/upload.middleware');
const { parseVersionFromRequest } = require('../platform/concurrency.service');

/** POST /api/breakage */
const ALLOWED_BREAKAGE_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_LINE_PHOTOS = 10;

const flattenUploadedFiles = (req) => {
    if (!req.files) return [];
    if (Array.isArray(req.files)) return req.files;
    if (typeof req.files === 'object') {
        return Object.values(req.files).flat();
    }
    return [];
};

const collectLinePhotoFiles = (req, lineCount) => {
    const byIndex = Array.from({ length: lineCount }, () => []);
    for (const file of flattenUploadedFiles(req)) {
        const match = /^linePhotos_(\d+)$/.exec(file.fieldname || '');
        if (!match) continue;
        const idx = Number.parseInt(match[1], 10);
        if (!Number.isFinite(idx) || idx < 0 || idx >= lineCount) continue;
        if (!ALLOWED_BREAKAGE_PHOTO_MIMES.has(file.mimetype)) continue;
        if (byIndex[idx].length >= MAX_LINE_PHOTOS) continue;
        byIndex[idx].push(file);
    }
    return byIndex;
};

const createBreakage = async (req, res, next) => {
    try {
        const payload = {
            ...req.body,
            lines:
                typeof req.body.lines === 'string'
                    ? (() => {
                        try {
                            return JSON.parse(req.body.lines);
                        } catch {
                            return null;
                        }
                    })()
                    : req.body.lines,
        };
        if (!payload.lines || !Array.isArray(payload.lines)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid lines payload. Please re-upload or try again.',
            });
        }
        const linePhotosByIndex = collectLinePhotoFiles(req, payload.lines.length);
        const doc = await breakageService.createBreakage(
            payload,
            req.user.tenantId,
            req.user,
            linePhotosByIndex,
        );
        return success(res, doc, 'Breakage document created.', 201);
    } catch (e) { next(e); }
};

/** GET /api/breakage */
const getBreakages = async (req, res, next) => {
    try {
        const result = await breakageService.getBreakages(req.user.tenantId, req.query, req.user);
        const {
            documents,
            total,
            scope,
            scopeApplied,
            scopeLabel,
            reason,
            totalUnscoped,
            totalAfterScope,
            scopeDebug,
        } = result;
        return success(res, documents, 'Breakage documents fetched.', 200, {
            total,
            skip: parseInt(req.query.skip) || 0,
            take: parseInt(req.query.take) || 20,
            scope,
            scopeApplied,
            scopeLabel,
            reason,
            totalUnscoped,
            totalAfterScope,
            ...(scopeDebug ? { scopeDebug } : {}),
        });
    } catch (e) { next(e); }
};

/** GET /api/breakage/:id */
const getBreakage = async (req, res, next) => {
    try {
        const doc = await breakageService.getBreakageById(req.params.id, req.user.tenantId, req.user);
        return success(res, formatMovementDocumentNotes(doc), 'Breakage document fetched.');
    } catch (e) { next(e); }
};

/** POST /api/breakage/:id/submit */
const submitBreakage = async (req, res, next) => {
    try {
        const doc = await breakageService.submitBreakage(
            req.params.id,
            req.user.tenantId,
            req.user,
            parseVersionFromRequest(req),
        );
        return success(res, doc, 'Breakage submitted for approval.');
    } catch (e) { next(e); }
};

/** POST /api/breakage/:id/approve */
const approveBreakage = async (req, res, next) => {
    try {
        const { comment, accountability } = req.body;
        const doc = await breakageService.processApprovalStep(
            req.params.id,
            req.user.tenantId,
            req.user,
            'APPROVE',
            comment,
            accountability,
            parseVersionFromRequest(req),
        );
        return success(res, doc, 'Step approved.');
    } catch (e) { next(e); }
};

/** POST /api/breakage/:id/reject */
const rejectBreakage = async (req, res, next) => {
    try {
        const { comment } = req.body;
        if (!comment?.trim()) {
            return res.status(400).json({ success: false, message: 'Rejection comment is required.' });
        }
        const doc = await breakageService.rejectBreakage(
            req.params.id, req.user.tenantId, req.user, comment,
            parseVersionFromRequest(req),
        );
        return success(res, doc, 'Document rejected.');
    } catch (e) { next(e); }
};

/** POST /api/breakage/:id/send-back */
const sendBackBreakage = async (req, res, next) => {
    try {
        const doc = await breakageService.sendBackBreakage(
            req.params.id,
            req.user.tenantId,
            req.user,
            req.body?.reason,
            parseVersionFromRequest(req),
            req.body?.targetStepNumber != null ? Number(req.body.targetStepNumber) : null,
        );
        return success(res, doc, 'Breakage document sent back.');
    } catch (e) { next(e); }
};

/** PUT /api/breakage/:id */
const updateBreakage = async (req, res, next) => {
    try {
        const doc = await breakageService.updateBreakage(
            req.params.id,
            req.user.tenantId,
            req.user,
            req.body,
            parseVersionFromRequest(req),
        );
        return success(res, doc, 'Breakage document updated.');
    } catch (e) { next(e); }
};

/** POST /api/breakage/:id/attachment  (multipart/form-data) */
const uploadAttachment = async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

        const key = buildAttachmentKey(req.user.tenantId, 'BREAKAGE', req.params.id, req.file.originalname);
        await putBuffer(key, req.file);

        const attachmentMeta = {
            key,
            url: key,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            uploadedBy: `${req.user.firstName || ''} ${req.user.lastName || ''} (${req.user.role})`.trim(),
            uploadedById: req.user.id,
        };

        const doc = await breakageService.addAttachment(req.params.id, req.user.tenantId, attachmentMeta, req.user);
        return success(res, doc, 'Attachment added.');
    } catch (e) { next(e); }
};

/** GET /api/breakage/:id/evidence */
const getEvidence = async (req, res, next) => {
    try {
        const evidence = await buildEnrichedEvidence(req, 'BREAKAGE', () =>
            breakageService.getEvidence(req.params.id, req.user.tenantId, req.user),
        );
        await logEvidenceExport(req, 'BREAKAGE', evidence, 'JSON');
        return success(res, evidence, 'Evidence pack generated.');
    } catch (e) { next(e); }
};

/** GET /api/breakage/:id/evidence/pdf */
const getEvidencePDF = async (req, res, next) => {
    try {
        const evidence = await buildEnrichedEvidence(req, 'BREAKAGE', () =>
            breakageService.getEvidence(req.params.id, req.user.tenantId, req.user),
        );
        await logEvidenceExport(req, 'BREAKAGE', evidence, 'PDF');
        const pdfBuffer = await generateBreakageEvidencePDF(evidence);

        if (!pdfBuffer || pdfBuffer.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'PDF generation produced an empty file. Please contact support.',
            });
        }

        const filename = resolveEvidencePdfFilename(evidence, 'Breakage-Report');
        res.status(200)
            .set('Content-Type', 'application/pdf')
            .set('Content-Disposition', `attachment; filename="${filename}"`)
            .set('Content-Length', String(pdfBuffer.length))
            .end(pdfBuffer);
    } catch (e) {
        console.error('[PDF ERROR]', e.message);
        next(e);
    }
};

/** POST /api/breakage/:id/void */
const voidBreakage = async (req, res, next) => {
    try {
        const doc = await breakageService.voidBreakage(
            req.params.id,
            req.user.tenantId,
            req.user,
            req.body?.reason,
            parseVersionFromRequest(req),
        );
        return success(res, doc, 'Breakage document voided.');
    } catch (e) { next(e); }
};

module.exports = {
    createBreakage, getBreakages, getBreakage, submitBreakage,
    approveBreakage, rejectBreakage, sendBackBreakage, updateBreakage, uploadAttachment,
    getEvidence, getEvidencePDF, voidBreakage,
};
