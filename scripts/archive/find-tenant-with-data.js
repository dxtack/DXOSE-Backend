'use strict';
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    const tenants = await p.tenant.findMany({ select: { id: true, slug: true }, take: 15 });
    for (const t of tenants) {
        const [sup, loc, item] = await Promise.all([
            p.supplier.count({ where: { tenantId: t.id, isActive: true } }),
            p.location.count({ where: { tenantId: t.id, isActive: true } }),
            p.item.count({ where: { tenantId: t.id, isActive: true } }),
        ]);
        if (sup && loc && item) console.log(t.slug, { sup, loc, item });
    }
    await p.$disconnect();
})();
