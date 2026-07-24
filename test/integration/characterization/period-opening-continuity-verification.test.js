'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { openPeriod } = require('../../../src/services/periodClose.service');
const { assertPeriodOpenForPosting } = require('../../../src/services/periodGuard.service');

test('period opening is blocked when live opening WAC differs from the approved CURRENT snapshot', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `P1 Continuity ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p1-continuity'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P1',
                lastName: 'Continuity',
            },
        });
        userId = user.id;
        const location = await prisma.location.create({
            data: { tenantId, name: `P1 Continuity Location ${runContext.runId}` },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                name: `P1 Continuity Item ${runContext.runId}`,
                code: `P1-CONT-${runContext.runId}`.slice(0, 60),
                unitPrice: 10,
            },
        });
        const prior = await prisma.periodClose.create({
            data: {
                tenantId,
                year: 2026,
                month: 6,
                status: 'CLOSED',
                closedAt: new Date('2026-06-30T23:59:59.999Z'),
                closedBy: userId,
            },
        });
        const snapshot = await prisma.periodSnapshotVersion.create({
            data: {
                periodCloseId: prior.id,
                versionNumber: 1,
                status: 'CURRENT',
                closedAt: new Date('2026-06-30T23:59:59.999Z'),
                closedBy: userId,
            },
        });
        await prisma.periodSnapshotLine.create({
            data: {
                snapshotVersionId: snapshot.id,
                itemId: item.id,
                locationId: location.id,
                closingQty: 100,
                closingValue: 1000,
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
                referenceNo: `P1-CONT-OB-${runContext.runId}`,
                postingDate: new Date('2026-06-01T00:00:00.000Z'),
                assignedPostingPeriod: '2026-06',
                createdBy: userId,
            },
        });
        await prisma.stockBalance.create({
            data: {
                tenantId,
                itemId: item.id,
                locationId: location.id,
                qtyOnHand: 100,
                qtyBlocked: 0,
                wacUnitCost: 12,
            },
        });

        const openResult = await openPeriod(
            tenantId,
            { year: 2026, month: 7, reason: 'P1 #16 continuity proof' },
            userId,
        ).then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason }),
        );
        const postingResult =
            openResult.status === 'fulfilled'
                ? await assertPeriodOpenForPosting(tenantId, new Date('2026-07-10T12:00:00.000Z')).then(
                    () => ({ allowed: true, errorCode: null }),
                    (reason) => ({ allowed: false, errorCode: reason.code ?? null }),
                )
                : { allowed: false, errorCode: openResult.reason?.code ?? null };
        const period = await prisma.periodClose.findUnique({
            where: { tenantId_year_month: { tenantId, year: 2026, month: 7 } },
        });
        const proof = {
            snapshot: { qty: 100, wac: 10, value: 1000 },
            ledgerBoundary: { qty: 100, wac: 10, value: 1000 },
            liveOpening: { qty: 100, wac: 12, value: 1200 },
            valueDelta: 200,
            openOutcome: openResult.status,
            openErrorCode: openResult.reason?.code ?? null,
            postingAllowed: postingResult.allowed,
            warningCount: 0,
            periodExists: Boolean(period),
        };
        console.log('[proof] p1-16-opening-continuity', JSON.stringify(proof));

        assert.deepEqual(proof, {
            snapshot: { qty: 100, wac: 10, value: 1000 },
            ledgerBoundary: { qty: 100, wac: 10, value: 1000 },
            liveOpening: { qty: 100, wac: 12, value: 1200 },
            valueDelta: 200,
            openOutcome: 'rejected',
            openErrorCode: 'PERIOD_OPENING_CONTINUITY_BLOCKED',
            postingAllowed: false,
            warningCount: 0,
            periodExists: false,
        });
    } finally {
        if (tenantId) {
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            const periods = await prisma.periodClose.findMany({ where: { tenantId }, select: { id: true } });
            const periodIds = periods.map((row) => row.id);
            await prisma.periodSnapshotLine.deleteMany({
                where: { snapshotVersion: { periodCloseId: { in: periodIds } } },
            });
            await prisma.periodSnapshotVersion.deleteMany({ where: { periodCloseId: { in: periodIds } } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.item.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
