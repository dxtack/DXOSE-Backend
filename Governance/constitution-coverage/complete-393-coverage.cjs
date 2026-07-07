#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = __dirname;

execSync('node build-evidence-correct-matrix.cjs', { cwd: DIR, stdio: 'inherit' });
execSync('node validate-393-evidence-integrity.cjs', { cwd: DIR, stdio: 'inherit' });
execSync('node generate-evidence-corrected-report.cjs', { cwd: DIR, stdio: 'inherit' });

console.log('Evidence-correct coverage pipeline complete.');
