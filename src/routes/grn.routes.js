'use strict';
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const ctrl = require('../controllers/grn.controller');

router.use(authenticate);

// ── Excel Template & Import Preview (no file needed for template) ──
router.get('/template', requirePermission('GRN_MANAGE'), ctrl.downloadTemplate);

/**
 * @openapi
 * /grn/import/preview:
 *   post:
 *     tags: [GRN]
 *     summary: Parse a supplier Excel and return validated lines
 *     description: >
 *       Stateless preview — the file is parsed in memory and discarded. The
 *       caller uses the parsed rows to build the JSON body for POST `/grn`.
 *     security: [ { bearerAuth: [] } ]
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
 *                 description: .xlsx / .xls / .csv, max 10 MB
 *               locationId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional destination warehouse — validates rows against RECEIVING catalog
 *     responses:
 *       200:
 *         description: Parsed lines + row-level validation
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/import/preview', requirePermission('GRN_MANAGE'), ctrl.uploadExcel, ctrl.previewExcel);

/**
 * @openapi
 * /grn/import/pdf-preview:
 *   post:
 *     tags: [GRN]
 *     summary: Parse a supplier PDF invoice and return detected lines
 *     description: >
 *       Extracts text via pdf-parse and tries to match each line against Item
 *       Master (exact barcode → fuzzy name ≥ 60% → UNMAPPED). Scanned/encrypted
 *       PDFs return a warning and suggest the Excel import instead.
 *     security: [ { bearerAuth: [] } ]
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
 *                 description: PDF, max 20 MB
 *     responses:
 *       200:
 *         description: Detected rows with mapping status
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/import/pdf-preview', requirePermission('GRN_MANAGE'), ctrl.uploadPdf, ctrl.previewPdf);

/**
 * @openapi
 * /grn:
 *   post:
 *     tags: [GRN]
 *     summary: Create a Goods Receipt Note with its invoice attachment
 *     description: >
 *       Multipart request: the `invoice` field carries the PDF/image; everything
 *       else is form fields. The invoice file is persisted via the storage
 *       provider and the key saved in `GrnImport.pdfAttachmentUrl`.
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [invoice, supplierId, locationId, grnNumber, lines]
 *             properties:
 *               invoice:
 *                 type: string
 *                 format: binary
 *                 description: PDF or image of the supplier invoice (max 20 MB)
 *               supplierId: { type: string, format: uuid }
 *               locationId: { type: string, format: uuid }
 *               grnNumber:  { type: string }
 *               receivingDate: { type: string, format: date-time }
 *               notes:      { type: string }
 *               lines:
 *                 type: string
 *                 description: JSON-stringified array of line items
 *     responses:
 *       201:
 *         description: GRN created (DRAFT, or auto-posted when thresholds pass)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/GrnImport' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/', requirePermission('GRN_MANAGE'), ctrl.uploadInvoice, ctrl.createGrn);

// ── List & Detail ──
// List stays VIEW-only. Detail/evidence: VIEW or MANAGE (approve uses GRN_MANAGE — Breakage pattern).
router.get('/', requirePermission('GRN_VIEW'), ctrl.listGrns);
router.get('/:id/evidence', requireAnyPermission('GRN_VIEW', 'GRN_MANAGE'), ctrl.getEvidence);
router.get('/:id/evidence/pdf', requireAnyPermission('GRN_VIEW', 'GRN_MANAGE'), ctrl.getEvidencePDF);
router.get('/:id', requireAnyPermission('GRN_VIEW', 'GRN_MANAGE'), ctrl.getGrn);

// ── State Machine ──
router.post('/:id/validate', requirePermission('GRN_MANAGE'), ctrl.validateGrn);
router.post('/:id/submit', requirePermission('GRN_MANAGE'), ctrl.submitGrn);
router.post('/:id/approve', requirePermission('GRN_MANAGE'), ctrl.approveGrn);
router.post('/:id/reject', requirePermission('GRN_MANAGE'), ctrl.rejectGrn);
router.post('/:id/send-back', requirePermission('GRN_MANAGE'), ctrl.sendBackGrn);
// Finance approval auto-posts via POST /grn/:id/approve (ACC workflow).
router.post('/:id/post', requirePermission('GRN_MANAGE'), ctrl.postGrn);

// ── Mutations (specific PATCH paths before `/:id`) ──
// Deprecated — use POST /grn/:id/approve or /reject (ACC workflow).
router.patch('/:id', requirePermission('GRN_MANAGE'), ctrl.updateGrn);
router.delete('/:id', requirePermission('GRN_MANAGE'), ctrl.deleteGrn);

module.exports = router;
