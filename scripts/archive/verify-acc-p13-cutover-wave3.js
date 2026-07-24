'use strict';

/**
 * P13 — Cutover Wave 3 verification (Stock Count, Stock Report, Requisition).
 * Usage: node scripts/verify-acc-p13-cutover-wave3.js
 */

require('dotenv').config();

const {
  resolveWorkflowForDocument,
  isCutoverWave3Module,
  CUTOVER_WAVE3_MODULE_KEYS,
  CUTOVER_MODULE_KEYS,
} = require('../src/services/acc-workflow-runtime.service');
const { ensureDefaultPublishedWorkflows } = require('../src/services/acc-workflow-default-seed.service');
const prisma = require('../src/config/database');

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
  console.log('\nACC P13 — Cutover Wave 3 (Stock Count / Report / Requisition)\n');

  await ensureDefaultPublishedWorkflows();

  console.log('[1] Cutover wave3 registry:');
  assert('STOCK_COUNT is wave3', isCutoverWave3Module('STOCK_COUNT'));
  assert('STOCK_REPORT is wave3', isCutoverWave3Module('STOCK_REPORT'));
  assert('REQUISITION is wave3', isCutoverWave3Module('REQUISITION'));
  assert('all cutover modules = 7', CUTOVER_MODULE_KEYS.size === 7);

  console.log('\n[2] Wave3 always resolves ACC:');
  process.env.ACC_ENFORCE_WORKFLOWS = 'false';
  process.env.ACC_HARD_CUTOVER = 'false';

  for (const moduleKey of ['STOCK_COUNT', 'STOCK_REPORT', 'REQUISITION']) {
    const resolved = await resolveWorkflowForDocument({ moduleKey, tenantId: null });
    assert(`${moduleKey} source acc`, resolved.source === 'acc');
    assert(`${moduleKey} has versionId`, !!resolved.versionId);
  }

  console.log('\n[3] REQUISITION module registered in ACC Builder:');
  const reqMod = await prisma.accModule.findUnique({ where: { key: 'REQUISITION' } });
  assert('REQUISITION acc module exists', !!reqMod);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P13 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC P13 Cutover Wave 3 PASS\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
