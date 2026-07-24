'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { openPeriod } = require('../../../src/services/periodClose.service');
const { assertPeriodOpenForPosting } = require('../../../src/services/periodGuard.service');

async function createPassingFixture(prisma, runContext, label) {
    const tenant = await prisma.tenant.create({
        data: {
            name: `P1 Continuity Fresh ${label} ${runContext.runId}`,
            slug: `${runContext.tenantSlug}-${label}`,
        },
    });
    const user = await prisma.user.create({
        data: {
            email: runContext.integrationEmail(`p1-continuity-${label}`),
            passwordHash: 'integration-test-not-used',
            firstName: 'P1',
            lastName: `Continuity ${label}`,
        },
    });
    const location = await prisma.location.create({
        data: { tenantId: tenant.id, name: `P1 Fresh Location ${label} ${runContext.runId}` },
    });
    const item = await prisma.item.create({
        data: {
            tenantId: tenant.id,
            name: `P1 Fresh Item ${label} ${runContext.runId}`,
            code: `P1-FRESH-${label}-${runContext.runId}`.slice(0, 60),
            unitPrice: 10,
        },
    });
    const prior = await prisma.periodClose.create({
        data: {
            tenantId: tenant.id,
            year: 2026,
            month: 6,
            status: 'CLOSED',
            closedAt: new Date('2026-06-30T23:59:59.999Z'),
            closedBy: user.id,
        },
    });
    const snapshot = await prisma.periodSnapshotVersion.create({
        data: {
            periodCloseId: prior.id,
            versionNumber: 1,
            status: 'CURRENT',
            closedAt: new Date('2026-06-30T23:59:59.999Z'),
            closedBy: user.id,
            lines: {
                create: {
                    itemId: item.id,
                    locationId: location.id,
                    closingQty: 100,
                    closingValue: 1000,
                    wacUnitCost: 10,
                },
            },
        },
    });
    await prisma.inventoryLedger.create({
        data: {
            tenantId: tenant.id,
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
            referenceNo: `P1-FRESH-OB-${label}-${runContext.runId}`,
            postingDate: new Date('2026-06-01T00:00:00.000Z'),
            assignedPostingPeriod: '2026-06',
            createdBy: user.id,
        },
    });
    await prisma.stockBalance.create({
        data: {
            tenantId: tenant.id,
            itemId: item.id,
            locationId: location.id,
            qtyOnHand: 100,
            qtyBlocked: 0,
            wacUnitCost: 10,
        },
    });
    const opened = await openPeriod(
        tenant.id,
        { year: 2026, month: 7, reason: `P1 #16 ${label}` },
        user.id,
    );
    await assertPeriodOpenForPosting(tenant.id, new Date('2026-07-10T12:00:00.000Z'));
    return { tenant, user, location, item, prior, snapshot, opened };
}

async function cleanupFixture(prisma, fixture) {
    if (!fixture?.tenant?.id) return;
    const tenantId = fixture.tenant.id;
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
    await prisma.stockBalance.deleteMany({ where: { tenantId } });
    const periods = await prisma.periodClose.findMany({ where: { tenantId }, select: { id: true } });
    const periodIds = periods.map((row) => row.id);
    await prisma.periodClose.deleteMany({ where: { tenantId, year: 2026, month: 7 } });
    await prisma.periodOpeningVerification.deleteMany({ where: { tenantId } });
    await prisma.periodSnapshotLine.deleteMany({
        where: { snapshotVersion: { periodCloseId: { in: periodIds } } },
    });
    await prisma.periodSnapshotVersion.deleteMany({ where: { periodCloseId: { in: periodIds } } });
    await prisma.periodClose.deleteMany({ where: { tenantId } });
    await prisma.item.deleteMany({ where: { tenantId } });
    await prisma.location.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.user.delete({ where: { id: fixture.user.id } });
}

test('posting guard invalidates PASS when its exact CURRENT snapshot is superseded', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let fixture;
    try {
        fixture = await createPassingFixture(prisma, runContext, 'snapshot');
        await prisma.periodSnapshotVersion.update({
            where: { id: fixture.snapshot.id },
            data: { status: 'SUPERSEDED' },
        });
        await prisma.periodSnapshotVersion.create({
            data: {
                periodCloseId: fixture.prior.id,
                versionNumber: 2,
                status: 'CURRENT',
                closedAt: new Date(),
                closedBy: fixture.user.id,
                lines: {
                    create: {
                        itemId: fixture.item.id,
                        locationId: fixture.location.id,
                        closingQty: 100,
                        closingValue: 1000,
                        wacUnitCost: 10,
                    },
                },
            },
        });
        const rejection = await assertPeriodOpenForPosting(
            fixture.tenant.id,
            new Date('2026-07-10T12:00:00.000Z'),
        ).then(
            () => null,
            (error) => error,
        );
        const verification = await prisma.periodOpeningVerification.findUnique({
            where: { id: fixture.opened.openingVerificationId },
        });
        assert.equal(rejection?.code, 'PERIOD_OPENING_VERIFICATION_STALE');
        assert.equal(rejection?.reason, 'SOURCE_SNAPSHOT_CHANGED');
        assert.equal(verification.status, 'INVALIDATED');
        assert.equal(verification.isCurrent, false);
    } finally {
        await cleanupFixture(prisma, fixture);
        await prisma.$disconnect();
    }
});

test('posting guard invalidates PASS after any late prior-period valuation ledger row', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let fixture;
    try {
        fixture = await createPassingFixture(prisma, runContext, 'ledger');
        await prisma.inventoryLedger.create({
            data: {
                tenantId: fixture.tenant.id,
                itemId: fixture.item.id,
                locationId: fixture.location.id,
                movementType: 'ADJUSTMENT',
                qtyIn: 0,
                qtyOut: 0,
                unitCost: 10,
                totalValue: 0,
                balanceAfter: 100,
                referenceType: 'PROOF',
                referenceId: fixture.location.id,
                referenceNo: `P1-LATE-LEDGER-${runContext.runId}`,
                postingDate: new Date('2026-06-29T12:00:00.000Z'),
                assignedPostingPeriod: '2026-06',
                createdBy: fixture.user.id,
            },
        });
        const rejection = await assertPeriodOpenForPosting(
            fixture.tenant.id,
            new Date('2026-07-10T12:00:00.000Z'),
        ).then(
            () => null,
            (error) => error,
        );
        const verification = await prisma.periodOpeningVerification.findUnique({
            where: { id: fixture.opened.openingVerificationId },
        });
        assert.equal(rejection?.code, 'PERIOD_OPENING_VERIFICATION_STALE');
        assert.equal(rejection?.reason, 'PRIOR_PERIOD_LEDGER_CHANGED');
        assert.equal(verification.status, 'INVALIDATED');
        assert.equal(verification.isCurrent, false);
    } finally {
        await cleanupFixture(prisma, fixture);
        await prisma.$disconnect();
    }
});
