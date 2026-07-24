'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { openPeriod } = require('../../../src/services/periodClose.service');
const {
    postStockCount,
    postStockReport,
    postInventoryCountSession,
} = require('../../../src/services/posting.service');
const { tenantPeriodYearMonth } = require('../../../src/utils/tenant-calendar.util');

test('zero-effect count and stock-report posts persist the exact posting pair atomically', async () => {
    const prisma = new PrismaClient();
    const run = createRunContext();
    let tenantId;
    let userId;
    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `Posting Pair ${run.runId}`,
                slug: run.tenantSlug,
                timezone: 'Asia/Riyadh',
            },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: run.integrationEmail('posting-pair'),
                passwordHash: 'integration-test-not-used',
                firstName: 'Posting',
                lastName: 'Pair',
            },
        });
        userId = user.id;
        const current = tenantPeriodYearMonth(new Date(), tenant.timezone);
        await openPeriod(
            tenantId,
            {
                year: current.year,
                month: current.month,
                reason: 'P1 #17 zero-effect proof',
                bootstrapApproval: {
                    approvedBy: userId,
                    reason: 'Explicit zero-state integration bootstrap',
                    source: 'P1_17_TEST',
                },
            },
            userId,
        );
        const location = await prisma.location.create({
            data: { tenantId, name: `Posting Pair Location ${run.runId}` },
        });
        await prisma.tenantSetting.createMany({
            data: [
                { tenantId, key: 'allowOpeningBalance', value: 'LOCKED' },
                {
                    tenantId,
                    key: 'obFinalizeSnapshot',
                    value: JSON.stringify({ finalizedAt: new Date().toISOString() }),
                },
            ],
        });

        const legacyCount = await prisma.stockCountSession.create({
            data: {
                tenantId,
                locationId: location.id,
                sessionNo: `PAIR-LC-${run.runId}`,
                createdBy: userId,
                status: 'DRAFT',
            },
        });
        const canonicalCount = await prisma.stockCountSession.create({
            data: {
                tenantId,
                locationId: location.id,
                sessionNo: `PAIR-CC-${run.runId}`,
                createdBy: userId,
                status: 'PENDING_GM',
            },
        });
        const report = await prisma.savedStockReport.create({
            data: {
                tenantId,
                locationId: location.id,
                reportNo: `PAIR-SR-${run.runId}`,
                createdBy: userId,
                status: 'DRAFT',
            },
        });

        await postStockCount(legacyCount.id, tenantId, userId);
        await postInventoryCountSession(canonicalCount.id, tenantId, userId);
        await postStockReport(report.id, tenantId, userId);

        const [legacyAfter, canonicalAfter, reportAfter] = await Promise.all([
            prisma.stockCountSession.findUnique({ where: { id: legacyCount.id } }),
            prisma.stockCountSession.findUnique({ where: { id: canonicalCount.id } }),
            prisma.savedStockReport.findUnique({ where: { id: report.id } }),
        ]);
        for (const row of [legacyAfter, canonicalAfter, reportAfter]) {
            assert.equal(row.status, 'POSTED');
            assert.ok(row.postedAt);
            assert.ok(row.postingDate);
            assert.equal(row.postedAt.getTime(), row.postingDate.getTime());
            assert.match(row.assignedPostingPeriod, /^\d{4}-\d{2}$/);
        }
        assert.equal(
            await prisma.inventoryLedger.count({
                where: { tenantId, referenceId: { in: [legacyCount.id, canonicalCount.id, report.id] } },
            }),
            0,
        );
        console.log('[proof] p1-17-zero-effect-posting-pairs', JSON.stringify({
            legacyCount: legacyAfter.assignedPostingPeriod,
            canonicalCount: canonicalAfter.assignedPostingPeriod,
            savedStockReport: reportAfter.assignedPostingPeriod,
            ledgerEffects: 0,
        }));
    } finally {
        if (tenantId) {
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.savedStockReport.deleteMany({ where: { tenantId } });
            await prisma.stockCountSession.deleteMany({ where: { tenantId } });
            await prisma.tenantSetting.deleteMany({ where: { tenantId } });
            await prisma.periodClose.updateMany({ where: { tenantId }, data: { openingVerificationId: null } });
            await prisma.periodOpeningVerificationLine.deleteMany({
                where: { verification: { tenantId } },
            });
            await prisma.periodOpeningVerification.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
