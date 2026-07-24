'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/services/supplier.service.js');

test('supplier.service — imports shared database client', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('supplier.service — exports unchanged', () => {
    const supplierService = require('./supplier.service');
    for (const key of [
        'createSupplier',
        'getSuppliers',
        'getSupplierById',
        'updateSupplier',
        'toggleSupplierStatus',
    ]) {
        assert.equal(typeof supplierService[key], 'function', `export ${key} must remain a function`);
    }
});

test('supplier.service — module loads with shared client', () => {
    assert.equal(typeof require('../config/database'), 'object');
    assert.equal(typeof require('./supplier.service').getSuppliers, 'function');
});
