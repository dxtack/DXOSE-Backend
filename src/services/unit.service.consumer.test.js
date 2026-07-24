'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/services/unit.service.js');

test('unit.service — imports shared database client', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('unit.service — exports unchanged', () => {
    const unitService = require('./unit.service');
    for (const key of ['createUnit', 'getUnits', 'getUnitById', 'updateUnit']) {
        assert.equal(typeof unitService[key], 'function', `export ${key} must remain a function`);
    }
});

test('unit.service — module loads with shared client', () => {
    assert.equal(typeof require('../config/database'), 'object');
    assert.equal(typeof require('./unit.service').getUnits, 'function');
});
