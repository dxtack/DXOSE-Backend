const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/breakage.controller');
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission, requirePermission } = require('../middleware/authorize');
const { uploadAttachment, uploadImage } = require('../middleware/upload.middleware');

// All routes require authentication
router.use(authenticate);

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.post(
    '/',
    requirePermission('BREAKAGE_CREATE'),
    uploadImage.any(),
    ctrl.createBreakage,
);
router.get(
    '/',
    requireAnyPermission('VIEW_INVENTORY', 'BREAKAGE_VIEW', 'READ_BREAKAGE', 'APPROVE_BREAKAGE'),
    ctrl.getBreakages,
);
router.get(
    '/:id',
    requireAnyPermission('VIEW_INVENTORY', 'BREAKAGE_VIEW', 'READ_BREAKAGE', 'APPROVE_BREAKAGE'),
    ctrl.getBreakage,
);
router.put('/:id', requirePermission('BREAKAGE_CREATE'), ctrl.updateBreakage);

// ── Workflow ──────────────────────────────────────────────────────────────────
router.post('/:id/submit', requirePermission('BREAKAGE_CREATE'), ctrl.submitBreakage);
router.post('/:id/approve', requirePermission('APPROVE_BREAKAGE'), ctrl.approveBreakage);
router.post('/:id/reject', requireAnyPermission('BREAKAGE_CREATE', 'APPROVE_BREAKAGE'), ctrl.rejectBreakage);
router.post('/:id/send-back', requirePermission('APPROVE_BREAKAGE'), ctrl.sendBackBreakage);
router.post('/:id/void', requirePermission('BREAKAGE_CREATE'), ctrl.voidBreakage);

/**
 * @openapi
 * /breakage/{id}/attachment:
 *   post:
 *     tags: [Breakage]
 *     summary: Attach a file (photo / PDF / Office doc) to a breakage document
 *     description: >
 *       Appended to the JSON array stored in `MovementDocument.attachmentUrl`.
 *       Blocked once the document is APPROVED or VOID.
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: .jpg/.png/.webp/.pdf/.doc(x)/.xls(x), max 10 MB
 *     responses:
 *       200:
 *         description: Document with the new attachment appended
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/attachment', requirePermission('BREAKAGE_CREATE'), uploadAttachment.single('file'), ctrl.uploadAttachment);

// ── Evidence ──────────────────────────────────────────────────────────────────
router.get(
    '/:id/evidence',
    requireAnyPermission('VIEW_INVENTORY', 'BREAKAGE_VIEW', 'READ_BREAKAGE', 'APPROVE_BREAKAGE'),
    ctrl.getEvidence,
);
router.get(
    '/:id/evidence/pdf',
    requireAnyPermission('VIEW_INVENTORY', 'BREAKAGE_VIEW', 'READ_BREAKAGE', 'APPROVE_BREAKAGE'),
    ctrl.getEvidencePDF,
);

module.exports = router;
