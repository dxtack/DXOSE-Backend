'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const database = require('../../../src/config/database');
const { createRunContext } = require('../../harness/run-context');
const getPassService = require('../../../src/services/getPass.service');
const posting = require('../../../src/services/postingGovernedGetPass.service');

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

function synchronizeLedgerCheck(tx, barrier) {
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

async function raceTransactions(prisma, worker) {
    const barrier = createBarrier(2);
    return Promise.allSettled(
        [1, 2].map(() =>
            prisma.$transaction((tx) => worker(synchronizeLedgerCheck(tx, barrier)), { timeout: 15000 }),
        ),
    );
}

async function raceAfterPassRead(passId, worker) {
    const barrier = createBarrier(2);
    const original = database.getPass.findFirst.bind(database.getPass);
    let hits = 0;
    database.getPass.findFirst = async (args) => {
        const result = await original(args);
        if (args?.where?.id === passId && hits < 2) {
            hits += 1;
            await barrier();
        }
        return result;
    };
    try {
        return await Promise.allSettled([worker(), worker()]);
    } finally {
        database.getPass.findFirst = original;
    }
}

function outcome(results) {
    return {
        successes: results.filter((result) => result.status === 'fulfilled').length,
        failures: results.filter((result) => result.status === 'rejected').length,
        failureCodes: results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason?.code || null),
    };
}

