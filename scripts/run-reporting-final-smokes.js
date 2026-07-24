#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const scripts = [
    'smoke-reporting-wave1b-contracts.js',
    'smoke-reporting-wave1a-pdf.js',
    'smoke-reporting-final-regression.js',
    'uat-phase1-reporting.js',
];

let failed = 0;
for (const script of scripts) {
    console.log(`\n>>> ${script}\n`);
    const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
    });
    if (r.status !== 0) failed += 1;
}

console.log(failed ? `\nReporting final smokes: ${failed} script(s) failed` : '\nReporting final smokes: ALL PASS');
process.exit(failed > 0 ? 1 : 0);
