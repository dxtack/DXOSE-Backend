'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { computeEffectiveRuntimePermissionCodes } = require('./effective-runtime-permissions.util');

const backendRoot = path.join(__dirname, '..', '..');
const userRightsPath = path.join(backendRoot, 'src/controllers/userRights.controller.js');
const diagnosticsPath = path.join(backendRoot, 'src/services/acc-system-diagnostics.service.js');

function readSource(relFromBackend) {
    return fs.readFileSync(path.join(backendRoot, relFromBackend), 'utf8');
}

test('User Rights call-site contract — imports shared utility, no local calculator', () => {
    const src = readSource('src/controllers/userRights.controller.js');
    assert.match(src, /require\('\.\.\/acc-authority\/effective-runtime-permissions\.util'\)/);
    assert.match(src, /computeEffectiveRuntimePermissionCodes/);
    assert.doesNotMatch(src, /function _normalizeRoleCode/);
    assert.doesNotMatch(src, /function _effectiveRuntimeCodes/);
    assert.doesNotMatch(src, /const _normalizeRoleCode/);
    assert.doesNotMatch(src, /const _effectiveRuntimeCodes/);
    assert.doesNotMatch(src, /applyRolePermissionPolicy/);
});

test('ACC Diagnostics call-site contract — imports shared utility, no local calculator', () => {
    const src = readSource('src/services/acc-system-diagnostics.service.js');
    assert.match(src, /require\('\.\.\/acc-authority\/effective-runtime-permissions\.util'\)/);
    assert.match(src, /computeEffectiveRuntimePermissionCodes/);
    assert.doesNotMatch(src, /function _normalizeRoleCode/);
    assert.doesNotMatch(src, /function _effectiveRuntimeCodes/);
    assert.doesNotMatch(src, /applyRolePermissionPolicy/);
});

test('User Rights argument order — role.code, urLegacyCodes, legacyPermissionCodes', () => {
    const src = readSource('src/controllers/userRights.controller.js');
    assert.match(
        src,
        /computeEffectiveRuntimePermissionCodes\(role\.code,\s*urLegacyCodes,\s*legacyPermissionCodes\)/,
    );
});

test('ACC Diagnostics argument order and effectiveRuntimeCount from result.length', () => {
    const src = readSource('src/services/acc-system-diagnostics.service.js');
    assert.match(
        src,
        /computeEffectiveRuntimePermissionCodes\(role\.code,\s*urLegacyCodes,\s*legacyPermissionCodes\)/,
    );
    assert.match(src, /effectiveRuntimeCount:\s*effectiveRuntimeCodes\.length/);
});

test('Call-site runtime contract — shared util matches User Rights drift payload shape', () => {
    const urLegacyCodes = ['GRN_VIEW', 'GRN_MANAGE'];
    const legacyPermissionCodes = ['ISSUE_VIEW'];
    const effectiveRuntimeCodes = computeEffectiveRuntimePermissionCodes(
        'FINANCE_MANAGER',
        urLegacyCodes,
        legacyPermissionCodes,
    );
    assert.ok(Array.isArray(effectiveRuntimeCodes));
    assert.equal(effectiveRuntimeCodes.length, effectiveRuntimeCodes.length);
    assert.deepEqual(effectiveRuntimeCodes, ['GRN_MANAGE', 'GRN_VIEW']);
});

test('Call-site runtime contract — diagnostics count equals returned array length', () => {
    const effectiveRuntimeCodes = computeEffectiveRuntimePermissionCodes(
        'DEPT_MANAGER',
        ['ISSUE_VIEW', 'GRN_VIEW'],
        ['TRANSFER_VIEW'],
    );
    const effectiveRuntimeCount = effectiveRuntimeCodes.length;
    assert.equal(effectiveRuntimeCount, 1);
    assert.deepEqual(effectiveRuntimeCodes, ['ISSUE_VIEW']);
});
