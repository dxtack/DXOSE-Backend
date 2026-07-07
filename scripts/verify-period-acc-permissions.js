'use strict';

const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    try {
        const perms = await prisma.permission.findMany({
            where: { code: { startsWith: 'PERIOD_' } },
            select: { code: true },
            orderBy: { code: 'asc' },
        });
        console.log('PERIOD_* permissions in catalog:', perms.map((p) => p.code).join(', ') || '(none)');

        const grants = await prisma.rolePermission.findMany({
            where: { permission: { code: { startsWith: 'PERIOD_' } } },
            include: { role: { select: { code: true } }, permission: { select: { code: true } } },
        });
        const byRole = {};
        for (const g of grants) {
            const role = g.role.code;
            byRole[role] = byRole[role] || [];
            byRole[role].push(g.permission.code);
        }
        console.log('Role grants:', JSON.stringify(byRole, null, 2));
        console.log('ORG_MANAGER period grants:', byRole.ORG_MANAGER?.length ?? 0);
        console.log('FINANCE_MANAGER period grants:', byRole.FINANCE_MANAGER?.length ?? 0);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
