'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/services/grnEvidence.service.js');

test('grnEvidence.service — imports shared database client', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('grnEvidence.service — imports shared evidence-format util', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/utils\/evidence-format\.util'\)/);
    assert.doesNotMatch(src, /const userName\s*=/);
    assert.doesNotMatch(src, /const num\s*=/);
});

test('grnEvidence.service — exports unchanged', () => {
    const svc = require('./grnEvidence.service');
    assert.equal(typeof svc.getGrnEvidence, 'function');
    assert.equal(typeof svc.assertGrnEvidenceEligible, 'function');
});

test('grnEvidence.service — lazy consumer remains compatible', () => {
    const grnServiceSrc = fs.readFileSync(
        path.join(backendRoot, 'src/services/grn.service.js'),
        'utf8',
    );
    assert.match(grnServiceSrc, /require\('\.\/grnEvidence\.service'\)\.getGrnEvidence/);
});
