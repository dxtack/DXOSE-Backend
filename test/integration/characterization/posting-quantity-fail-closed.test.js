'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const postingService = require('../../../src/services/posting.service');
const {
    postBreakageMovementInTransaction,
    postLostMovementInTransaction,
} = require('../../../src/services/postingGovernedMovement.service');

async function createDocumentFixture(prisma, {
    tenantId,
    userId,
    runId,
    movementType,
    suffix,
    quantities,
}) {
    const lines = [];
    for (let index = 0; index < quantities.length; index += 1) {
        const location = await prisma.location.create({
            data: { tenantId, name: `P11 ${movementType} ${suffix} Location ${index} ${runId}` },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `P11 ${movementType} ${suffix} Item ${index} ${runId}`,
                code: `P11-${movementType}-${suffix}-${index}-${runId}`.slice(0, 60),
                unitPrice: 10,
            },
        });
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
        lines.push({
            itemId: item.id,
            locationId: location.id,
            qtyRequested: quantities[index],
            qtyInBaseUnit: quantities[index],
            unitCost: 10,
            totalValue: quantities[index] * 10,
        });
    }

    return prisma.movementDocument.create({
        data: {
            tenantId,
            documentNo: `P11-${movementType}-${suffix}-${runId}`.slice(0, 100),
            movementType,
            sourceType: 'INTERNAL',
            status: 'DRAFT',
            reason: 'P0 #11 deterministic fail-open proof',
            createdBy: userId,
            lines: { create: lines },
        },
        include: { lines: { include: { item: true } } },
    });
}

async function postAsActualEntryPoint(prisma, document, tenantId, userId) {
    if (document.movementType === 'OPENING_BALANCE') {
        return postingService.postDocument(document.id, tenantId, userId);
    }

    return prisma.$transaction(async (tx) => {
        if (document.movementType === 'BREAKAGE') {
            await postBreakageMovementInTransaction(tx, document, tenantId, userId);
        } else {
            await postLostMovementInTransaction(tx, document, userId);
        }
        return tx.movementDocument.update({
            where: { id: document.id },
            data: { status: 'POSTED', postedAt: new Date() },
        });
    });
}

test('posting quantity guards reject invalid lines instead of silently posting', async (t) => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `P11 Quantity Guard ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p11-quantity'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P11',
                lastName: 'Quantity',
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
        await prisma.tenantSetting.create({
            data: { tenantId, key: 'allowOpeningBalance', value: 'OPEN' },
        });

        const cases = [
            { type: 'BREAKAGE', suffix: 'mixed', quantities: [0, 10] },
            { type: 'BREAKAGE', suffix: 'all-invalid', quantities: [0, -5] },
            { type: 'LOST', suffix: 'mixed', quantities: [-5, 10] },
            { type: 'LOST', suffix: 'all-invalid', quantities: [0, -5] },
            { type: 'OPENING_BALANCE', suffix: 'mixed', quantities: [0, 20] },
            { type: 'OPENING_BALANCE', suffix: 'all-invalid', quantities: [0, -5] },
        ];

        for (const proofCase of cases) {
            await t.test(`${proofCase.type} ${proofCase.suffix}`, async () => {
                const document = await createDocumentFixture(prisma, {
                    tenantId,
                    userId,
                    runId: runContext.runId,
                    movementType: proofCase.type,
                    suffix: proofCase.suffix,
                    quantities: proofCase.quantities,
                });
                const outcome = await Promise.allSettled([
                    postAsActualEntryPoint(prisma, document, tenantId, userId),
                ]);
                const stored = await prisma.movementDocument.findUnique({
                    where: { id: document.id },
                    include: { lines: true },
                });
                const stocks = [];
                for (const line of stored.lines) {
                    const stock = await prisma.stockBalance.findUnique({
                        where: {
                            tenantId_itemId_locationId: {
                                tenantId,
                                itemId: line.itemId,
                                locationId: line.locationId,
                            },
                        },
                    });
                    stocks.push(Number(stock.qtyOnHand));
                }
                const ledgerRows = await prisma.inventoryLedger.count({
                    where: { tenantId, referenceId: document.id },
                });
                stocks.sort((a, b) => a - b);
                const proof = {
                    outcome: outcome[0].status,
                    errorCode: outcome[0].status === 'rejected'
                        ? outcome[0].reason?.code
                        : null,
                    status: stored.status,
                    quantities: proofCase.quantities,
                    stocks,
                    ledgerRows,
                };
                console.log(
                    `[proof] p11-${proofCase.type.toLowerCase()}-${proofCase.suffix}`,
                    JSON.stringify(proof),
                );

                assert.equal(proof.outcome, 'rejected');
                assert.equal(proof.errorCode, 'INVALID_POSTING_LINE_QUANTITY');
                assert.equal(proof.status, 'DRAFT');
                assert.deepEqual(proof.stocks, [100, 100]);
                assert.equal(proof.ledgerRows, 0);
            });
        }
    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.movementDocument.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            await prisma.tenantSetting.deleteMany({ where: { tenantId } });
            await prisma.docSequence.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.item.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
