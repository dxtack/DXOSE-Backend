const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission } = require('../middleware/authorize');
const controller = require('../controllers/lostFound.controller');

const router = express.Router();

router.use(authenticate);

router.post(
    '/',
    requireAnyPermission('BREAKAGE_CREATE', 'CREATE_LOST', 'CREATE_BREAKAGE'),
    controller.createLostFoundItem,
);
router.get(
    '/',
    requireAnyPermission('LOST_ITEMS_VIEW', 'VIEW_INVENTORY', 'READ_LOST'),
    controller.listLostFoundItems,
);
router.patch(
    '/:id/return',
    requireAnyPermission('APPROVE_LOST', 'BREAKAGE_APPROVE'),
    controller.markLostFoundItemReturned,
);

module.exports = router;
