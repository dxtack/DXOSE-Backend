'use strict';

/**
 * ACC Zero-Legacy — export cost mask runtime verification (READ-ONLY, no DB writes).
 * Usage: node Governance/scripts/acc-export-mask-runtime.js
 */

const {
    userMayViewSensitiveExport,
    maskExportRow,
    EXPORT_COST_VIEW_PERMISSION,
} = require('../../src/platform/export-mask.service');

let pass = 0;
let fail = 0;

function assert(label, cond) {
    if (cond) { console.log(`  ✓ ${label}`); pass++; }
    else { console.error(`  ✗ ${label}`); fail++; }
}

const row = { item: 'A', unitCost: 42.5, totalValue: 100, qty: 2 };

console.log('Export Cost Mask Runtime Verification');
console.log('=====================================');
console.log(`Canonical permission: ${EXPORT_COST_VIEW_PERMISSION}`);

// 1. Export + cost permission
{
    const u = { role: 'FINANCE_MANAGER', permissions: ['REPORTS_EXPORT', 'LEDGER_VIEW'] };
    assert('export+cost → unmask allowed', userMayViewSensitiveExport(u));
    const masked = maskExportRow(row, u);
    assert('export+cost → unitCost unmasked', masked.unitCost === 42.5);
    assert('export+cost → totalValue unmasked', masked.totalValue === 100);
}

// 2. Export only
{
    const u = { role: 'FINANCE_MANAGER', permissions: ['REPORTS_EXPORT'] };
    assert('export only → unmask denied', !userMayViewSensitiveExport(u));
    const masked = maskExportRow(row, u);
    assert('export only → unitCost masked', masked.unitCost === '***');
    assert('export only → non-sensitive preserved', masked.qty === 2);
}

// 3. SUPER_ADMIN without cost perm
{
    const u = { role: 'SUPER_ADMIN', permissions: ['SUPER_ADMIN_PORTAL_ACCESS'] };
    assert('SUPER_ADMIN no LEDGER_VIEW → denied', !userMayViewSensitiveExport(u));
    assert('SUPER_ADMIN → unitCost masked', maskExportRow(row, u).unitCost === '***');
}

// 4. ADMIN without cost perm
{
    const u = { role: 'ADMIN', permissions: ['REPORTS_EXPORT'] };
    assert('ADMIN no LEDGER_VIEW → denied', !userMayViewSensitiveExport(u));
}

// 5. ORG_MANAGER without cost perm
{
    const u = { role: 'ORG_MANAGER', permissions: ['VIEW_DASHBOARD', 'REPORTS_EXPORT'] };
    assert('ORG_MANAGER no LEDGER_VIEW → denied', !userMayViewSensitiveExport(u));
}

// 6. No export permission — masking layer still works (route gate is separate)
{
    const u = { role: 'DEPT_MANAGER', permissions: [] };
    assert('no permissions → denied', !userMayViewSensitiveExport(u));
}

// 7. Tenant isolation — masking is per-user permissions, not cross-tenant
{
    const tenantA = { id: 'u1', role: 'FINANCE_MANAGER', tenantId: 't-a', permissions: ['LEDGER_VIEW'] };
    const tenantB = { id: 'u1', role: 'FINANCE_MANAGER', tenantId: 't-b', permissions: [] };
    assert('tenant A with LEDGER_VIEW → unmask', userMayViewSensitiveExport(tenantA));
    assert('tenant B without LEDGER_VIEW → mask', !userMayViewSensitiveExport(tenantB));
}

// 8. No column/format change except masking
{
    const u = { role: 'STOREKEEPER', permissions: ['REPORTS_EXPORT'] };
    const masked = maskExportRow(row, u);
    assert('same keys preserved', Object.keys(masked).sort().join() === Object.keys(row).sort().join());
}

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
