'use strict';
const { PrismaClient } = require('@prisma/client');
const url = process.env.DATABASE_URL || 'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory_test';
const prisma = new PrismaClient({ datasources: { db: { url } } });
prisma
    .$executeRawUnsafe(
        'ALTER TABLE "stock_count_sessions" ADD COLUMN IF NOT EXISTS "concurrencyVersion" INTEGER NOT NULL DEFAULT 0',
    )
    .then(() => {
        console.log('StockCountSession.concurrencyVersion ensured');
        return prisma.$disconnect();
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
