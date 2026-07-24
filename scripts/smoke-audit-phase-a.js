/**
 * Phase A audit integrity — static verification (no DB).
 * Ensures Prisma AuditAction enum includes every action string used by Phase A–touched paths.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');
const m = schema.match(/enum\s+AuditAction\s*\{([^}]*)\}/s);
if (!m) {
    console.error(JSON.stringify({ pass: false, error: 'AuditAction enum not found in schema.prisma' }));
    process.exit(1);
}
const allowed = new Set(
    m[1]
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, '').trim())
        .filter(Boolean)
        .map((line) => line.replace(/\s+$/, ''))
        .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line))
);

/** Actions that must remain valid after Phase A hotfixes (subset used by touched modules). */
const requiredActions = [
    'VOID', // inventory count draft cancel
    'UPDATE', // Get Pass domain steps; OB enable
    'APPROVE', // Get Pass security + approval chain
    'REJECT',
    'CREATE',
    'DELETE',
    'SUBMIT',
    'POST',
    'CLOSE_PERIOD',
    'REOPEN_PERIOD', // period close only — still in enum
    'LOCK_OB',
    'FINALIZE_OB',
];

const missing = requiredActions.filter((a) => !allowed.has(a));
const pass = missing.length === 0;

console.log(
    JSON.stringify(
        {
            mode: 'audit_phase_a_static',
            pass,
            allowedCount: allowed.size,
            missingFromSchema: missing,
        },
        null,
        2
    )
);

process.exit(pass ? 0 : 1);
