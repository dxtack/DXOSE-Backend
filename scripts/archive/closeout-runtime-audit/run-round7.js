'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPTS = [
  '42-stale-fresh-jwt-v2.js',
  '43-workflow-pipeline-scope.js',
  '44-lost-legacy-reproduce.js',
  '45-gp-permission-round7.js',
  '46-gp-fail-details.js',
  '47-assignment-gate-v2.js',
  '48-scope-summary.js',
  '09-grn-runtime-final.js',
  '10-transfer-runtime-final.js',
  '11-inventory-count-runtime-final.js',
  '49-constitution-round7.js',
  '51-frontend-legacy-runtime.js',
  '50-frontend-tests-round7.js',
  '37-frontend-legacy-dependency.js',
  '39-scope-matrix-verdicts.js',
  '07-constitution-mapping.js',
  '41-constitution-gap-artifacts.js',
];

const dir = __dirname;
const results = [];
for (const s of SCRIPTS) {
  const p = path.join(dir, s);
  if (!fs.existsSync(p)) {
    results.push({ script: s, status: 'skip' });
    continue;
  }
  console.log('\n=== Round 7:', s, '===');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [p], { cwd: dir, stdio: 'inherit', env: process.env, timeout: 600000 });
  results.push({ script: s, status: r.status === 0 ? 'ok' : 'fail', exit: r.status, ms: Date.now() - t0 });
}

const out = path.join(REPORT_DIR, 'ROUND7_RUN_LOG.json');
fs.writeFileSync(out, JSON.stringify({ executedAt: new Date().toISOString(), results }, null, 2));
console.log('\nRound 7 run log', out);
