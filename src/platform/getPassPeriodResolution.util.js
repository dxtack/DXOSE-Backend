'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getCarriedForwardGetPassIds(tenantId, fromPeriod) {
    const audits = await prisma.auditLog.findMany({
        where: {
            tenantId,
            entityType: 'GET_PASS',
            note: { contains: `carry forward from ${fromPeriod}` },
        },
        select: { entityId: true },
        take: 200,
    });
    return new Set(audits.map((a) => a.entityId));
}

module.exports = { getCarriedForwardGetPassIds };
