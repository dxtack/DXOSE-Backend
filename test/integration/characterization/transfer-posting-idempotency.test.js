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

test('Transfer posting effects are idempotent under concurrent duplicate delivery', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `P02 Transfer Idempotency ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p02-transfer-idempotency'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P02',
                lastName: 'Transfer Idempotency',
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
                name: `P02 Transfer Unit ${runContext.runId}`,
                abbreviation: `T${runContext.runId}`.slice(0, 20),
            },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `P02 Transfer Item ${runContext.runId}`,
                code: `P02-TRF-${runContext.runId}`.slice(0, 60),
                unitPrice: 10,
            },
        });
        const source = await prisma.location.create({
            data: { tenantId, name: `P02 Transfer Source ${runContext.runId}` },
        });
        const destination = await prisma.location.create({
            data: { tenantId, name: `P02 Transfer Destination ${runContext.runId}` },
        });
        const sourceKey = {
            tenantId_itemId_locationId: {
                tenantId,
                itemId: item.id,
                locationId: source.id,
            },
        };
        const destinationKey = {
            tenantId_itemId_locationId: {
                tenantId,
                itemId: item.id,
                locationId: destination.id,
            },
        };
        await prisma.stockBalance.create({
            data: {
                tenantId,
                itemId: item.id,
                locationId: source.id,
                qtyOnHand: 100,
                qtyBlocked: 0,
                wacUnitCost: 10,
            },
        });
        const transfer = await prisma.storeTransfer.create({
            data: {
                tenantId,
                transferNo: `P02-TRF-${runContext.runId}`,
                sourceLocationId: source.id,
                destLocationId: destination.id,
                requestedBy: userId,
                status: 'APPROVED',
                lines: {
                    create: {
                        itemId: item.id,
                        uomId: unit.id,
                        requestedQty: 10,
                    },
                },
            },
            include: {
                lines: true,
                sourceLocation: true,
                destLocation: true,
            },
        });

        const barrier = createBarrier(2);
        const results = await Promise.allSettled(
            [1, 2].map(() =>
                prisma.$transaction(
                    (tx) => postTransferInTransaction(
                        synchronizeDuplicateCheck(tx, barrier),
                        transfer,
                        userId,
                    ),
                    { timeout: 15000 },
                ),
            ),
        );
        const sourceStock = await prisma.stockBalance.findUnique({ where: sourceKey });
        const destinationStock = await prisma.stockBalance.findUnique({ where: destinationKey });
        const ledgerRows = await prisma.inventoryLedger.findMany({
            where: { tenantId, referenceType: 'TRANSFER', referenceId: transfer.id },
            orderBy: [{ movementType: 'asc' }, { createdAt: 'asc' }],
        });
        const proof = {
            successes: results.filter((result) => result.status === 'fulfilled').length,
            failures: results.filter((result) => result.status === 'rejected').length,
            failureCodes: results
                .filter((result) => result.status === 'rejected')
                .map((result) => result.reason?.code || null),
            sourceQty: Number(sourceStock.qtyOnHand),
            destinationQty: Number(destinationStock.qtyOnHand),
            ledgerRows: ledgerRows.length,
            transferOutRows: ledgerRows.filter((row) => row.movementType === 'TRANSFER_OUT').length,
            transferInRows: ledgerRows.filter((row) => row.movementType === 'TRANSFER_IN').length,
            postingEffectKeys: ledgerRows.map((row) => row.postingEffectKey),
        };
        console.log('[proof] p02-transfer-duplicate', JSON.stringify(proof));

        assert.deepEqual(proof, {
            successes: 1,
            failures: 1,
            failureCodes: ['POSTING_EFFECT_ALREADY_APPLIED'],
            sourceQty: 90,
            destinationQty: 10,
            ledgerRows: 2,
            transferOutRows: 1,
            transferInRows: 1,
            postingEffectKeys: [
                `v1|TRANSFER|${tenantId}|${transfer.id}|${transfer.lines[0].id}|OUT`,
                `v1|TRANSFER|${tenantId}|${transfer.id}|${transfer.lines[0].id}|IN`,
            ],
        });
    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.storeTransfer.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.item.deleteMany({ where: { tenantId } });
            await prisma.unit.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
