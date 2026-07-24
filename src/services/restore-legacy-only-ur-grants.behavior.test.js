'use strict';

/**
 * Proof + post-restore checks for four hard-lost UR grants.
 * Uses requirePermission middleware (403 vs next) — same gate routes use.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requirePermission, hasPermission } = require('../middleware/authorize');
const {
  BASE_ROLE_PERMISSIONS,
  mergeAuthorityGrants,
  applyRolePermissionPolicy,
} = require('../acc-authority/base-role-permissions');
const { ACTIONS, PERMISSION_MAP } = require('../acc-authority/catalog.constitution');

const CASES = Object.freeze([
  { role: 'ORG_MANAGER', permission: 'APPROVE_INVENTORY_COUNT' },
  { role: 'ORG_MANAGER', permission: 'ADJUSTMENT_CREATE' },
  { role: 'GENERAL_MANAGER', permission: 'GET_PASS_CONFIRM_DESTINATION' },
  { role: 'SUPER_ADMIN', permission: 'BREAKAGE_VIEW' },
]);

function invokeRequirePermission(permission, user) {
  const mw = requirePermission(permission);
  return new Promise((resolve) => {
    const req = { user };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body, allowed: false });
        return this;
      },
    };
    mw(req, res, () => resolve({ statusCode: 200, allowed: true }));
  });
}

test('catalog already defines actions used by the four restore permissions', () => {
  const needed = new Set(
    CASES.map((c) => PERMISSION_MAP.find((p) => p.legacyCode === c.permission)?.action).filter(Boolean),
  );
  for (const action of needed) {
    assert.ok(
      ACTIONS.some((a) => a.code === action),
      `missing action ${action}`,
    );
  }
});

test('official matrix seals the four role×permission grants', () => {
  const grants = mergeAuthorityGrants(BASE_ROLE_PERMISSIONS);
  for (const { role, permission } of CASES) {
    const codes = new Set(applyRolePermissionPolicy(role, grants[role] || []));
    assert.equal(codes.has(permission), true, `${role} missing ${permission} in official matrix`);
  }
});

test('requirePermission — without grant returns 403 (characterization of the loss)', async () => {
  for (const { role, permission } of CASES) {
    const user = { role, permissions: ['VIEW_DASHBOARD'] }; // UR-shaped JWT missing the target
    const outcome = await invokeRequirePermission(permission, user);
    assert.equal(outcome.allowed, false, `${role}/${permission} should deny`);
    assert.equal(outcome.statusCode, 403, `${role}/${permission} should be 403`);
    assert.equal(hasPermission(user, permission), false);
  }
});

test('requirePermission — with sealed grant allows (post-restore JWT shape)', async () => {
  for (const { role, permission } of CASES) {
    const user = { role, permissions: [permission, 'VIEW_DASHBOARD'] };
    const outcome = await invokeRequirePermission(permission, user);
    assert.equal(outcome.allowed, true, `${role}/${permission} should allow`);
    assert.equal(outcome.statusCode, 200, `${role}/${permission} should pass`);
    assert.equal(hasPermission(user, permission), true);
  }
});
