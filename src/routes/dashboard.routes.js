const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const ctrl = require('../controllers/dashboard.controller');

router.use(authenticate);

router.get('/summary', requirePermission('DASHBOARD_VIEW'), ctrl.getSummary);
router.get('/charts', requirePermission('DASHBOARD_VIEW'), ctrl.getCharts);
router.get(
    '/organization-summary',
    requireAnyPermission('USERS_COMPANY_MANAGE', 'SETTINGS_MANAGE', 'PLATFORM_MANAGE'),
    ctrl.getOrganizationSummary,
);

module.exports = router;
