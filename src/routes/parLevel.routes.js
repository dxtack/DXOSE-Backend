const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const ctrl = require('../controllers/parLevel.controller');

router.get('/', authenticate, requirePermission('PAR_LEVELS_VIEW'), ctrl.getParLevels);
router.put('/', authenticate, requirePermission('PAR_LEVELS_MANAGE'), ctrl.updateParLevels);
router.get('/low-stock', authenticate, requirePermission('PAR_LEVELS_VIEW'), ctrl.checkLowStock);

module.exports = router;
