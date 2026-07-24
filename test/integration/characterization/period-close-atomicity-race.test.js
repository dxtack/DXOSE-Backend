'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const prismaModule = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { postResolutionDocument } = require('../../../src/services/periodCloseResolution.service');
const { buildClosingSnapshotLines } = require('../../../src/platform/periodLedgerSnapshot.service');

function createGate() {
    let signalTransaction;
    let releaseTransaction;
    const transactionObserved = new Promise((resolve) => {
        signalTransaction = resolve;
    });
    const release = new Promise((resolve) => {
        releaseTransaction = resolve;
    });
    return { transactionObserved, release, signalTransaction, releaseTransaction };
}

function loadPeriodCloseWithPausedTransaction(privatePrisma, gate) {
    const prismaModulePath = require.resolve('@prisma/client');
    const servicePath = require.resolve('../../../src/services/periodClose.service');
    const originalExports = require.cache[prismaModulePath].exports;
    let paused = false;
    const proxiedPrisma = new Proxy(privatePrisma, {
        get(client, property) {
            if (property === '$transaction') {
                return (work, options) => {
                    if (paused || typeof work !== 'function') return client.$transaction(work, options);
                    paused = true;
                    return (async () => {
                        gate.signalTransaction();
                        await gate.release;
                        return client.$transaction(work, options);
                    })();
                };
            }
            const value = client[property];
            return typeof value === 'function' ? value.bind(client) : value;
        },
    });
    class InjectedPrismaClient {
        constructor() {
            return proxiedPrisma;
        }
    }

    delete require.cache[servicePath];
    require.cache[prismaModulePath].exports = {
        ...originalExports,
        PrismaClient: InjectedPrismaClient,
    };
    try {
        return require(servicePath);
    } finally {
        require.cache[prismaModulePath].exports = originalExports;
    }
}

test('Complete Close cannot persist a snapshot stale behind a concurrent approved Breakage post', async () => {
    const prisma = new prismaModule.PrismaClient();
    const closePrisma = new prismaModule.PrismaClient();
    const runContext = createRunContext();
    const gate = createGate();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `P1 Close Race ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p1-close-race'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P1',
                lastName: 'Close Race',
            },
        });
        userId = user.id;
        const location = await prisma.location.create({
            data: { tenantId, name: `P1 Close Race Location ${runContext.runId}` },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `P1 Close Race Item ${runContext.runId}`,
                code: `P1-RACE-${runContext.runId}`.slice(0, 60),
                unitPrice: 10,
            },
        });
        await prisma.periodClose.create({
            data: { tenantId, year: 2026, month: 1, status: 'CLOSING' },
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
        await prisma.inventoryLedger.create({
            data: {
                tenantId,
                itemId: item.id,
                locationId: location.id,
                movementType: 'OPENING_BALANCE',
                qtyIn: 100,
                qtyOut: 0,
                unitCost: 10,
                totalValue: 1000,
                balanceAfter: 100,
                referenceType: 'PROOF',
                referenceId: item.id,
                referenceNo: `P1-RACE-OB-${runContext.runId}`,
                postingDate: new Date('2026-01-01T00:00:00.000Z'),
                assignedPostingPeriod: '2026-01',
                createdBy: userId,
            },
        });
        const document = await prisma.movementDocument.create({
            data: {
                tenantId,
                documentNo: `P1-RACE-BRK-${runContext.runId}`,
                movementType: 'BREAKAGE',
                sourceType: 'INTERNAL',
                status: 'APPROVED',
                sourceLocationId: location.id,
                documentDate: new Date('2026-01-20T12:00:00.000Z'),
                reason: 'P1 #15 approved concurrent Breakage proof',
                createdBy: userId,
                lines: {
                    create: {
                        itemId: item.id,
                        locationId: location.id,
                        qtyRequested: 10,
                        qtyInBaseUnit: 10,
                        unitCost: 10,
                        totalValue: 100,
                    },
                },
            },
        });

        const { completeClose } = loadPeriodCloseWithPausedTransaction(closePrisma, gate);
        const closePromise = completeClose(
            tenantId,
            { year: 2026, month: 1, notes: 'P1 #15 atomicity proof' },
            userId,
        );
        await gate.transactionObserved;

        await postResolutionDocument(tenantId, userId, {
            year: 2026,
            month: 1,
            module: 'BREAKAGE',
            documentId: document.id,
        });
        gate.releaseTransaction();
        const closed = await closePromise;

        const stored = await prisma.periodSnapshotLine.findFirst({
            where: {
                snapshotVersion: { periodCloseId: closed.id, status: 'CURRENT' },
                itemId: item.id,
                locationId: location.id,
            },
        });
        const replay = (await buildClosingSnapshotLines(tenantId, 2026, 1)).find(
            (line) => line.itemId === item.id && line.locationId === location.id,
        );
        const stock = await prisma.stockBalance.findUnique({
            where: {
                tenantId_itemId_locationId: {
                    tenantId,
                    itemId: item.id,
                    locationId: location.id,
                },
            },
        });
        const proof = {
            closeStatus: closed.status,
            documentStatus: (await prisma.movementDocument.findUnique({ where: { id: document.id } })).status,
            storedSnapshotQty: Number(stored?.closingQty),
            replayQty: Number(replay?.closingQty),
            liveQty: Number(stock.qtyOnHand),
            staleSnapshot: Number(stored?.closingQty) !== Number(replay?.closingQty),
        };
        console.log('[proof] p1-15-period-close-atomicity', JSON.stringify(proof));

        assert.deepEqual(proof, {
            closeStatus: 'CLOSED',
            documentStatus: 'POSTED',
            storedSnapshotQty: 90,
            replayQty: 90,
            liveQty: 90,
            staleSnapshot: false,
        });
    } finally {
        gate.releaseTransaction();
        if (tenantId) {
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.movementDocument.deleteMany({ where: { tenantId } });
            const periods = await prisma.periodClose.findMany({ where: { tenantId }, select: { id: true } });
            const periodIds = periods.map((row) => row.id);
            await prisma.periodSnapshotLine.deleteMany({
                where: { snapshotVersion: { periodCloseId: { in: periodIds } } },
            });
            await prisma.periodSnapshotVersion.deleteMany({ where: { periodCloseId: { in: periodIds } } });
            await prisma.tenantSetting.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            await prisma.item.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await closePrisma.$disconnect();
        await prisma.$disconnect();
    }
});
