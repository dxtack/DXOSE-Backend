'use strict';

/**
 * P9 — ACC Workflow Runtime Foundation verification.
 *
 * Usage:
 *   node scripts/verify-acc-p9-workflow-foundation.js
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const {
  resolveWorkflowForDocument,
  approvalRequestVersionPin,
  listAllModulesRuntimeReadPath,
  getWorkflowEnforcementStatus,
} = require('../src/services/acc-workflow-runtime.service');
const { ensureDefaultPublishedWorkflows } = require('../src/services/acc-workflow-default-seed.service');
const { defaultStepsForModule, DEFAULT_MODULE_CHAINS } = require('../src/services/acc-workflow-default-chains');
const { resolvePublishedWorkflowChain } = require('../src/engines/workflow-resolution.engine');

const prisma = new PrismaClient();

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
  console.log('\nACC P9 — Workflow Runtime Foundation\n');

  console.log('[1] Schema — accWorkflowVersionId on approval_requests:');
  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'approval_requests' AND column_name = 'accWorkflowVersionId'
  `;
  assert('accWorkflowVersionId column exists', Array.isArray(cols) && cols.length > 0);

  console.log('\n[2] Default published workflows for all Builder modules:');
  const seedResults = await ensureDefaultPublishedWorkflows();
  assert('seed ran for all default modules', seedResults.length === Object.keys(DEFAULT_MODULE_CHAINS).length);
  for (const key of Object.keys(DEFAULT_MODULE_CHAINS)) {
    const published = await resolvePublishedWorkflowChain(key, null);
    assert(`${key} has published chain`, !!published?.versionId);
  }

  console.log('\n[3] Runtime read path — all modules:');
  const readPaths = await listAllModulesRuntimeReadPath(null);
  assert('read path returns 7 modules', readPaths.length >= 7);
  for (const row of readPaths) {
    assert(`${row.moduleKey} hasPublishedWorkflow`, row.hasPublishedWorkflow === true);
    assert(`${row.moduleKey} published role codes`, row.runtimeRoleCodes?.length > 0);
  }

  console.log('\n[4] resolveWorkflowForDocument — enforcement ON uses ACC + versionId:');
  const prevEnforce = process.env.ACC_ENFORCE_WORKFLOWS;
  process.env.ACC_ENFORCE_WORKFLOWS = 'true';
  const breakageChain = await resolveWorkflowForDocument({
    moduleKey: 'BREAKAGE',
    tenantId: null,
  });
  assert('enforcement ON → source acc', breakageChain.source === 'acc');
  assert('enforcement ON → versionId set', !!breakageChain.versionId);
  assert('approvalRequestVersionPin returns FK', !!approvalRequestVersionPin(breakageChain).accWorkflowVersionId);

  console.log('\n[5] Cutover modules resolve ACC even when enforcement OFF:');
  process.env.ACC_ENFORCE_WORKFLOWS = 'false';
  process.env.ACC_HARD_CUTOVER = 'false';
  const cutoverChain = await resolveWorkflowForDocument({
    moduleKey: 'BREAKAGE',
    tenantId: null,
  });
  assert('enforcement OFF cutover → source acc', cutoverChain.source === 'acc');
  assert('enforcement OFF cutover → no legacy fallback', cutoverChain.legacyFallback === false);
  assert('enforcement OFF cutover → versionId set', !!cutoverChain.versionId);

  console.log('\n[6] Enforcement status exposes runtime phase:');
  const status = getWorkflowEnforcementStatus({});
  assert('runtimePhase P30', status.runtimePhase === 'P30');
  assert('primarySource acc-only', status.primarySource === 'acc-only');

  process.env.ACC_ENFORCE_WORKFLOWS = prevEnforce ?? '';
  if (prevEnforce === undefined) delete process.env.ACC_ENFORCE_WORKFLOWS;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P9 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC P9 Workflow Runtime Foundation PASS\n');
}

main()
  .catch((e) => {
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
