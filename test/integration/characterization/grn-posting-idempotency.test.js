'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { postGrnInTransaction } = require('../../../src/services/postingGovernedGrn.service');

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

test('GRN posting effect is idempotent under concurrent duplicate delivery', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `P02 GRN Idempotency ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p02-grn-idempotency'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P02',
                lastName: 'GRN Idempotency',
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
            data: { tenantId, name: `P02 GRN Location ${runContext.runId}` },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `P02 GRN Item ${runContext.runId}`,
                code: `P02-GRN-${runContext.runId}`.slice(0, 60),
                unitPrice: 20,
            },
        });
        const unit = await prisma.unit.create({
            data: {
                tenantId,
                name: `P02 GRN Unit ${runContext.runId}`,
                abbreviation: `G${runContext.runId}`.slice(0, 20),
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
                qtyOnHand: 0,
                qtyBlocked: 0,
                wacUnitCost: 0,
            },
        });
        const grn = await prisma.grnImport.create({
            data: {
                tenantId,
                grnNumber: `P02-GRN-${runContext.runId}`,
                vendorNameSnapshot: 'P02 Supplier',
                locationId: location.id,
                receivingDate: now,
                pdfAttachmentUrl: 'integration-test.pdf',
                importedBy: userId,
                lines: {
                    create: {
                        futurelogItemCode: 'P02-GRN',
                        futurelogDescription: 'P02 duplicate GRN proof',
                        futurelogUom: unit.abbreviation,
                        orderedQty: 10,
                        receivedQty: 10,
                        unitPrice: 20,
                        internalItemId: item.id,
                        internalUomId: unit.id,
                        qtyInBaseUnit: 10,
                        isMapped: true,
                    },
                },
            },
            include: { lines: true },
        });

        const barrier = createBarrier(2);
        const results = await Promise.allSettled(
            [1, 2].map(() =>
                prisma.$transaction(
                    (tx) => postGrnInTransaction(
                        synchronizeDuplicateCheck(tx, barrier),
                        grn,
                        userId,
                    ),
                    { timeout: 15000 },
                ),
            ),
        );
        const stock = await prisma.stockBalance.findUnique({ where: stockKey });
        const ledgerRows = await prisma.inventoryLedger.findMany({
            where: { tenantId, referenceType: 'GRN', referenceId: grn.id },
            orderBy: { createdAt: 'asc' },
        });
        const movementDocuments = await prisma.movementDocument.count({
            where: { tenantId, documentNo: grn.grnNumber, movementType: 'RECEIVE' },
        });
        const proof = {
            successes: results.filter((result) => result.status === 'fulfilled').length,
            failures: results.filter((result) => result.status === 'rejected').length,
            failureCodes: results
                .filter((result) => result.status === 'rejected')
                .map((result) => result.reason?.code || null),
            failureTargets: results
                .filter((result) => result.status === 'rejected')
                .map((result) => result.reason?.meta?.target || null),
            qtyOnHand: Number(stock.qtyOnHand),
            wacUnitCost: Number(stock.wacUnitCost),
            ledgerRows: ledgerRows.length,
            receiptValue: ledgerRows.reduce((sum, row) => sum + Number(row.totalValue), 0),
            movementDocuments,
            postingEffectKeys: ledgerRows.map((row) => row.postingEffectKey),
        };
        console.log('[before] p02-grn-duplicate', JSON.stringify(proof));

        assert.deepEqual(proof, {
            successes: 1,
            failures: 1,
            failureCodes: ['P2002'],
            failureTargets: [['tenantId', 'documentNo']],
            qtyOnHand: 10,
            wacUnitCost: 20,
            ledgerRows: 1,
            receiptValue: 200,
            movementDocuments: 1,
            postingEffectKeys: [null],
        });
    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.movementDocument.deleteMany({ where: { tenantId } });
            await prisma.grnImport.deleteMany({ where: { tenantId } });
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
