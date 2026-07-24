'use strict';

/**
 * P1 #24 — No capability regression for STOCK_COUNT_MANAGE unbundle.
 * Former MANAGE holders keep all create/execute/cancel/recount/submit ops
 * via either legacy MANAGE synonym or the equivalent granular set.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasPermission } = require('../middleware/authorize');
const {
  STOCK_COUNT_MANAGE_EQUIVALENT,
  expandsStockCountPermission,
} = require('../acc-authority/stock-count-permissions');
const {
  BASE_ROLE_PERMISSIONS,
  mergeAuthorityGrants,
  applyRolePermissionPolicy,
} = require('../acc-authority/base-role-permissions');

const OPS = Object.freeze([
  'STOCK_COUNT_CREATE',
  'STOCK_COUNT_EXECUTE',
  'STOCK_COUNT_CANCEL',
  'STOCK_COUNT_RECOUNT',
  'STOCK_COUNT_SUBMIT',
]);

const FORMER_MANAGE_ROLES = Object.freeze([
  'ORG_MANAGER',
  'STOREKEEPER',
  'COST_CONTROL',
  'FINANCE_MANAGER',
]);

test('expandsStockCountPermission — legacy MANAGE satisfies every granular op', () => {
  const perms = ['STOCK_COUNT_MANAGE', 'STOCK_COUNT_VIEW'];
  for (const op of OPS) {
    assert.equal(expandsStockCountPermission(perms, op), true, op);
  }
});

test('expandsStockCountPermission — any granular satisfies legacy MANAGE check', () => {
  for (const op of OPS) {
    assert.equal(expandsStockCountPermission([op], 'STOCK_COUNT_MANAGE'), true, op);
  }
  assert.equal(expandsStockCountPermission(['STOCK_COUNT_VIEW'], 'STOCK_COUNT_MANAGE'), false);
});

test('hasPermission — JWT with only legacy MANAGE still passes granular route checks', () => {
  const user = { role: 'STOREKEEPER', permissions: ['STOCK_COUNT_MANAGE'] };
  for (const op of OPS) {
    assert.equal(hasPermission(user, op), true, op);
  }
  assert.equal(hasPermission(user, 'MANAGE_COUNT'), true);
});

test('hasPermission — JWT with equivalent granular set still passes legacy MANAGE checks', () => {
  const user = { role: 'COST_CONTROL', permissions: [...STOCK_COUNT_MANAGE_EQUIVALENT] };
  assert.equal(hasPermission(user, 'STOCK_COUNT_MANAGE'), true);
  assert.equal(hasPermission(user, 'MANAGE_COUNT'), true);
  for (const op of OPS) {
    assert.equal(hasPermission(user, op), true, op);
  }
});

test('BASE_ROLE_PERMISSIONS — former MANAGE roles keep full equivalent set (no capability loss)', () => {
  const grants = mergeAuthorityGrants(BASE_ROLE_PERMISSIONS);
  for (const role of FORMER_MANAGE_ROLES) {
    const codes = new Set(applyRolePermissionPolicy(role, grants[role] || []));
    assert.equal(codes.has('STOCK_COUNT_MANAGE'), false, `${role} should not keep bundled MANAGE in BASE`);
    for (const op of STOCK_COUNT_MANAGE_EQUIVALENT) {
      assert.equal(codes.has(op), true, `${role} missing ${op}`);
    }
  }
});

test('route guard file — inventoryCount.routes uses granular permissions', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '../routes/inventoryCount.routes.js'),
    'utf8',
  );
  assert.match(source, /requirePermission\('STOCK_COUNT_CREATE'\)/);
  assert.match(source, /requirePermission\('STOCK_COUNT_EXECUTE'\)/);
  assert.match(source, /requirePermission\('STOCK_COUNT_CANCEL'\)/);
  assert.match(source, /requirePermission\('STOCK_COUNT_RECOUNT'\)/);
  assert.match(source, /requirePermission\('STOCK_COUNT_SUBMIT'\)/);
  assert.doesNotMatch(source, /requirePermission\('STOCK_COUNT_MANAGE'\)/);
});
