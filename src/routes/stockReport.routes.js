const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');

const ctrl = require('../controllers/stockReport.controller');

router.get('/', authenticate, requirePermission('STOCK_COUNT_VIEW'), ctrl.retiredWorkflow);
router.get('/export', authenticate, requirePermission('STOCK_COUNT_VIEW'), ctrl.retiredWorkflow);
router.post('/upload', authenticate, requireAnyPermission('STOCK_COUNT_CREATE', 'STOCK_COUNT_EXECUTE', 'STOCK_COUNT_MANAGE'), ctrl.retiredWorkflow);
router.post('/save', authenticate, requireAnyPermission('STOCK_COUNT_CREATE', 'STOCK_COUNT_EXECUTE', 'STOCK_COUNT_MANAGE'), ctrl.retiredWorkflow);
router.post('/:id/submit', authenticate, requireAnyPermission('STOCK_COUNT_SUBMIT', 'STOCK_COUNT_MANAGE'), ctrl.retiredWorkflow);
router.post('/:id/approve', authenticate, requireAnyPermission('APPROVE_INVENTORY_COUNT', 'STOCK_COUNT_SUBMIT', 'STOCK_COUNT_MANAGE'), ctrl.retiredWorkflow);
router.post('/:id/reject', authenticate, requireAnyPermission('APPROVE_INVENTORY_COUNT', 'STOCK_COUNT_SUBMIT', 'STOCK_COUNT_MANAGE'), ctrl.retiredWorkflow);
router.get('/saved', authenticate, requirePermission('STOCK_COUNT_VIEW'), ctrl.getSavedReports);
router.get('/saved/:id', authenticate, requirePermission('STOCK_COUNT_VIEW'), ctrl.getSavedReportById);
router.get('/saved/:id/pdf', authenticate, requirePermission('STOCK_COUNT_VIEW'), ctrl.exportPdfReport);

module.exports = router;
