const test = require('node:test');
const assert = require('node:assert/strict');
const { isBelowMinimumStock } = require('./parLevel.service');

test('isBelowMinimumStock: false when min is zero', () => {
    assert.equal(isBelowMinimumStock({ qtyOnHand: 0, minQty: 0 }), false);
    assert.equal(isBelowMinimumStock({ qtyOnHand: 5, minQty: 0 }), false);
});

test('isBelowMinimumStock: true when qty below min', () => {
    assert.equal(isBelowMinimumStock({ qtyOnHand: 3, minQty: 10 }), true);
    assert.equal(isBelowMinimumStock({ qtyOnHand: 0, minQty: 5 }), true);
});

test('isBelowMinimumStock: false when qty meets or exceeds min', () => {
    assert.equal(isBelowMinimumStock({ qtyOnHand: 10, minQty: 10 }), false);
    assert.equal(isBelowMinimumStock({ qtyOnHand: 15, minQty: 10 }), false);
});
