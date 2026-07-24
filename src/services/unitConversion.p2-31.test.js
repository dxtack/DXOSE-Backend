'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveQtyInBaseUnit,
    assertClientBaseQtyMatches,
} = require('./unitConversion.util');

test('P2 #31 — BASE / omitted unitId stays 1:1', async () => {
    const db = {
        itemUnit: {
            findFirst: async () => ({ unitType: 'BASE', conversionRate: 1, unitId: 'u-base' }),
        },
    };
    const a = await resolveQtyInBaseUnit({
        tenantId: 't1',
        itemId: 'i1',
        qty: 5,
        unitId: null,
        db,
    });
    assert.equal(a.qtyInBaseUnit, 5);
    assert.equal(a.conversionRate, 1);

    const b = await resolveQtyInBaseUnit({
        tenantId: 't1',
        itemId: 'i1',
        qty: 5,
        unitId: 'u-base',
        db,
    });
    assert.equal(b.qtyInBaseUnit, 5);
});

test('P2 #31 — non-base unit applies approved integer conversion (not 1:1)', async () => {
    const db = {
        itemUnit: {
            findFirst: async () => ({ unitType: 'ISSUE', conversionRate: 12, unitId: 'u-box' }),
        },
    };
    const resolved = await resolveQtyInBaseUnit({
        tenantId: 't1',
        itemId: 'i1',
        qty: 2,
        unitId: 'u-box',
        db,
    });
    assert.equal(resolved.qtyInBaseUnit, 24);
    assert.equal(resolved.conversionRate, 12);
});

test('P2 #31 — rejects unapproved unitId and mismatched client qtyInBaseUnit', async () => {
    const db = {
        itemUnit: { findFirst: async () => null },
    };
    await assert.rejects(
        () =>
            resolveQtyInBaseUnit({
                tenantId: 't1',
                itemId: 'i1',
                qty: 1,
                unitId: 'unknown',
                db,
            }),
        (err) => err.code === 'ITEM_UNIT_NOT_APPROVED',
    );

    assert.throws(
        () => assertClientBaseQtyMatches(24, 2, { itemId: 'i1' }),
        (err) => err.code === 'QTY_IN_BASE_MISMATCH',
    );
});

test('P2 #31 — API surface accepts unitId; qtyUnitId is alias-only on writers', () => {
    const fs = require('fs');
    const path = require('path');
    const movement = fs.readFileSync(path.join(__dirname, 'movement.service.js'), 'utf8');
    const util = fs.readFileSync(path.join(__dirname, 'unitConversion.util.js'), 'utf8');
    assert.match(util, /resolveQtyInBaseUnit/);
    assert.match(movement, /resolveQtyInBaseUnit/);
    assert.match(movement, /line\.unitId \|\| line\.qtyUnitId/);
});
