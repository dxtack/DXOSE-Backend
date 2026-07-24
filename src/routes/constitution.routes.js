'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const ctrl = require('../controllers/constitution.controller');

router.use(authenticate);

router.get('/display-currency', ctrl.getCurrency);
/** Display currency mutation is SUPER_ADMIN-only (intentional — not a hotel-role capability). */
router.put('/display-currency', requireSuperAdmin, ctrl.putCurrency);
router.get('/display-currency/format', ctrl.formatCurrencyPreview);
router.get('/timeline/:moduleKey/:id', ctrl.getTimeline);
router.get('/draft-policy', ctrl.getDraftPolicy);
router.post('/grn/draft', requirePermission('GRN_MANAGE'), ctrl.createGrnDraft);
router.patch('/grn/draft/:id', requirePermission('GRN_MANAGE'), ctrl.patchGrnDraft);
router.get('/grn/draft/:id/recover', requirePermission('GRN_MANAGE'), ctrl.getGrnDraftForRecovery);
router.delete('/grn/draft/:id', requirePermission('GRN_MANAGE'), ctrl.deleteGrnDraft);
router.get('/drafts/:family', ctrl.listDrafts);
router.post('/drafts/expire', requirePermission('SETTINGS_MANAGE'), ctrl.postExpireDrafts);
router.post('/drafts/transfer-ownership', requirePermission('SETTINGS_MANAGE'), ctrl.postTransferDraftOwnership);
router.get('/period-resolution', requirePermission('PERIOD_CLOSE_RESOLUTION'), ctrl.getPeriodResolution);

module.exports = router;
