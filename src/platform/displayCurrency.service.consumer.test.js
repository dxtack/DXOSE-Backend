'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/platform/displayCurrency.service.js');

test('displayCurrency.service — imports shared database client', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('displayCurrency.service — exports and signatures unchanged', () => {
    const svc = require('./displayCurrency.service');
    for (const key of [
        'SETTING_KEY',
        'DEFAULT_CURRENCY',
        'PRECISION_BY_CURRENCY',
        'getDisplayCurrency',
        'setDisplayCurrency',
        'formatAmount',
    ]) {
        assert.ok(key in svc, `export ${key} must exist`);
    }
    assert.equal(typeof svc.getDisplayCurrency, 'function');
    assert.equal(typeof svc.setDisplayCurrency, 'function');
    assert.equal(typeof svc.formatAmount, 'function');
    assert.equal(svc.formatAmount(10, 'SAR'), 'SAR 10.00');
});

test('displayCurrency.service — module loads with shared client', () => {
    assert.equal(typeof require('../config/database'), 'object');
    assert.equal(typeof require('./displayCurrency.service').getDisplayCurrency, 'function');
});
