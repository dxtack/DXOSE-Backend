'use strict';

const { resolvePostingPeriod } = require('./postingPeriod.util');

/**
 * Attach Ch.6 postingDate + assignedPostingPeriod to ledger create payloads.
 */
function withLedgerPostingFields(data, postingDate) {
    const pd = postingDate || data.postingDate || new Date();
    const { postingDate: resolvedDate, assignedPostingPeriod } = resolvePostingPeriod(pd);
    return {
        ...data,
        postingDate: resolvedDate,
        assignedPostingPeriod,
    };
}

async function createLedgerEntry(tx, data, postingDate) {
    return tx.inventoryLedger.create({
        data: withLedgerPostingFields(data, postingDate),
    });
}

module.exports = {
    withLedgerPostingFields,
    createLedgerEntry,
};
