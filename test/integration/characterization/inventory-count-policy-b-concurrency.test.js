'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const prismaModule = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');

function createGate() {
    let signalRead;
    let releaseRead;
    const readObserved = new Promise((resolve) => {
        signalRead = resolve;
    });
    const release = new Promise((resolve) => {
        releaseRead = resolve;
    });
    return { readObserved, release, signalRead, releaseRead };
}

function loadPostingServiceWithPausedCountRead(privatePrisma, target, gate) {
    const prismaModulePath = require.resolve('@prisma/client');
    const postingPath = require.resolve('../../../src/services/posting.service');
    const originalExports = require.cache[prismaModulePath].exports;
    let paused = false;

    const wrapTx = (tx) => {
        const stockBalance = new Proxy(tx.stockBalance, {
            get(model, property) {
                const value = model[property];
                if (property !== 'findUnique') {
                    return typeof value === 'function' ? value.bind(model) : value;
                }
                return async (...args) => {
                    const row = await value.apply(model, args);
                    const key = args[0]?.where?.tenantId_itemId_locationId;
                    if (
                        !paused &&
                        key?.tenantId === target.tenantId &&
                        key?.itemId === target.itemId &&
                        key?.locationId === target.locationId
                    ) {
                        paused = true;
                        gate.signalRead();
                        await gate.release;
                    }
                    return row;
                };
            },
        });
        return new Proxy(tx, {
            get(client, property) {
                if (property === 'stockBalance') return stockBalance;
                const value = client[property];
                return typeof value === 'function' ? value.bind(client) : value;
            },
        });
    };

    const proxiedPrisma = new Proxy(privatePrisma, {
        get(client, property) {
            if (property === '$transaction') {
                return (work, options) => {
                    if (typeof work !== 'function') return client.$transaction(work, options);
                    return client.$transaction((tx) => work(wrapTx(tx)), options);
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

    delete require.cache[postingPath];
    require.cache[prismaModulePath].exports = {
        ...originalExports,
        PrismaClient: InjectedPrismaClient,
    };
    try {
        return require(postingPath);
    } finally {
        require.cache[prismaModulePath].exports = originalExports;
    }
}

test('Policy-B retries when an issue changes live stock after the count read', async () => {
    const prisma = new prismaModule.PrismaClient();
    const postingPrisma = new prismaModule.PrismaClient();
    const runContext = createRunContext();
    const gate = createGate();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `Policy B Race ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('policy-b'),
                passwordHash: 'integration-test-not-used',
                firstName: 'Policy',
                lastName: 'B',
            },
        });
        userId = user.id;
        const location = await prisma.location.create({
            data: { tenantId, name: `Policy B Location ${runContext.runId}` },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `Policy B Item ${runContext.runId}`,
                code: `ICPB-${runContext.runId}`.slice(0, 60),
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
        const session = await prisma.stockCountSession.create({
            data: {
                tenantId,
                locationId: location.id,
                sessionNo: `IT-PB-${runContext.runId}`,
                createdBy: userId,
                status: 'PENDING_GM',
                locationQtys: {
                    create: {
                        itemId: item.id,
                        locationId: location.id,
                        roundNo: 1,
                        bookQty: 100,
                        countedQty: 40,
                        varianceQty: -60,
                    },
                },
            },
        });
        const issue = await prisma.movementDocument.create({
            data: {
                tenantId,
                documentNo: `IT-PB-ISSUE-${runContext.runId}`,
                movementType: 'ISSUE',
                status: 'DRAFT',
                sourceLocationId: location.id,
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

        const postingService = loadPostingServiceWithPausedCountRead(
            postingPrisma,
            { tenantId, itemId: item.id, locationId: location.id },
            gate,
        );
        const countPost = postingService.postInventoryCountSession(session.id, tenantId, userId);
        await gate.readObserved;
        await prisma.$transaction((tx) =>
            postingService.postDocument(issue.id, tenantId, userId, tx),
        );
        gate.releaseRead();
        await countPost;

        const [stock, ledgers] = await Promise.all([
            prisma.stockBalance.findUnique({
                where: {
                    tenantId_itemId_locationId: {
                        tenantId,
                        itemId: item.id,
                        locationId: location.id,
                    },
                },
            }),
            prisma.inventoryLedger.findMany({
                where: { tenantId },
                orderBy: { createdAt: 'asc' },
            }),
        ]);
        const proof = {
            qtyOnHand: Number(stock.qtyOnHand),
            ledgers: ledgers.map((row) => ({
                movementType: row.movementType,
                qtyOut: Number(row.qtyOut),
                balanceAfter: Number(row.balanceAfter),
            })),
        };
        console.log('[proof] inventory-count-policy-b-race', JSON.stringify(proof));

        assert.equal(proof.qtyOnHand, 40);
        assert.deepEqual(proof.ledgers, [
            { movementType: 'ISSUE', qtyOut: 10, balanceAfter: 90 },
            { movementType: 'COUNT_ADJUSTMENT', qtyOut: 50, balanceAfter: 40 },
        ]);
    } finally {
        gate.releaseRead();
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.auditLog.deleteMany({ where: { tenantId } });
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
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await Promise.all([prisma.$disconnect(), postingPrisma.$disconnect()]);
    }
});
