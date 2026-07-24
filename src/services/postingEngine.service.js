/**
 * Incremental centralized posting facade (Phase C1).
 * Domain services delegate inventory/accounting posting here; implementation
 * migrates gradually from posting.service.js without a big-bang rewrite.
 */
const postingService = require('./posting.service');
const { VALUATION_BASIS } = require('./valuationGovernance.service');
const governedMovement = require('./postingGovernedMovement.service');
const governedGrn = require('./postingGovernedGrn.service');
const governedTransfer = require('./postingGovernedTransfer.service');
const governedGetPass = require('./postingGovernedGetPass.service');

const POSTING_REFERENCE = Object.freeze({
    COUNT_SESSION: 'COUNT_SESSION',
    STOCK_COUNT_LEGACY: 'STOCK_COUNT',
    STOCK_REPORT: 'STOCK_REPORT',
    MOVEMENT: 'MOVEMENT',
    GET_PASS_RETURN: 'GET_PASS_RETURN',
    GRN: 'GRN',
    TRANSFER: 'TRANSFER',
    GET_PASS: 'GET_PASS',
});

module.exports = {
    VALUATION_BASIS,
    POSTING_REFERENCE,

    /** Canonical inventory count post (referenceType COUNT_SESSION). */
    postInventoryCountSession: (sessionId, tenantId, userId) =>
        postingService.postInventoryCountSession(sessionId, tenantId, userId),

    /** @deprecated Legacy stock-count lines post — blocked at route when sunset env set. */
    postStockCountLegacy: (sessionId, tenantId, userId) =>
        postingService.postStockCount(sessionId, tenantId, userId),

    postMovementDocument: (documentId, tenantId, userId, db, expectedVersion, opts) =>
        postingService.postDocument(documentId, tenantId, userId, db, expectedVersion, opts),

    postStockReport: (reportId, tenantId, userId) =>
        postingService.postStockReport(reportId, tenantId, userId),

    /** Governed breakage final post (stock + ledger paired). */
    postBreakageMovementInTransaction: (tx, doc, tenantId, userId, opts) =>
        governedMovement.postBreakageMovementInTransaction(tx, doc, tenantId, userId, opts),

    /** Governed lost final post (stock + ledger paired). */
    postLostMovementInTransaction: (tx, doc, userId, opts) =>
        governedMovement.postLostMovementInTransaction(tx, doc, userId, opts),

    postGrnInTransaction: (tx, grn, userId, opts) => governedGrn.postGrnInTransaction(tx, grn, userId, opts),

    postTransferInTransaction: (tx, trf, userId, receivedLines, opts) =>
        governedTransfer.postTransferInTransaction(tx, trf, userId, receivedLines, opts),
    postTransferReceiveInTransaction: (tx, trf, userId, receivedLines, opts) =>
        governedTransfer.postTransferInTransaction(tx, trf, userId, receivedLines, opts),

    ...governedGetPass,
};
