'use strict';

/**
 * FY baseline counts for DX Marina Hotel (or first branch hotel under DX org).
 * Usage: node scripts/fy-marina-baseline-snapshot.js
 */

require('dotenv').config();
const prisma = require('../src/config/database');

async function resolveMarinaTenantId() {
    const bySlug = await prisma.tenant.findFirst({
        where: {
            OR: [
                { slug: { contains: 'marina', mode: 'insensitive' } },
                { name: { contains: 'Marina', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true, slug: true },
    });
    if (bySlug) return bySlug;

    const org = await prisma.tenant.findFirst({
        where: { name: { contains: 'DX', mode: 'insensitive' }, parentId: null },
        select: { id: true },
    });
    if (!org) return null;
    return prisma.tenant.findFirst({
        where: { parentId: org.id },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true },
    });
}

async function main() {
    const tenant = await resolveMarinaTenantId();
    if (!tenant) {
        console.error('Could not resolve DX Marina tenant.');
        process.exit(1);
    }

    console.log('\n=== FY Baseline Snapshot ===');
    console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
    console.log(`tenantId: ${tenant.id}\n`);

    const [ledgerCount, stockCount, auditCount] = await Promise.all([
        prisma.inventoryLedger.count({ where: { tenantId: tenant.id } }),
        prisma.stockBalance.count({ where: { tenantId: tenant.id } }),
        prisma.auditLog.count({ where: { tenantId: tenant.id } }),
    ]);

    console.log('Counts:');
    console.log(`  inventory_ledger: ${ledgerCount}`);
    console.log(`  stock_balances:   ${stockCount}`);
    console.log(`  audit_log:        ${auditCount}\n`);

    const byMovement = await prisma.inventoryLedger.groupBy({
        by: ['movementType'],
        where: { tenantId: tenant.id },
        _count: { _all: true },
        orderBy: { movementType: 'asc' },
    });
    console.log('inventory_ledger by movementType:');
    for (const row of byMovement) {
        console.log(`  ${row.movementType}: ${row._count._all}`);
    }
    if (byMovement.length === 0) console.log('  (none)');

    const byAction = await prisma.auditLog.groupBy({
        by: ['action'],
        where: { tenantId: tenant.id },
        _count: { _all: true },
        orderBy: { action: 'asc' },
    });
    console.log('\naudit_log by action:');
    for (const row of byAction) {
        console.log(`  ${row.action}: ${row._count._all}`);
    }
    if (byAction.length === 0) console.log('  (none)');

    console.log('\n=== End Baseline ===\n');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
