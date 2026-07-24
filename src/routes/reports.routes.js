const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const summaryReportController = require('../controllers/summaryReport.controller');
const { authenticate: protect } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

router.use(protect);

// Summary Inventory Report (PDF before generic GET /:id)
router.get('/summary-inventory/pdf', requirePermission('REPORTS_EXPORT'), summaryReportController.exportSummaryPdf);
router.get('/summary-inventory/excel', requirePermission('REPORTS_EXPORT'), summaryReportController.exportSummaryExcel);
router.get('/summary-inventory', requirePermission('REPORTS_VIEW'), summaryReportController.getSummary);

// Valuation Report — As-of-Date (specific paths before /:id)
router.get('/valuation/pdf',   requirePermission('REPORTS_EXPORT'), reportController.exportValuationPdf);
router.get('/valuation/excel', requirePermission('REPORTS_EXPORT'), reportController.exportValuationExcel);
router.get('/valuation',       requirePermission('REPORTS_VIEW'),   reportController.getValuationReport);

// Operational analytics (specific paths before /:id)
router.get('/analytics/:analyticsType/pdf', requirePermission('REPORTS_EXPORT'), reportController.exportAnalyticsPdf);
router.get('/analytics/:analyticsType/excel', requirePermission('REPORTS_EXPORT'), reportController.exportAnalyticsExcel);
router.get('/analytics/:analyticsType', requirePermission('REPORTS_VIEW'), reportController.getAnalytics);

router.post('/generate', requirePermission('REPORTS_VIEW'), reportController.generateReport);
router.get('/history', requirePermission('REPORTS_VIEW'), reportController.getHistory);
router.get('/:id', requirePermission('REPORTS_VIEW'), reportController.getReportById);
router.get('/:id/pdf', requirePermission('REPORTS_EXPORT'), reportController.exportPdf);
router.get('/:id/excel', requirePermission('REPORTS_EXPORT'), reportController.exportExcel);

module.exports = router;
