'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission } = require('../middleware/authorize');

const PIPELINE_ACCESS = [
    'WORKFLOW_PIPELINE_VIEW',
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'APPROVE_BREAKAGE',
    'APPROVE_LOST',
    'APPROVE_INVENTORY_COUNT',
    'GET_PASS_APPROVE_FINAL',
    'GET_PASS_APPROVE_EXIT',
    'GET_PASS_CONFIRM_DESTINATION',
    'INVENTORY_VIEW',
    'TRANSFER_VIEW',
    'TRANSFER_CREATE',
    'GET_PASS_VIEW',
    'GRN_VIEW',
    'STOCK_COUNT_VIEW',
    'STOCK_COUNT_CREATE',
    'STOCK_COUNT_EXECUTE',
    'STOCK_COUNT_CANCEL',
    'STOCK_COUNT_RECOUNT',
    'STOCK_COUNT_SUBMIT',
    'BREAKAGE_VIEW',
    'LOST_ITEMS_VIEW',
];
const ctrl = require('../controllers/workflow-pipeline.controller');

router.use(authenticate);

router.get('/', requireAnyPermission(...PIPELINE_ACCESS), ctrl.getPipeline);
router.get('/summary', requireAnyPermission(...PIPELINE_ACCESS), ctrl.getSummary);
router.get('/alerts', requireAnyPermission(...PIPELINE_ACCESS), ctrl.getAlerts);
router.post('/alerts/mark-read', requireAnyPermission(...PIPELINE_ACCESS), ctrl.markAlertsRead);

module.exports = router;
