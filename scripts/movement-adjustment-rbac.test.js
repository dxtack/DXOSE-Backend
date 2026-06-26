'use strict';

/**
 * ACC matrix: ADJUSTMENT_CREATE is FINANCE_MANAGER only in canonical grants.
 * Run: node --test scripts/movement-adjustment-rbac.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    BASE_ROLE_PERMISSIONS,
    buildRolePermissionMap,
} = require('../src/acc-authority/base-role-permissions');
const { AUTHORITY_ROLE_GRANTS } = require('../src/acc-authority/catalog.constitution');

const PERM = 'ADJUSTMENT_CREATE';
const FM = 'FINANCE_MANAGER';

test('BASE grants exclude ADJUSTMENT_CREATE from ORG_MANAGER and STOREKEEPER', () => {
    assert.ok(!BASE_ROLE_PERMISSIONS.ORG_MANAGER.includes(PERM));
    assert.ok(!BASE_ROLE_PERMISSIONS.STOREKEEPER.includes(PERM));
    assert.ok(BASE_ROLE_PERMISSIONS[FM].includes(PERM));
});

test('AUTHORITY_ROLE_GRANTS limits ADJUSTMENT_CREATE to FINANCE_MANAGER', () => {
    const grants = AUTHORITY_ROLE_GRANTS[PERM];
    assert.ok(grants);
    assert.equal(grants[FM], true);
    assert.equal(grants.ORG_MANAGER, undefined);
    assert.equal(grants.STOREKEEPER, undefined);
});

test('merged role map grants ADJUSTMENT_CREATE only to FINANCE_MANAGER among operational roles', () => {
    const map = buildRolePermissionMap();
    const holders = Object.entries(map)
        .filter(([, codes]) => codes.includes(PERM))
        .map(([role]) => role)
        .sort();
    assert.deepEqual(holders, [FM]);
});
