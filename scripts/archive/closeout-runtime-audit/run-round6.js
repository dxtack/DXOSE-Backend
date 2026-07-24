'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  '30-gp-creator-fast-forward-authority-audit.js',
  '32-no-assign-read-scope-final.js',
  '37-frontend-legacy-dependency.js',
  '34-assignment-gate-final.js',
  '39-scope-matrix-verdicts.js',
  '41-constitution-gap-artifacts.js',
  '07-constitution-mapping.js',
  '31-gp-finance-fast-forward-matrix-final.js',
  '33-stale-fresh-jwt-matrix.js',
  '38-gp-cross-tenant-expanded.js',
  '36-legacy-chain-complete.js',
  '09-grn-runtime-v3.js',
  '10-transfer-runtime-v3.js',
  '11-inventory-count-runtime-v3.js',
  '35-gp-permission-grid-round6.js',
  '40-frontend-tests-round6.js',
];

const dir = __dirname;
for (const s of SCRIPTS) {
  const p = path.join(dir, s);
  if (!require('fs').existsSync(p)) {
    console.log('[skip]', s, 'not found');
    continue;
  }
  console.log('\n===', s, '===');
  const r = spawnSync(process.execPath, [p], { cwd: dir, stdio: 'inherit', env: process.env });
  if (r.status !== 0) console.error('[exit]', s, r.status);
}
