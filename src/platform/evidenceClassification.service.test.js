'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    EVIDENCE_CLASS,
    isOfficialEvidenceEligible,
    resolveEvidenceClass,
    resolveRequestedEvidenceClass,
    enrichEvidencePack,
    buildEvidenceFilename,
} = require('./evidenceClassification.service');

test('GRN — draft is preview only', () => {
    assert.equal(
        resolveEvidenceClass('GRN', { internalStatus: 'DRAFT', postedAt: null }),
        EVIDENCE_CLASS.PREVIEW,
    );
});

test('GRN — posted is official', () => {
    assert.equal(
        resolveEvidenceClass('GRN', { internalStatus: 'POSTED', postedAt: new Date() }),
        EVIDENCE_CLASS.OFFICIAL,
    );
});

test('Transfer — posted is official', () => {
    assert.equal(
        resolveEvidenceClass('TRANSFER', { internalStatus: 'POSTED', postedAt: new Date() }),
        EVIDENCE_CLASS.OFFICIAL,
    );
});

test('Breakage — approved with postedAt is official', () => {
    assert.equal(
        resolveEvidenceClass('BREAKAGE', { internalStatus: 'APPROVED', postedAt: new Date() }),
        EVIDENCE_CLASS.OFFICIAL,
    );
});

test('Breakage — posted with postedAt is official (final ledger state)', () => {
    assert.equal(
        resolveEvidenceClass('BREAKAGE', { internalStatus: 'POSTED', postedAt: new Date() }),
        EVIDENCE_CLASS.OFFICIAL,
    );
});

test('Lost — posted with postedAt is official', () => {
    assert.equal(
        resolveEvidenceClass('LOST', { internalStatus: 'POSTED', postedAt: new Date() }),
        EVIDENCE_CLASS.OFFICIAL,
    );
});

test('Breakage — rejected stays preview even with postedAt', () => {
    assert.equal(
        isOfficialEvidenceEligible('BREAKAGE', { internalStatus: 'REJECTED', postedAt: new Date() }),
        false,
    );
});

test('blocks client forcing OFFICIAL on draft', () => {
    assert.throws(
        () =>
            resolveRequestedEvidenceClass('GRN', { internalStatus: 'DRAFT', postedAt: null }, 'OFFICIAL'),
        (err) => err.status === 422 && err.code === 'EVIDENCE_OFFICIAL_NOT_ELIGIBLE',
    );
});

test('enrichEvidencePack adds contract fields', () => {
    const pack = enrichEvidencePack(
        {
            header: {
                documentNo: 'GRN-001',
                status: 'DRAFT',
                tenantName: 'Hotel A',
                notes: null,
                postedAt: null,
            },
        },
        'GRN',
    );
    assert.equal(pack.evidenceClass, EVIDENCE_CLASS.PREVIEW);
    assert.equal(pack.isOfficialEvidence, false);
    assert.equal(pack.documentStatus, 'Draft');
    assert.ok(pack.generatedAt);
    assert.ok(pack.disclaimer);
});

test('buildEvidenceFilename suffixes', () => {
    assert.match(buildEvidenceFilename('GRN-Report', 'GRN-1', EVIDENCE_CLASS.PREVIEW), /_PREVIEW\.pdf$/);
    assert.match(buildEvidenceFilename('GRN-Report', 'GRN-1', EVIDENCE_CLASS.OFFICIAL), /_OFFICIAL\.pdf$/);
});
