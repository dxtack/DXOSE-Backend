'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const {
    buildClosingSnapshotLines,
    validateClosingSnapshotReplay,
} = require('../../../src/platform/periodLedgerSnapshot.service');

test('closing snapshot derives WAC from cumulative ledger value', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `P10 Snapshot ${runContext.runId}`,
                slug: runContext.tenantSlug,
            },
        });
        tenantId = tenant.id;

        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p10-snapshot'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P10',
                lastName: 'Snapshot',
            },
        });
        userId = user.id;
        await prisma.periodClose.create({
            data: { tenantId, year: 2026, month: 6, status: 'CLOSED', closedAt: new Date() },
        });

        const location = await prisma.location.create({
            data: { tenantId, name: `P10 Location ${runContext.runId}` },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `P10 Item ${runContext.runId}`,
                code: `P10-${runContext.runId}`.slice(0, 60),
                unitPrice: 10,
            },
        });

        await prisma.stockBalance.create({
            data: {
                tenantId,
                itemId: item.id,
                locationId: location.id,
                qtyOnHand: 130,
                qtyBlocked: 0,
                wacUnitCost: 13.8462,
            },
        });

        await prisma.inventoryLedger.createMany({
            data: [
                {
                    id: '10000000-0000-4000-8000-000000000001',
                    tenantId,
                    itemId: item.id,
                    locationId: location.id,
                    movementType: 'OPENING_BALANCE',
                    qtyIn: 100,
                    qtyOut: 0,
                    unitCost: 10,
                    totalValue: 1000,
                    balanceAfter: 100,
                    postingDate: new Date('2026-06-01T00:00:00.000Z'),
                    assignedPostingPeriod: '2026-06',
                    createdBy: userId,
                    createdAt: new Date('2026-06-01T00:00:01.000Z'),
                },
                {
                    id: '10000000-0000-4000-8000-000000000002',
                    tenantId,
                    itemId: item.id,
                    locationId: location.id,
                    movementType: 'RECEIVE',
                    qtyIn: 10,
                    qtyOut: 0,
                    unitCost: 20,
                    totalValue: 200,
                    balanceAfter: 110,
                    postingDate: new Date('2026-06-02T00:00:00.000Z'),
                    assignedPostingPeriod: '2026-06',
                    createdBy: userId,
                    createdAt: new Date('2026-06-02T00:00:01.000Z'),
                },
                {
                    id: '10000000-0000-4000-8000-000000000003',
                    tenantId,
                    itemId: item.id,
                    locationId: location.id,
                    movementType: 'RECEIVE',
                    qtyIn: 20,
                    qtyOut: 0,
                    unitCost: 30,
                    totalValue: 600,
                    balanceAfter: 130,
                    postingDate: new Date('2026-06-03T00:00:00.000Z'),
                    assignedPostingPeriod: '2026-06',
                    createdBy: userId,
                    createdAt: new Date('2026-06-03T00:00:01.000Z'),
                },
            ],
        });

        const lines = await buildClosingSnapshotLines(tenantId, 2026, 6);
        const line = lines.find((candidate) => candidate.itemId === item.id);
        const proof = {
            closingQty: Number(line.closingQty),
            snapshotWac: Number(line.wacUnitCost),
            snapshotValue: Number(line.closingValue),
            correctWac: 1800 / 130,
            correctValue: 1800,
        };
        console.log('[proof] p10-snapshot-valuation', JSON.stringify(proof));

        assert.equal(proof.closingQty, 130);
        assert.ok(Math.abs(proof.snapshotWac - proof.correctWac) < 0.0001);
        assert.equal(proof.snapshotValue, proof.correctValue);

        const initialValidation = await validateClosingSnapshotReplay(tenantId, 2026, 6);
        assert.deepEqual(initialValidation, {
            balanceAfterMismatches: [],
            stockBalanceMismatches: [],
            stockComparisonSkipped: false,
        });

        await prisma.inventoryLedger.createMany({
            data: [
                {
                    id: '10000000-0000-4000-8000-000000000004',
                    tenantId,
                    itemId: item.id,
                    locationId: location.id,
                    movementType: 'ADJUSTMENT',
                    qtyIn: 10,
                    qtyOut: 0,
                    unitCost: 15,
                    totalValue: 150,
                    balanceAfter: 140,
                    postingDate: new Date('2026-06-04T00:00:00.000Z'),
                    assignedPostingPeriod: '2026-06',
                    createdBy: userId,
                    createdAt: new Date('2026-06-04T00:00:01.000Z'),
                },
                {
                    id: '10000000-0000-4000-8000-000000000005',
                    tenantId,
                    itemId: item.id,
                    locationId: location.id,
                    movementType: 'ADJUSTMENT',
                    qtyIn: 0,
                    qtyOut: 5,
                    unitCost: 13.9286,
                    totalValue: 69.6429,
                    balanceAfter: 135,
                    postingDate: new Date('2026-06-04T00:00:00.000Z'),
                    assignedPostingPeriod: '2026-06',
                    createdBy: userId,
                    createdAt: new Date('2026-06-04T00:00:01.000Z'),
                },
                {
                    id: '10000000-0000-4000-8000-000000000006',
                    tenantId,
                    itemId: item.id,
                    locationId: location.id,
                    movementType: 'OPENING_BALANCE',
                    qtyIn: 0,
                    qtyOut: 85,
                    unitCost: 8,
                    totalValue: -1480.3571,
                    balanceAfter: 50,
                    postingDate: new Date('2026-06-04T00:00:00.000Z'),
                    assignedPostingPeriod: '2026-06',
                    createdBy: userId,
                    createdAt: new Date('2026-06-04T00:00:01.000Z'),
                },
            ],
        });
        await prisma.stockBalance.update({
            where: {
                tenantId_itemId_locationId: {
                    tenantId,
                    itemId: item.id,
                    locationId: location.id,
                },
            },
            data: { qtyOnHand: 50, wacUnitCost: 8 },
        });

        const semanticLines = await buildClosingSnapshotLines(tenantId, 2026, 6);
        const semanticLine = semanticLines.find((candidate) => candidate.itemId === item.id);
        assert.equal(Number(semanticLine.closingQty), 50);
        assert.ok(Math.abs(Number(semanticLine.closingValue) - 400) < 0.0001);
        assert.ok(Math.abs(Number(semanticLine.wacUnitCost) - 8) < 0.0001);

        const semanticValidation = await validateClosingSnapshotReplay(tenantId, 2026, 6);
        assert.deepEqual(semanticValidation, {
            balanceAfterMismatches: [],
            stockBalanceMismatches: [],
            stockComparisonSkipped: false,
        });

    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.item.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
