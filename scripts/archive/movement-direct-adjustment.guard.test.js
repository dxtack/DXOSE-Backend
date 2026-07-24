'use strict';

/**
 * Run: node --test scripts/movement-direct-adjustment.guard.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    assertCreateDraftOrigin,
    assertDirectApiCreateType,
    resolveMovementMutationPermission,
    DIRECT_ADJUSTMENT_TYPE_ONLY,
    MOVEMENT_DRAFT_ORIGIN_REQUIRED,
    MOVEMENT_DRAFT_ORIGIN_INVALID,
} = require('../src/services/movementDirectAdjustment.guard');

test('assertCreateDraftOrigin rejects missing options (fail-closed)', () => {
    assert.throws(
        () => assertCreateDraftOrigin(undefined),
        (err) => err.statusCode === 500 && err.code === MOVEMENT_DRAFT_ORIGIN_REQUIRED,
    );
    assert.throws(
        () => assertCreateDraftOrigin({}),
        (err) => err.statusCode === 500 && err.code === MOVEMENT_DRAFT_ORIGIN_REQUIRED,
    );
});

test('assertCreateDraftOrigin rejects invalid origin values', () => {
    assert.throws(
        () => assertCreateDraftOrigin({ origin: '' }),
        (err) => err.code === MOVEMENT_DRAFT_ORIGIN_REQUIRED,
    );
    assert.throws(
        () => assertCreateDraftOrigin({ origin: 'bogus' }),
        (err) => err.code === MOVEMENT_DRAFT_ORIGIN_INVALID,
    );
});

test('assertCreateDraftOrigin accepts DIRECT_API and INTERNAL', () => {
    assert.equal(assertCreateDraftOrigin({ origin: 'DIRECT_API' }), 'DIRECT_API');
    assert.equal(assertCreateDraftOrigin({ origin: 'internal' }), 'INTERNAL');
});

test('assertDirectApiCreateType accepts ADJUSTMENT only', () => {
    assert.equal(assertDirectApiCreateType('ADJUSTMENT'), 'ADJUSTMENT');
    assert.equal(assertDirectApiCreateType('adjustment'), 'ADJUSTMENT');
});

test('assertDirectApiCreateType rejects non-ADJUSTMENT before normalize', () => {
    for (const bad of ['ISSUE', 'RECEIVE', '', null, undefined]) {
        assert.throws(
            () => assertDirectApiCreateType(bad),
            (err) => err.statusCode === 422 && err.code === DIRECT_ADJUSTMENT_TYPE_ONLY,
        );
    }
});

test('resolveMovementMutationPermission maps by document type', () => {
    assert.equal(resolveMovementMutationPermission('ADJUSTMENT'), 'ADJUSTMENT_CREATE');
    assert.equal(resolveMovementMutationPermission('adjustment'), 'ADJUSTMENT_CREATE');
    assert.equal(resolveMovementMutationPermission('OPENING_BALANCE'), 'MOVEMENT_CREATE');
    assert.equal(resolveMovementMutationPermission('BREAKAGE'), 'MOVEMENT_CREATE');
});
