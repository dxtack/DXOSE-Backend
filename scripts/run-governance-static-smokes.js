/**
 * Runs all governance static smokes in sequence (cross-platform; no shell &&).
 * Invoked by: npm run smoke:governance-static
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const steps = [
    ['node', ['scripts/smoke-audit-facade-static.js']],
    ['node', ['scripts/smoke-audit-phase-a.js']],
    ['node', ['scripts/smoke-audit-phase-c-static.js']],
    ['node', ['scripts/smoke-transfer-audit-static.js']],
    ['node', ['scripts/smoke-legacy-evidence-alignment.js']],
    ['node', ['scripts/smoke-inventory-count-unification-static.js']],
    ['node', ['scripts/smoke-valuation-governance-static.js']],
    ['node', ['scripts/smoke-reversal-governance-static.js']],
    ['node', ['scripts/smoke-period-close-governance-static.js']],
    ['node', ['scripts/smoke-integrity-monitoring-static.js']],
    ['node', ['scripts/smoke-posting-governance-enforcement.js']],
];

for (const [cmd, args] of steps) {
    const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
    const code = r.status ?? 1;
    if (code !== 0) process.exit(code);
}

process.exit(0);
