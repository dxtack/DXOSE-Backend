'use strict';

/**
 * Lost approval workflow — production guard + service integration (Grand Horizon fixtures).
 * Run: node --test scripts/lost-approval-workflow.test.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const lostItemsService = require('../src/services/lostItems.service');
const { FIXTURE_TAG, resolvePhase5Actors } = require('./lib/phase5-timeline-fixture.helpers');
const { actorFromMember } = require('./lib/grn-timeline-fixture.helpers');

const prisma = new PrismaClient();

async function tenantId() {
    const t = await prisma.tenant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    return t?.id ?? null;
}

test('Allowed: approve on current active step (new lost doc, cost approve)', async () => {
    const tid = await tenantId();
    assert.ok(tid);
    const actors = await resolvePhase5Actors(prisma, tid);
    assert.ok(actors);
    const { findStockLine } = require('./lib/phase5-timeline-fixture.helpers');
    const stock = await findStockLine(prisma, tid, 1);
    assert.ok(stock);
    const created = await lostItemsService.createLost(tid, actors.creator, {
        reason: `${FIXTURE_TAG} guard approve test`,
        suggestedAction: 'HOTEL',
        lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
        notes: `${FIXTURE_TAG}_guard_approve`,
    });
    assert.equal(created.status, 'DEPT_APPROVED');
    const updated = await lostItemsService.processLostApprovalStep(
        created.id,
        tid,
        actors.costUser,
        'APPROVE',
        'Guard approve OK',
        null,
    );
    assert.equal(updated.status, 'COST_CONTROL_APPROVED');
    assert.equal(updated.approvalRequests?.status, 'PENDING');
    assert.equal(updated.approvalRequests?.currentStep, 3);
});

test('Allowed: reject on current active step (creates transient doc)', async () => {
    const tid = await tenantId();
    assert.ok(tid);
    const actors = await resolvePhase5Actors(prisma, tid);
    assert.ok(actors);
    const { findStockLine } = require('./lib/phase5-timeline-fixture.helpers');
    const stock = await findStockLine(prisma, tid, 1);
    assert.ok(stock);
    const created = await lostItemsService.createLost(tid, actors.creator, {
        reason: `${FIXTURE_TAG} guard reject test`,
        suggestedAction: 'HOTEL',
        lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
        notes: `${FIXTURE_TAG}_guard_reject`,
    });
    await assert.rejects(
        () =>
            lostItemsService.processLostApprovalStep(
                created.id,
                tid,
                actors.creator,
                'REJECT',
                'Guard reject test',
                null,
            ),
        (e) => e.statusCode === 403 || /permission/i.test(e.message),
    );
    await lostItemsService.processLostApprovalStep(
        created.id,
        tid,
        actors.costUser,
        'REJECT',
        'Guard reject test',
        null,
    );
    const after = await lostItemsService.getLostById(created.id, tid, actors.costUser);
    assert.equal(after.status, 'REJECTED');
    assert.equal(after.approvalRequests?.status, 'REJECTED');
});

test('Blocked: approve after reject terminal', async () => {
    const tid = await tenantId();
    const doc = await prisma.movementDocument.findFirst({
        where: { tenantId: tid, movementType: 'LOST', notes: { contains: FIXTURE_TAG }, status: 'REJECTED' },
        orderBy: { createdAt: 'desc' },
    });
    assert.ok(doc);
    const actors = await resolvePhase5Actors(prisma, tid);
    await assert.rejects(
        () =>
            lostItemsService.processLostApprovalStep(
                doc.id,
                tid,
                actors.costUser,
                'APPROVE',
                'Should fail',
                null,
            ),
        (e) => e.code === 'APPROVAL_ACTION_BLOCKED' || /read-only|REJECTED/i.test(e.message),
    );
});

test('Blocked: approve with insufficient permission (storekeeper on cost step)', async () => {
    const tid = await tenantId();
    const actors = await resolvePhase5Actors(prisma, tid);
    const storeMember = await prisma.tenantMember.findFirst({
        where: { tenantId: tid, role: { code: 'STOREKEEPER' }, isActive: true },
        include: { user: true, role: true },
    });
    const storekeeper = actorFromMember(storeMember, ['LOST_MANAGE']);
    assert.ok(storekeeper);
    const { findStockLine } = require('./lib/phase5-timeline-fixture.helpers');
    const stock = await findStockLine(prisma, tid, 1);
    const created = await lostItemsService.createLost(tid, actors.creator, {
        reason: `${FIXTURE_TAG} perm test`,
        suggestedAction: 'HOTEL',
        lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
        notes: `${FIXTURE_TAG}_perm_block`,
    });
    await assert.rejects(
        () =>
            lostItemsService.processLostApprovalStep(
                created.id,
                tid,
                storekeeper,
                'APPROVE',
                'No permission',
                null,
            ),
        (e) => e.statusCode === 403,
    );
});

test('Blocked: approve on DRAFT status (no pipeline)', async () => {
    const tid = await tenantId();
    const doc = await prisma.movementDocument.findFirst({
        where: { tenantId: tid, movementType: 'BREAKAGE', status: 'DRAFT' },
        orderBy: { createdAt: 'desc' },
    });
    if (!doc?.approvalRequests) {
        test.skip('no draft breakage with approval to probe');
        return;
    }
    const actors = await resolvePhase5Actors(prisma, tid);
    await assert.rejects(
        () =>
            require('../src/services/breakage.service').processApprovalStep(
                doc.id,
                tid,
                actors.costUser,
                'APPROVE',
                'Draft block',
                null,
                doc.concurrencyVersion,
            ),
        (e) => e.code === 'DOCUMENT_STATUS_NOT_IN_APPROVAL_PIPELINE',
    );
});

test('Blocked: stale concurrency version on breakage approve', async () => {
    const tid = await tenantId();
    const doc = await prisma.movementDocument.findFirst({
        where: { tenantId: tid, movementType: 'BREAKAGE', notes: FIXTURE_TAG, status: 'DEPT_APPROVED' },
        orderBy: { createdAt: 'desc' },
    });
    if (!doc) {
        test.skip('no breakage in pipeline');
        return;
    }
    const actors = await resolvePhase5Actors(prisma, tid);
    await assert.rejects(
        () =>
            require('../src/services/breakage.service').processApprovalStep(
                doc.id,
                tid,
                actors.costUser,
                'APPROVE',
                'Stale',
                null,
                (doc.concurrencyVersion ?? 1) - 1,
            ),
        (e) => /concurrency|version|stale|modified by another user/i.test(e.message),
    );
});
