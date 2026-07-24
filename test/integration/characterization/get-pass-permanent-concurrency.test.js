'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const {
    postGetPassCheckoutInTransaction,
    postPermanentDestinationReceiveLine,
} = require('../../../src/services/postingGovernedGetPass.service');

function createBarrier(expected, fallbackMs = null) {
    let arrived = 0;
    let released = false;
    let release;
    const ready = new Promise((resolve) => {
        release = () => {
            if (released) return;
            released = true;
            resolve();
        };
    });
    return async () => {
        arrived += 1;
        if (arrived === expected) release();
        if (fallbackMs != null) setTimeout(release, fallbackMs).unref();
        await ready;
    };
}

function createSignal() {
    let release;
    const ready = new Promise((resolve) => {
        release = resolve;
    });
    return { ready, release };
}

function locationIdFromWhere(args) {
    return args?.where?.tenantId_itemId_locationId?.locationId;
}

function proxyStockBalance(tx, hooks = {}) {
    const stockBalance = new Proxy(tx.stockBalance, {
        get(target, property) {
            const value = target[property];
            if (typeof value !== 'function') return value;
            return async (...args) => {
                if (hooks.before?.[property]) await hooks.before[property](...args);
                const result = await value.apply(target, args);
                if (hooks.after?.[property]) await hooks.after[property](result, ...args);
                return result;
            };
        },
    });
    return new Proxy(tx, {
        get(target, property) {
            if (property === 'stockBalance') return stockBalance;
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

async function runConcurrent(prisma, workers) {
    const startBarrier = createBarrier(workers.length);
    return Promise.allSettled(
        workers.map(({ run, wrap }) =>
            prisma.$transaction(
                async (tx) => {
                    await startBarrier();
                    return run(wrap ? wrap(tx) : tx);
                },
                { timeout: 15000 },
            ),
        ),
    );
}

async function createPermanentGetPass(prisma, { tenantId, userId, itemId, locationId, qty, passNo }) {
    return prisma.getPass.create({
        data: {
            tenantId,
            passNo,
            transferType: 'PERMANENT',
            borrowingEntity: 'Permanent concurrency proof',
            createdBy: userId,
            lines: {
                create: {
                    itemId,
                    locationId,
                    qty,
                },
            },
        },
        include: { lines: true },
    });
}

async function createLocation(prisma, tenantId, runId, label) {
    return prisma.location.create({
        data: {
            tenantId,
            name: `Permanent ${label} ${runId}`,
        },
    });
}

async function setStock(prisma, { tenantId, itemId, locationId, qty, wac }) {
    return prisma.stockBalance.create({
        data: {
            tenantId,
            itemId,
            locationId,
            qtyOnHand: qty,
            qtyBlocked: 0,
            wacUnitCost: wac,
        },
    });
}

function near(actual, expected, tolerance = 0.0002) {
    return Math.abs(actual - expected) <= tolerance;
}

test('Permanent Get Pass checkout and destination receipt are concurrency safe', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `Permanent Concurrency ${runContext.runId}`,
                slug: runContext.tenantSlug,
            },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('permanent-concurrency'),
                passwordHash: 'integration-test-not-used',
                firstName: 'Permanent',
                lastName: 'Concurrency',
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
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `Permanent Item ${runContext.runId}`,
                code: `PGP-${runContext.runId}`.slice(0, 60),
                unitPrice: 10,
            },
        });

        const source = await createLocation(prisma, tenantId, runContext.runId, 'SOURCE-RACE');
        await setStock(prisma, { tenantId, itemId: item.id, locationId: source.id, qty: 100, wac: 10 });
        const passA = await createPermanentGetPass(prisma, {
            tenantId,
            userId,
            itemId: item.id,
            locationId: source.id,
            qty: 60,
            passNo: `IT-PGP-A-${runContext.runId}`,
        });
        const passB = await createPermanentGetPass(prisma, {
            tenantId,
            userId,
            itemId: item.id,
            locationId: source.id,
            qty: 60,
            passNo: `IT-PGP-B-${runContext.runId}`,
        });
        const secondSourceReadBarrier = createBarrier(2);
        const sourceWrapper = (tx) => {
            let sourceReads = 0;
            return proxyStockBalance(tx, {
                after: {
                    findUnique: async (_row, args) => {
                        if (locationIdFromWhere(args) !== source.id) return;
                        sourceReads += 1;
                        if (sourceReads === 2) await secondSourceReadBarrier();
                    },
                },
            });
        };
        const sourceResults = await runConcurrent(prisma, [
            {
                wrap: sourceWrapper,
                run: (tx) =>
                    postGetPassCheckoutInTransaction(tx, {
                        getPass: passA,
                        tenantId,
                        user: { id: userId },
                    }),
            },
            {
                wrap: sourceWrapper,
                run: (tx) =>
                    postGetPassCheckoutInTransaction(tx, {
                        getPass: passB,
                        tenantId,
                        user: { id: userId },
                    }),
            },
        ]);
        const sourceStock = await prisma.stockBalance.findUnique({
            where: {
                tenantId_itemId_locationId: {
                    tenantId,
                    itemId: item.id,
                    locationId: source.id,
                },
            },
        });
        const sourceProof = {
            successes: sourceResults.filter((result) => result.status === 'fulfilled').length,
            failures: sourceResults.filter((result) => result.status === 'rejected').length,
            qtyOnHand: Number(sourceStock.qtyOnHand),
            issueRows: await prisma.inventoryLedger.count({
                where: {
                    tenantId,
                    movementType: 'ISSUE',
                    referenceId: { in: [passA.id, passB.id] },
                },
            }),
        };
        console.log('[proof] permanent-checkout-race', JSON.stringify(sourceProof));

        const shared = await createLocation(prisma, tenantId, runContext.runId, 'SHARED');
        await setStock(prisma, { tenantId, itemId: item.id, locationId: shared.id, qty: 100, wac: 10 });
        const outbound = await createPermanentGetPass(prisma, {
            tenantId,
            userId,
            itemId: item.id,
            locationId: shared.id,
            qty: 40,
            passNo: `IT-PGP-OUT-${runContext.runId}`,
        });
        const inboundGetPassId = crypto.randomUUID();
        const sharedReadBarrier = createBarrier(2, 100);
        const outboundUpdated = createSignal();
        const sharedResults = await runConcurrent(prisma, [
            {
                wrap: (tx) =>
                    proxyStockBalance(tx, {
                        after: {
                            findUnique: async (_row, args) => {
                                if (locationIdFromWhere(args) === shared.id) await sharedReadBarrier();
                            },
                        },
                        before: {
                            upsert: async (args) => {
                                if (locationIdFromWhere(args) === shared.id) await outboundUpdated.ready;
                            },
                        },
                    }),
                run: (tx) =>
                    postPermanentDestinationReceiveLine(tx, {
                        tenantId,
                        destinationItemId: item.id,
                        locationId: shared.id,
                        receivedQty: 20,
                        sourceWac: 20,
                        getPassId: inboundGetPassId,
                        passNo: `IT-PGP-IN-${runContext.runId}`,
                        userId,
                    }),
            },
            {
                wrap: (tx) => {
                    let sharedReads = 0;
                    return proxyStockBalance(tx, {
                        after: {
                            findUnique: async (_row, args) => {
                                if (locationIdFromWhere(args) !== shared.id) return;
                                sharedReads += 1;
                                if (sharedReads === 2) await sharedReadBarrier();
                            },
                            update: async (_row, args) => {
                                if (locationIdFromWhere(args) === shared.id) outboundUpdated.release();
                            },
                        },
                    });
                },
                run: (tx) =>
                    postGetPassCheckoutInTransaction(tx, {
                        getPass: outbound,
                        tenantId,
                        user: { id: userId },
                    }),
            },
        ]);
        const sharedStock = await prisma.stockBalance.findUnique({
            where: {
                tenantId_itemId_locationId: {
                    tenantId,
                    itemId: item.id,
                    locationId: shared.id,
                },
            },
        });
        const outboundLedger = await prisma.inventoryLedger.findFirst({
            where: {
                tenantId,
                referenceId: outbound.id,
                movementType: 'ISSUE',
                locationId: shared.id,
            },
        });
        const sharedProof = {
            successes: sharedResults.filter((result) => result.status === 'fulfilled').length,
            failures: sharedResults.filter((result) => result.status === 'rejected').length,
            qtyOnHand: Number(sharedStock.qtyOnHand),
            wacUnitCost: Number(sharedStock.wacUnitCost),
            outboundUnitCost: Number(outboundLedger?.unitCost || 0),
        };
        console.log('[proof] permanent-destination-outbound-race', JSON.stringify(sharedProof));

        assert.deepEqual(sourceProof, {
            successes: 1,
            failures: 1,
            qtyOnHand: 40,
            issueRows: 1,
        });
        assert.equal(sharedProof.successes, 2);
        assert.equal(sharedProof.failures, 0);
        assert.equal(sharedProof.qtyOnHand, 80);
        const validOutboundFirst =
            near(sharedProof.wacUnitCost, 12.5) && near(sharedProof.outboundUnitCost, 10);
        const validInboundFirst =
            near(sharedProof.wacUnitCost, 11.6667) && near(sharedProof.outboundUnitCost, 11.6667);
        assert.ok(
            validOutboundFirst || validInboundFirst,
            `Expected a serializable quantity/WAC result, received ${JSON.stringify(sharedProof)}`,
        );
    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.getPassReturn.deleteMany({
                where: { getPassLine: { getPass: { tenantId } } },
            });
            await prisma.getPass.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.item.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) {
            await prisma.user.delete({ where: { id: userId } });
        }
        await prisma.$disconnect();
    }
});
