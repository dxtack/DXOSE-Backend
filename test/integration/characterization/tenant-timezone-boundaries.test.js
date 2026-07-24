'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { openPeriod } = require('../../../src/services/periodClose.service');
const { assertPeriodOpenForPosting } = require('../../../src/services/periodGuard.service');
const { resolvePostingPeriod, monthBounds } = require('../../../src/platform/postingPeriod.util');

test('Saudi-local midnight uses the new hotel day and posting period', async () => {
    const prisma = new PrismaClient();
    const run = createRunContext();
    let tenantId;
    let userId;
    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `Timezone Boundary ${run.runId}`,
                slug: run.tenantSlug,
                timezone: 'Asia/Riyadh',
            },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: run.integrationEmail('timezone-boundary'),
                passwordHash: 'integration-test-not-used',
                firstName: 'Timezone',
                lastName: 'Boundary',
            },
        });
        userId = user.id;
        await openPeriod(
            tenantId,
            {
                year: 2026,
                month: 7,
                reason: 'P1 #19 boundary proof',
                bootstrapApproval: {
                    approvedBy: userId,
                    reason: 'Explicit zero-state timezone test bootstrap',
                    source: 'P1_19_TEST',
                },
            },
            userId,
        );

        const localJuly = new Date('2026-06-30T21:30:00.000Z');
        const resolved = resolvePostingPeriod(localJuly, tenant.timezone);
        assert.equal(resolved.assignedPostingPeriod, '2026-07');
        await assert.doesNotReject(() => assertPeriodOpenForPosting(tenantId, localJuly));

        const bounds = monthBounds(2026, 7, tenant.timezone);
        assert.equal(bounds.start.toISOString(), '2026-06-30T21:00:00.000Z');
        assert.equal(bounds.end.toISOString(), '2026-07-31T20:59:59.999Z');
        console.log('[proof] p1-19-riyadh-boundary', JSON.stringify({
            instant: localJuly.toISOString(),
            assignedPostingPeriod: resolved.assignedPostingPeriod,
            start: bounds.start.toISOString(),
            end: bounds.end.toISOString(),
        }));
    } finally {
        if (tenantId) {
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.periodClose.updateMany({ where: { tenantId }, data: { openingVerificationId: null } });
            await prisma.periodOpeningVerificationLine.deleteMany({ where: { verification: { tenantId } } });
            await prisma.periodOpeningVerification.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
