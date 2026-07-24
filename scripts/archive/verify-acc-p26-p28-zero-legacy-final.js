'use strict';

/**
 * P26–P28 — Final ZERO LEGACY verification (scope, FE, pipeline/PDF).
 * Usage: node scripts/verify-acc-p26-p28-zero-legacy-final.js
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BACKEND_SRC = path.resolve(__dirname, '../src');
const FRONTEND_SRC = path.resolve(__dirname, '../../OSE-Frontend/src/app');

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

function fileHas(relPath, needle) {
  const full = path.join(BACKEND_SRC, relPath);
  if (!fs.existsSync(full)) return false;
  return fs.readFileSync(full, 'utf8').includes(needle);
}

function fileLacks(relPath, needle) {
  const full = path.join(BACKEND_SRC, relPath);
  if (!fs.existsSync(full)) return true;
  return !fs.readFileSync(full, 'utf8').includes(needle);
}

function walkHasRoleOutsideAuth() {
  const hits = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|html)$/.test(entry.name)) {
        const rel = path.relative(FRONTEND_SRC, full).replace(/\\/g, '/');
        if (rel.includes('auth.service.ts')) continue;
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes('hasRole(')) hits.push(rel);
      }
    }
  }
  walk(FRONTEND_SRC);
  return hits;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' ACC P26–P28 — Final ZERO LEGACY');
  console.log('══════════════════════════════════════════════════\n');

  console.log('[P26] Scope — ACC assignments only:');
  assert('ROLE_SCOPE_DEFAULTS removed', fileLacks('services/scope/scope.constants.js', 'ROLE_SCOPE_DEFAULTS'));
  assert('no legacy scope path', fileLacks('services/scope/scope.service.js', '_resolveUserScopeLegacy'));
  assert('acc-scope-runtime P26', fileHas('services/acc-scope-runtime.service.js', 'legacyScopeFallbackRetired'));

  console.log('\n[P27] Frontend — zero operational hasRole():');
  const hasRoleHits = walkHasRoleOutsideAuth();
  assert(`hasRole only on AuthService (${hasRoleHits.length} violations)`, hasRoleHits.length === 0);
  if (hasRoleHits.length) console.error('    ', hasRoleHits.join(', '));
  assert('permission guard no rolesAny', !fs.readFileSync(path.join(FRONTEND_SRC, 'core/guards/permission.guard.ts'), 'utf8').includes('rolesAny'));
  assert('auth no ROLE_OPERATIONAL_PERMISSIONS fallback', !fs.readFileSync(path.join(FRONTEND_SRC, 'core/services/auth.service.ts'), 'utf8').includes('ROLE_OPERATIONAL_PERMISSIONS'));

  console.log('\n[P28] Pipeline / PDF / reports — ACC chains only:');
  assert('presentation service exists', fs.existsSync(path.join(BACKEND_SRC, 'services/acc-workflow-presentation.service.js')));
  assert('pipeline no STEP_ROLE_', fileLacks('services/workflow-pipeline/workflow-pipeline.collectors.js', 'STEP_ROLE_'));
  assert('pipeline no BREAKAGE_CHAIN', fileLacks('services/workflow-pipeline/workflow-pipeline.collectors.js', 'BREAKAGE_CHAIN'));
  assert('get-pass report no STEP_ROLE', fileLacks('services/get-pass-report.service.js', 'STEP_ROLE_'));
  assert('transfer evidence no V2 chain constant', fileLacks('services/transferEvidence.service.js', 'TRANSFER_V2_APPROVAL_CHAIN'));
  assert('pdf no GRN_APPROVAL_CHAIN', fileLacks('services/pdf/report-pdf-components.js', 'GRN_APPROVAL_CHAIN'));
  assert('grn evidence uses ACC chain', fileHas('services/grnEvidence.service.js', 'approvalChainDefinitionFromAcc'));

  console.log('\n[Lint] Operational hasRole gate:');
  const lint = spawnSync(process.execPath, [path.resolve(__dirname, '../../OSE-Frontend/scripts/lint-no-operational-hasrole.js')], {
    stdio: 'inherit',
    env: process.env,
  });
  assert('lint-no-operational-hasrole PASS', (lint.status ?? 1) === 0);

  console.log('\n[Regression] P30 suite:');
  const p30 = spawnSync(process.execPath, [path.resolve(__dirname, 'verify-acc-p30-zero-legacy.js')], {
    stdio: 'inherit',
    env: process.env,
  });
  assert('P30 suite PASS', (p30.status ?? 1) === 0);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P26–P28 Final: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('FINAL ZERO LEGACY — NOT COMPLETE');
    process.exit(1);
  }
  console.log('FINAL ZERO LEGACY — COMPLETE');
  console.log('══════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
