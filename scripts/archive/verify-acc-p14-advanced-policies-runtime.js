'use strict';

/**
 * P14 — Advanced Policies Runtime verification.
 * Usage: node scripts/verify-acc-p14-advanced-policies-runtime.js
 */

require('dotenv').config();

const {
  getPolicyEnforcementStatus,
  resolveAdvancedPolicyEvaluation,
} = require('../src/services/policy-enforcement-pilot.service');
const { isAccEnforceAdvancedPoliciesEnabled } = require('../src/acc-runtime/featureFlags');

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

async function main() {
  console.log('\nACC P14 — Advanced Policies Runtime\n');

  process.env.ACC_HARD_CUTOVER = 'true';
  delete process.env.ACC_ENFORCE_ADVANCED_POLICIES;

  console.log('[1] Hard cutover enables policy enforcement by default:');
  assert('policies enforced via hard cutover', isAccEnforceAdvancedPoliciesEnabled());

  const status = getPolicyEnforcementStatus({});
  assert('runtime phase P14', status.runtimePhase === 'P14');
  assert('enforcement active', status.enforcement.active === true);
  assert('primary source acc', status.primarySource === 'acc-advanced-policies');

  console.log('\n[2] Policy evaluation path active under enforce:');
  const evalResult = await resolveAdvancedPolicyEvaluation({
    userId: '00000000-0000-0000-0000-000000000001',
    tenantId: null,
    resourceCode: 'BREAKAGE',
    fieldKey: 'unitCost',
  });
  assert('evaluation has enforcement block', !!evalResult.enforcement);
  assert('enforcement mode active', evalResult.enforcement.active === true);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P14 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC P14 Advanced Policies Runtime PASS\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
