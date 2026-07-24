'use strict';

/**
 * P18 — ACC Complete Acceptance (runs P9–P17 verification suite).
 * Usage: node scripts/verify-acc-p18-complete.js
 */

require('dotenv').config();

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const SCRIPTS = [
  'verify-acc-p9-workflow-foundation.js',
  'verify-acc-p10-dual-gate.js',
  'verify-acc-p11-cutover-wave1.js',
  'verify-acc-p12-cutover-wave2.js',
  'verify-acc-p13-cutover-wave3.js',
  'verify-acc-p14-advanced-policies-runtime.js',
  'verify-acc-p15-scope-assignments-runtime.js',
  'verify-acc-p16-feature-flags-ui.js',
  'verify-acc-p17-legacy-retirement.js',
];

function runScript(name) {
  const scriptPath = path.resolve(__dirname, name);
  if (!fs.existsSync(scriptPath)) {
    console.error(`Missing script: ${name}`);
    return 1;
  }
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env: process.env,
  });
  return result.status ?? 1;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' ACC P18 — Complete Acceptance Suite (P9→P17)');
  console.log('══════════════════════════════════════════════════\n');

  let failed = 0;
  for (const script of SCRIPTS) {
    console.log(`\n▶ Running ${script}...\n`);
    const code = runScript(script);
    if (code !== 0) failed++;
  }

  console.log('\n══════════════════════════════════════════════════');
  if (failed > 0) {
    console.error(`ACC P18 FAILED — ${failed} script(s) failed`);
    process.exit(1);
  }
  console.log('ACC P18 COMPLETE — All phases PASS');
  console.log('Runtime: ACC-only SSOT for workflows, permissions, policies, scope');
  console.log('══════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
