'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const {
    postDocument,
    postStockCount,
    postStockReport,
    postInventoryCountSession,
} = require('../../../src/services/posting.service');

const GENERIC_DECREASE_TYPES = ['ISSUE', 'TRANSFER_OUT', 'LOAN_WRITE_OFF'];
const SILENT_TYPES = ['TEMP_RECEIVE', 'TEMP_RELEASE', 'GET_PASS_OUT', 'GET_PASS_RETURN'];

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

function proxyStockRead(tx, locationId, barrier) {
    const stockBalance = new Proxy(tx.stockBalance, {
        get(target, property) {
            const value = target[property];
            if (property !== 'findUnique') {
                return typeof value === 'function' ? value.bind(target) : value;
            }
            return async (...args) => {
                const row = await value.apply(target, args);
                const readLocation = args[0]?.where?.tenantId_itemId_locationId?.locationId;
                if (readLocation === locationId) await barrier();
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

async function runInjectedRace(prisma, locationId, workers) {
    const startBarrier = createBarrier(workers.length);
    const readBarrier = createBarrier(workers.length);
    return Promise.allSettled(
        workers.map((worker) =>
            prisma.$transaction(
                async (tx) => {
                    await startBarrier();
                    return worker(proxyStockRead(tx, locationId, readBarrier));
                },
                { timeout: 15000 },
            ),
        ),
    );
}

async function waitForBlockedStockWriters(prisma, expected, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw`
            SELECT COUNT(*)::int AS "count"
            FROM pg_locks l
            JOIN pg_class c ON c.oid = l.relation
            WHERE c.relname = 'stock_balances'
              AND l.granted = false
        `;
        if (Number(rows[0]?.count || 0) >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${expected} blocked stock writers.`);
}

async function runPrivateClientRace(prisma, workers, expectedBlockedWriters = workers.length) {
    let markLocked;
    let releaseHolder;
    const locked = new Promise((resolve) => {
        markLocked = resolve;
    });
    const release = new Promise((resolve) => {
        releaseHolder = resolve;
    });
    const holder = prisma.$transaction(
        async (tx) => {
            await tx.$executeRawUnsafe('LOCK TABLE "stock_balances" IN SHARE MODE');
            markLocked();
            await release;
        },
        { timeout: 15000 },
    );

    await locked;
    const pending = workers.map((worker) => worker());
    const settled = Promise.allSettled(pending);
    try {
        await waitForBlockedStockWriters(prisma, expectedBlockedWriters);
    } finally {
        releaseHolder();
    }
    const results = await settled;
    await holder;
    return results;
}

async function createStockFixture(prisma, { tenantId, runId, suffix }) {
    const location = await prisma.location.create({
        data: { tenantId, name: `Generic Posting ${suffix} ${runId}` },
    });
    const item = await prisma.item.create({
        data: {
            tenantId,
            name: `Generic Posting Item ${suffix} ${runId}`,
            code: `GPC-${suffix}-${runId}`.slice(0, 60),
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
    };
}

async function createMovement(prisma, {
    tenantId,
    userId,
    itemId,
    locationId,
    movementType,
    qty,
    documentNo,
}) {
    return prisma.movementDocument.create({
        data: {
            tenantId,
            documentNo,
            movementType,
            status: 'DRAFT',
            sourceLocationId: locationId,
            createdBy: userId,
            lines: {
                create: {
                    itemId,
                    locationId,
                    qtyRequested: Math.abs(qty),
                    qtyInBaseUnit: qty,
                    unitCost: 10,
                    totalValue: Math.abs(qty) * 10,
                },
            },
        },
    });
}

async function genericDecreaseProof(prisma, ctx, type, qty = 60) {
    const fixture = await createStockFixture(prisma, {
        tenantId: ctx.tenantId,
        runId: ctx.runId,
        suffix: type,
    });
    const docs = await Promise.all(
        ['A', 'B'].map((label) =>
            createMovement(prisma, {
                tenantId: ctx.tenantId,
                userId: ctx.userId,
                itemId: fixture.item.id,
                locationId: fixture.location.id,
                movementType: type,
                qty: type === 'ADJUSTMENT' ? -qty : qty,
                documentNo: `IT-${type}-${label}-${ctx.runId}`,
            }),
        ),
    );
    const results = await runInjectedRace(prisma, fixture.location.id, docs.map((doc) =>
        (tx) => postDocument(doc.id, ctx.tenantId, ctx.userId, tx),
    ));
    const stock = await prisma.stockBalance.findUnique({ where: fixture.stockKey });
    const ledgerRows = await prisma.inventoryLedger.findMany({
        where: { tenantId: ctx.tenantId, referenceId: { in: docs.map((doc) => doc.id) } },
    });
    return {
        successes: results.filter((result) => result.status === 'fulfilled').length,
        failures: results.filter((result) => result.status === 'rejected').length,
        qtyOnHand: Number(stock.qtyOnHand),
        ledgerRows: ledgerRows.length,
        ledgerBalances: ledgerRows.map((row) => Number(row.balanceAfter)).sort((a, b) => a - b),
    };
}

async function legacyCountProof(prisma, ctx) {
    const fixture = await createStockFixture(prisma, {
        tenantId: ctx.tenantId,
        runId: ctx.runId,
        suffix: 'LEGACY-COUNT',
    });
    const sessions = await Promise.all(
        ['A', 'B'].map((label) =>
            prisma.stockCountSession.create({
                data: {
                    tenantId: ctx.tenantId,
                    locationId: fixture.location.id,
                    sessionNo: `IT-LC-${label}-${ctx.runId}`,
                    createdBy: ctx.userId,
                    status: 'DRAFT',
                    lines: {
                        create: {
                            itemId: fixture.item.id,
                            bookQty: 100,
                            countedQty: 40,
                            varianceQty: -60,
                            wacUnitCost: 10,
                        },
                    },
                },
            }),
        ),
    );
    const results = await runPrivateClientRace(
        prisma,
        sessions.map((session) => () => postStockCount(session.id, ctx.tenantId, ctx.userId)),
    );
    const stock = await prisma.stockBalance.findUnique({ where: fixture.stockKey });
    return {
        successes: results.filter((result) => result.status === 'fulfilled').length,
        failures: results.filter((result) => result.status === 'rejected').length,
        qtyOnHand: Number(stock.qtyOnHand),
        ledgerRows: await prisma.inventoryLedger.count({
            where: { tenantId: ctx.tenantId, referenceId: { in: sessions.map((session) => session.id) } },
        }),
    };
}

async function stockReportProof(prisma, ctx) {
    const fixture = await createStockFixture(prisma, {
        tenantId: ctx.tenantId,
        runId: ctx.runId,
        suffix: 'STOCK-REPORT',
    });
    const reports = [];
    for (const label of ['A', 'B']) {
        reports.push(await prisma.savedStockReport.create({
            data: {
                tenantId: ctx.tenantId,
                reportNo: `IT-SR-${label}-${ctx.runId}`,
                locationId: fixture.location.id,
                createdBy: ctx.userId,
                status: 'DRAFT',
                lines: {
                    create: {
                        itemId: fixture.item.id,
                        locationQtys: {
                            create: {
                                locationId: fixture.location.id,
                                bookQty: 100,
                                countedQty: 40,
                                varianceQty: -60,
                            },
                        },
                    },
                },
            },
        }));
    }
    const results = await runPrivateClientRace(
        prisma,
        reports.map((report) => () => postStockReport(report.id, ctx.tenantId, ctx.userId)),
    );
    const stock = await prisma.stockBalance.findUnique({ where: fixture.stockKey });
    return {
        successes: results.filter((result) => result.status === 'fulfilled').length,
        failures: results.filter((result) => result.status === 'rejected').length,
        qtyOnHand: Number(stock.qtyOnHand),
        ledgerRows: await prisma.inventoryLedger.count({
            where: { tenantId: ctx.tenantId, referenceId: { in: reports.map((report) => report.id) } },
        }),
    };
}

async function canonicalCountProof(prisma, ctx) {
    const fixture = await createStockFixture(prisma, {
        tenantId: ctx.tenantId,
        runId: ctx.runId,
        suffix: 'CANONICAL-COUNT',
    });
    const sessions = [];
    for (const label of ['A', 'B']) {
        sessions.push(await prisma.stockCountSession.create({
            data: {
                tenantId: ctx.tenantId,
                locationId: fixture.location.id,
                sessionNo: `IT-CC-${label}-${ctx.runId}`,
                createdBy: ctx.userId,
                status: 'PENDING_GM',
                locationQtys: {
                    create: {
                        itemId: fixture.item.id,
                        locationId: fixture.location.id,
                        roundNo: 1,
                        bookQty: 100,
                        countedQty: 40,
                        varianceQty: -60,
                    },
                },
            },
        }));
    }
    const results = await runPrivateClientRace(
        prisma,
        sessions.map((session) => () => postInventoryCountSession(session.id, ctx.tenantId, ctx.userId)),
        1,
    );
    const stock = await prisma.stockBalance.findUnique({ where: fixture.stockKey });
    return {
        successes: results.filter((result) => result.status === 'fulfilled').length,
        failures: results.filter((result) => result.status === 'rejected').length,
        qtyOnHand: Number(stock.qtyOnHand),
        ledgerRows: await prisma.inventoryLedger.count({
            where: { tenantId: ctx.tenantId, referenceId: { in: sessions.map((session) => session.id) } },
        }),
        rejectionCodes: results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason?.code || null),
        rejectionMessages: results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason?.message || null),
    };
}

async function silentTypeProof(prisma, ctx, type) {
    const fixture = await createStockFixture(prisma, {
        tenantId: ctx.tenantId,
        runId: ctx.runId,
        suffix: `SILENT-${type}`,
    });
    const doc = await createMovement(prisma, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        itemId: fixture.item.id,
        locationId: fixture.location.id,
        movementType: type,
        qty: 1,
        documentNo: `IT-SILENT-${type}-${ctx.runId}`,
    });
    const result = await Promise.allSettled([
        postDocument(doc.id, ctx.tenantId, ctx.userId),
    ]);
    const after = await prisma.movementDocument.findUnique({ where: { id: doc.id } });
    const stock = await prisma.stockBalance.findUnique({ where: fixture.stockKey });
    return {
        call: result[0].status,
        status: after.status,
        qtyOnHand: Number(stock.qtyOnHand),
        ledgerRows: await prisma.inventoryLedger.count({
            where: { tenantId: ctx.tenantId, referenceId: doc.id },
        }),
    };
}

test('generic posting decrements and silent movement types fail closed', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `Generic Posting Concurrency ${runContext.runId}`,
                slug: runContext.tenantSlug,
            },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('generic-posting'),
                passwordHash: 'integration-test-not-used',
                firstName: 'Generic',
                lastName: 'Posting',
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
        await prisma.tenantSetting.createMany({
            data: [
                { tenantId, key: 'allowOpeningBalance', value: 'LOCKED' },
                {
                    tenantId,
                    key: 'obFinalizeSnapshot',
                    value: JSON.stringify({ finalizedAt: now.toISOString() }),
                },
            ],
        });
        const ctx = { tenantId, userId, runId: runContext.runId };
        const proofs = {};

        for (const type of [...GENERIC_DECREASE_TYPES, 'ADJUSTMENT']) {
            proofs[type] = await genericDecreaseProof(prisma, ctx, type);
            console.log(`[proof] generic-${type}`, JSON.stringify(proofs[type]));
        }
        proofs.LEGACY_STOCK_COUNT = await legacyCountProof(prisma, ctx);
        console.log('[proof] legacy-stock-count', JSON.stringify(proofs.LEGACY_STOCK_COUNT));
        proofs.STOCK_REPORT = await stockReportProof(prisma, ctx);
        console.log('[proof] stock-report', JSON.stringify(proofs.STOCK_REPORT));
        proofs.CANONICAL_COUNT = await canonicalCountProof(prisma, ctx);
        console.log('[proof] canonical-count', JSON.stringify(proofs.CANONICAL_COUNT));

        for (const type of SILENT_TYPES) {
            proofs[type] = await silentTypeProof(prisma, ctx, type);
            console.log(`[proof] silent-${type}`, JSON.stringify(proofs[type]));
        }

        for (const type of [...GENERIC_DECREASE_TYPES, 'ADJUSTMENT']) {
            assert.deepEqual(proofs[type], {
                successes: 1,
                failures: 1,
                qtyOnHand: 40,
                ledgerRows: 1,
                ledgerBalances: [40],
            });
        }
        for (const key of ['LEGACY_STOCK_COUNT', 'STOCK_REPORT']) {
            assert.deepEqual(proofs[key], {
                successes: 1,
                failures: 1,
                qtyOnHand: 40,
                ledgerRows: 1,
            });
        }
        assert.deepEqual(proofs.CANONICAL_COUNT, {
            successes: 1,
            failures: 1,
            qtyOnHand: 40,
            ledgerRows: 1,
            rejectionCodes: ['COUNT_ITEM_LOCKED_BY_ANOTHER_COUNT'],
            rejectionMessages: [
                'This item/location is locked by another inventory count currently being completed. ' +
                'Review the completed count before retrying this session.',
            ],
        });
        for (const type of SILENT_TYPES) {
            assert.deepEqual(proofs[type], {
                call: 'rejected',
                status: 'DRAFT',
                qtyOnHand: 100,
                ledgerRows: 0,
            });
        }
    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.savedStockReport.deleteMany({ where: { tenantId } });
            await prisma.stockCountSession.deleteMany({ where: { tenantId } });
            await prisma.movementDocument.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            await prisma.tenantSetting.deleteMany({ where: { tenantId } });
            await prisma.docSequence.deleteMany({ where: { tenantId } });
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
