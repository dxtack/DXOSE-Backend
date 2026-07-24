'use strict';

const crypto = require('crypto');
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

function synchronizeStockRead(tx, barrier) {
    const stockBalance = new Proxy(tx.stockBalance, {
        get(target, property) {
            const value = target[property];
            if (property !== 'findUnique') {
                return typeof value === 'function' ? value.bind(target) : value;
            }
            return async (...args) => {
                const row = await value.apply(target, args);
                await barrier();
                return row;
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

async function runConcurrentPostings(prisma, workers) {
    const transactionBarrier = createBarrier(workers.length);
    const stockReadBarrier = createBarrier(workers.length);
    return Promise.allSettled(
        workers.map((worker) =>
            prisma.$transaction(
                async (tx) => {
                    await transactionBarrier();
                    return worker(synchronizeStockRead(tx, stockReadBarrier));
                },
                { timeout: 15000 },
            ),
        ),
    );
}

function movementDoc({ tenantId, itemId, locationId, type, documentNo }) {
    return {
        id: crypto.randomUUID(),
        tenantId,
        documentNo,
        movementType: type,
        sourceType: 'INTERNAL',
        reason: 'Concurrent stock proof',
        lines: [
            {
                itemId,
                locationId,
                qtyInBaseUnit: 60,
                item: { name: 'Concurrent stock item' },
            },
        ],
    };
}

test('Breakage and Lost cannot concurrently consume the same available stock', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `Movement Concurrency ${runContext.runId}`,
                slug: runContext.tenantSlug,
            },
        });
        tenantId = tenant.id;

        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('movement-concurrency'),
                passwordHash: 'integration-test-not-used',
                firstName: 'Movement',
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

        const location = await prisma.location.create({
            data: {
                tenantId,
                name: `Movement Concurrency Location ${runContext.runId}`,
            },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `Movement Concurrency Item ${runContext.runId}`,
                code: `MC-${runContext.runId}`.slice(0, 60),
                unitPrice: 25,
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
                wacUnitCost: 25,
            },
        });

        const breakage = movementDoc({
            tenantId,
            itemId: item.id,
            locationId: location.id,
            type: 'BREAKAGE',
            documentNo: `IT-BRK-${runContext.runId}`,
        });
        const lost = movementDoc({
            tenantId,
            itemId: item.id,
            locationId: location.id,
            type: 'LOST',
            documentNo: `IT-LST-${runContext.runId}`,
        });

        const results = await runConcurrentPostings(prisma, [
            (tx) => postBreakageMovementInTransaction(tx, breakage, tenantId, userId),
            (tx) => postLostMovementInTransaction(tx, lost, userId),
        ]);
        const successes = results.filter((result) => result.status === 'fulfilled').length;
        const failures = results.length - successes;

        const stock = await prisma.stockBalance.findUnique({ where: stockKey });
        const ledgerRows = await prisma.inventoryLedger.findMany({
            where: {
                tenantId,
                referenceId: { in: [breakage.id, lost.id] },
            },
            orderBy: { createdAt: 'asc' },
        });
        const proof = {
            successes,
            failures,
            qtyOnHand: Number(stock.qtyOnHand),
            qtyBlocked: Number(stock.qtyBlocked),
            totalQtyDamage: Number(stock.totalQtyDamage),
            totalQtyLost: Number(stock.totalQtyLost),
            ledgerRows: ledgerRows.length,
            ledgerBalances: ledgerRows.map((row) => Number(row.balanceAfter)),
        };
        console.log('[proof] breakage-lost-concurrency', JSON.stringify(proof));

        assert.equal(successes, 1, 'exactly one competing posting must succeed');
        assert.equal(failures, 1, 'the posting that loses the stock race must be rejected');
        assert.equal(proof.qtyOnHand, 40);
        assert.ok(proof.qtyOnHand >= 0);
        assert.equal(proof.qtyBlocked, 0);
        assert.equal(proof.totalQtyDamage + proof.totalQtyLost, 60);
        assert.equal(proof.ledgerRows, 1);
        assert.deepEqual(proof.ledgerBalances, [40]);
    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
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
