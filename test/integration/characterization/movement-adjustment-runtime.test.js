'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createInject } = require('../../harness/express-inject');
const { createMovementApiApp } = require('../../harness/movement-api-app');
const {
    createMovementAdjustmentFixture,
    cleanupMovementAdjustmentFixture,
} = require('../../harness/disposable-movement-adjustment-fixture');

function authHeader(token) {
    return { authorization: `Bearer ${token}` };
}

function adjustmentPayload(fixture, { direction = 'INCREASE', qty = 5, clientRequestKey = null } = {}) {
    return {
        movementType: 'ADJUSTMENT',
        adjustmentDirection: direction,
        documentDate: new Date().toISOString().split('T')[0],
        sourceLocationId: fixture.location.id,
        reason: 'integration adjustment',
        lines: [
            {
                itemId: fixture.item.id,
                locationId: fixture.location.id,
                qtyRequested: qty,
            },
        ],
        ...(clientRequestKey ? { clientRequestKey } : {}),
    };
}

test('Movement Adjustment runtime — increase/decrease, permissions, idempotency, tenant isolation', async (t) => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    const app = createMovementApiApp();
    const inject = createInject(app);
    let fixture;

    try {
        fixture = await createMovementAdjustmentFixture(prisma, runContext);

        const stockKey = {
            tenantId_itemId_locationId: {
                tenantId: fixture.tenantA.id,
                itemId: fixture.item.id,
                locationId: fixture.location.id,
            },
        };

        await t.test('viewer cannot create adjustment (403)', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.viewerToken),
                body: adjustmentPayload(fixture),
            });
            assert.equal(res.status, 403);
            assert.equal(res.body?.required, 'ADJUSTMENT_CREATE');
        });

        await t.test('increase: draft does not change stock; post increases once', async () => {
            const before = await prisma.stockBalance.findUnique({ where: stockKey });
            assert.equal(Number(before.qtyOnHand), 100);

            const createRes = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: adjustmentPayload(fixture, { direction: 'INCREASE', qty: 7 }),
            });
            assert.equal(createRes.status, 201, createRes.body?.message);
            const docId = createRes.body?.data?.id;
            assert.ok(docId);
            assert.equal(createRes.body?.data?.status, 'DRAFT');

            const duringDraft = await prisma.stockBalance.findUnique({ where: stockKey });
            assert.equal(Number(duringDraft.qtyOnHand), 100, 'stock unchanged while DRAFT');

            const createAudits = await prisma.auditLog.findMany({
                where: { tenantId: fixture.tenantA.id, entityId: docId, action: 'CREATE' },
            });
            assert.ok(createAudits.length >= 1);

            const postRes = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assert.equal(postRes.status, 200, postRes.body?.message);
            assert.equal(postRes.body?.data?.status, 'POSTED');

            const after = await prisma.stockBalance.findUnique({ where: stockKey });
            assert.equal(Number(after.qtyOnHand), 107);

            const ledger = await prisma.inventoryLedger.findMany({
                where: { tenantId: fixture.tenantA.id, referenceId: docId },
            });
            assert.equal(ledger.length, 1);
            assert.equal(Number(ledger[0].qtyIn), 7);
            assert.equal(Number(ledger[0].qtyOut), 0);

            const postAudits = await prisma.auditLog.findMany({
                where: { tenantId: fixture.tenantA.id, entityId: docId, action: 'POST' },
            });
            assert.ok(postAudits.length >= 1);
            const afterVal = postAudits[0].afterValue;
            assert.equal(afterVal?.status, 'POSTED');
            assert.equal(afterVal?.lines?.[0]?.direction, 'INCREASE');
        });

        await t.test('decrease: post lowers stock and writes qtyOut ledger', async () => {
            const before = await prisma.stockBalance.findUnique({ where: stockKey });
            const startQty = Number(before.qtyOnHand);

            const createRes = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: adjustmentPayload(fixture, { direction: 'DECREASE', qty: 4 }),
            });
            assert.equal(createRes.status, 201);
            const docId = createRes.body.data.id;

            const postRes = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assert.equal(postRes.status, 200);

            const after = await prisma.stockBalance.findUnique({ where: stockKey });
            assert.equal(Number(after.qtyOnHand), startQty - 4);

            const ledger = await prisma.inventoryLedger.findFirst({
                where: { tenantId: fixture.tenantA.id, referenceId: docId },
            });
            assert.equal(Number(ledger.qtyOut), 4);
            assert.equal(Number(ledger.qtyIn), 0);
        });

        await t.test('decrease exceeding stock is rejected with no partial posting', async () => {
            const before = await prisma.stockBalance.findUnique({ where: stockKey });
            const startQty = Number(before.qtyOnHand);

            const createRes = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: adjustmentPayload(fixture, { direction: 'DECREASE', qty: startQty + 50 }),
            });
            assert.equal(createRes.status, 201);
            const docId = createRes.body.data.id;

            const postRes = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assert.notEqual(postRes.status, 200);
            assert.ok(postRes.body?.message?.includes('Insufficient stock') || postRes.status >= 400);

            const after = await prisma.stockBalance.findUnique({ where: stockKey });
            assert.equal(Number(after.qtyOnHand), startQty);

            const doc = await prisma.movementDocument.findUnique({ where: { id: docId } });
            assert.equal(doc.status, 'DRAFT');

            const ledgerCount = await prisma.inventoryLedger.count({
                where: { referenceId: docId },
            });
            assert.equal(ledgerCount, 0);
        });

        await t.test('duplicate create with same clientRequestKey returns one document', async () => {
            const key = `it-adj-idem-${fixture.runId}`;
            const body = adjustmentPayload(fixture, { direction: 'INCREASE', qty: 2, clientRequestKey: key });

            const [a, b] = await Promise.all([
                inject({
                    method: 'POST',
                    path: '/api/movements',
                    headers: authHeader(fixture.creatorToken),
                    body,
                }),
                inject({
                    method: 'POST',
                    path: '/api/movements',
                    headers: authHeader(fixture.creatorToken),
                    body,
                }),
            ]);

            assert.equal(a.status, 201);
            assert.equal(b.status, 201);
            assert.equal(a.body.data.id, b.body.data.id);

            const count = await prisma.movementDocument.count({
                where: { tenantId: fixture.tenantA.id, reason: 'integration adjustment' },
            });
            assert.ok(count >= 1);
        });

        await t.test('double post rejected — stock and ledger not duplicated', async () => {
            const createRes = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: adjustmentPayload(fixture, { direction: 'INCREASE', qty: 1 }),
            });
            const docId = createRes.body.data.id;

            const post1 = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assert.equal(post1.status, 200);

            const stockAfterFirst = await prisma.stockBalance.findUnique({ where: stockKey });
            const ledgerAfterFirst = await prisma.inventoryLedger.count({
                where: { referenceId: docId },
            });

            const post2 = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assert.notEqual(post2.status, 200);
            assert.ok(post2.status === 400 || post2.status === 409);

            const stockAfterSecond = await prisma.stockBalance.findUnique({ where: stockKey });
            const ledgerAfterSecond = await prisma.inventoryLedger.count({
                where: { referenceId: docId },
            });
            assert.equal(Number(stockAfterSecond.qtyOnHand), Number(stockAfterFirst.qtyOnHand));
            assert.equal(ledgerAfterSecond, ledgerAfterFirst);
        });

        await t.test('tenant B cannot read tenant A movement document', async () => {
            const createRes = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: adjustmentPayload(fixture, { direction: 'INCREASE', qty: 1 }),
            });
            const docId = createRes.body.data.id;

            const res = await inject({
                method: 'GET',
                path: `/api/movements/${docId}`,
                headers: authHeader(fixture.tenantBViewerToken),
            });
            assert.ok([403, 404].includes(res.status), `expected 403 or 404, got ${res.status}`);
        });
    } finally {
        try {
            if (fixture) {
                await cleanupMovementAdjustmentFixture(prisma, fixture);
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});
