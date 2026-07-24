'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createInject } = require('../../harness/express-inject');
const { createGrnApiApp } = require('../../harness/grn-api-app');
const {
    createGrnTenantIsolationFixture,
    issueGrnAccessToken,
} = require('../../harness/disposable-grn-fixture');
const { cleanupGrnTenantIsolationFixture } = require('../../harness/cleanup-grn-fixture');

function authHeader(token) {
    return { authorization: `Bearer ${token}` };
}

function responseText(res) {
    return JSON.stringify(res.body || {});
}

test('Cross-tenant GRN isolation — read, list, and mutation denied across tenants', async (t) => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    const app = createGrnApiApp();
    const inject = createInject(app);
    let fixture;

    try {
        fixture = await createGrnTenantIsolationFixture(prisma, runContext);

        const tokenB = await issueGrnAccessToken(fixture.userBId, fixture.tenantSlugB);
        const tokenA = await issueGrnAccessToken(fixture.userAId, fixture.tenantSlugA);

        await t.test('Case A — tenant B cannot read tenant A GRN by ID', async () => {
            const res = await inject({
                method: 'GET',
                path: `/api/grn/${fixture.grnAId}`,
                headers: authHeader(tokenB),
            });

            assert.equal(res.status, 404, 'foreign GRN read should not be found');
            assert.equal(res.body?.success, false);
            assert.ok(!responseText(res).includes(fixture.grnANumber), 'must not leak GRN number');
            assert.ok(!responseText(res).includes(fixture.grnAId), 'must not leak GRN id');
            assert.ok(!responseText(res).includes(String(fixture.tenantAId)), 'must not leak tenant A id');
        });

        await t.test('Case B — tenant B list excludes tenant A GRN', async () => {
            const res = await inject({
                method: 'GET',
                path: '/api/grn',
                headers: authHeader(tokenB),
                query: { limit: '50' },
            });

            assert.equal(res.status, 200);
            assert.equal(res.body?.success, true);
            const rows = res.body?.data?.data || [];
            const ids = rows.map((row) => row.id);
            assert.ok(!ids.includes(fixture.grnAId), 'foreign GRN must not appear in list rows');
            assert.ok(
                rows.every((row) => row.grnNumber !== fixture.grnANumber),
                'foreign GRN number must not appear in list',
            );
            if (typeof res.body?.data?.total === 'number') {
                const foreignCount = await prisma.grnImport.count({
                    where: { tenantId: fixture.tenantAId, grnNumber: fixture.grnANumber },
                });
                assert.ok(foreignCount >= 1, 'control: tenant A GRN exists');
                assert.ok(
                    !rows.some((row) => row.id === fixture.grnAId),
                    'total/list must not expose tenant A GRN',
                );
            }
        });

        await t.test('Case C — tenant B cannot mutate tenant A GRN via reject', async () => {
            const grnBefore = await prisma.grnImport.findUnique({
                where: { id: fixture.grnAId },
                select: {
                    status: true,
                    rejectionReason: true,
                    rejectedBy: true,
                    concurrencyVersion: true,
                    approvalRequestId: true,
                },
            });

            const auditBefore = await prisma.auditLog.count({
                where: { entityId: fixture.grnAId },
            });

            const approvalBefore = await prisma.approvalRequest.count({
                where: {
                    OR: [
                        { grnImportId: fixture.grnAId },
                        ...(grnBefore.approvalRequestId ? [{ id: grnBefore.approvalRequestId }] : []),
                    ],
                },
            });

            const res = await inject({
                method: 'POST',
                path: `/api/grn/${fixture.grnAId}/reject`,
                headers: {
                    ...authHeader(tokenB),
                    'if-match': String(grnBefore.concurrencyVersion),
                },
                body: { reason: 'integration foreign reject attempt' },
            });

            assert.ok(res.status === 404 || res.status === 403, `foreign reject should be denied, got ${res.status}`);
            assert.ok(!responseText(res).includes(fixture.grnANumber), 'must not leak GRN number on reject');
            assert.ok(!responseText(res).includes(String(fixture.tenantAId)), 'must not leak tenant A id');

            const grnAfter = await prisma.grnImport.findUnique({
                where: { id: fixture.grnAId },
                select: { status: true, rejectionReason: true, rejectedBy: true },
            });
            assert.equal(grnAfter.status, grnBefore.status, 'GRN A status must remain unchanged');
            assert.equal(grnAfter.rejectionReason, grnBefore.rejectionReason);
            assert.equal(grnAfter.rejectedBy, grnBefore.rejectedBy);

            const auditAfter = await prisma.auditLog.count({
                where: { entityId: fixture.grnAId },
            });
            assert.equal(auditAfter, auditBefore, 'no audit rows should be created for foreign mutation');

            const approvalAfter = await prisma.approvalRequest.count({
                where: { grnImportId: fixture.grnAId },
            });
            assert.equal(approvalAfter, approvalBefore, 'no approval workflow rows should be created');

            const ledgerAfter = await prisma.inventoryLedger.count({
                where: { tenantId: fixture.tenantAId },
            });
            assert.equal(ledgerAfter, 0, 'no ledger rows should exist for tenant A GRN fixture');
        });

        await t.test('Case D — same-tenant control read succeeds for tenant A user', async () => {
            const res = await inject({
                method: 'GET',
                path: `/api/grn/${fixture.grnAId}`,
                headers: authHeader(tokenA),
            });

            assert.equal(res.status, 200);
            assert.equal(res.body?.success, true);
            assert.equal(res.body?.data?.id, fixture.grnAId);
            assert.equal(res.body?.data?.grnNumber, fixture.grnANumber);
        });
    } finally {
        try {
            if (fixture) {
                await cleanupGrnTenantIsolationFixture(prisma, { runContext, fixture });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});
