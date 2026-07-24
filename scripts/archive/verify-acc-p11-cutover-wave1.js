'use strict';

/**
 * P11 — Cutover Wave 1 verification (Breakage, Lost, Transfer).
 * Usage: node scripts/verify-acc-p11-cutover-wave1.js
 */

require('dotenv').config();

const {
  resolveWorkflowForDocument,
  isCutoverWave1Module,
} = require('../src/services/acc-workflow-runtime.service');
const { ensureDefaultPublishedWorkflows } = require('../src/services/acc-workflow-default-seed.service');
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
  console.log('\nACC P11 — Cutover Wave 1 (Breakage / Transfer)\n');

  await ensureDefaultPublishedWorkflows();

  console.log('[1] Cutover module registry:');
  assert('BREAKAGE is wave1', isCutoverWave1Module('BREAKAGE'));
  assert('TRANSFER is wave1', isCutoverWave1Module('TRANSFER'));
  assert('GRN not wave1 yet', !isCutoverWave1Module('GRN'));
  assert('wave1 has 2 modules', ['BREAKAGE', 'TRANSFER'].filter(isCutoverWave1Module).length === 2);

  console.log('\n[2] Wave1 always resolves ACC (enforcement OFF):');
  process.env.ACC_ENFORCE_WORKFLOWS = 'false';
  process.env.ACC_HARD_CUTOVER = 'false';
  const breakage = await resolveWorkflowForDocument({ moduleKey: 'BREAKAGE', tenantId: null });
  assert('BREAKAGE source acc', breakage.source === 'acc');
  assert('BREAKAGE versionId pinned', !!breakage.versionId);
  assert('BREAKAGE no legacy fallback', breakage.legacyFallback === false);

  const transfer = await resolveWorkflowForDocument({ moduleKey: 'TRANSFER', tenantId: null });
  assert('TRANSFER source acc', transfer.source === 'acc');

  console.log('\n[3] Hardcoded APPROVAL_CHAIN removed from breakage.service.js:');
  const breakageSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/services/breakage.service.js'),
    'utf8',
  );
  assert('no legacy-chains import', !breakageSrc.includes('acc-workflow-legacy-chains'));

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P11 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC P11 Cutover Wave 1 PASS\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
