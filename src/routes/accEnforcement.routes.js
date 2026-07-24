'use strict';

/**
 * ACC enforcement pilot — permission (S14), workflow (S15), policies (S16) read-only status.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission } = require('../middleware/authorize');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const ctrl = require('../controllers/accEnforcement.controller');

const canView = requireAnyPermission(
  'SETTINGS_MANAGE',
  'USERS_COMPANY_MANAGE',
  'HOTEL_USERS_MANAGE',
);

router.get('/status', authenticate, canView, ctrl.getStatus);
router.get('/session-evaluation', authenticate, canView, ctrl.getSessionEvaluation);
router.get('/workflow-status', authenticate, canView, ctrl.getWorkflowStatus);
router.get('/workflow-evaluation', authenticate, canView, ctrl.getWorkflowEvaluation);
router.get('/policy-status', authenticate, requireSuperAdmin, ctrl.getPolicyStatus);
router.get('/policy-evaluation', authenticate, requireSuperAdmin, ctrl.getPolicyEvaluation);
router.get('/p2-status', authenticate, canView, ctrl.getP2Status);
router.get('/assignment-coverage', authenticate, canView, ctrl.getAssignmentCoverage);
router.get('/linkage-analysis', authenticate, canView, ctrl.getLinkageAnalysis);
router.get('/route-migration-inventory', authenticate, canView, ctrl.getRouteMigrationInventory);

module.exports = router;
