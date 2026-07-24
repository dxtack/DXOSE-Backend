'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { userName, num } = require('./evidence-format.util');

function legacyUserName(u) {
    if (!u) return null;
    const t = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    return t || null;
}

function legacyNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

test('userName — null and undefined', () => {
    assert.equal(userName(null), null);
    assert.equal(userName(undefined), null);
});

test('userName — empty names', () => {
    assert.equal(userName({ firstName: '', lastName: '' }), null);
    assert.equal(userName({ firstName: '  ', lastName: '' }), null);
});

test('userName — first/last name composition', () => {
    assert.equal(userName({ firstName: 'Jane', lastName: 'Doe' }), 'Jane Doe');
    assert.equal(userName({ firstName: 'Jane', lastName: '' }), 'Jane');
    assert.equal(userName({ firstName: '', lastName: 'Doe' }), 'Doe');
});

test('num — numeric values and strings', () => {
    assert.equal(num(10), 10);
    assert.equal(num('3.5'), 3.5);
    assert.equal(num('0'), 0);
});

test('num — null, undefined, NaN, Infinity', () => {
    assert.equal(num(null), 0);
    assert.equal(num(undefined), 0);
    assert.equal(num(NaN), 0);
    assert.equal(num(Infinity), 0);
    assert.equal(num(-Infinity), 0);
    assert.equal(num('not-a-number'), 0);
});

test('legacy implementation equivalence — userName vectors', () => {
    const vectors = [
        null,
        undefined,
        {},
        { firstName: '', lastName: '' },
        { firstName: 'A', lastName: 'B' },
        { firstName: 'Only' },
        { lastName: 'Last' },
    ];
    for (const v of vectors) {
        assert.equal(userName(v), legacyUserName(v));
    }
});

test('legacy implementation equivalence — num vectors', () => {
    const vectors = [null, undefined, 0, 1, -2.5, '4', '', NaN, Infinity, 'abc'];
    for (const v of vectors) {
        assert.equal(num(v), legacyNum(v));
    }
});
