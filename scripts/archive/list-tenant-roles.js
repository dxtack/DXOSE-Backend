'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const TENANT = process.argv[2] || 'dx-airport-hotel';

async function main() {
    const t = await prisma.tenant.findFirst({ where: { slug: TENANT } });
    const members = await prisma.tenantMember.findMany({
        where: { tenantId: t.id, isActive: true },
        include: { user: { select: { email: true } }, role: { select: { code: true } } },
        orderBy: { role: { code: 'asc' } },
    });
    const byRole = {};
    for (const m of members) {
        const c = m.role.code;
        if (!byRole[c]) byRole[c] = [];
        byRole[c].push(m.user.email);
    }
    console.log(JSON.stringify(byRole, null, 2));
}

main().finally(() => prisma.$disconnect());
