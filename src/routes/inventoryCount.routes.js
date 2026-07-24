const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');
const multer = require('multer');
const path = require('path');
const ctrl = require('../controllers/inventoryCount.controller');

router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only Excel files (.xlsx, .xls) or CSV allowed'));
  },
});

router.post('/sessions', requirePermission('STOCK_COUNT_CREATE'), ctrl.createSession);
router.get('/sessions', requirePermission('STOCK_COUNT_VIEW'), ctrl.listSessions);
// Detail reads: VIEW or approve-only (Breakage/Lost pattern) — list stays VIEW-only.
router.get(
  '/sessions/:id',
  requireAnyPermission('STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT'),
  ctrl.getSession,
);
router.post('/sessions/:id/start', requirePermission('STOCK_COUNT_CREATE'), ctrl.startSession);
router.post('/sessions/:id/cancel', requirePermission('STOCK_COUNT_CANCEL'), ctrl.cancelSession);

router.get(
  '/sessions/:id/export',
  requireAnyPermission('STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT'),
  ctrl.exportExcel,
);
router.get(
  '/sessions/:id/pdf',
  requireAnyPermission('STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT'),
  ctrl.exportPdf,
);
router.post(
  '/sessions/:id/upload',
  requirePermission('STOCK_COUNT_EXECUTE'),
  upload.single('file'),
  ctrl.uploadExcel,
);

router.get(
  '/sessions/:id/sheets/:locationId',
  requireAnyPermission('STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT'),
  ctrl.getCountSheet,
);
router.put(
  '/sessions/:id/sheets/:locationId/items/:itemId',
  requirePermission('STOCK_COUNT_EXECUTE'),
  ctrl.updateCountedQty,
);

router.post('/sessions/:id/submit-counts', requirePermission('STOCK_COUNT_EXECUTE'), ctrl.submitCounts);
router.post('/sessions/:id/recount', requirePermission('STOCK_COUNT_RECOUNT'), ctrl.startRecount);
router.get(
  '/sessions/:id/variances',
  requireAnyPermission('STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT'),
  ctrl.getVariances,
);
router.post('/sessions/:id/submit-approval', requirePermission('STOCK_COUNT_SUBMIT'), ctrl.submitForApproval);
router.post('/sessions/:id/approve', requirePermission('APPROVE_INVENTORY_COUNT'), ctrl.approve);
router.post('/sessions/:id/reject', requirePermission('APPROVE_INVENTORY_COUNT'), ctrl.reject);
router.post('/sessions/:id/send-back', requirePermission('APPROVE_INVENTORY_COUNT'), ctrl.sendBack);

module.exports = router;
