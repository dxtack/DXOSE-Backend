const express = require('express');
const tenantController = require('../controllers/tenant.controller');
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission } = require('../middleware/authorize');
const { createTenantValidator, updateTenantLicenseValidator } = require('../utils/validators');

const router = express.Router();

router.use(authenticate);
router.use(requireAnyPermission('TENANT_MANAGE', 'PLATFORM_MANAGE'));

router.get('/', tenantController.listTenants);
router.post('/', createTenantValidator, tenantController.createTenant);
router.get('/:id', tenantController.getTenant);
router.put('/:id', updateTenantLicenseValidator, tenantController.updateTenant);
router.patch('/:id/toggle', tenantController.toggleTenant);
router.patch('/:id/suspend', requireAnyPermission('PLATFORM_MANAGE'), tenantController.suspendTenant);

module.exports = router;
