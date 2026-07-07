const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireAnyPermission, requirePermission } = require('../middleware/authorize');
const ctrl = require('../controllers/periodClose.controller');

const VIEW = requireAnyPermission(
    'PERIOD_CLOSE_EXECUTE',
    'PERIOD_CLOSE_RESOLUTION',
    'PERIOD_REOPEN_EXECUTE',
    'PERIOD_CLOSE_MANAGE',
    'INTEGRITY_VIEW',
);

router.get('/', authenticate, VIEW, ctrl.getPeriods);
router.get('/:id/snapshots', authenticate, VIEW, ctrl.snapshotHistory);
router.get('/:id', authenticate, VIEW, ctrl.getPeriodById);

router.post('/start-close', authenticate, requireAnyPermission('PERIOD_CLOSE_EXECUTE', 'PERIOD_CLOSE_MANAGE'), ctrl.startClose);
router.post('/cancel-close', authenticate, requireAnyPermission('PERIOD_CLOSE_RESOLUTION', 'PERIOD_CLOSE_MANAGE'), ctrl.cancelClose);
router.post('/close', authenticate, requireAnyPermission('PERIOD_CLOSE_EXECUTE', 'PERIOD_RECLOSE_EXECUTE', 'PERIOD_CLOSE_MANAGE'), ctrl.closePeriod);

router.post(
    '/:id/reopen',
    authenticate,
    requireAnyPermission('PERIOD_REOPEN_EXECUTE', 'PERIOD_CLOSE_MANAGE'),
    ctrl.reopenPeriod,
);

module.exports = router;
