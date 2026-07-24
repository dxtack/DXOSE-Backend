'use strict';

const periodCloseService = require('../src/services/periodClose.service');
const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
    if (!tenant) {
        console.error('No tenant found');
        process.exit(1);
    }
    const rows = await periodCloseService.getPeriods(tenant.id);
    console.log(`OK: getPeriods for ${tenant.name} returned ${rows.length} row(s)`);
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error('FAIL:', err.message);
    process.exit(1);
});
