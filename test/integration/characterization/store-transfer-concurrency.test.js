'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { postTransferInTransaction } = require('../../../src/services/postingGovernedTransfer.service');

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

function proxyTransaction(tx, hooks = {}) {
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

async function createTransfer(prisma, { tenantId, userId, itemId, unitId, sourceId, destId, qty, transferNo }) {
    return prisma.storeTransfer.create({
        data: {
            tenantId,
            transferNo,
            sourceLocationId: sourceId,
            destLocationId: destId,
            requestedBy: userId,
            status: 'APPROVED',
            lines: {
                create: {
                    itemId,
                    uomId: unitId,
                    requestedQty: qty,
                },
            },
        },
        include: {
            lines: true,
            sourceLocation: true,
            destLocation: true,
        },
    });
}

async function createLocation(prisma, tenantId, runId, label) {
    return prisma.location.create({
        data: {
            tenantId,
            name: `Transfer ${label} ${runId}`,
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

test('Store Transfer source and destination updates are concurrency safe', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `Transfer Concurrency ${runContext.runId}`,
                slug: runContext.tenantSlug,
            },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('transfer-concurrency'),
                passwordHash: 'integration-test-not-used',
                firstName: 'Transfer',
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
        const unit = await prisma.unit.create({
            data: {
                tenantId,
                name: `Transfer Piece ${runContext.runId}`,
                abbreviation: `TP-${runContext.runId}`.slice(0, 40),
            },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `Transfer Item ${runContext.runId}`,
                code: `TR-${runContext.runId}`.slice(0, 60),
                unitPrice: 10,
            },
        });

        const source = await createLocation(prisma, tenantId, runContext.runId, 'SOURCE-RACE');
        const destA = await createLocation(prisma, tenantId, runContext.runId, 'DEST-A');
        const destB = await createLocation(prisma, tenantId, runContext.runId, 'DEST-B');
        await setStock(prisma, { tenantId, itemId: item.id, locationId: source.id, qty: 100, wac: 10 });
        const transferA = await createTransfer(prisma, {
            tenantId,
            userId,
            itemId: item.id,
            unitId: unit.id,
            sourceId: source.id,
            destId: destA.id,
            qty: 60,
            transferNo: `IT-TR-A-${runContext.runId}`,
        });
        const transferB = await createTransfer(prisma, {
            tenantId,
            userId,
            itemId: item.id,
            unitId: unit.id,
            sourceId: source.id,
            destId: destB.id,
            qty: 60,
            transferNo: `IT-TR-B-${runContext.runId}`,
        });
        const sourceReadBarrier = createBarrier(2);
        const sourceResults = await runConcurrent(prisma, [
            {
                wrap: (tx) =>
                    proxyTransaction(tx, {
                        after: {
                            findUnique: async (_row, args) => {
                                if (locationIdFromWhere(args) === source.id) await sourceReadBarrier();
                            },
                        },
                    }),
                run: (tx) => postTransferInTransaction(tx, transferA, userId),
            },
            {
                wrap: (tx) =>
                    proxyTransaction(tx, {
                        after: {
                            findUnique: async (_row, args) => {
                                if (locationIdFromWhere(args) === source.id) await sourceReadBarrier();
                            },
                        },
                    }),
                run: (tx) => postTransferInTransaction(tx, transferB, userId),
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
            transferOutRows: await prisma.inventoryLedger.count({
                where: {
                    tenantId,
                    locationId: source.id,
                    movementType: 'TRANSFER_OUT',
                    referenceId: { in: [transferA.id, transferB.id] },
                },
            }),
        };
        console.log('[proof] transfer-source-race', JSON.stringify(sourceProof));

        const inboundSource = await createLocation(prisma, tenantId, runContext.runId, 'INBOUND-SOURCE');
        const shared = await createLocation(prisma, tenantId, runContext.runId, 'SHARED');
        const outboundDest = await createLocation(prisma, tenantId, runContext.runId, 'OUTBOUND-DEST');
        await setStock(prisma, { tenantId, itemId: item.id, locationId: inboundSource.id, qty: 20, wac: 20 });
        await setStock(prisma, { tenantId, itemId: item.id, locationId: shared.id, qty: 100, wac: 10 });
        const inbound = await createTransfer(prisma, {
            tenantId,
            userId,
            itemId: item.id,
            unitId: unit.id,
            sourceId: inboundSource.id,
            destId: shared.id,
            qty: 20,
            transferNo: `IT-TR-IN-${runContext.runId}`,
        });
        const outbound = await createTransfer(prisma, {
            tenantId,
            userId,
            itemId: item.id,
            unitId: unit.id,
            sourceId: shared.id,
            destId: outboundDest.id,
            qty: 40,
            transferNo: `IT-TR-OUT-${runContext.runId}`,
        });

        const sharedReadBarrier = createBarrier(2);
        const outboundUpdated = createSignal();
        const sharedResults = await runConcurrent(prisma, [
            {
                wrap: (tx) =>
                    proxyTransaction(tx, {
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
                run: (tx) => postTransferInTransaction(tx, inbound, userId),
            },
            {
                wrap: (tx) =>
                    proxyTransaction(tx, {
                        after: {
                            findUnique: async (_row, args) => {
                                if (locationIdFromWhere(args) === shared.id) await sharedReadBarrier();
                            },
                            update: async (_row, args) => {
                                if (locationIdFromWhere(args) === shared.id) outboundUpdated.release();
                            },
                        },
                    }),
                run: (tx) => postTransferInTransaction(tx, outbound, userId),
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
                movementType: 'TRANSFER_OUT',
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
        console.log('[proof] transfer-destination-outbound-race', JSON.stringify(sharedProof));

        assert.deepEqual(sourceProof, {
            successes: 1,
            failures: 1,
            qtyOnHand: 40,
            transferOutRows: 1,
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
            await prisma.storeTransferLine.deleteMany({ where: { transfer: { tenantId } } });
            await prisma.storeTransfer.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.item.deleteMany({ where: { tenantId } });
            await prisma.unit.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) {
            await prisma.user.delete({ where: { id: userId } });
        }
        await prisma.$disconnect();
    }
});
