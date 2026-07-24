'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { userDisplayName, toIso } = require('./timeline-present.util');

/** Legacy inline implementations (pre-B3-1) for equivalence vectors. */
function legacyUserDisplayName(user) {
    if (!user) return null;
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return name || null;
}

function legacyToIso(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

test('userDisplayName — null user', () => {
    assert.equal(userDisplayName(null), null);
});

test('userDisplayName — undefined user', () => {
    assert.equal(userDisplayName(undefined), null);
});

test('userDisplayName — empty names', () => {
    assert.equal(userDisplayName({ firstName: '', lastName: '' }), null);
    assert.equal(userDisplayName({ firstName: '  ', lastName: '' }), null);
});

test('userDisplayName — first/last name composition', () => {
    assert.equal(userDisplayName({ firstName: 'Jane', lastName: 'Doe' }), 'Jane Doe');
    assert.equal(userDisplayName({ firstName: 'Jane', lastName: '' }), 'Jane');
    assert.equal(userDisplayName({ firstName: '', lastName: 'Doe' }), 'Doe');
});

test('userDisplayName — displayName field does not override first/last (legacy contract)', () => {
    assert.equal(
        userDisplayName({ firstName: 'A', lastName: 'B', displayName: 'Override' }),
        'A B',
    );
});

test('toIso — null and undefined', () => {
    assert.equal(toIso(null), null);
    assert.equal(toIso(undefined), null);
});

test('toIso — Date instance', () => {
    const d = new Date('2026-06-01T12:00:00.000Z');
    assert.equal(toIso(d), '2026-06-01T12:00:00.000Z');
});

test('toIso — ISO string input', () => {
    assert.equal(toIso('2026-06-01T12:00:00.000Z'), '2026-06-01T12:00:00.000Z');
});

test('toIso — invalid date', () => {
    assert.equal(toIso('not-a-date'), null);
});

test('legacy implementation equivalence — userDisplayName vectors', () => {
    const vectors = [
        null,
        undefined,
        {},
        { firstName: '', lastName: '' },
        { firstName: 'X', lastName: 'Y' },
        { firstName: 'Only' },
        { lastName: 'Last' },
        { firstName: 'A', lastName: 'B', displayName: 'Ignored' },
    ];
    for (const v of vectors) {
        assert.equal(userDisplayName(v), legacyUserDisplayName(v));
    }
});

test('legacy implementation equivalence — toIso vectors', () => {
    const vectors = [
        null,
        undefined,
        '',
        '2026-01-15T08:30:00.000Z',
        new Date('2026-01-15T08:30:00.000Z'),
        'invalid',
        0,
    ];
    for (const v of vectors) {
        assert.equal(toIso(v), legacyToIso(v));
    }
});
