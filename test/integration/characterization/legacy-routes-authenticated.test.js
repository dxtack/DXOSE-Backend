'use strict';

/**
 * Legacy route retirement — AUTHENTICATED exact-status proof.
 *
 * Uses a real tenant + a valid GRN_MANAGE access token so that requests pass the
 * `authenticate` middleware. This distinguishes:
 *   - DELETED route            → exactly 404 (no route matches; falls through to 404 handler)
 *   - DEPRECATED-but-present   → exactly 410 (route exists, handler rejects)
 *   - EXISTS-but-forbidden     → exactly 403 (route exists, permission denied)
 *
 * A 401 would mean auth failed before routing and proves nothing about route removal;
 * the control case below asserts the token authenticates (200) so 404s are genuine.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createInject } = require('../../harness/express-inject');
const {
    createGrnAuthorizationFixture,
    issueGrnAccessToken,
} = require('../../harness/disposable-grn-fixture');
const { cleanupGrnAuthorizationFixture } = require('../../harness/cleanup-grn-fixture');

function authHeader(token) {
    return { authorization: `Bearer ${token}` };
}

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', require('../../../src/routes'));
    app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found' }));
    return app;
}

test('Legacy route retirement — authenticated exact status codes', async (t) => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    const inject = createInject(buildApp());
    let fixture;

    try {
        fixture = await createGrnAuthorizationFixture(prisma, runContext);
        const token = await issueGrnAccessToken(fixture.authorizedUserId, fixture.tenantSlug);
        const h = authHeader(token);
        const docId = fixture.grnInScopeId;

        await t.test('control — token authenticates (GET in-scope GRN = 200)', async () => {
            const res = await inject({ method: 'GET', path: `/api/grn/${docId}`, headers: h });
            assert.equal(res.status, 200, `expected authenticated 200, got ${res.status}`);
        });

        await t.test('DELETED — PATCH /api/grn/:id/status = 404 exactly', async () => {
            const res = await inject({
                method: 'PATCH',
                path: `/api/grn/${docId}/status`,
                headers: h,
                body: { status: 'POSTED' },
            });
            assert.equal(res.status, 404);
        });

        await t.test('DEPRECATED — POST /api/grn/:id/post = 410 exactly', async () => {
            const res = await inject({
                method: 'POST',
                path: `/api/grn/${docId}/post`,
                headers: h,
                body: {},
            });
            assert.equal(res.status, 410);
        });

        await t.test('control — kept breakage /approve route EXISTS but forbidden = 403 (not 404)', async () => {
            const res = await inject({
                method: 'POST',
                path: `/api/breakage/${docId}/approve`,
                headers: h,
                body: {},
            });
            assert.equal(res.status, 403, `expected 403 (route exists, lacks APPROVE_BREAKAGE), got ${res.status}`);
        });

        const deletedSegments = ['approve-dept', 'approve-cost', 'approve-finance', 'approve-gm'];
        for (const seg of deletedSegments) {
            await t.test(`DELETED — POST /api/breakage/:id/${seg} = 404 exactly`, async () => {
                const res = await inject({ method: 'POST', path: `/api/breakage/${docId}/${seg}`, headers: h, body: {} });
                assert.equal(res.status, 404);
            });
            await t.test(`DELETED — POST /api/lost/:id/${seg} = 404 exactly`, async () => {
                const res = await inject({ method: 'POST', path: `/api/lost/${docId}/${seg}`, headers: h, body: {} });
                assert.equal(res.status, 404);
            });
            await t.test(`DELETED — POST /api/lost-items/:id/${seg} = 404 exactly`, async () => {
                const res = await inject({ method: 'POST', path: `/api/lost-items/${docId}/${seg}`, headers: h, body: {} });
                assert.equal(res.status, 404);
            });
        }
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
