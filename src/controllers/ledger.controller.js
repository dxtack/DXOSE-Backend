const ledgerService = require('../services/ledger.service');
const { success } = require('../utils/response');

/**
 * @desc    Get paginated ledger entries with filters
 * @route   GET /api/ledger
 * @access  Private
 */
const getLedgerEntries = async (req, res, next) => {
    try {
        const result = await ledgerService.getLedgerEntries(req.user.tenantId, req.query, req.user);
        const { entries, total, scope, scopeApplied, scopeLabel, reason } = result;
        return success(res, entries, 'Ledger entries fetched successfully', 200, {
            total,
            skip: parseInt(req.query.skip) || 0,
            take: parseInt(req.query.take) || 50,
            scope,
            scopeApplied,
            scopeLabel,
            reason,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Export ledger entries with filters
 * @route   GET /api/ledger/export
 * @access  Private
 */
const exportLedgerEntries = async (req, res, next) => {
    try {
        const entries = await ledgerService.exportLedgerEntries(req.user.tenantId, req.query, req.user);
        return success(res, entries, 'Ledger entries exported successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get ledger entries for a specific document
 * @route   GET /api/ledger/by-document/:documentId
 * @access  Private
 */
const getLedgerByDocument = async (req, res, next) => {
    try {
        const entries = await ledgerService.getLedgerByDocument(
            req.params.documentId,
            req.user.tenantId,
            req.user,
            { documentNo: req.query.documentNo },
        );
        return success(res, entries, 'Document ledger entries fetched successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getLedgerEntries,
    exportLedgerEntries,
    getLedgerByDocument
};
