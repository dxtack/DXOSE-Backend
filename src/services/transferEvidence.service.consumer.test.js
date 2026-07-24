'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/services/transferEvidence.service.js');

test('transferEvidence.service — imports shared database client', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('transferEvidence.service — imports shared evidence-format util', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/utils\/evidence-format\.util'\)/);
    assert.doesNotMatch(src, /const userName\s*=/);
    assert.doesNotMatch(src, /const num\s*=/);
});

test('transferEvidence.service — exports unchanged', () => {
    const svc = require('./transferEvidence.service');
    assert.equal(typeof svc.getTransferEvidence, 'function');
    assert.equal(typeof svc.assertTransferEvidenceEligible, 'function');
});

test('transferEvidence.service — lazy consumer remains compatible', () => {
    const transferServiceSrc = fs.readFileSync(
        path.join(backendRoot, 'src/services/transfer.service.js'),
        'utf8',
    );
    assert.match(transferServiceSrc, /require\('\.\/transferEvidence\.service'\)\.getTransferEvidence/);
});
