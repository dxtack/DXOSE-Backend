const express = require('express');
const router = express.Router();
const settingController = require('../controllers/setting.controller');
const { authenticate: protect } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

// All settings routes require authentication
router.use(protect);

// OB eligibility check — any authenticated user can check
router.get('/ob-eligible', settingController.getOBEligibility);

// Full inventory / OB status (snapshot, locks) — any authenticated user
router.get('/inventory-status', settingController.getInventoryStatus);

// Active tenant settings (currency + symbol) — any authenticated user
router.get('/tenant', settingController.getTenantSettings);

// OB lock / enable — tenant-level admins can toggle for their own tenant
router.post('/ob-lock', requirePermission('SETTINGS_MANAGE'), settingController.lockOB);
router.post('/ob-enable', requirePermission('SETTINGS_MANAGE'), settingController.enableOB);
router.post('/ob-finalize', requirePermission('SETTINGS_MANAGE'), settingController.finalizeOpeningBalance);

// Generic setting CRUD
router.route('/:key')
    .get(settingController.getSetting)
    .put(requirePermission('MANAGE_SETTINGS'), settingController.setSetting);

module.exports = router;
