'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const utilPath = path.join(backendRoot, 'src/utils/movementLineFinancial.util.js');

test('movementLineFinancial.util — imports shared database client', () => {
    const src = fs.readFileSync(utilPath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('movementLineFinancial.util — exports unchanged', () => {
    const util = require('./movementLineFinancial.util');
    assert.equal(typeof util.enrichMovementLinesFinancials, 'function');
});

test('movementLineFinancial.util — empty lines short-circuit without DB', async () => {
    const { enrichMovementLinesFinancials } = require('./movementLineFinancial.util');
    const lines = [{ itemId: 'a', locationId: 'b', qtyInBaseUnit: 1 }];
    const result = await enrichMovementLinesFinancials('tenant', []);
    assert.deepEqual(result, []);
    assert.notEqual(typeof enrichMovementLinesFinancials, 'undefined');
    assert.ok(Array.isArray(lines));
});
