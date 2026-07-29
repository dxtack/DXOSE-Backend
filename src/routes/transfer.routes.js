'use strict';
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission, requirePermission } = require('../middleware/authorize');
const ctrl = require('../controllers/transfer.controller');

router.use(authenticate);

router.post('/', requirePermission('TRANSFER_CREATE'), ctrl.createTransfer); // Create + enter approval (PENDING_DEPT / PENDING_FINANCE)
router.get('/', requirePermission('TRANSFER_VIEW'), ctrl.listTransfers);
router.get('/:id/evidence', requirePermission('TRANSFER_VIEW'), ctrl.getEvidence);
router.get('/:id/evidence/pdf', requirePermission('TRANSFER_VIEW'), ctrl.getEvidencePDF);
router.get('/:id', requirePermission('TRANSFER_VIEW'), ctrl.getTransfer);
router.patch('/:id', requirePermission('TRANSFER_CREATE'), ctrl.updateTransfer); // DRAFT only
router.delete('/:id', requirePermission('TRANSFER_CREATE'), ctrl.deleteTransfer); // DRAFT only

// State machine
router.post('/:id/submit', requirePermission('TRANSFER_CREATE'), ctrl.submitTransfer);
router.post('/:id/approve', requirePermission('TRANSFER_APPROVE'), ctrl.approveTransfer);
router.post('/:id/reject', requireAnyPermission('TRANSFER_CREATE', 'TRANSFER_APPROVE'), ctrl.rejectTransfer);
router.post('/:id/send-back', requirePermission('TRANSFER_APPROVE'), ctrl.sendBackTransfer);

module.exports = router;
