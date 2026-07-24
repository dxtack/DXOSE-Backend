'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeAdjustmentDirection,
    signedQtyForAdjustment,
    directionFromSignedQty,
    displayQtyFromSigned,
    resolveLineAdjustmentDirection,
} = require('./adjustmentDirection.util');

test('normalizeAdjustmentDirection accepts INCREASE and DECREASE', () => {
    assert.equal(normalizeAdjustmentDirection('increase'), 'INCREASE');
    assert.equal(normalizeAdjustmentDirection('DECREASE'), 'DECREASE');
});

test('normalizeAdjustmentDirection rejects invalid values', () => {
    assert.throws(() => normalizeAdjustmentDirection(''), /INCREASE or DECREASE/);
    assert.throws(() => normalizeAdjustmentDirection('UP'), /INCREASE or DECREASE/);
});

test('signedQtyForAdjustment keeps positive qty for INCREASE and negates for DECREASE', () => {
    assert.equal(signedQtyForAdjustment(5, 'INCREASE'), 5);
    assert.equal(signedQtyForAdjustment(5, 'DECREASE'), -5);
});

test('signedQtyForAdjustment rejects zero and negative input', () => {
    assert.throws(() => signedQtyForAdjustment(0, 'INCREASE'), /greater than zero/);
    assert.throws(() => signedQtyForAdjustment(-2, 'DECREASE'), /greater than zero/);
});

test('directionFromSignedQty and displayQtyFromSigned round-trip', () => {
    assert.equal(directionFromSignedQty(4), 'INCREASE');
    assert.equal(directionFromSignedQty(-4), 'DECREASE');
    assert.equal(displayQtyFromSigned(-4), 4);
});

test('resolveLineAdjustmentDirection prefers line direction then document direction', () => {
    assert.equal(
        resolveLineAdjustmentDirection({ adjustmentDirection: 'INCREASE' }, { direction: 'DECREASE' }),
        'DECREASE',
    );
    assert.equal(resolveLineAdjustmentDirection({ adjustmentDirection: 'DECREASE' }, {}), 'DECREASE');
});
