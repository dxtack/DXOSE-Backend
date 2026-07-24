/**
 * Phase B — static smoke: all `auditLog.create` calls must live in `auditWriter.service.js`
 * (unified facade). Also verifies `AuditAction` enum parses from schema.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');
const m = schema.match(/enum\s+AuditAction\s*\{([^}]*)\}/s);
if (!m) {
    console.error(JSON.stringify({ pass: false, error: 'AuditAction enum not found' }));
    process.exit(1);
}
const actions = m[1]
    .split(/\n/)
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
if (actions.length < 5) {
    console.error(JSON.stringify({ pass: false, error: 'AuditAction enum parse suspiciously small', actions }));
    process.exit(1);
}

function walkJs(dir, acc = []) {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, name.name);
        if (name.isDirectory() && name.name !== 'node_modules') walkJs(p, acc);
        else if (name.isFile() && name.name.endsWith('.js')) acc.push(p);
    }
    return acc;
}

const srcRoot = path.join(__dirname, '../src');
const offenders = [];
for (const file of walkJs(srcRoot)) {
    if (path.basename(file) === 'auditWriter.service.js') continue;
    const content = fs.readFileSync(file, 'utf8');
    if (/\bauditLog\.create\s*\(/.test(content)) offenders.push(path.relative(path.join(__dirname, '..'), file));
}

if (offenders.length) {
    console.error(JSON.stringify({ pass: false, error: 'raw auditLog.create outside facade', offenders }));
    process.exit(1);
}

console.log(JSON.stringify({ pass: true, auditActionCount: actions.length, message: 'all writes routed through auditWriter facade' }));
