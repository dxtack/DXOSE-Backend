'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
    const [items, transfers, members, users, tenants] = await Promise.all([
        p.item.count(),
        p.storeTransfer.count(),
        p.tenantMember.count(),
        p.user.count(),
        p.tenant.count(),
    ]);
    console.log(JSON.stringify({ items, transfers, members, users, tenants, db: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@') }));
    await p.$disconnect();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
