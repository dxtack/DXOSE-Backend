'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    EXPORT_COST_VIEW_PERMISSION,
    userMayViewSensitiveExport,
    maskExportRow,
    maskExportRows,
    SENSITIVE_FIELD_KEYS,
} = require('./export-mask.service');

const sampleRow = {
    itemName: 'Widget',
    qty: 10,
    unitCost: 12.5,
    totalValue: 125,
};

test('userMayViewSensitiveExport — LEDGER_VIEW grants unmask', () => {
    const user = { role: 'FINANCE_MANAGER', permissions: ['REPORTS_EXPORT', 'LEDGER_VIEW'] };
    assert.equal(userMayViewSensitiveExport(user), true);
});

test('userMayViewSensitiveExport — REPORTS_EXPORT alone does not unmask', () => {
    const user = { role: 'FINANCE_MANAGER', permissions: ['REPORTS_EXPORT'] };
    assert.equal(userMayViewSensitiveExport(user), false);
});

test('userMayViewSensitiveExport — SUPER_ADMIN without LEDGER_VIEW is denied', () => {
    const user = { role: 'SUPER_ADMIN', permissions: ['REPORTS_EXPORT', 'SUPER_ADMIN_PORTAL_ACCESS'] };
    assert.equal(userMayViewSensitiveExport(user), false);
});

test('userMayViewSensitiveExport — ADMIN without LEDGER_VIEW is denied', () => {
    const user = { role: 'ADMIN', permissions: ['REPORTS_EXPORT'] };
    assert.equal(userMayViewSensitiveExport(user), false);
});

test('userMayViewSensitiveExport — ORG_MANAGER without LEDGER_VIEW is denied', () => {
    const user = { role: 'ORG_MANAGER', permissions: ['VIEW_DASHBOARD', 'REPORTS_EXPORT'] };
    assert.equal(userMayViewSensitiveExport(user), false);
});

test('userMayViewSensitiveExport — empty permissions fail closed', () => {
    assert.equal(userMayViewSensitiveExport({ role: 'FINANCE_MANAGER', permissions: [] }), false);
    assert.equal(userMayViewSensitiveExport(null), false);
});

test('maskExportRows — omitted user leaves values unmasked (caller must pass req.user)', () => {
    const rows = [sampleRow];
    const out = maskExportRows(rows, undefined);
    assert.equal(out, rows);
    assert.equal(out[0].unitCost, 12.5);
    assert.equal(out[0].totalValue, 125);
});

test('maskExportRow — masks sensitive fields when no cost permission', () => {
    const user = { role: 'STOREKEEPER', permissions: ['REPORTS_EXPORT'] };
    const out = maskExportRow(sampleRow, user);
    assert.equal(out.itemName, 'Widget');
    assert.equal(out.qty, 10);
    assert.equal(out.unitCost, '***');
    assert.equal(out.totalValue, '***');
});

test('maskExportRow — preserves values when LEDGER_VIEW present', () => {
    const user = { role: 'COST_CONTROL', permissions: ['REPORTS_EXPORT', 'LEDGER_VIEW'] };
    const out = maskExportRow(sampleRow, user);
    assert.equal(out.unitCost, 12.5);
    assert.equal(out.totalValue, 125);
});

test('maskExportRows — returns same array reference when unmasked', () => {
    const rows = [sampleRow];
    const user = { role: 'AUDITOR', permissions: ['LEDGER_VIEW'] };
    assert.equal(maskExportRows(rows, user), rows);
});

test('maskExportRows — masks all rows when denied', () => {
    const rows = [sampleRow, { ...sampleRow, unitCost: 99 }];
    const user = { role: 'DEPT_MANAGER', permissions: ['REPORTS_EXPORT'] };
    const out = maskExportRows(rows, user);
    assert.notEqual(out, rows);
    assert.equal(out.length, 2);
    assert.equal(out[0].unitCost, '***');
    assert.equal(out[1].unitCost, '***');
});

test('EXPORT_COST_VIEW_PERMISSION is LEDGER_VIEW', () => {
    assert.equal(EXPORT_COST_VIEW_PERMISSION, 'LEDGER_VIEW');
});

test('SENSITIVE_FIELD_KEYS covers expected financial columns', () => {
    for (const key of ['unitCost', 'wacAtPosting', 'netVarianceValue']) {
        assert.ok(SENSITIVE_FIELD_KEYS.has(key), key);
    }
});
