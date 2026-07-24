const test = require('node:test');
const assert = require('node:assert/strict');
const { inferProbableCause, PROBABLE_CAUSE } = require('./inventoryTruthReconciliation.service');

test('inferProbableCause: blocked qty + positive stock drift → reversible get pass', () => {
    assert.equal(
        inferProbableCause({
            qtyDrift: 1,
            qtyBlocked: 1,
            hasOfficialLedger: true,
            hasNonValuationNet: false,
            itemInactive: false,
            stockQty: 49,
            replayQty: 48,
        }),
        PROBABLE_CAUSE.REVERSIBLE_GET_PASS,
    );
});

test('inferProbableCause: no drift → null', () => {
    assert.equal(
        inferProbableCause({
            qtyDrift: 0,
            qtyBlocked: 0,
            hasOfficialLedger: true,
            hasNonValuationNet: false,
            itemInactive: false,
            stockQty: 10,
            replayQty: 10,
        }),
        null,
    );
});

test('inferProbableCause: stock without official ledger', () => {
    assert.equal(
        inferProbableCause({
            qtyDrift: 5,
            qtyBlocked: 0,
            hasOfficialLedger: false,
            hasNonValuationNet: false,
            itemInactive: false,
            stockQty: 5,
            replayQty: 0,
        }),
        PROBABLE_CAUSE.MISSING_OFFICIAL_LEDGER,
    );
});
