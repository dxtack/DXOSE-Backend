'use strict';

/**
 * P12 — Cutover Wave 2 verification (Get Pass, GRN).
 * Usage: node scripts/verify-acc-p12-cutover-wave2.js
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  resolveWorkflowForDocument,
  isCutoverWave2Module,
} = require('../src/services/acc-workflow-runtime.service');
const { ensureDefaultPublishedWorkflows } = require('../src/services/acc-workflow-default-seed.service');
const {
  buildGetPassWorkflowMaps,
  getSubmitInitialWorkflowFromContext,
} = require('../src/services/acc-workflow-get-pass.runtime');

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
  console.log('\nACC P12 — Cutover Wave 2 (Get Pass / GRN)\n');

  await ensureDefaultPublishedWorkflows();

  console.log('[1] Cutover wave2 registry:');
  assert('GET_PASS is wave2', isCutoverWave2Module('GET_PASS'));
  assert('GRN is wave2', isCutoverWave2Module('GRN'));
  assert('wave2 has 2 modules', ['GET_PASS', 'GRN'].filter(isCutoverWave2Module).length === 2);

  console.log('\n[2] Wave2 always resolves ACC (enforcement OFF):');
  process.env.ACC_ENFORCE_WORKFLOWS = 'false';
  process.env.ACC_HARD_CUTOVER = 'false';

  const getPass = await resolveWorkflowForDocument({ moduleKey: 'GET_PASS', tenantId: null });
  assert('GET_PASS source acc', getPass.source === 'acc');
  assert('GET_PASS includes SECURITY step', getPass.roleCodes.includes('SECURITY'));
  assert('GET_PASS versionId pinned', !!getPass.versionId);

  const grn = await resolveWorkflowForDocument({ moduleKey: 'GRN', tenantId: null });
  assert('GRN source acc', grn.source === 'acc');

  console.log('\n[3] Get Pass runtime helper bound to ACC chain:');
  const maps = buildGetPassWorkflowMaps(getPass.steps);
  assert('6 pending statuses', maps.pendingStatuses.length === 6);
  assert('chain includes PENDING_GM before SECURITY', maps.pendingStatuses.includes('PENDING_GM'));
  assert(
    'GM precedes Security',
    maps.pendingStatuses.indexOf('PENDING_GM') < maps.pendingStatuses.indexOf('PENDING_SECURITY'),
  );
  const submit = getSubmitInitialWorkflowFromContext(
    { ...maps, chain: getPass },
    'DEPT_MANAGER',
    'user-1',
  );
  assert('DEPT_MANAGER submit stamps Dept and enters step 2', submit.status === 'PENDING_COST_CONTROL');
  assert('DEPT_MANAGER submit stamps deptApprovedBy', submit.deptApprovedBy === 'user-1');

  const storekeeperSubmit = getSubmitInitialWorkflowFromContext(
    { ...maps, chain: getPass },
    'STOREKEEPER',
    'user-2',
  );
  assert('STOREKEEPER submit enters first step', storekeeperSubmit.status === 'PENDING_DEPT');

  console.log('\n[4] getPass.service.js uses ACC runtime (no hardcoded STEP_ROLE):');
  const src = fs.readFileSync(path.resolve(__dirname, '../src/services/getPass.service.js'), 'utf8');
  assert('no const STEP_ROLE', !/const STEP_ROLE\s*=/.test(src));
  assert('uses resolveGetPassWorkflowContext', src.includes('resolveGetPassWorkflowContext'));
  assert('grn create resolves ACC workflow', fs.readFileSync(
    path.resolve(__dirname, '../src/services/grn.service.js'),
    'utf8',
  ).includes("resolveWorkflowForDocument({ moduleKey: 'GRN'"));

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P12 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC P12 Cutover Wave 2 PASS\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
