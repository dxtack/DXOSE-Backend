'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { applyRolePermissionPolicy } = require('./base-role-permissions');
const { computeEffectiveRuntimePermissionCodes } = require('./effective-runtime-permissions.util');

/** Legacy inline oracle — must stay equivalent to pre-Wave-1 call sites. */
function legacyEffectiveRuntimeCodes(roleCode, urLegacyCodes, legacyPermissionCodes) {
    const normalize = (role = '') => {
        const normalized = String(role).toUpperCase();
        return normalized === 'SECURITY_MANAGER' ? 'SECURITY' : normalized;
    };
    const rc = normalize(roleCode);
    const source = urLegacyCodes.length > 0 ? urLegacyCodes : legacyPermissionCodes;
    return applyRolePermissionPolicy(rc, source).sort();
}

test('UR precedence — non-empty urLegacyCodes wins over legacy', () => {
    const ur = ['GRN_VIEW', 'GRN_MANAGE'];
    const legacy = ['ISSUE_VIEW', 'TRANSFER_VIEW'];
    const result = computeEffectiveRuntimePermissionCodes('FINANCE_MANAGER', ur, legacy);
    assert.deepEqual(result, legacyEffectiveRuntimeCodes('FINANCE_MANAGER', ur, legacy));
    assert.deepEqual(result, ['GRN_MANAGE', 'GRN_VIEW']);
});

test('Legacy fallback — empty urLegacyCodes uses legacyPermissionCodes', () => {
    const legacy = ['ISSUE_VIEW', 'TRANSFER_VIEW'];
    const result = computeEffectiveRuntimePermissionCodes('FINANCE_MANAGER', [], legacy);
    assert.deepEqual(result, legacyEffectiveRuntimeCodes('FINANCE_MANAGER', [], legacy));
    assert.deepEqual(result, ['ISSUE_VIEW', 'TRANSFER_VIEW']);
});

test('DEPT_MANAGER stripping — stripped codes removed from effective runtime', () => {
    const ur = ['ISSUE_VIEW', 'GRN_VIEW', 'MOVEMENTS_VIEW', 'LEDGER_VIEW'];
    const result = computeEffectiveRuntimePermissionCodes('DEPT_MANAGER', ur, []);
    assert.deepEqual(result, legacyEffectiveRuntimeCodes('DEPT_MANAGER', ur, []));
    assert.deepEqual(result, ['ISSUE_VIEW']);
    assert.ok(!result.includes('GRN_VIEW'));
});

test('SECURITY_MANAGER alias — normalized to SECURITY policy path', () => {
    const ur = ['GET_PASS_VIEW', 'GET_PASS_APPROVE_FINAL'];
    const result = computeEffectiveRuntimePermissionCodes('SECURITY_MANAGER', ur, []);
    assert.deepEqual(result, legacyEffectiveRuntimeCodes('SECURITY_MANAGER', ur, []));
    assert.deepEqual(result, ['GET_PASS_APPROVE_FINAL', 'GET_PASS_VIEW']);
});

test('Sorted output — ascending lexicographic order', () => {
    const ur = ['ZETA_PERM', 'ALPHA_PERM', 'MID_PERM'];
    const result = computeEffectiveRuntimePermissionCodes('AUDITOR', ur, []);
    assert.deepEqual(result, ['ALPHA_PERM', 'MID_PERM', 'ZETA_PERM']);
});

test('Empty arrays — both sources empty yields empty effective runtime', () => {
    const result = computeEffectiveRuntimePermissionCodes('AUDITOR', [], []);
    assert.deepEqual(result, []);
    assert.equal(result.length, 0);
});

test('Duplicate preservation — duplicates are not deduplicated', () => {
    const ur = ['GRN_VIEW', 'GRN_VIEW', 'ISSUE_VIEW'];
    const result = computeEffectiveRuntimePermissionCodes('STOREKEEPER', ur, []);
    assert.deepEqual(result, legacyEffectiveRuntimeCodes('STOREKEEPER', ur, []));
    assert.equal(result.length, 3);
    assert.equal(result.filter((c) => c === 'GRN_VIEW').length, 2);
});

test('In-place sorting behavior — mutates selected source array reference', () => {
    const ur = ['Z_PERM', 'A_PERM'];
    const legacy = ['M_PERM', 'B_PERM'];
    const urCopy = [...ur];
    const legacyCopy = [...legacy];

    computeEffectiveRuntimePermissionCodes('AUDITOR', ur, legacy);
    assert.deepEqual(ur, ['A_PERM', 'Z_PERM'], 'ur source sorted in place when UR wins');
    assert.deepEqual(legacy, legacyCopy, 'legacy untouched when UR wins');

    const ur2 = ['Z_PERM', 'A_PERM'];
    const legacy2 = ['M_PERM', 'B_PERM'];
    computeEffectiveRuntimePermissionCodes('AUDITOR', [], legacy2);
    assert.deepEqual(ur2, urCopy, 'ur untouched when empty');
    assert.deepEqual(legacy2, ['B_PERM', 'M_PERM'], 'legacy source sorted in place when legacy wins');
});

test('Legacy oracle equivalence — matrix of role and source combinations', () => {
    const cases = [
        ['FINANCE_MANAGER', ['GRN_MANAGE', 'GRN_VIEW'], ['ISSUE_VIEW']],
        ['DEPT_MANAGER', ['GRN_VIEW', 'ISSUE_VIEW'], ['TRANSFER_VIEW']],
        ['SECURITY', ['GET_PASS_VIEW'], ['GET_PASS_VIEW', 'GET_PASS_APPROVE_FINAL']],
        ['ORG_MANAGER', [], ['TENANT_MANAGE', 'ACCESS_CONTROL_VIEW']],
        ['COST_CONTROL', ['APPROVE_BREAKAGE'], []],
    ];
    for (const [role, ur, legacy] of cases) {
        assert.deepEqual(
            computeEffectiveRuntimePermissionCodes(role, ur, legacy),
            legacyEffectiveRuntimeCodes(role, ur, legacy),
            `oracle mismatch for role=${role}`,
        );
    }
});

test('Normalizer equivalence matrix', () => {
    const ur = ['ALPHA_PERM'];
    const legacy = ['BETA_PERM'];
    const matrix = [
        undefined,
        '',
        null,
        42,
        'security_manager',
        'SECURITY_MANAGER',
        'security',
        'finance_manager',
        'FiNaNcE_Manager',
    ];
    for (const roleInput of matrix) {
        assert.deepEqual(
            computeEffectiveRuntimePermissionCodes(roleInput, ur, legacy),
            legacyEffectiveRuntimeCodes(roleInput, ur, legacy),
            `normalizer mismatch for role=${String(roleInput)}`,
        );
    }
});
