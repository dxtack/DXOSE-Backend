'use strict';

/**
 * P15 — Scope & Assignments Runtime verification.
 * Usage: node scripts/verify-acc-p15-scope-assignments-runtime.js
 */

require('dotenv').config();

const { isAccScopeAssignmentsPrimary, getAccScopeRuntimeStatus } = require('../src/services/acc-scope-runtime.service');
const fs = require('node:fs');
const path = require('node:path');

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
  console.log('\nACC P15 — Scope & Assignments Runtime\n');

  process.env.ACC_HARD_CUTOVER = 'true';
  delete process.env.USE_NEW_POLICY_ENGINE;

  console.log('[1] Hard cutover makes ACC assignments primary for scope:');
  assert('assignments primary', isAccScopeAssignmentsPrimary());

  const status = getAccScopeRuntimeStatus();
  assert('runtime phase P26', status.runtimePhase === 'P26');
  assert('legacy scope fallback retired', status.legacyScopeFallbackRetired === true);

  console.log('\n[2] scope.service.js — ACC assignments only:');
  const src = fs.readFileSync(path.resolve(__dirname, '../src/services/scope/scope.service.js'), 'utf8');
  assert('uses assignment resolver', src.includes('_resolveUserScopeFromAssignments'));
  assert('no legacy scope path', !src.includes('_resolveUserScopeLegacy'));

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P15 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC P15 Scope & Assignments Runtime PASS\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
