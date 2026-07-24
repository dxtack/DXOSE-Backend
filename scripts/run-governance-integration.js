'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const scripts = [
    'scripts/integration/governed-posting-delegation.js',
    'scripts/integration/reconciliation-validation.js',
    'scripts/smoke-posting-governance-enforcement.js',
    'scripts/integration/governed-workflow-integration.js',
];

let failed = false;
for (const script of scripts) {
    const res = spawnSync(process.execPath, [path.join(__dirname, '..', script)], {
        stdio: 'inherit',
        env: process.env,
    });
    if (res.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
