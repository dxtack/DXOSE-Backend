'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/services/consumption.service.js');

test('consumption.service — imports shared database client', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('consumption.service — exports unchanged', () => {
    const svc = require('./consumption.service');
    assert.equal(typeof svc.getConsumptionReport, 'function');
    assert.equal(typeof svc.exportToExcel, 'function');
});

test('consumption.service — report query methods unchanged', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /inventoryLedger\.findMany/);
    assert.match(src, /location\.findMany/);
    assert.match(src, /item\.findMany/);
});

test('consumption.service — Excel export entry point unchanged', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /XLSX\.utils\.json_to_sheet/);
    assert.match(src, /XLSX\.write/);
});
