const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission, requirePermission } = require('../middleware/authorize');
const ctrl = require('../controllers/periodClose.controller');

const VIEW = requireAnyPermission(
    'PERIOD_CLOSE_EXECUTE',
    'PERIOD_RECLOSE_EXECUTE',
    'PERIOD_CLOSE_RESOLUTION',
    'PERIOD_REOPEN_EXECUTE',
);

router.get('/', authenticate, VIEW, ctrl.getPeriods);
router.get('/resolution', authenticate, requirePermission('PERIOD_CLOSE_RESOLUTION'), ctrl.getResolutionWorkspace);
router.get('/opening-continuity', authenticate, VIEW, ctrl.getOpeningContinuityReport);
router.get('/:id/snapshots', authenticate, VIEW, ctrl.snapshotHistory);
router.get('/:id', authenticate, VIEW, ctrl.getPeriodById);

router.post('/open', authenticate, requirePermission('PERIOD_CLOSE_EXECUTE'), ctrl.openPeriod);
router.post('/start-close', authenticate, requirePermission('PERIOD_CLOSE_EXECUTE'), ctrl.startClose);
router.post('/cancel-close', authenticate, requirePermission('PERIOD_CLOSE_RESOLUTION'), ctrl.cancelClose);
router.post('/close', authenticate, requireAnyPermission('PERIOD_CLOSE_EXECUTE', 'PERIOD_RECLOSE_EXECUTE'), ctrl.closePeriod);

router.post(
    '/:id/reopen',
    authenticate,
    requirePermission('PERIOD_REOPEN_EXECUTE'),
    ctrl.reopenPeriod,
);

router.post(
    '/resolution/post',
    authenticate,
    requirePermission('PERIOD_CLOSE_DOCUMENT_POST'),
    ctrl.postResolutionDocument,
);
router.post(
    '/resolution/delete',
    authenticate,
    requirePermission('PERIOD_CLOSE_DOCUMENT_DELETE'),
    ctrl.deleteResolutionDocument,
);
router.post(
    '/resolution/get-pass/carry-forward',
    authenticate,
    requirePermission('PERIOD_CLOSE_GET_PASS_CARRY_FORWARD'),
    ctrl.carryForwardGetPass,
);

module.exports = router;
