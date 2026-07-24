/**
 * Phase C audit — static verification (no DB).
 * Ensures Prisma AuditAction enum includes actions used for count/report workflow + posting.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');
const m = schema.match(/enum\s+AuditAction\s*\{([^}]*)\}/s);
if (!m) {
    console.error(JSON.stringify({ pass: false, error: 'AuditAction enum not found' }));
    process.exit(1);
}
const allowed = new Set(
    m[1]
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, '').trim())
        .filter(Boolean)
        .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line))
);

const required = [
    'SUBMIT',
    'COUNT_APPROVE',
    'COUNT_REJECT',
    'APPROVE',
    'REJECT',
    'POST',
    'VOID',
    'UPDATE',
];

const missing = required.filter((a) => !allowed.has(a));
const pass = missing.length === 0;

console.log(
    JSON.stringify(
        {
            mode: 'audit_phase_c_static',
            pass,
            allowedCount: allowed.size,
            missingFromSchema: missing,
        },
        null,
        2
    )
);

process.exit(pass ? 0 : 1);
