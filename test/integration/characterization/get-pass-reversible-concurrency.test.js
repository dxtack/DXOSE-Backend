'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const {
    postGetPassCheckoutInTransaction,
    releaseBlockedOnReturn,
} = require('../../../src/services/postingGovernedGetPass.service');

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

async function runConcurrentTransactions(prisma, workers) {
    const barrier = createBarrier(workers.length);
    return Promise.all(
        workers.map((worker) =>
            prisma.$transaction(
                async (tx) => {
                    await barrier();
                    return worker(tx);
                },
                { timeout: 15000 },
            ),
        ),
    );
}

async function createStockFixture(prisma, { tenantId, userId, runId, suffix, qtyOnHand = 100, qtyBlocked = 0 }) {
    const location = await prisma.location.create({
        data: {
            tenantId,
            name: `Concurrency Location ${suffix} ${runId}`,
        },
    });
    const item = await prisma.item.create({
        data: {
            tenantId,
            name: `Concurrency Item ${suffix} ${runId}`,
            code: `CC-${suffix}-${runId}`.slice(0, 60),
            unitPrice: 25,
        },
    });
    await prisma.stockBalance.create({
        data: {
            tenantId,
            itemId: item.id,
            locationId: location.id,
            qtyOnHand,
            qtyBlocked,
            wacUnitCost: 25,
        },
    });
    return {
        item,
        location,
        stockKey: {
            tenantId_itemId_locationId: {
                tenantId,
                itemId: item.id,
                locationId: location.id,
            },
        },
        user: { id: userId },
    };
}

async function createReversibleGetPass(prisma, { tenantId, userId, itemId, locationId, passNo }) {
    return prisma.getPass.create({
        data: {
            tenantId,
            passNo,
            transferType: 'TEMPORARY',
            borrowingEntity: 'Integration Test Borrower',
            createdBy: userId,
            lines: {
                create: {
                    itemId,
                    locationId,
                    qty: 10,
                },
            },
        },
        include: { lines: true },
    });
}

async function readBalance(prisma, stockKey) {
    const row = await prisma.stockBalance.findUnique({ where: stockKey });
    return {
        qtyOnHand: Number(row.qtyOnHand),
        qtyBlocked: Number(row.qtyBlocked),
        available: Number(row.qtyOnHand) - Number(row.qtyBlocked),
    };
}

test('Get Pass reversible checkout and return release use real concurrent conditional updates', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `Get Pass Concurrency ${runContext.runId}`,
                slug: runContext.tenantSlug,
            },
        });
        tenantId = tenant.id;

        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('gp-concurrency'),
                passwordHash: 'integration-test-not-used',
                firstName: 'Concurrency',
                lastName: 'Tester',
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

        const checkoutFixture = await createStockFixture(prisma, {
            tenantId,
            userId,
            runId: runContext.runId,
            suffix: 'CHECKOUT',
        });
        const checkoutA = await createReversibleGetPass(prisma, {
            tenantId,
            userId,
            itemId: checkoutFixture.item.id,
            locationId: checkoutFixture.location.id,
            passNo: `IT-GP-A-${runContext.runId}`,
        });
        const checkoutB = await createReversibleGetPass(prisma, {
            tenantId,
            userId,
            itemId: checkoutFixture.item.id,
            locationId: checkoutFixture.location.id,
            passNo: `IT-GP-B-${runContext.runId}`,
        });

        await runConcurrentTransactions(prisma, [
            (tx) =>
                postGetPassCheckoutInTransaction(tx, {
                    getPass: checkoutA,
                    tenantId,
                    user: checkoutFixture.user,
                }),
            (tx) =>
                postGetPassCheckoutInTransaction(tx, {
                    getPass: checkoutB,
                    tenantId,
                    user: checkoutFixture.user,
                }),
        ]);

        const checkoutBalance = await readBalance(prisma, checkoutFixture.stockKey);
        assert.deepEqual(checkoutBalance, {
            qtyOnHand: 100,
            qtyBlocked: 20,
            available: 80,
        });
        assert.ok(checkoutBalance.qtyBlocked <= checkoutBalance.qtyOnHand);
        console.log('[proof] concurrent-checkout', JSON.stringify(checkoutBalance));

        const duplicateFixture = await createStockFixture(prisma, {
            tenantId,
            userId,
            runId: runContext.runId,
            suffix: 'DUPLICATE',
        });
        const duplicatePass = await createReversibleGetPass(prisma, {
            tenantId,
            userId,
            itemId: duplicateFixture.item.id,
            locationId: duplicateFixture.location.id,
            passNo: `IT-GP-DUP-${runContext.runId}`,
        });

        const duplicateResults = await Promise.allSettled([
            ...[1, 2].map(() =>
                prisma.$transaction(
                    (tx) =>
                        postGetPassCheckoutInTransaction(tx, {
                            getPass: duplicatePass,
                            tenantId,
                            user: duplicateFixture.user,
                        }),
                    { timeout: 15000 },
                ),
            ),
        ]);
        const duplicateSuccesses = duplicateResults.filter((result) => result.status === 'fulfilled').length;
        const duplicateFailures = duplicateResults.length - duplicateSuccesses;
        const duplicateBalance = await readBalance(prisma, duplicateFixture.stockKey);
        const duplicateLedgerCount = await prisma.inventoryLedger.count({
            where: {
                tenantId,
                referenceType: 'GET_PASS',
                referenceId: duplicatePass.id,
                movementType: 'GET_PASS_OUT',
            },
        });
        assert.equal(duplicateBalance.qtyBlocked, duplicateSuccesses * 10);
        assert.equal(duplicateBalance.available, 100 - duplicateSuccesses * 10);
        assert.equal(duplicateLedgerCount, duplicateSuccesses);
        assert.ok(duplicateBalance.qtyBlocked <= duplicateBalance.qtyOnHand);
        console.log(
            '[proof] duplicate-document',
            JSON.stringify({
                successes: duplicateSuccesses,
                failures: duplicateFailures,
                ledgerRows: duplicateLedgerCount,
                ...duplicateBalance,
                note:
                    duplicateSuccesses === 2
                        ? 'Known phase-1 idempotency gap reproduced'
                        : 'Existing application guard rejected one duplicate',
            }),
        );

        const releaseFixture = await createStockFixture(prisma, {
            tenantId,
            userId,
            runId: runContext.runId,
            suffix: 'RELEASE',
            qtyBlocked: 20,
        });
        await runConcurrentTransactions(prisma, [
            (tx) =>
                releaseBlockedOnReturn(tx, {
                    stockKey: releaseFixture.stockKey,
                    releaseQty: 10,
                    nonGoodQty: 0,
                }),
            (tx) =>
                releaseBlockedOnReturn(tx, {
                    stockKey: releaseFixture.stockKey,
                    releaseQty: 10,
                    nonGoodQty: 0,
                }),
        ]);

        const releaseBalance = await readBalance(prisma, releaseFixture.stockKey);
        assert.deepEqual(releaseBalance, {
            qtyOnHand: 100,
            qtyBlocked: 0,
            available: 100,
        });
        assert.ok(releaseBalance.qtyBlocked <= releaseBalance.qtyOnHand);
        console.log('[proof] concurrent-return-release', JSON.stringify(releaseBalance));
    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
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
