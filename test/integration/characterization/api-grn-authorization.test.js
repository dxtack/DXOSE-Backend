'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createInject } = require('../../harness/express-inject');
const { createGrnApiApp } = require('../../harness/grn-api-app');
const {
    createGrnAuthorizationFixture,
    issueGrnAccessToken,
    signGrnAccessToken,
} = require('../../harness/disposable-grn-fixture');
const { cleanupGrnAuthorizationFixture } = require('../../harness/cleanup-grn-fixture');

function authHeader(token) {
    return { authorization: `Bearer ${token}` };
}

test('API GRN authorization — actual route stack with authenticate and requirePermission', async (t) => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    const app = createGrnApiApp();
    const inject = createInject(app);
    let fixture;

    try {
        fixture = await createGrnAuthorizationFixture(prisma, runContext);

        const authorizedToken = await issueGrnAccessToken(fixture.authorizedUserId, fixture.tenantSlug);
        const deniedToken = await issueGrnAccessToken(fixture.deniedUserId, fixture.tenantSlug);
        const scopeToken = await issueGrnAccessToken(fixture.scopeUserId, fixture.tenantSlug);

        await t.test('Case A — authorized user can read in-scope GRN', async () => {
            const res = await inject({
                method: 'GET',
                path: `/api/grn/${fixture.grnInScopeId}`,
                headers: authHeader(authorizedToken),
            });

            assert.equal(res.status, 200, 'authorized read should succeed');
            assert.equal(res.body?.success, true);
            assert.equal(res.body?.data?.id, fixture.grnInScopeId);
            assert.equal(res.body?.data?.grnNumber, fixture.grnInScopeNumber);
        });

        await t.test('Case B — missing GRN permission returns 403 without data change', async () => {
            const before = await prisma.grnImport.findUnique({
                where: { id: fixture.grnInScopeId },
                select: { status: true, grnNumber: true, updatedAt: true },
            });

            const res = await inject({
                method: 'GET',
                path: `/api/grn/${fixture.grnInScopeId}`,
                headers: authHeader(deniedToken),
            });

            assert.equal(res.status, 403, 'missing permission should be forbidden');
            assert.notEqual(res.status, 500);
            assert.equal(res.body?.success, false);
            assert.equal(res.body?.required, 'GRN_VIEW');

            const after = await prisma.grnImport.findUnique({
                where: { id: fixture.grnInScopeId },
                select: { status: true, grnNumber: true, updatedAt: true },
            });
            assert.deepEqual(after, before, 'GRN must remain unchanged after forbidden read');
        });

        await t.test('Case C — stale JWT denied via authenticate with PERMISSIONS_STALE', async () => {
            const staleToken = await signGrnAccessToken(prisma, {
                userId: fixture.authorizedUserId,
                tenantId: fixture.tenantId,
                roleId: fixture.grantedRoleId,
                roleCode: fixture.codes.grantedRoleCode,
                email: fixture.authorizedEmail,
            });

            await prisma.user.update({
                where: { id: fixture.authorizedUserId },
                data: { permissionVersion: { increment: 1 } },
            });

            const res = await inject({
                method: 'GET',
                path: `/api/grn/${fixture.grnInScopeId}`,
                headers: authHeader(staleToken),
            });

            assert.equal(res.status, 401);
            assert.equal(res.body?.code, 'PERMISSIONS_STALE');
        });

        await t.test('Case D — permission granted but scope denies out-of-scope GRN', async () => {
            const before = await prisma.grnImport.findUnique({
                where: { id: fixture.grnOutOfScopeId },
                select: { status: true, updatedAt: true },
            });

            const res = await inject({
                method: 'GET',
                path: `/api/grn/${fixture.grnOutOfScopeId}`,
                headers: authHeader(scopeToken),
            });

            assert.equal(res.status, 403, 'scope-limited user should be denied for foreign department location');
            assert.equal(res.body?.success, false);
            assert.match(String(res.body?.message || ''), /scope/i);

            const after = await prisma.grnImport.findUnique({
                where: { id: fixture.grnOutOfScopeId },
                select: { status: true, updatedAt: true },
            });
            assert.deepEqual(after, before, 'out-of-scope GRN must remain unchanged');
        });
    } finally {
        try {
            if (fixture) {
                await cleanupGrnAuthorizationFixture(prisma, { runContext, fixture });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});
