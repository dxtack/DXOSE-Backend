const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const ctrl = require('../controllers/integrity.controller');

router.use(authenticate);

router.get('/month-end-checklist', requirePermission('INTEGRITY_VIEW'), ctrl.monthEndChecklist);
router.get('/scan', requirePermission('INTEGRITY_VIEW'), ctrl.integrityScan);
router.get('/history', requirePermission('INTEGRITY_VIEW'), ctrl.integrityHistory);
router.get('/reconciliation', requirePermission('INTEGRITY_VIEW'), ctrl.reconciliationDashboard);
router.get('/governance-tracking', requirePermission('INTEGRITY_VIEW'), ctrl.governanceTrackingContext);
router.get('/inventory-reconciliation', requirePermission('INTEGRITY_VIEW'), ctrl.inventoryTruthReconciliation);

module.exports = router;
