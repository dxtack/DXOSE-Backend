const test = require('node:test');
const assert = require('node:assert/strict');
const {
    toRoleCodeString,
    isKnownRoleCode,
    isAssignableRoleCode,
    SYSTEM_ROLE_CODES,
    PROTECTED_ROLE_CODES,
} = require('./roleCode');
const { normalizeRole } = require('../services/rbac.service');

test('toRoleCodeString uppercases and resolves SECURITY_MANAGER alias', () => {
    assert.equal(toRoleCodeString('storekeeper'), 'STOREKEEPER');
    assert.equal(toRoleCodeString('SECURITY_MANAGER'), 'SECURITY');
});

test('isKnownRoleCode accepts all system role codes', () => {
    for (const code of SYSTEM_ROLE_CODES) {
        assert.equal(isKnownRoleCode(code), true, code);
    }
    assert.equal(isKnownRoleCode('UNKNOWN'), false);
});

test('isAssignableRoleCode excludes SUPER_ADMIN and ADMIN', () => {
    assert.equal(isAssignableRoleCode('STOREKEEPER'), true);
    assert.equal(isAssignableRoleCode('SUPER_ADMIN'), false);
    assert.equal(isAssignableRoleCode('ADMIN'), false);
});

test('PROTECTED_ROLE_CODES matches ACC protected roles', () => {
    assert.deepEqual([...PROTECTED_ROLE_CODES].sort(), ['ORG_MANAGER', 'SUPER_ADMIN']);
});

test('normalizeRole stays aligned with toRoleCodeString', () => {
    assert.equal(normalizeRole('dept_manager'), toRoleCodeString('dept_manager'));
    assert.equal(normalizeRole('SECURITY_MANAGER'), toRoleCodeString('SECURITY_MANAGER'));
});
