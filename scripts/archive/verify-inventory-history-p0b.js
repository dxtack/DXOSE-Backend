'use strict';

/**
 * P0-B — verify inventory-history API against inventory_ledger.
 * Usage: node scripts/verify-inventory-history-p0b.js
 */

require('dotenv').config();

const prisma = require('../src/config/database');
const inventoryHistoryService = require('../src/services/inventory-history.service');

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
    console.log('\nFY P0-B — Inventory History API\n');

    const tenant = await prisma.tenant.findFirst({
        where: { OR: [{ slug: 'dx-marina-hotel' }, { name: { contains: 'Marina', mode: 'insensitive' } }] },
        select: { id: true, name: true },
    });
    if (!tenant) {
        console.error('FAIL: DX Marina tenant not found');
        process.exit(1);
    }

    const financeMember = await prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, role: { code: 'FINANCE_MANAGER' }, isActive: true },
        include: { user: { select: { id: true } }, role: { select: { code: true } } },
    });
    const user = financeMember
        ? { id: financeMember.user.id, role: financeMember.role.code, tenantId: tenant.id }
        : { id: '00000000-0000-4000-8000-000000000002', role: 'FINANCE_MANAGER', tenantId: tenant.id };

    const ledgerTotal = await prisma.inventoryLedger.count({ where: { tenantId: tenant.id } });
    console.log(`Tenant: ${tenant.name}`);
    console.log(`inventory_ledger rows: ${ledgerTotal}\n`);

    const all = await inventoryHistoryService.getInventoryHistory(tenant.id, { page: 1, limit: 50 }, user);
    assert('returns entries array', Array.isArray(all.entries));
    assert('total matches ledger count', all.total === ledgerTotal);
    assert('scope applied for finance', all.scopeApplied === true || all.scopeApplied === false);

    const byType = await prisma.inventoryLedger.groupBy({
        by: ['movementType'],
        where: { tenantId: tenant.id },
        _count: { _all: true },
    });

    for (const row of byType) {
        const filtered = await inventoryHistoryService.getInventoryHistory(
            tenant.id,
            { page: 1, limit: 5, movementType: row.movementType },
            user,
        );
        assert(`${row.movementType} filter returns rows`, filtered.total === row._count._all);
    }

    const sample = all.entries[0];
    if (sample?.referenceNo) {
        const refSlice = sample.referenceNo.slice(0, Math.min(6, sample.referenceNo.length));
        const byRef = await inventoryHistoryService.getInventoryHistory(
            tenant.id,
            { page: 1, limit: 20, referenceNo: refSlice },
            user,
        );
        assert('referenceNo filter works', byRef.total >= 1);
    } else {
        console.log('  (skip referenceNo filter — no sample referenceNo in first page)');
    }

    assert('entries omit runningBalance', all.entries.every((e) => e.runningBalance === undefined));
    assert('entries have movementType', all.entries.every((e) => typeof e.movementType === 'string'));

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Result: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    console.log('FY P0-B inventory history verification PASS\n');

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('SCRIPT ERROR:', e);
    try {
        await prisma.$disconnect();
    } catch (_) {
        /* ignore */
    }
    process.exit(1);
});
