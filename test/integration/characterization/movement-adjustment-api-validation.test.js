'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
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

function basePayload(fixture, overrides = {}) {
    return {
        movementType: 'ADJUSTMENT',
        adjustmentDirection: 'INCREASE',
        documentDate: new Date().toISOString().split('T')[0],
        sourceLocationId: fixture.location.id,
        reason: `api-val-${fixture.runId}`,
        lines: [
            {
                itemId: fixture.item.id,
                locationId: fixture.location.id,
                qtyRequested: 3,
            },
        ],
        ...overrides,
    };
}

function assertNo500(status, label) {
    assert.ok(status < 500, `${label}: unexpected HTTP ${status}`);
}

test('Movement Adjustment API validation matrix', async (t) => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    const app = createMovementApiApp();
    const inject = createInject(app);
    let fixture;
    let inactiveItem;
    let inactiveLocation;
    let foreignItem;
    let foreignLocation;
    let postedDocId;

    try {
        fixture = await createMovementAdjustmentFixture(prisma, runContext);

        inactiveItem = await prisma.item.create({
            data: {
                tenantId: fixture.tenantA.id,
                name: `INACTIVE-${fixture.runId}`,
                barcode: `INACT-${fixture.runId}`,
                isActive: false,
                unitPrice: 1,
            },
        });

        inactiveLocation = await prisma.location.create({
            data: {
                tenantId: fixture.tenantA.id,
                departmentId: fixture.dept.id,
                name: `INACTIVE-LOC-${fixture.runId}`,
                isActive: false,
            },
        });

        const deptB = await prisma.department.create({
            data: {
                tenantId: fixture.tenantB.id,
                code: `IT_ADJ_B_DEPT_${fixture.runId}`,
                name: 'Adj B Dept',
                isActive: true,
            },
        });
        foreignLocation = await prisma.location.create({
            data: {
                tenantId: fixture.tenantB.id,
                departmentId: deptB.id,
                name: `FOREIGN-LOC-${fixture.runId}`,
                isActive: true,
            },
        });
        foreignItem = await prisma.item.create({
            data: {
                tenantId: fixture.tenantB.id,
                name: `FOREIGN-ITEM-${fixture.runId}`,
                barcode: `FOR-${fixture.runId}`,
                isActive: true,
                unitPrice: 1,
            },
        });

        const stockKey = {
            tenantId_itemId_locationId: {
                tenantId: fixture.tenantA.id,
                itemId: fixture.item.id,
                locationId: fixture.location.id,
            },
        };

        await t.test('1. quantity = 0 rejected', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    lines: [{ itemId: fixture.item.id, locationId: fixture.location.id, qtyRequested: 0 }],
                }),
            });
            assertNo500(res.status, 'qty=0');
            assert.ok(res.status >= 400 && res.status < 500);
        });

        await t.test('2. negative quantity rejected', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    lines: [{ itemId: fixture.item.id, locationId: fixture.location.id, qtyRequested: -5 }],
                }),
            });
            assertNo500(res.status, 'negative qty');
            assert.ok(res.status >= 400 && res.status < 500);
        });

        await t.test('3. missing direction rejected', async () => {
            const body = basePayload(fixture);
            delete body.adjustmentDirection;
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body,
            });
            assertNo500(res.status, 'missing direction');
            assert.ok(res.status >= 400 && res.status < 500);
        });

        await t.test('4. invalid direction rejected', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, { adjustmentDirection: 'SIDEWAYS' }),
            });
            assertNo500(res.status, 'invalid direction');
            assert.ok(res.status >= 400 && res.status < 500);
        });

        await t.test('5. item not found — safe rejection', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    lines: [{ itemId: randomUUID(), locationId: fixture.location.id, qtyRequested: 1 }],
                }),
            });
            assertNo500(res.status, 'random item');
            assert.equal(res.status, 404);
        });

        await t.test('6. inactive item rejected', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    lines: [{ itemId: inactiveItem.id, locationId: fixture.location.id, qtyRequested: 1 }],
                }),
            });
            assertNo500(res.status, 'inactive item');
            assert.equal(res.status, 422);
        });

        await t.test('7. location not found — safe rejection', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    sourceLocationId: randomUUID(),
                    lines: [{ itemId: fixture.item.id, locationId: randomUUID(), qtyRequested: 1 }],
                }),
            });
            assertNo500(res.status, 'random location');
            assert.ok(res.status === 404 || res.status === 400);
        });

        await t.test('8. inactive location rejected', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    sourceLocationId: inactiveLocation.id,
                    lines: [{ itemId: fixture.item.id, locationId: inactiveLocation.id, qtyRequested: 1 }],
                }),
            });
            assertNo500(res.status, 'inactive location');
            assert.equal(res.status, 422);
        });

        await t.test('9. foreign tenant item rejected', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    lines: [{ itemId: foreignItem.id, locationId: fixture.location.id, qtyRequested: 1 }],
                }),
            });
            assertNo500(res.status, 'foreign item');
            assert.equal(res.status, 404);
        });

        await t.test('10. foreign tenant location rejected', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    sourceLocationId: foreignLocation.id,
                    lines: [{ itemId: fixture.item.id, locationId: foreignLocation.id, qtyRequested: 1 }],
                }),
            });
            assertNo500(res.status, 'foreign location');
            assert.ok(res.status === 404 || res.status === 400);
        });

        await t.test('11. random movement id → 404', async () => {
            const res = await inject({
                method: 'GET',
                path: `/api/movements/${randomUUID()}`,
                headers: authHeader(fixture.creatorToken),
            });
            assertNo500(res.status, 'random id');
            assert.equal(res.status, 404);
        });

        let tenantADocId;
        await t.test('setup: create draft for cross-tenant tests', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, { reason: `cross-${fixture.runId}` }),
            });
            assert.equal(res.status, 201);
            tenantADocId = res.body.data.id;
        });

        await t.test('12. update other tenant document denied', async () => {
            const res = await inject({
                method: 'PUT',
                path: `/api/movements/${tenantADocId}`,
                headers: {
                    ...authHeader(fixture.tenantBViewerToken),
                    'if-match': '0',
                },
                body: basePayload(fixture, { notes: 'cross-tenant update' }),
            });
            assertNo500(res.status, 'cross-tenant update');
            assert.equal(res.status, 404);
        });

        await t.test('13. post other tenant document denied', async () => {
            const res = await inject({
                method: 'POST',
                path: `/api/movements/${tenantADocId}/post`,
                headers: authHeader(fixture.tenantBViewerToken),
                body: {},
            });
            assertNo500(res.status, 'cross-tenant post');
            assert.equal(res.status, 404);
        });

        await t.test('14. update after POSTED rejected', async () => {
            const createRes = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, { reason: `posted-upd-${fixture.runId}`, lines: [{ itemId: fixture.item.id, locationId: fixture.location.id, qtyRequested: 1 }] }),
            });
            const docId = createRes.body.data.id;
            const postRes = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assert.equal(postRes.status, 200);
            postedDocId = docId;

            const updateRes = await inject({
                method: 'PUT',
                path: `/api/movements/${docId}`,
                headers: { ...authHeader(fixture.creatorToken), 'if-match': String(postRes.body.data.concurrencyVersion ?? 1) },
                body: basePayload(fixture, { notes: 'after posted' }),
            });
            assertNo500(updateRes.status, 'update posted');
            assert.ok(updateRes.status >= 400 && updateRes.status < 500);
        });

        await t.test('15. post non-DRAFT rejected', async () => {
            const res = await inject({
                method: 'POST',
                path: `/api/movements/${postedDocId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assertNo500(res.status, 'post non-draft');
            assert.ok(res.status >= 400 && res.status < 500);
        });

        await t.test('16. double post — second rejected, no duplicate impact', async () => {
            const before = await prisma.stockBalance.findUnique({ where: stockKey });
            const startQty = Number(before.qtyOnHand);

            const createRes = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, { reason: `dbl-post-${fixture.runId}`, lines: [{ itemId: fixture.item.id, locationId: fixture.location.id, qtyRequested: 2 }] }),
            });
            const docId = createRes.body.data.id;

            const post1 = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assert.equal(post1.status, 200);

            const stockMid = await prisma.stockBalance.findUnique({ where: stockKey });
            const ledgerMid = await prisma.inventoryLedger.count({ where: { referenceId: docId } });

            const post2 = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assertNo500(post2.status, 'double post');
            assert.ok(post2.status >= 400 && post2.status < 500);

            const stockEnd = await prisma.stockBalance.findUnique({ where: stockKey });
            const ledgerEnd = await prisma.inventoryLedger.count({ where: { referenceId: docId } });
            assert.equal(Number(stockEnd.qtyOnHand), Number(stockMid.qtyOnHand));
            assert.equal(ledgerEnd, ledgerMid);
            assert.equal(Number(stockEnd.qtyOnHand), startQty + 2);
        });

        await t.test('17. missing required structural fields — validation error', async () => {
            const res = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: { movementType: 'ADJUSTMENT', adjustmentDirection: 'INCREASE' },
            });
            assertNo500(res.status, 'missing fields');
            assert.ok(res.status >= 400 && res.status < 500);
        });

        await t.test('18. user without ADJUSTMENT_CREATE — mutations denied', async () => {
            const body = basePayload(fixture);
            const create = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.viewerToken),
                body,
            });
            assert.equal(create.status, 403);

            const draft = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, { reason: `viewer-deny-${fixture.runId}` }),
            });
            const docId = draft.body.data.id;

            const update = await inject({
                method: 'PUT',
                path: `/api/movements/${docId}`,
                headers: { ...authHeader(fixture.viewerToken), 'if-match': '0' },
                body,
            });
            assert.equal(update.status, 403);

            const post = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.viewerToken),
                body: {},
            });
            assert.equal(post.status, 403);
            assertNo500(create.status, 'viewer create');
        });

        await t.test('19. MOVEMENTS_VIEW only — list/detail OK, mutations denied', async () => {
            const list = await inject({
                method: 'GET',
                path: '/api/movements',
                headers: authHeader(fixture.viewerToken),
            });
            assert.equal(list.status, 200);

            const draft = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, { reason: `viewer-read-${fixture.runId}` }),
            });
            const docId = draft.body.data.id;

            const detail = await inject({
                method: 'GET',
                path: `/api/movements/${docId}`,
                headers: authHeader(fixture.viewerToken),
            });
            assert.equal(detail.status, 200);

            const mutate = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.viewerToken),
                body: {},
            });
            assert.equal(mutate.status, 403);
        });

        await t.test('20. no HTTP 500 across negative stock post + verify state', async () => {
            const before = await prisma.stockBalance.findUnique({ where: stockKey });
            const startQty = Number(before.qtyOnHand);

            const createRes = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    adjustmentDirection: 'DECREASE',
                    reason: `neg-stock-${fixture.runId}`,
                    lines: [{ itemId: fixture.item.id, locationId: fixture.location.id, qtyRequested: startQty + 100 }],
                }),
            });
            assert.equal(createRes.status, 201);
            const docId = createRes.body.data.id;

            const postRes = await inject({
                method: 'POST',
                path: `/api/movements/${docId}/post`,
                headers: authHeader(fixture.creatorToken),
                body: {},
            });
            assertNo500(postRes.status, 'negative stock post');
            assert.ok(postRes.status >= 400 && postRes.status < 500);

            const after = await prisma.stockBalance.findUnique({ where: stockKey });
            assert.equal(Number(after.qtyOnHand), startQty);

            const doc = await prisma.movementDocument.findUnique({ where: { id: docId } });
            assert.equal(doc.status, 'DRAFT');

            const ledgerCount = await prisma.inventoryLedger.count({ where: { referenceId: docId } });
            assert.equal(ledgerCount, 0);

            const auditPost = await prisma.auditLog.count({
                where: { entityId: docId, action: 'POST' },
            });
            assert.equal(auditPost, 0);
        });

        await t.test('idempotency: sequential duplicate same clientRequestKey within TTL', async () => {
            const key = `seq-idem-${fixture.runId}`;
            const body = basePayload(fixture, { clientRequestKey: key, reason: `seq-idem-${fixture.runId}` });

            const a = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body,
            });
            const b = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body,
            });
            assert.equal(a.status, 201);
            assert.equal(b.status, 201);
            assert.equal(a.body.data.id, b.body.data.id);
        });

        await t.test('idempotency: different clientRequestKey allowed', async () => {
            const a = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    clientRequestKey: `key-a-${fixture.runId}`,
                    reason: `idem-a-${fixture.runId}`,
                }),
            });
            const b = await inject({
                method: 'POST',
                path: '/api/movements',
                headers: authHeader(fixture.creatorToken),
                body: basePayload(fixture, {
                    clientRequestKey: `key-b-${fixture.runId}`,
                    reason: `idem-b-${fixture.runId}`,
                }),
            });
            assert.equal(a.status, 201);
            assert.equal(b.status, 201);
            assert.notEqual(a.body.data.id, b.body.data.id);
        });
    } finally {
        if (fixture) {
            await cleanupMovementAdjustmentFixture(prisma, fixture);
        }
        await prisma.$disconnect();
    }
});
