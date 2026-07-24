'use strict';

/**
 * P10 — Dual-Gate Enforcement verification.
 * Usage: node scripts/verify-acc-p10-dual-gate.js
 */

require('dotenv').config();

const {
  assertDualGateApproval,
  assertStepRoleMatch,
  userHasPermission,
} = require('../src/acc-authority/step-permission-enforcement');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function assertThrows(label, fn) {
  try {
    fn();
    console.error(`  ✗ FAIL: ${label} (expected throw)`);
    failed++;
  } catch (err) {
    assert(label, err.statusCode === 403);
  }
}

function main() {
  console.log('\nACC P10 — Dual-Gate Enforcement\n');

  const costWithPerm = { role: 'COST_CONTROL', permissions: ['APPROVE_BREAKAGE'] };
  const securityNoPerm = { role: 'SECURITY', permissions: [] };
  const financeWithPerm = { role: 'FINANCE_MANAGER', permissions: ['APPROVE_BREAKAGE'] };

  console.log('[1] Permission gate:');
  assert('COST_CONTROL + APPROVE_BREAKAGE', userHasPermission(costWithPerm, 'APPROVE_BREAKAGE'));
  assert('SECURITY without permission denied', !userHasPermission(securityNoPerm, 'APPROVE_BREAKAGE'));

  console.log('\n[2] Step role gate (no ORG bypass on wrong step):');
  assertThrows('ORG_MANAGER wrong step denied', () =>
    assertStepRoleMatch({ role: 'ORG_MANAGER' }, 'COST_CONTROL'),
  );

  console.log('\n[3] Dual gate 2×2 matrix:');
  try {
    assertDualGateApproval(costWithPerm, 'COST_CONTROL', 'APPROVE_BREAKAGE');
    assert('match + permission → pass', true);
  } catch {
    assert('match + permission → pass', false);
  }

  assertThrows('match + no permission → deny', () =>
    assertDualGateApproval(
      { role: 'UNKNOWN_ROLE_X', permissions: [] },
      'UNKNOWN_ROLE_X',
      'APPROVE_BREAKAGE',
    ),
  );
  assertThrows('wrong step + permission → deny', () =>
    assertDualGateApproval(financeWithPerm, 'COST_CONTROL', 'APPROVE_BREAKAGE'),
  );
  assertThrows('wrong step + no permission → deny', () =>
    assertDualGateApproval({ role: 'FINANCE_MANAGER', permissions: [] }, 'COST_CONTROL', 'APPROVE_BREAKAGE'),
  );

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P10 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC P10 Dual-Gate Enforcement PASS\n');
}

main();
