const test = require('node:test');
const assert = require('node:assert/strict');
const {
    applyLedgerEntryToBalance,
    balanceMapKey,
    parseBalanceMapKey,
} = require('./ledgerReplay.service');

test('parseBalanceMapKey round-trips UUID keys', () => {
    const itemId = '8bfcf489-60a1-4cf7-be17-63aa1295334f';
    const locationId = '4a439e1f-6691-4c06-9d26-3900297edaff';
    const key = balanceMapKey(itemId, locationId);
    assert.deepEqual(parseBalanceMapKey(key), { itemId, locationId });
});

test('applyLedgerEntryToBalance: GET_PASS_OUT reduces qty (legacy replay semantics)', () => {
    const b = { qty: 49, wac: 53.76, value: 49 * 53.76 };
    applyLedgerEntryToBalance(b, { movementType: 'GET_PASS_OUT', qtyIn: 0, qtyOut: 1, totalValue: 53.76, unitCost: 53.76 });
    assert.equal(b.qty, 48);
});

test('applyLedgerEntryToBalance: LOST reduces qty', () => {
    const b = { qty: 10, wac: 5, value: 50 };
    applyLedgerEntryToBalance(b, { movementType: 'LOST', qtyIn: 0, qtyOut: 2, totalValue: 10, unitCost: 5 });
    assert.equal(b.qty, 8);
});

test('applyLedgerEntryToBalance: COUNT_ADJUSTMENT positive adjusts qty', () => {
    const b = { qty: 10, wac: 5, value: 50 };
    applyLedgerEntryToBalance(b, { movementType: 'COUNT_ADJUSTMENT', qtyIn: 2, qtyOut: 0, totalValue: 10, unitCost: 5 });
    assert.equal(b.qty, 12);
    assert.equal(b.value, 60);
});
