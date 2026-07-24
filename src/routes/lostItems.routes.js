const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/lostItems.controller');
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission, requirePermission } = require('../middleware/authorize');

router.use(authenticate);
// Same privilege as breakage create (BREAKAGE_CREATE / CREATE_LOST / CREATE_BREAKAGE aliases).
router.post('/', requirePermission('BREAKAGE_CREATE'), ctrl.createLost);
router.get(
    '/',
    requireAnyPermission('LOST_ITEMS_VIEW', 'VIEW_INVENTORY', 'READ_LOST', 'APPROVE_LOST'),
    ctrl.listLostItems,
);
router.get(
    '/:id/evidence/pdf',
    requireAnyPermission('LOST_ITEMS_VIEW', 'VIEW_INVENTORY', 'READ_LOST', 'APPROVE_LOST'),
    ctrl.getEvidencePDF,
);
router.get(
    '/:id/evidence',
    requireAnyPermission('LOST_ITEMS_VIEW', 'VIEW_INVENTORY', 'READ_LOST', 'APPROVE_LOST'),
    ctrl.getEvidence,
);
router.get(
    '/:id',
    requireAnyPermission('LOST_ITEMS_VIEW', 'VIEW_INVENTORY', 'READ_LOST', 'APPROVE_LOST'),
    ctrl.getLostItem,
);
router.put('/:id', requirePermission('BREAKAGE_CREATE'), ctrl.updateLost);
router.post('/:id/submit', requirePermission('BREAKAGE_CREATE'), ctrl.submitLost);
router.post('/:id/approve', requirePermission('APPROVE_LOST'), ctrl.approveLostApprovalStep);
router.post('/:id/reject', requireAnyPermission('BREAKAGE_CREATE', 'APPROVE_LOST'), ctrl.rejectLostApprovalStep);
router.post('/:id/send-back', requirePermission('APPROVE_LOST'), ctrl.sendBackLostApprovalStep);

module.exports = router;