test('Get Pass posting effects and partial-return quantity are idempotent', async (t) => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `P02 Get Pass Idempotency ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p02-get-pass-idempotency'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P02',
                lastName: 'Get Pass Idempotency',
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

        async function createCell(suffix, { qty = 100, blocked = 0 } = {}) {
            const location = await prisma.location.create({
                data: { tenantId, name: `P02 GP ${suffix} Location ${runContext.runId}` },
            });
            const item = await prisma.item.create({
                data: {
                    tenantId,
                    name: `P02 GP ${suffix} Item ${runContext.runId}`,
                    code: `P02-GP-${suffix}-${runContext.runId}`.slice(0, 60),
                    unitPrice: 10,
                },
            });
            const key = {
                tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: location.id },
            };
            await prisma.stockBalance.create({
                data: {
                    tenantId,
                    itemId: item.id,
                    locationId: location.id,
                    qtyOnHand: qty,
                    qtyBlocked: blocked,
                    wacUnitCost: 10,
                },
            });
            return { location, item, key };
        }

        async function createPass(suffix, cell, overrides = {}) {
            return prisma.getPass.create({
                data: {
                    tenantId,
                    passNo: `P02-GP-${suffix}-${runContext.runId}`,
                    transferType: 'TEMPORARY',
                    isInternalTransfer: false,
                    borrowingEntity: 'P02 Borrower',
                    status: 'OUT',
                    createdBy: userId,
                    ...overrides,
                    lines: {
                        create: {
                            itemId: cell.item.id,
                            locationId: cell.location.id,
                            qty: 10,
                            qtyReturned: 0,
                            unitCost: 10,
                            status: 'OUT',
                        },
                    },
                },
                include: { lines: { include: { item: true } } },
            });
        }

        await t.test('CHECKOUT', async () => {
            const cell = await createCell('CHECKOUT');
            const pass = await createPass('CHECKOUT', cell, { status: 'PENDING_SECURITY' });
            const results = await raceTransactions(prisma, (tx) =>
                posting.postGetPassCheckoutInTransaction(tx, {
                    getPass: pass,
                    tenantId,
                    user,
                }),
            );
            const [stock, ledgers] = await Promise.all([
                prisma.stockBalance.findUnique({ where: cell.key }),
                prisma.inventoryLedger.findMany({ where: { tenantId, referenceId: pass.id } }),
            ]);
            const proof = {
                ...outcome(results),
                qtyBlocked: Number(stock.qtyBlocked),
                ledgerRows: ledgers.length,
                keys: ledgers.map((row) => row.postingEffectKey),
            };
            console.log('[after] p02-gp-checkout', JSON.stringify(proof));
            assert.deepEqual(proof, {
                successes: 1,
                failures: 1,
                failureCodes: ['POSTING_EFFECT_ALREADY_APPLIED'],
                qtyBlocked: 10,
                ledgerRows: 1,
                keys: [
                    `v1|GET_PASS|${tenantId}|${pass.id}|${pass.lines[0].id}|CHECKOUT`,
                ],
            });
        });

        await t.test('DESTINATION_RECEIVE', async () => {
            const cell = await createCell('DEST-RECEIVE', { qty: 0 });
            const getPassId = crypto.randomUUID();
            const getPassLineId = crypto.randomUUID();
            const results = await raceTransactions(prisma, (tx) =>
                posting.postPermanentDestinationReceiveLine(tx, {
                    tenantId,
                    destinationItemId: cell.item.id,
                    locationId: cell.location.id,
                    receivedQty: 10,
                    sourceWac: 10,
                    getPassId,
                    getPassLineId,
                    passNo: `P02-DEST-${runContext.runId}`,
                    userId,
                }),
            );
            const [stock, ledgers] = await Promise.all([
                prisma.stockBalance.findUnique({ where: cell.key }),
                prisma.inventoryLedger.findMany({ where: { tenantId, referenceId: getPassId } }),
            ]);
            const proof = {
                ...outcome(results),
                qtyOnHand: Number(stock.qtyOnHand),
                ledgerRows: ledgers.length,
                keys: ledgers.map((row) => row.postingEffectKey),
            };
            console.log('[after] p02-gp-destination-receive', JSON.stringify(proof));
            assert.deepEqual(proof, {
                successes: 1,
                failures: 1,
                failureCodes: ['POSTING_EFFECT_ALREADY_APPLIED'],
                qtyOnHand: 10,
                ledgerRows: 1,
                keys: [
                    `v1|GET_PASS|${tenantId}|${getPassId}|${getPassLineId}|DESTINATION_RECEIVE`,
                ],
            });
        });

        await t.test('DESTINATION_DISCREPANCY', async () => {
            const cell = await createCell('DISCREPANCY');
            const getPassId = crypto.randomUUID();
            const getPassLineId = crypto.randomUUID();
            const results = await raceTransactions(prisma, (tx) =>
                posting.postPermanentDiscrepancyWriteOff(tx, {
                    tenantId,
                    itemId: cell.item.id,
                    locationId: cell.location.id,
                    discrepancyQty: 2,
                    sourceWac: 10,
                    getPassId,
                    getPassLineId,
                    passNo: `P02-DISC-${runContext.runId}`,
                    userId,
                }),
            );
            const ledgers = await prisma.inventoryLedger.findMany({
                where: { tenantId, referenceId: getPassId },
            });
            const proof = {
                ...outcome(results),
                ledgerRows: ledgers.length,
                keys: ledgers.map((row) => row.postingEffectKey),
            };
            console.log('[after] p02-gp-destination-discrepancy', JSON.stringify(proof));
            assert.deepEqual(proof, {
                successes: 1,
                failures: 1,
                failureCodes: ['POSTING_EFFECT_ALREADY_APPLIED'],
                ledgerRows: 1,
                keys: [
                    `v1|GET_PASS|${tenantId}|${getPassId}|${getPassLineId}|DESTINATION_DISCREPANCY`,
                ],
            });
        });

        await t.test('TEMP_RECEIVE', async () => {
            const cell = await createCell('TEMP-RECEIVE');
            const getPassId = crypto.randomUUID();
            const getPassLineId = crypto.randomUUID();
            const results = await raceTransactions(prisma, (tx) =>
                posting.createTrackingLedgerEntry(tx, {
                    tenantId,
                    itemId: cell.item.id,
                    locationId: cell.location.id,
                    movementType: 'TEMP_RECEIVE',
                    qtyIn: 10,
                    referenceId: getPassId,
                    getPassLineId,
                    referenceNo: `P02-TEMP-${runContext.runId}`,
                    createdBy: userId,
                    notes: 'P0 #2 duplicate proof',
                }, now),
            );
            const ledgers = await prisma.inventoryLedger.findMany({
                where: { tenantId, referenceId: getPassId },
            });
            const proof = {
                ...outcome(results),
                ledgerRows: ledgers.length,
                keys: ledgers.map((row) => row.postingEffectKey),
            };
            console.log('[after] p02-gp-temp-receive', JSON.stringify(proof));
            assert.deepEqual(proof, {
                successes: 1,
                failures: 1,
                failureCodes: ['POSTING_EFFECT_ALREADY_APPLIED'],
                ledgerRows: 1,
                keys: [
                    `v1|GET_PASS|${tenantId}|${getPassId}|${getPassLineId}|TEMP_RECEIVE`,
                ],
            });
        });

        await t.test('FORCE_CLOSE', async () => {
            const cell = await createCell('FORCE-CLOSE', { blocked: 20 });
            const pass = await createPass('FORCE-CLOSE', cell);
            await getPassService.submitForceCloseSettlement(pass.id, tenantId, userId, {
                closeReason: 'P0 #2 duplicate force-close proof',
                accountability: 'COMPANY_LOSS',
                lines: [{
                    lineId: pass.lines[0].id,
                    disposition: 'GOOD',
                    accountability: 'COMPANY_LOSS',
                }],
            });
            const pendingSettlement = await prisma.getPass.findUnique({
                where: { id: pass.id },
                select: { settlementPayload: true },
            });
            const settlementCycleId = pendingSettlement.settlementPayload.settlementCycleId;
            const executionKey =
                `v1|GET_PASS_FORCE_CLOSE|${tenantId}|${pass.id}|${settlementCycleId}`;
            const results = await raceAfterPassRead(pass.id, () =>
                getPassService.approveForceCloseSettlement(pass.id, tenantId, userId),
            );
            const [stock, ledgers, returnRows, executions] = await Promise.all([
                prisma.stockBalance.findUnique({ where: cell.key }),
                prisma.inventoryLedger.findMany({ where: { tenantId, referenceNo: pass.passNo } }),
                prisma.getPassReturn.findMany({ where: { getPassLineId: pass.lines[0].id } }),
                prisma.postingExecution.findMany({ where: { tenantId, sourceId: pass.id } }),
            ]);
            const proof = {
                ...outcome(results),
                qtyBlocked: Number(stock.qtyBlocked),
                ledgerRows: ledgers.length,
                returnRows: returnRows.length,
                executionRows: executions.length,
                keys: ledgers.map((row) => row.postingEffectKey),
            };
            console.log('[after] p02-gp-force-close', JSON.stringify(proof));
            assert.deepEqual(proof, {
                successes: 1,
                failures: 1,
                failureCodes: ['POSTING_EXECUTION_ALREADY_APPLIED'],
                qtyBlocked: 10,
                ledgerRows: 1,
                returnRows: 1,
                executionRows: 1,
                keys: [`${executionKey}|${pass.lines[0].id}|GOOD_RETURN`],
            });
        });

        await t.test('PARTIAL_RETURN_QUANTITY_RACE', async () => {
            const cell = await createCell('PARTIAL-RETURN', { blocked: 20 });
            const pass = await createPass('PARTIAL-RETURN', cell);
            const payload = [{
                lineId: pass.lines[0].id,
                qtyGood: 10,
                qtyLost: 0,
                qtyDamaged: 0,
                conditionIn: 'GOOD',
            }];
            const results = await raceAfterPassRead(pass.id, () =>
                getPassService.processReturns(
                    pass.id,
                    tenantId,
                    userId,
                    payload,
                    'P0 #2 partial-return race proof',
                ),
            );
            const [stock, line, ledgers, returnRows] = await Promise.all([
                prisma.stockBalance.findUnique({ where: cell.key }),
                prisma.getPassLine.findUnique({ where: { id: pass.lines[0].id } }),
                prisma.inventoryLedger.findMany({ where: { tenantId, referenceNo: pass.passNo } }),
                prisma.getPassReturn.findMany({ where: { getPassLineId: pass.lines[0].id } }),
            ]);
            const proof = {
                ...outcome(results),
                qtyBlocked: Number(stock.qtyBlocked),
                qtyReturned: Number(line.qtyReturned),
                returnedGoodQty: Number(line.returnedGoodQty),
                ledgerRows: ledgers.length,
                returnRows: returnRows.length,
            };
            console.log('[after] p02-gp-partial-return', JSON.stringify(proof));
            assert.deepEqual(proof, {
                successes: 1,
                failures: 1,
                failureCodes: ['GET_PASS_RETURN_QUANTITY_CHANGED'],
                qtyBlocked: 10,
                qtyReturned: 10,
                returnedGoodQty: 10,
                ledgerRows: 1,
                returnRows: 1,
            });
        });
    } finally {
        if (tenantId) {
            await prisma.postingEffect.deleteMany({ where: { tenantId } });
            await prisma.postingExecution.deleteMany({ where: { tenantId } });
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.getPassReturn.deleteMany({
                where: { getPassLine: { getPass: { tenantId } } },
            });
            await prisma.movementDocument.deleteMany({ where: { tenantId } });
            await prisma.getPassLine.deleteMany({ where: { getPass: { tenantId } } });
            await prisma.getPass.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
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
