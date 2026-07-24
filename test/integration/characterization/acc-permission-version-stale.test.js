'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createDisposablePvFixture } = require('../../harness/disposable-pv-fixture');
const { cleanupPvFixture } = require('../../harness/cleanup-pv-fixture');

test('JWT permissionVersion freshness — signed token matches DB then PERMISSIONS_STALE after bump', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let fixture;
    let runtimeSettingIdsBefore = new Set();

    try {
        fixture = await createDisposablePvFixture(prisma, runContext);
        const permissionVersionBefore = fixture.permissionVersion;

        const settingsBefore = await prisma.accRuntimeSetting.findMany({ select: { id: true } });
        runtimeSettingIdsBefore = new Set(settingsBefore.map((row) => row.id));

        const { switchTenant } = require('../../../src/services/auth.service');

        const session = await switchTenant({
            userId: fixture.userId,
            tenantSlug: fixture.tenantSlug,
            ipAddress: '127.0.0.1',
            userAgent: 'integration-pv-freshness-test',
        });

        assert.ok(session?.accessToken, 'switchTenant must return accessToken');
        assert.ok(session?.refreshToken, 'switchTenant must return refreshToken');

        const refreshCount = await prisma.refreshToken.count({ where: { userId: fixture.userId } });
        assert.ok(refreshCount >= 1, 'refresh token row must be persisted for test user');

        const verified = jwt.verify(session.accessToken, process.env.JWT_SECRET);
        assert.equal(verified.userId, fixture.userId);
        assert.equal(verified.tenantId, fixture.tenantId);
        assert.equal(verified.permissionVersion, permissionVersionBefore);
        assert.equal(verified.email, fixture.userEmail);
        assert.ok(verified.role, 'JWT must include role claim');

        const dbUserBeforeBump = await prisma.user.findUnique({
            where: { id: fixture.userId },
            select: { permissionVersion: true },
        });
        assert.equal(verified.permissionVersion, dbUserBeforeBump.permissionVersion);

        await prisma.user.update({
            where: { id: fixture.userId },
            data: { permissionVersion: { increment: 1 } },
        });

        const dbUserAfterBump = await prisma.user.findUnique({
            where: { id: fixture.userId },
            select: { permissionVersion: true },
        });
        assert.equal(dbUserAfterBump.permissionVersion, permissionVersionBefore + 1);

        const { authenticate } = require('../../../src/middleware/authenticate');

        const req = {
            headers: {
                authorization: `Bearer ${session.accessToken}`,
            },
        };

        const res = {
            statusCode: null,
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                this.body = body;
                return this;
            },
        };

        let nextCalled = false;
        const next = () => {
            nextCalled = true;
        };

        await authenticate(req, res, next);

        assert.equal(res.statusCode, 401);
        assert.equal(res.body?.code, 'PERMISSIONS_STALE');
        assert.equal(nextCalled, false);
        assert.equal(req.user, undefined);
    } finally {
        try {
            if (fixture) {
                await cleanupPvFixture(prisma, {
                    runContext,
                    fixture,
                    runtimeSettingIdsBefore,
                });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});
