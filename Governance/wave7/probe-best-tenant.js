'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    const tenants = await p.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
    const scores = [];
    for (const t of tenants) {
        const [items, trf, grn, brk, ic] = await Promise.all([
            p.item.count({ where: { tenantId: t.id } }),
            p.storeTransfer.count({ where: { tenantId: t.id } }),
            p.grnImport.count({ where: { tenantId: t.id } }),
            p.movementDocument.count({ where: { tenantId: t.id, movementType: 'BREAKAGE' } }),
            p.stockCountSession.count({ where: { tenantId: t.id } }),
        ]);
        if (items > 0) {
            scores.push({ slug: t.slug, items, trf, grn, brk, ic, score: items + trf + grn + brk + ic });
        }
    }
    scores.sort((a, b) => b.score - a.score);
    console.log(JSON.stringify(scores.slice(0, 10), null, 2));
    await p.$disconnect();
})();
