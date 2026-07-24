'use strict';

/**
 * P17 — Legacy Workflow Engine Retirement verification.
 * Usage: node scripts/verify-acc-p17-legacy-retirement.js
 */

require('dotenv').config();

const {
  getWorkflowEnforcementStatus,
  CUTOVER_MODULE_KEYS,
} = require('../src/services/acc-workflow-runtime.service');
const { isAccWorkflowLegacyRetired } = require('../src/acc-runtime/featureFlags');

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
  console.log('\nACC P17 — Legacy Workflow Engine Retirement\n');

  process.env.ACC_HARD_CUTOVER = 'true';

  console.log('[1] Legacy runtime retired under hard cutover:');
  assert('legacy retired flag', isAccWorkflowLegacyRetired());

  const status = getWorkflowEnforcementStatus({});
  assert('runtime phase P30', status.runtimePhase === 'P30');
  assert('primary source acc-only', status.primarySource === 'acc-only');
  assert('legacy retired in status', status.accWorkflowLegacyRetired === true);
  assert('7 cutover modules', status.cutoverModules.length === 7);
  assert('all expected modules cutover', [
    'BREAKAGE', 'TRANSFER', 'GET_PASS', 'GRN', 'STOCK_COUNT', 'STOCK_REPORT', 'REQUISITION',
  ].every((k) => CUTOVER_MODULE_KEYS.has(k)));

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P17 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC P17 Legacy Engine Retirement PASS\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
