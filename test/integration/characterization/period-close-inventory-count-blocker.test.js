'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { runMonthEndCloseChecklist } = require('../../../src/services/periodCloseGovernance.service');
const { completeClose } = require('../../../src/services/periodClose.service');

test('only nonterminal inventory counts inside the period block Complete Close', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: { name: `P1 Count Blocker ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p1-count-blocker'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P1',
                lastName: 'Count Blocker',
            },
        });
        userId = user.id;
        const location = await prisma.location.create({
            data: { tenantId, name: `P1 Count Blocker Location ${runContext.runId}` },
        });
        await prisma.periodClose.create({
            data: { tenantId, year: 2026, month: 1, status: 'CLOSING' },
        });

        const sessions = [
            ['before-period', 'COUNTING', '2025-12-31T20:59:59.999Z'],
            ['inside-period', 'COUNTING', '2026-01-15T12:00:00.000Z'],
            ['after-period', 'COUNTING', '2026-02-01T00:00:00.000Z'],
            ['cancelled-inside', 'CANCELLED', '2026-01-20T12:00:00.000Z'],
        ];
        for (const [label, status, countDate] of sessions) {
            await prisma.stockCountSession.create({
                data: {
                    tenantId,
                    locationId: location.id,
                    sessionNo: `P1-CNT-${label}-${runContext.runId}`,
                    countDate: new Date(countDate),
                    snapshotAt: new Date(countDate),
                    status,
                    createdBy: userId,
                },
            });
        }

        const checklist = await runMonthEndCloseChecklist(tenantId, { year: 2026, month: 1 });
        const finding = checklist.findings.find((row) => row.code === 'OPEN_INVENTORY_COUNT');
        const closeResult = await completeClose(
            tenantId,
            { year: 2026, month: 1, notes: 'P1 #13 scope proof' },
            userId,
        ).then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason }),
        );
        const persistedPeriod = await prisma.periodClose.findUnique({
            where: { tenantId_year_month: { tenantId, year: 2026, month: 1 } },
        });
        const proof = {
            findingSeverity: finding?.severity ?? null,
            findingCount: finding?.count ?? 0,
            ready: checklist.ready,
            closeOutcome: closeResult.status,
            closeErrorCode: closeResult.reason?.code ?? null,
            persistedStatus: persistedPeriod.status,
        };
        console.log('[proof] p1-13-inventory-count-blocker', JSON.stringify(proof));

        assert.deepEqual(proof, {
            findingSeverity: 'BLOCKER',
            findingCount: 1,
            ready: false,
            closeOutcome: 'rejected',
            closeErrorCode: 'PERIOD_CLOSE_BLOCKERS',
            persistedStatus: 'CLOSING',
        });
    } finally {
        if (tenantId) {
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.stockCountSession.deleteMany({ where: { tenantId } });
            const periods = await prisma.periodClose.findMany({ where: { tenantId }, select: { id: true } });
            const periodIds = periods.map((row) => row.id);
            await prisma.periodSnapshotLine.deleteMany({
                where: { snapshotVersion: { periodCloseId: { in: periodIds } } },
            });
            await prisma.periodSnapshotVersion.deleteMany({ where: { periodCloseId: { in: periodIds } } });
            await prisma.tenantSetting.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
