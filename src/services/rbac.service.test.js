const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveMembershipBusinessRole, normalizeRole } = require('./rbac.service');

test('resolveMembershipBusinessRole: promotes legacy branch ADMIN when user is org manager elsewhere', () => {
    assert.equal(resolveMembershipBusinessRole('ADMIN', true), 'ORG_MANAGER');
});

test('resolveMembershipBusinessRole: keeps standalone branch ADMIN when not org manager', () => {
    assert.equal(resolveMembershipBusinessRole('ADMIN', false), 'ADMIN');
});

test('resolveMembershipBusinessRole: keeps explicit ORG_MANAGER on membership row', () => {
    assert.equal(resolveMembershipBusinessRole('ORG_MANAGER', false), 'ORG_MANAGER');
});

test('resolveMembershipBusinessRole: keeps SUPER_ADMIN', () => {
    assert.equal(resolveMembershipBusinessRole('SUPER_ADMIN', true), 'SUPER_ADMIN');
});

test('resolveMembershipBusinessRole: promotes any lower role when org manager elsewhere', () => {
    assert.equal(resolveMembershipBusinessRole('STOREKEEPER', true), 'ORG_MANAGER');
});

test('resolveMembershipBusinessRole: normalizes SECURITY_MANAGER alias', () => {
    assert.equal(resolveMembershipBusinessRole('SECURITY_MANAGER', false), 'SECURITY');
    assert.equal(normalizeRole('SECURITY_MANAGER'), 'SECURITY');
});

test('resolveMembershipBusinessRole: returns null for empty membership role without org manager', () => {
    assert.equal(resolveMembershipBusinessRole(null, false), null);
    assert.equal(resolveMembershipBusinessRole('', false), null);
});
