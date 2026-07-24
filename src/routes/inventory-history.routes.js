'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const inventoryHistoryController = require('../controllers/inventory-history.controller');

router.use(authenticate);
router.get('/', requirePermission('INVENTORY_HISTORY_VIEW'), inventoryHistoryController.getInventoryHistory);

module.exports = router;
