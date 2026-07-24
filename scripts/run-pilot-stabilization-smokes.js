'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const scripts = [
  'smoke-inventory-count-unification-static.js',
  'smoke-count-posting-policy-b.js',
  'smoke-pre-wave2-rbac.js',
  'smoke-inventory-count-excel-roundtrip.js',
];

for (const script of scripts) {
  console.log(`\n--- ${script} ---\n`);
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

console.log('\nAll pilot stabilization smokes passed.');
process.exit(0);
