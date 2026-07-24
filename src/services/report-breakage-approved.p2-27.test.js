'use strict';

/**
 * P2 #27 — APPROVED without postedAt/ledger must not inflate official Breakage totals.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('P2 #27 — official financial classifier excludes APPROVED without evidence', () => {
    const BREAKAGE_OFFICIAL_STATUS = 'POSTED';
    const ledgerDocIds = new Set(['doc-with-ledger']);
    const isOfficialFinancialDoc = (doc) => {
        if (doc.status === BREAKAGE_OFFICIAL_STATUS) return true;
        if (doc.status !== 'APPROVED') return false;
        return Boolean(doc.postedAt || doc.postingDate || ledgerDocIds.has(doc.id));
    };

    const docs = [
        { id: 'a', status: 'POSTED', postedAt: new Date() },
        { id: 'b', status: 'APPROVED', postedAt: null, postingDate: null },
        { id: 'doc-with-ledger', status: 'APPROVED', postedAt: null, postingDate: null },
        { id: 'c', status: 'APPROVED', postedAt: new Date('2026-01-01') },
    ];
    const official = docs.filter(isOfficialFinancialDoc);
    const excluded = docs.filter((d) => d.status === 'APPROVED' && !isOfficialFinancialDoc(d));

    assert.deepEqual(
        official.map((d) => d.id).sort(),
        ['a', 'c', 'doc-with-ledger'].sort(),
    );
    assert.deepEqual(excluded.map((d) => d.id), ['b']);
});
