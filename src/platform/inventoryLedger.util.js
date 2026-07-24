'use strict';

const { resolvePostingPeriod } = require('./postingPeriod.util');

/**
 * Attach Ch.6 postingDate + assignedPostingPeriod to ledger create payloads.
 */
function withLedgerPostingFields(data, postingDate, timezone) {
    const pd = postingDate || data.postingDate || new Date();
    const { postingDate: resolvedDate, assignedPostingPeriod } = resolvePostingPeriod(pd, timezone);
    return {
        ...data,
        postingDate: resolvedDate,
        assignedPostingPeriod,
    };
}

async function createLedgerEntry(tx, data, postingDate, timezone) {
    return tx.inventoryLedger.create({
        data: withLedgerPostingFields(data, postingDate, timezone),
    });
}

module.exports = {
    withLedgerPostingFields,
    createLedgerEntry,
};
