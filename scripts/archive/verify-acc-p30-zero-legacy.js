'use strict';

/**
 * P30 — ZERO LEGACY acceptance verification.
 * Usage: node scripts/verify-acc-p30-zero-legacy.js
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  getWorkflowEnforcementStatus,
  CUTOVER_MODULE_KEYS,
} = require('../src/services/acc-workflow-runtime.service');
const { isAccZeroLegacyEnabled, isAccWorkflowLegacyRetired } = require('../src/acc-runtime/featureFlags');

const SRC_ROOT = path.resolve(__dirname, '../src');
const LEGACY_FILE = path.join(SRC_ROOT, 'services/acc-workflow-legacy-chains.js');
const RUNTIME_SERVICES = path.join(SRC_ROOT, 'services');

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

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkJsFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function runtimeImportsLegacyChains() {
  const hits = [];
  for (const file of walkJsFiles(RUNTIME_SERVICES)) {
    if (file.includes('acc-workflow-default-chains.js')) continue;
    if (file.includes('acc-workflow-default-seed.service.js')) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('acc-workflow-legacy-chains')) {
      hits.push(path.relative(SRC_ROOT, file));
    }
  }
  return hits;
}

function fileContains(fileRel, needle) {
  const full = path.join(SRC_ROOT, fileRel);
  if (!fs.existsSync(full)) return false;
  return fs.readFileSync(full, 'utf8').includes(needle);
}

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' ACC P30 — ZERO LEGACY Acceptance');
  console.log('══════════════════════════════════════════════════\n');

  process.env.ACC_HARD_CUTOVER = 'true';

  console.log('[1] Legacy engine demolished:');
  assert('legacy-chains.js removed', !fs.existsSync(LEGACY_FILE));
  const legacyImports = runtimeImportsLegacyChains();
  assert(`no runtime service imports legacy-chains (${legacyImports.length})`, legacyImports.length === 0);
  if (legacyImports.length) {
    console.error('    imports:', legacyImports.join(', '));
  }

  console.log('\n[2] P19 runtime config wired:');
  assert('server.js loads ensureAccRuntimeConfigLoaded', fileContains('server.js', 'ensureAccRuntimeConfigLoaded'));
  assert('accSystem runtime-settings GET route', fileContains('routes/accSystem.routes.js', '/runtime-settings'));
  assert('acc-runtime-config.service exists', fs.existsSync(path.join(SRC_ROOT, 'services/acc-runtime-config.service.js')));

  console.log('\n[3] P20/P21 ACC builder extensions:');
  assert('step resolver service', fs.existsSync(path.join(SRC_ROOT, 'services/acc-workflow-step-resolver.service.js')));
  assert('catalog service', fs.existsSync(path.join(SRC_ROOT, 'services/acc-catalog.service.js')));
  assert('config saves permissionId', fileContains('services/acc-workflow-config.service.js', 'permissionId'));

  console.log('\n[4] P22/P23 operational runtime:');
  assert('GRN approval request util usage', fileContains('services/grn.service.js', 'createAccApprovalRequestInTx'));
  assert('GRN dual gate', fileContains('services/grn.service.js', 'assertDualGateApproval'));
  assert('requisition dual gate', fileContains('services/requisition.service.js', 'assertDualGateOnStep'));
  assert('get pass pinned version resolver', fs.existsSync(path.join(SRC_ROOT, 'services/acc-workflow-get-pass.runtime.js')));

  console.log('\n[5] P25 policy runtime stub:');
  assert('acc-policy-runtime.service', fs.existsSync(path.join(SRC_ROOT, 'services/acc-policy-runtime.service.js')));

  console.log('\n[6] P29 runtime status:');
  const status = getWorkflowEnforcementStatus();
  assert('runtime phase P30', status.runtimePhase === 'P30');
  assert('primary source acc-only', status.primarySource === 'acc-only');
  assert('accZeroLegacy flag', isAccZeroLegacyEnabled());
  assert('legacy retired flag', isAccWorkflowLegacyRetired());
  assert('7 cutover modules', status.cutoverModules.length === 7);
  assert('all modules present', [
    'BREAKAGE', 'TRANSFER', 'GET_PASS', 'GRN', 'STOCK_COUNT', 'STOCK_REPORT', 'REQUISITION',
  ].every((k) => CUTOVER_MODULE_KEYS.has(k)));

  console.log('\n[7] P18 regression suite (optional):');
  const p18 = path.resolve(__dirname, 'verify-acc-p18-complete.js');
  if (fs.existsSync(p18)) {
    const result = spawnSync(process.execPath, [p18], { stdio: 'inherit', env: process.env });
    assert('P18 suite PASS', (result.status ?? 1) === 0);
  } else {
    assert('P18 suite script present', false);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P30 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('ACC P30 ZERO LEGACY FAILED');
    process.exit(1);
  }
  console.log('ACC P30 ZERO LEGACY PASS');
  console.log('══════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
