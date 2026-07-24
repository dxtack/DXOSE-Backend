'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const {
    postBreakageMovementInTransaction,
    postLostMovementInTransaction,
} = require('../../../src/services/postingGovernedMovement.service');

function createBarrier(expected) {
    let arrived = 0;
    let release;
    const ready = new Promise((resolve) => {
        release = resolve;
    });
    return async () => {
        arrived += 1;
        if (arrived === expected) release();
        await ready;
    };
}

function synchronizeDuplicateCheck(tx, barrier) {
    const inventoryLedger = new Proxy(tx.inventoryLedger, {
        get(target, property) {
            const value = target[property];
            if (property !== 'findFirst') {
                return typeof value === 'function' ? value.bind(target) : value;
            }
            return async (...args) => {
                const result = await value.apply(target, args);
                await barrier();
                return result;
            };
        },
    });
    return new Proxy(tx, {
        get(target, property) {
            if (property === 'inventoryLedger') return inventoryLedger;
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

async function createFixture(prisma, { tenantId, userId, runId, movementType }) {
    const location = await prisma.location.create({
        data: { tenantId, name: `P02 ${movementType} Location ${runId}` },
    });
    const item = await prisma.item.create({
        data: {
            tenantId,
            name: `P02 ${movementType} Item ${runId}`,
            code: `P02-${movementType}-${runId}`.slice(0, 60),
            unitPrice: 10,
        },
    });
    const stockKey = {
        tenantId_itemId_locationId: {
            tenantId,
            itemId: item.id,
            locationId: location.id,
        },
    };
    await prisma.stockBalance.create({
        data: {
            tenantId,
            itemId: item.id,
            locationId: location.id,
            qtyOnHand: 100,
            qtyBlocked: 0,
            wacUnitCost: 10,
        },
    });
    const document = await prisma.movementDocument.create({
        data: {
            tenantId,
            documentNo: `P02-${movementType}-${runId}`,
            movementType,
            sourceType: 'INTERNAL',
            status: 'DRAFT',
            sourceLocationId: location.id,
            reason: 'P0 #2 duplicate posting proof',
            createdBy: userId,
            lines: {
                create: {
                    itemId: item.id,
                    locationId: location.id,
                    qtyRequested: 10,
                    qtyInBaseUnit: 10,
                    unitCost: 10,
                    totalValue: 100,
                },
            },
        },
        include: { lines: { include: { item: true } } },
    });
    return { document, stockKey };
}

test('Breakage and Lost posting effects are idempotent under concurrent duplicate delivery', async (t) => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `P02 Movement Idempotency ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p02-movement-idempotency'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P02',
                lastName: 'Idempotency',
            },
        });
        userId = user.id;
        const now = new Date();
        await prisma.periodClose.create({
            data: {
                tenantId,
                year: now.getUTCFullYear(),
                month: now.getUTCMonth() + 1,
                status: 'OPEN',
            },
        });

        for (const movementType of ['BREAKAGE', 'LOST']) {
            await t.test(movementType, async () => {
                const { document, stockKey } = await createFixture(prisma, {
                    tenantId,
                    userId,
                    runId: runContext.runId,
                    movementType,
                });
                const barrier = createBarrier(2);
                const results = await Promise.allSettled(
                    [1, 2].map(() =>
                        prisma.$transaction(
                            (tx) => {
                                const synchronizedTx = synchronizeDuplicateCheck(tx, barrier);
                                return movementType === 'BREAKAGE'
                                    ? postBreakageMovementInTransaction(
                                        synchronizedTx,
                                        document,
                                        tenantId,
                                        userId,
                                    )
                                    : postLostMovementInTransaction(
                                        synchronizedTx,
                                        document,
                                        userId,
                                    );
                            },
                            { timeout: 15000 },
                        ),
                    ),
                );
                const stock = await prisma.stockBalance.findUnique({ where: stockKey });
                const ledgerRows = await prisma.inventoryLedger.findMany({
                    where: { tenantId, referenceId: document.id },
                });
                const proof = {
                    successes: results.filter((result) => result.status === 'fulfilled').length,
                    failures: results.filter((result) => result.status === 'rejected').length,
                    failureCodes: results
                        .filter((result) => result.status === 'rejected')
                        .map((result) => result.reason?.code || null),
                    qtyOnHand: Number(stock.qtyOnHand),
                    cumulativeQty: movementType === 'BREAKAGE'
                        ? Number(stock.totalQtyDamage)
                        : Number(stock.totalQtyLost),
                    ledgerRows: ledgerRows.length,
                    postingEffectKeys: ledgerRows.map((row) => row.postingEffectKey),
                };
                console.log(`[proof] p02-${movementType.toLowerCase()}-duplicate`, JSON.stringify(proof));

                assert.deepEqual(proof, {
                    successes: 1,
                    failures: 1,
                    failureCodes: ['POSTING_EFFECT_ALREADY_APPLIED'],
                    qtyOnHand: 90,
                    cumulativeQty: 10,
                    ledgerRows: 1,
                    postingEffectKeys: [
                        `v1|MOVEMENT|${tenantId}|${document.id}|${document.lines[0].id}|${movementType}`,
                    ],
                });
            });
        }
    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.movementDocument.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.item.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
