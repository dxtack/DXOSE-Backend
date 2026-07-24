const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const ledgerController = require('../controllers/ledger.controller');

// All routes require authentication
router.use(authenticate);

// GET /api/ledger — paginated list with filters
router.get('/', requirePermission('LEDGER_VIEW'), ledgerController.getLedgerEntries);

// GET /api/ledger/export — full list with filters for export
router.get('/export', requirePermission('LEDGER_VIEW'), ledgerController.exportLedgerEntries);

// GET /api/ledger/by-document/:documentId — entries for a specific movement document
router.get('/by-document/:documentId', requirePermission('LEDGER_VIEW'), ledgerController.getLedgerByDocument);

module.exports = router;
