'use strict';

/**
 * FY P0-A — verify property-wide scope for oversight roles.
 * Usage: node scripts/verify-oversight-scope-fy.js
 */

require('dotenv').config();

const {
    resolveUserScope,
    buildScopeWhere,
    SCOPE_MODULE,
    isPropertyWideOversightRole,
    PROPERTY_WIDE_OVERSIGHT_ROLES,
} = require('../src/services/scope/scope.service');
const { SCOPE_SOURCE } = require('../src/services/scope/scope.constants');

const TENANT = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';

let passed = 0;
let failed = 0;

function assert(label, condition) {
    if (condition) {
        console.log(`  ✓ ${label}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${label}`);
        failed++;
    }
}

async function main() {
    console.log('\nFY P0-A — Oversight property-wide scope\n');

    for (const role of PROPERTY_WIDE_OVERSIGHT_ROLES) {
        assert(`${role} is oversight`, isPropertyWideOversightRole(role));
    }
    assert('DEPT_MANAGER is not oversight', !isPropertyWideOversightRole('DEPT_MANAGER'));

    const financeScope = await resolveUserScope(
        { id: USER, role: 'FINANCE_MANAGER' },
        TENANT,
    );
    assert('Finance isTenantWide', financeScope.isTenantWide === true);
    assert('Finance scopeSource ROLE_DEFAULT', financeScope.scopeSource === SCOPE_SOURCE.ROLE_DEFAULT);
    assert('Finance stock scope empty filter', Object.keys(buildScopeWhere(SCOPE_MODULE.STOCK, financeScope)).length === 0);
    assert('Finance ledger scope empty filter', Object.keys(buildScopeWhere(SCOPE_MODULE.LEDGER, financeScope)).length === 0);

    const storeScope = await resolveUserScope(
        { id: USER, role: 'STOREKEEPER' },
        TENANT,
    );
    assert('Storekeeper isTenantWide', storeScope.isTenantWide === true);
    assert('Storekeeper ROLE_DEFAULT', storeScope.scopeSource === SCOPE_SOURCE.ROLE_DEFAULT);

    const orgScope = await resolveUserScope(
        { id: USER, role: 'ORG_MANAGER' },
        TENANT,
    );
    assert('Org manager still governance bypass', orgScope.scopeSource === SCOPE_SOURCE.ORG_BYPASS);

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Result: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    console.log('FY P0-A oversight scope verification PASS\n');
}

main().catch((e) => {
    console.error('SCRIPT ERROR:', e);
    process.exit(1);
});
