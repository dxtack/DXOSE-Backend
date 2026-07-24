'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/services/stockCountEvidence.service.js');

test('stockCountEvidence.service — imports shared database client', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('stockCountEvidence.service — exports unchanged', () => {
    const svc = require('./stockCountEvidence.service');
    assert.equal(typeof svc.buildEvidencePack, 'function');
    assert.equal(typeof svc._buildEvidenceRows, 'function');
    assert.equal(typeof svc._pickLatestCountedCells, 'function');
    assert.equal(typeof svc._sessionHasAnyCountedCells, 'function');
});

test('stockCountEvidence.service — query method names unchanged', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /stockCountLocationQty\.findMany/);
    assert.match(src, /inventoryLedger\.findMany/);
});

test('stockCountEvidence.service — controller import remains compatible', () => {
    const controllerSrc = fs.readFileSync(
        path.join(backendRoot, 'src/controllers/stockCount.controller.js'),
        'utf8',
    );
    assert.match(controllerSrc, /require\('\.\.\/services\/stockCountEvidence\.service'\)/);
    assert.match(controllerSrc, /stockCountEvidence\.buildEvidencePack/);
});
