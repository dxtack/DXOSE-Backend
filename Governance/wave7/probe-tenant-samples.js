'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    const t = await p.tenant.findFirst({ where: { slug: { contains: 'w5-trf-w5-rv' } } });
    const items = await p.item.count({ where: { tenantId: t?.id } });
    const trf = await p.storeTransfer.count({ where: { tenantId: t?.id } });
    const grn = await p.grnImport.findFirst({ where: { tenantId: t?.id }, select: { id: true } });
    const brk = await p.movementDocument.findFirst({
        where: { tenantId: t?.id, movementType: 'BREAKAGE' },
        select: { id: true },
    });
    const ic = await p.stockCountSession.findFirst({ where: { tenantId: t?.id }, select: { id: true } });
    console.log(JSON.stringify({ tenant: t, items, trf, grn, brk, ic }, null, 2));
    await p.$disconnect();
})();
