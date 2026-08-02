const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertStepRoleMatch,
  assertDualGateApproval,
  userHasPermission,
  userMatchesStepRole,
} = require('../acc-authority/step-permission-enforcement');

const costUserWithPerm = {
  role: 'COST_CONTROL',
  permissions: ['APPROVE_BREAKAGE'],
};

const securityUserNoPerm = {
  role: 'SECURITY',
  permissions: [],
};

const financeUserWithPerm = {
  role: 'FINANCE_MANAGER',
  permissions: ['APPROVE_BREAKAGE'],
};

test('userMatchesStepRole — role match', () => {
  assert.equal(userMatchesStepRole(costUserWithPerm, 'COST_CONTROL'), true);
  assert.equal(userMatchesStepRole(financeUserWithPerm, 'COST_CONTROL'), false);
});

test('Dual gate matrix — match + permission → pass', () => {
  assert.doesNotThrow(() =>
    assertDualGateApproval(costUserWithPerm, 'COST_CONTROL', 'APPROVE_BREAKAGE'),
  );
});

test('Dual gate matrix — match + no permission → deny', () => {
  assert.throws(
    () => assertDualGateApproval(securityUserNoPerm, 'SECURITY', 'APPROVE_BREAKAGE'),
    (err) => err.statusCode === 403,
  );
});

test('Dual gate matrix — wrong step + permission → deny', () => {
  assert.throws(
    () => assertDualGateApproval(financeUserWithPerm, 'COST_CONTROL', 'APPROVE_BREAKAGE'),
    (err) => err.statusCode === 403,
  );
});

test('Dual gate matrix — wrong step + no permission → deny', () => {
  assert.throws(
    () => assertDualGateApproval({ role: 'FINANCE_MANAGER', permissions: [] }, 'COST_CONTROL', 'APPROVE_BREAKAGE'),
    (err) => err.statusCode === 403,
  );
});

test('assertStepRoleMatch — ORG_MANAGER may override wrong step (Manager Override)', () => {
  assert.doesNotThrow(() =>
    assertStepRoleMatch({ role: 'ORG_MANAGER', permissions: ['APPROVE_BREAKAGE'] }, 'COST_CONTROL'),
  );
});

test('assertStepRoleMatch — SUPER_ADMIN may override wrong step', () => {
  assert.doesNotThrow(() =>
    assertStepRoleMatch({ role: 'SUPER_ADMIN', permissions: ['APPROVE_BREAKAGE'] }, 'COST_CONTROL'),
  );
});

test('assertStepRoleMatch — ORG_MANAGER cannot override when allowGovernanceBypass is false', () => {
  assert.throws(
    () =>
      assertStepRoleMatch(
        { role: 'ORG_MANAGER', permissions: ['GET_PASS_APPROVE_EXIT'] },
        'SECURITY',
        undefined,
        { allowGovernanceBypass: false },
      ),
    (err) => err.statusCode === 403,
  );
});

test('Dual gate — ORG_MANAGER override still requires ACC permission', () => {
  assert.throws(
    () => assertDualGateApproval({ role: 'ORG_MANAGER', permissions: [] }, 'COST_CONTROL', 'APPROVE_BREAKAGE'),
    (err) => err.statusCode === 403,
  );
  assert.doesNotThrow(() =>
    assertDualGateApproval(
      { role: 'ORG_MANAGER', permissions: ['APPROVE_BREAKAGE'] },
      'COST_CONTROL',
      'APPROVE_BREAKAGE',
    ),
  );
});

test('userHasPermission — ORG_MANAGER requires explicit ACC permission (no role bypass)', () => {
  assert.equal(userHasPermission({ role: 'ORG_MANAGER', permissions: [] }, 'APPROVE_BREAKAGE'), false);
  assert.equal(
    userHasPermission({ role: 'ORG_MANAGER', permissions: ['APPROVE_BREAKAGE'] }, 'APPROVE_BREAKAGE'),
    true,
  );
});
