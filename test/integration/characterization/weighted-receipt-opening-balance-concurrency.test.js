'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const postingService = require('../../../src/services/posting.service');
const { postGrnInTransaction } = require('../../../src/services/postingGovernedGrn.service');
const getPassService = require('../../../src/services/getPass.service');

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

function createPauseGate() {
    let markRead;
    let releaseRead;
    return {
        read: new Promise((resolve) => {
            markRead = resolve;
        }),
        release: new Promise((resolve) => {
            releaseRead = resolve;
        }),
        markRead,
        releaseRead,
    };
}

function proxyStockRead(tx, { locationId, method, wait }) {
    let intercepted = false;
    const stockBalance = new Proxy(tx.stockBalance, {
        get(target, property) {
            const value = target[property];
            if (property !== method) return typeof value === 'function' ? value.bind(target) : value;
            return async (...args) => {
                const result = await value.apply(target, args);
                const uniqueLocation = args[0]?.where?.tenantId_itemId_locationId?.locationId;
                const manyLocations = args[0]?.where?.OR?.map((row) => row.locationId) || [];
                if (!intercepted && (uniqueLocation === locationId || manyLocations.includes(locationId))) {
                    intercepted = true;
                    await wait();
                }
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

async function createStockCell(prisma, { tenantId, runId, suffix, qty = 100, wac = 10 }) {
    const location = await prisma.location.create({
        data: { tenantId, name: `P09 ${suffix} ${runId}` },
    });
    const item = await prisma.item.create({
        data: {
            tenantId,
            name: `P09 Item ${suffix} ${runId}`,
            code: `P09-${suffix}-${runId}`.slice(0, 60),
            unitPrice: wac,
        },
    });
    await prisma.stockBalance.create({
        data: {
            tenantId,
            itemId: item.id,
            locationId: location.id,
            qtyOnHand: qty,
            qtyBlocked: 0,
            wacUnitCost: wac,
        },
    });
    return {
        item,
        location,
        key: {
            tenantId_itemId_locationId: {
                tenantId,
                itemId: item.id,
                locationId: location.id,
            },
        },
    };
}

async function createMovement(prisma, {
    tenantId,
    userId,
    itemId,
    locationId,
    movementType,
    qty,
    unitCost,
    documentNo,
}) {
    return prisma.movementDocument.create({
        data: {
            tenantId,
            documentNo,
            movementType,
            status: 'DRAFT',
            sourceLocationId: locationId,
            destLocationId: locationId,
            createdBy: userId,
            lines: {
                create: {
                    itemId,
                    locationId,
                    qtyRequested: qty,
                    qtyInBaseUnit: qty,
                    unitCost,
                    totalValue: qty * unitCost,
                },
            },
        },
    });
}

test('P0 #9 weighted receipts and Opening Balance preserve committed stock state', async (t) => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    const tenantIds = [];
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `P09 Receipts ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantIds.push(tenant.id);
        const targetTenant = await prisma.tenant.create({
            data: {
                name: `P09 Receipt Target ${runContext.runId}`,
                slug: `${runContext.tenantSlug}-target`,
            },
        });
        tenantIds.push(targetTenant.id);
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p09-receipts'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P09',
                lastName: 'Receipts',
            },
        });
        userId = user.id;
        const now = new Date();
        for (const tenantId of tenantIds) {
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
        }
        const unit = await prisma.unit.create({
            data: {
                tenantId: tenant.id,
                name: `Piece ${runContext.runId}`,
                abbreviation: `P${runContext.runId}`.slice(0, 20),
            },
        });

        await t.test('GRN concurrent receipts preserve quantity, value, and WAC', async () => {
            const cell = await createStockCell(prisma, {
                tenantId: tenant.id,
                runId: runContext.runId,
                suffix: 'GRN',
            });
            const grns = [];
            for (const [label, qty, price] of [['A', 10, 20], ['B', 20, 30]]) {
                grns.push(await prisma.grnImport.create({
                    data: {
                        tenantId: tenant.id,
                        grnNumber: `P09-GRN-${label}-${runContext.runId}`,
                        vendorNameSnapshot: 'P09 Supplier',
                        locationId: cell.location.id,
                        receivingDate: now,
                        pdfAttachmentUrl: 'integration-test.pdf',
                        importedBy: userId,
                        lines: {
                            create: {
                                futurelogItemCode: `P09-${label}`,
                                futurelogDescription: `P09 GRN ${label}`,
                                futurelogUom: unit.abbreviation,
                                orderedQty: qty,
                                receivedQty: qty,
                                unitPrice: price,
                                internalItemId: cell.item.id,
                                internalUomId: unit.id,
                                qtyInBaseUnit: qty,
                                isMapped: true,
                            },
                        },
                    },
                    include: { lines: true },
                }));
            }
            const barrier = createBarrier(2);
            const results = await Promise.allSettled(grns.map((grn) =>
                prisma.$transaction(
                    (tx) => postGrnInTransaction(
                        proxyStockRead(tx, {
                            locationId: cell.location.id,
                            method: 'findUnique',
                            wait: barrier,
                        }),
                        grn,
                        userId,
                    ),
                    { timeout: 15000 },
                ),
            ));
            const stock = await prisma.stockBalance.findUnique({ where: cell.key });
            const ledgers = await prisma.inventoryLedger.findMany({
                where: { tenantId: tenant.id, referenceType: 'GRN', referenceId: { in: grns.map((g) => g.id) } },
            });
            const proof = {
                successes: results.filter((row) => row.status === 'fulfilled').length,
                qtyOnHand: Number(stock.qtyOnHand),
                wacUnitCost: Number(stock.wacUnitCost),
                receiptValue: ledgers.reduce((sum, row) => sum + Number(row.totalValue), 0),
            };
            console.log('[proof] p09-grn-weighted-race', JSON.stringify(proof));
            assert.equal(proof.successes, 2);
            assert.equal(proof.qtyOnHand, 130);
            assert.ok(Math.abs(proof.wacUnitCost - (1800 / 130)) < 0.0001);
            assert.equal(proof.receiptValue, 800);
        });

        await t.test('Generic RECEIVE/RETURN/TRANSFER_IN use committed-state weighted WAC', async () => {
            const proofs = {};
            for (const movementType of ['RECEIVE', 'RETURN', 'TRANSFER_IN']) {
                const cell = await createStockCell(prisma, {
                    tenantId: tenant.id,
                    runId: runContext.runId,
                    suffix: movementType,
                });
                const docs = await Promise.all([
                    createMovement(prisma, {
                        tenantId: tenant.id,
                        userId,
                        itemId: cell.item.id,
                        locationId: cell.location.id,
                        movementType,
                        qty: 10,
                        unitCost: 20,
                        documentNo: `P09-${movementType}-A-${runContext.runId}`,
                    }),
                    createMovement(prisma, {
                        tenantId: tenant.id,
                        userId,
                        itemId: cell.item.id,
                        locationId: cell.location.id,
                        movementType,
                        qty: 20,
                        unitCost: 30,
                        documentNo: `P09-${movementType}-B-${runContext.runId}`,
                    }),
                ]);
                const barrier = createBarrier(2);
                const results = await Promise.allSettled(docs.map((doc) =>
                    prisma.$transaction(
                        (tx) => postingService.postDocument(
                            doc.id,
                            tenant.id,
                            userId,
                            proxyStockRead(tx, {
                                locationId: cell.location.id,
                                method: 'findUnique',
                                wait: barrier,
                            }),
                        ),
                        { timeout: 15000 },
                    ),
                ));
                const stock = await prisma.stockBalance.findUnique({ where: cell.key });
                proofs[movementType] = {
                    successes: results.filter((row) => row.status === 'fulfilled').length,
                    qtyOnHand: Number(stock.qtyOnHand),
                    wacUnitCost: Number(stock.wacUnitCost),
                };
            }
            console.log('[proof] p09-generic-weighted-races', JSON.stringify(proofs));
            for (const proof of Object.values(proofs)) {
                assert.equal(proof.successes, 2);
                assert.equal(proof.qtyOnHand, 130);
                assert.ok(Math.abs(proof.wacUnitCost - (1800 / 130)) < 0.0001);
            }
        });

        await t.test('Get Pass permanent discrepancy uses checkout-fixed line cost', async () => {
            const cell = await createStockCell(prisma, {
                tenantId: tenant.id,
                runId: runContext.runId,
                suffix: 'GP-DISCREPANCY',
                qty: 95,
                wac: 25,
            });
            const getPass = await prisma.getPass.create({
                data: {
                    tenantId: tenant.id,
                    targetTenantId: targetTenant.id,
                    passNo: `P09-GP-${runContext.runId}`,
                    transferType: 'PERMANENT',
                    isInternalTransfer: true,
                    borrowingEntity: 'P09 Target',
                    status: 'OUT',
                    createdBy: userId,
                    lines: {
                        create: {
                            itemId: cell.item.id,
                            locationId: cell.location.id,
                            qty: 5,
                            unitCost: 10,
                            status: 'OUT',
                        },
                    },
                },
                include: { lines: true },
            });
            await getPassService.confirmDestinationReceipt(
                getPass.id,
                targetTenant.id,
                { id: userId, role: 'SECURITY' },
                {
                    receivedCondition: 'GOOD',
                    lines: [{
                        lineId: getPass.lines[0].id,
                        receivedQty: 4,
                        discrepancyReason: 'P09 proof discrepancy',
                    }],
                },
            );
            const ledger = await prisma.inventoryLedger.findFirst({
                where: {
                    tenantId: targetTenant.id,
                    referenceId: getPass.id,
                    movementType: 'LOAN_WRITE_OFF',
                },
            });
            const proof = {
                checkoutFixedCost: 10,
                liveSourceWacAtReceipt: 25,
                discrepancyLedgerCost: Number(ledger.unitCost),
                discrepancyLedgerValue: Number(ledger.totalValue),
            };
            console.log('[proof] p09-get-pass-discrepancy-cost', JSON.stringify(proof));
            assert.equal(proof.discrepancyLedgerCost, proof.checkoutFixedCost);
            assert.equal(proof.discrepancyLedgerValue, 10);
        });

        await t.test('Opening Balance reconciles against the live row changed during finalization', async () => {
            const cell = await createStockCell(prisma, {
                tenantId: tenant.id,
                runId: runContext.runId,
                suffix: 'OB',
                qty: 50,
                wac: 5,
            });
            await prisma.tenantSetting.update({
                where: { tenantId_key: { tenantId: tenant.id, key: 'allowOpeningBalance' } },
                data: { value: 'OPEN' },
            });
            const opening = await createMovement(prisma, {
                tenantId: tenant.id,
                userId,
                itemId: cell.item.id,
                locationId: cell.location.id,
                movementType: 'OPENING_BALANCE',
                qty: 100,
                unitCost: 8,
                documentNo: `P09-OB-${runContext.runId}`,
            });
            const receipt = await createMovement(prisma, {
                tenantId: tenant.id,
                userId,
                itemId: cell.item.id,
                locationId: cell.location.id,
                movementType: 'RECEIVE',
                qty: 10,
                unitCost: 20,
                documentNo: `P09-OB-RACE-${runContext.runId}`,
            });
            const gate = createPauseGate();
            const obPost = prisma.$transaction(
                (tx) => postingService.postDocument(
                    opening.id,
                    tenant.id,
                    userId,
                    proxyStockRead(tx, {
                        locationId: cell.location.id,
                        method: 'findMany',
                        wait: async () => {
                            gate.markRead();
                            await gate.release;
                        },
                    }),
                ),
                { timeout: 15000 },
            );
            await gate.read;
            await prisma.$transaction((tx) =>
                postingService.postDocument(receipt.id, tenant.id, userId, tx),
            );
            gate.releaseRead();
            const [obOutcome] = await Promise.allSettled([obPost]);

            const [stock, ledger] = await Promise.all([
                prisma.stockBalance.findUnique({ where: cell.key }),
                prisma.inventoryLedger.findFirst({
                    where: { tenantId: tenant.id, referenceId: opening.id, movementType: 'OPENING_BALANCE' },
                }),
            ]);
            const proof = {
                obPost: obOutcome.status,
                obErrorCode: obOutcome.status === 'rejected' ? obOutcome.reason?.code : null,
                qtyOnHand: Number(stock.qtyOnHand),
                wacUnitCost: Number(stock.wacUnitCost),
                obQtyIn: ledger ? Number(ledger.qtyIn) : null,
                obQtyOut: ledger ? Number(ledger.qtyOut) : null,
                obValueDelta: ledger ? Number(ledger.totalValue) : null,
            };
            console.log('[proof] p09-opening-balance-race', JSON.stringify(proof));
            if (proof.obPost === 'rejected') {
                assert.equal(proof.obErrorCode, 'OB_LOCKED');
                assert.equal(proof.qtyOnHand, 60);
                assert.equal(proof.obQtyIn, null);
                await prisma.tenantSetting.update({
                    where: { tenantId_key: { tenantId: tenant.id, key: 'allowOpeningBalance' } },
                    data: { value: 'OPEN' },
                });
                const retry = await createMovement(prisma, {
                    tenantId: tenant.id,
                    userId,
                    itemId: cell.item.id,
                    locationId: cell.location.id,
                    movementType: 'OPENING_BALANCE',
                    qty: 100,
                    unitCost: 8,
                    documentNo: `P09-OB-RETRY-${runContext.runId}`,
                });
                await postingService.postDocument(retry.id, tenant.id, userId);
                const retryLedger = await prisma.inventoryLedger.findFirst({
                    where: { tenantId: tenant.id, referenceId: retry.id, movementType: 'OPENING_BALANCE' },
                });
                assert.equal(Number(retryLedger.qtyIn), 40);
                assert.equal(Number(retryLedger.qtyOut), 0);
                assert.equal(Number(retryLedger.totalValue), 350);
                return;
            }
            assert.equal(proof.qtyOnHand, 100);
            assert.equal(proof.wacUnitCost, 8);
            assert.equal(proof.obQtyIn, 40);
            assert.equal(proof.obQtyOut, 0);
            assert.equal(proof.obValueDelta, 350);
        });
    } finally {
        await prisma.inventoryLedger.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.getPass.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.grnImport.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.movementDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.stockBalance.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.tenantSetting.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.docSequence.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.periodClose.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.item.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.unit.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.location.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
