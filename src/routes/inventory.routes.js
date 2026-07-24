const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const inventoryController = require('../controllers/inventory.controller');

const router = express.Router();

router.get(
    '/items-by-locations/:locationId',
    authenticate,
    requirePermission('GRN_MANAGE'),
    inventoryController.getItemsByLocation,
);

router.get(
    '/items-by-locations/:locationId/select',
    authenticate,
    inventoryController.getItemsByLocationSelect,
);

router.patch(
    '/status',
    authenticate,
    requirePermission('SETTINGS_MANAGE'),
    inventoryController.patchInventoryStatus,
);

module.exports = router;
