'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyLedgerEntryToBalance } = require('./ledgerReplay.service');

/**
 * Simulates stock + official-ledger replay at each lifecycle stage for reversible get pass.
 * Mirrors postingGovernedGetPass semantics after Finding #26 Phase 1.
 */
function simulateLifecycle(stages) {
    let qtyOnHand = 10;
    let qtyBlocked = 0;
    const replay = { qty: 10, wac: 5, value: 50 };

    const applyOfficial = (entry) => {
        if (entry.affectsValuation === false) return;
        applyLedgerEntryToBalance(replay, entry);
    };

    const snapshot = () => ({
        qtyOnHand,
        qtyBlocked,
        available: qtyOnHand - qtyBlocked,
        replayQty: replay.qty,
        replayValue: replay.value,
    });

    const results = [snapshot()];

    for (const stage of stages) {
        switch (stage.type) {
            case 'CHECKOUT':
                qtyBlocked += stage.qty;
                applyOfficial({
                    movementType: 'GET_PASS_OUT',
                    affectsValuation: false,
                    qtyIn: 0,
                    qtyOut: stage.qty,
                    totalValue: stage.qty * replay.wac,
                    unitCost: replay.wac,
                });
                break;
            case 'RETURN_GOOD':
                qtyBlocked -= stage.qty;
                applyOfficial({
                    movementType: 'RETURN',
                    affectsValuation: false,
                    qtyIn: stage.qty,
                    qtyOut: 0,
                    totalValue: stage.qty * replay.wac,
                    unitCost: replay.wac,
                });
                break;
            case 'RETURN_DAMAGED':
            case 'RETURN_LOST': {
                const nonGood = stage.qty;
                qtyBlocked -= stage.qty;
                qtyOnHand -= nonGood;
                applyOfficial({
                    movementType: stage.type === 'RETURN_DAMAGED' ? 'BREAKAGE' : 'LOST',
                    affectsValuation: true,
                    qtyIn: 0,
                    qtyOut: nonGood,
                    totalValue: nonGood * replay.wac,
                    unitCost: replay.wac,
                });
                break;
            }
            default:
                throw new Error(`Unknown stage ${stage.type}`);
        }
        results.push(snapshot());
    }

    return results;
}

test('reversible get pass lifecycle: stock replay aligned at every stage', () => {
    const stages = [
        { type: 'CHECKOUT', qty: 2 },
        { type: 'RETURN_GOOD', qty: 1 },
        { type: 'RETURN_DAMAGED', qty: 1 },
    ];
    const results = simulateLifecycle(stages);

    assert.equal(results[0].qtyOnHand, 10);
    assert.equal(results[0].replayQty, 10);

    // After checkout 2
    assert.equal(results[1].qtyOnHand, 10);
    assert.equal(results[1].qtyBlocked, 2);
    assert.equal(results[1].available, 8);
    assert.equal(results[1].replayQty, 10);

    // After good return 1
    assert.equal(results[2].qtyBlocked, 1);
    assert.equal(results[2].available, 9);
    assert.equal(results[2].replayQty, 10);

    // After damaged 1
    assert.equal(results[3].qtyOnHand, 9);
    assert.equal(results[3].qtyBlocked, 0);
    assert.equal(results[3].replayQty, 9);
    assert.equal(results[3].qtyOnHand, results[3].replayQty);
});

test('full lifecycle OUT → partial good → lost → final good → force-close good', () => {
    const stages = [
        { type: 'CHECKOUT', qty: 3 },
        { type: 'RETURN_GOOD', qty: 1 },
        { type: 'RETURN_LOST', qty: 1 },
        { type: 'RETURN_GOOD', qty: 1 },
    ];
    const results = simulateLifecycle(stages);
    const final = results[results.length - 1];

    assert.equal(final.qtyOnHand, 9);
    assert.equal(final.qtyBlocked, 0);
    assert.equal(final.available, 9);
    assert.equal(final.qtyOnHand, final.replayQty);
});

test('legacy valuation GET_PASS_OUT would drift (documents pre-fix behavior)', () => {
    const replay = { qty: 10, wac: 5, value: 50 };
    applyLedgerEntryToBalance(replay, {
        movementType: 'GET_PASS_OUT',
        qtyIn: 0,
        qtyOut: 2,
        totalValue: 10,
        unitCost: 5,
    });
    assert.equal(replay.qty, 8);
    assert.notEqual(replay.qty, 10);
});
