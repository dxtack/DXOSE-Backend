'use strict';

/**
 * DB-backed GRN multi-cycle timeline integration (4-cycle functional + 10-cycle mandatory).
 * Uses real Prisma relations and getGrnTimeline — no in-memory fixture truncation.
 *
 * Run: node --test scripts/grn-timeline-db-integration.test.js
 * Requires: seeded grand-horizon tenant, ACC GRN workflow, mapped item/supplier/location.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const grnService = require('../src/services/grn.service');
const { getGrnTimeline } = require('../src/platform/documentTimeline.service');
const { buildTimelineEntries } = require('../src/platform/timeline/timelineEntry.merge');
const { buildGrnTimelineRawEntries } = require('../src/platform/timeline/grnTimeline.builder');
const {
    findActorWithRole,
    approveCostAndFinanceForSendBackCycle,
    approveCostStep,
} = require('./lib/grn-timeline-fixture.helpers');

const prisma = new PrismaClient();

async function resolveContext() {
    const tenant = await prisma.tenant.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
    });
    if (!tenant) return null;
    const member = await prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        include: { user: true, role: true },
    });
    if (!member?.user) return null;
    const supplier = await prisma.supplier.findFirst({ where: { tenantId: tenant.id } });
    const location = await prisma.location.findFirst({ where: { tenantId: tenant.id } });
    const item = await prisma.item.findFirst({
        where: { tenantId: tenant.id, itemUnits: { some: {} } },
        include: { itemUnits: { include: { unit: true } } },
    });
    if (!supplier || !location || !item?.itemUnits?.[0]) return null;

    const costUser = await findActorWithRole(prisma, tenant.id, 'COST_CONTROL');
    const financeUser = await findActorWithRole(prisma, tenant.id, 'FINANCE_MANAGER');
    if (!costUser || !financeUser) return null;

    return {
        tenantId: tenant.id,
        user: {
            ...member.user,
            role: member?.role?.code || 'ORG_MANAGER',
            permissions: ['GRN_MANAGE'],
        },
        userId: member.user.id,
        costUser,
        financeUser,
        supplierId: supplier.id,
        locationId: location.id,
        line: {
            itemId: item.id,
            uomId: item.itemUnits[0].unitId,
            receivedQty: 5,
            orderedQty: 5,
            unitPrice: 10,
        },
    };
}

async function createValidatedGrn(ctx, tag) {
    const grn = await grnService.createGrn({
        supplierId: ctx.supplierId,
        locationId: ctx.locationId,
        grnNumber: `EXT-${tag}`,
        supplierInvoiceNumber: `INV-${tag}`,
        receivingDate: new Date(),
        invoiceUrl: '/uploads/test-invoice.pdf',
        lines: [ctx.line],
        tenantId: ctx.tenantId,
        userId: ctx.userId,
    });
    return grn;
}

async function freshGrn(ctx) {
    return createValidatedGrn(ctx, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
}

async function submit(ctx, grn) {
    return grnService.submitForApproval(grn.id, ctx.tenantId, ctx.userId, grn.concurrencyVersion);
}

async function approveCostOnly(ctx, grnId) {
    return approveCostStep(ctx, grnId, ctx.costUser);
}

async function approveCostAndFinance(ctx, grnId) {
    await approveCostAndFinanceForSendBackCycle(prisma, ctx, grnId, ctx.costUser, ctx.financeUser);
}

async function sendBack(ctx, grnId) {
    let g = await grnService.getGrn(grnId, ctx.tenantId);
    await grnService.sendBackGrn(grnId, ctx.tenantId, ctx.user, 'Send back for correction', g.concurrencyVersion);
    g = await grnService.getGrn(grnId, ctx.tenantId);
    return grnService.validateGrn(grnId, ctx.tenantId).then(() => grnService.getGrn(grnId, ctx.tenantId));
}

async function loadGrnGraph(grnId, tenantId) {
    return prisma.grnImport.findFirst({
        where: { id: grnId, tenantId },
        include: {
            importedByUser: { select: { firstName: true, lastName: true } },
            postedByUser: { select: { firstName: true, lastName: true } },
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: {
                            actedByUser: { select: { firstName: true, lastName: true } },
                            requiredRole: { select: { code: true } },
                        },
                    },
                },
            },
            approvalHistory: {
                where: { requestType: 'GRN_IMPORT' },
                orderBy: [{ cycleNumber: 'asc' }, { createdAt: 'asc' }],
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: {
                            actedByUser: { select: { firstName: true, lastName: true } },
                            requiredRole: { select: { code: true } },
                        },
                    },
                },
            },
        },
    });
}

function assertNoTruncationInGrnHistoryQuery() {
    const doc = require('fs').readFileSync(
        require('path').join(__dirname, '../src/platform/documentTimeline.service.js'),
        'utf8',
    );
    const historyBlock = doc.split('approvalHistory:')[1]?.split('approvalRequest:')[0] || '';
    assert.ok(!/\b(take|limit)\s*:\s*\d+/.test(historyBlock), 'approvalHistory query has no take/limit');
}

test('DB integration prerequisites', async (t) => {
    const ctx = await resolveContext();
    if (!ctx) {
        t.skip('active tenant with member/supplier/location/item not available');
        return;
    }
    assert.ok(ctx.tenantId);
});

test('DB-backed 4-cycle timeline via API service', async (t) => {
    const ctx = await resolveContext();
    if (!ctx) {
        t.skip('active tenant with member/supplier/location/item not available');
        return;
    }

    assertNoTruncationInGrnHistoryQuery();

    let grn = await freshGrn(ctx);
    grn = await submit(ctx, grn);

    for (let cycle = 1; cycle <= 3; cycle++) {
        await approveCostAndFinance(ctx, grn.id);
        grn = await sendBack(ctx, grn.id);
        grn = await submit(ctx, grn);
    }

    const timeline = await getGrnTimeline(grn.id, ctx.tenantId);
    const entries = timeline.timelineEntries;

    assert.equal(entries.length, 15, '4-cycle with cost+finance per cycle = 15 entries');
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length, 3);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'RESUBMIT').length, 3);
    assert.equal(
        entries.filter((e) => e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'FINANCE').length,
        3,
    );
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_CURRENT').length, 1);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 1);

    const graph = await loadGrnGraph(grn.id, ctx.tenantId);
    assert.ok(graph.approvalRequest?.grnImportId === grn.id);
    assert.equal(graph.approvalRequest?.cycleNumber, 4);

    for (let i = 1; i < entries.length; i++) {
        assert.ok(entries[i].globalOrder > entries[i - 1].globalOrder);
    }

    assert.ok(timeline.workflowSlots.length >= 3, 'legacy workflowSlots unchanged additive');
    assert.ok(Array.isArray(timeline.auditEvents), 'legacy auditEvents present');
});

test('DB-backed 10-cycle timeline reads all cycles from DB', async (t) => {
    const ctx = await resolveContext();
    if (!ctx) {
        t.skip('active tenant with member/supplier/location/item not available');
        return;
    }

    let grn = await freshGrn(ctx);
    grn = await submit(ctx, grn);

    for (let cycle = 1; cycle <= 9; cycle++) {
        await approveCostAndFinance(ctx, grn.id);
        grn = await sendBack(ctx, grn.id);
        grn = await submit(ctx, grn);
    }

    const historyCount = await prisma.approvalRequest.count({
        where: { grnImportId: grn.id, requestType: 'GRN_IMPORT' },
    });
    assert.equal(historyCount, 10, '10 approval requests persisted (incl active)');

    const graph = await loadGrnGraph(grn.id, ctx.tenantId);
    const audits = await prisma.auditLog.findMany({
        where: { tenantId: ctx.tenantId, entityType: 'GRN', entityId: grn.id },
        orderBy: { changedAt: 'asc' },
        include: { changedByUser: { select: { firstName: true, lastName: true } } },
    });

    const raw = buildGrnTimelineRawEntries(graph, audits);
    const entries = buildTimelineEntries([raw]);

    assert.equal(entries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length, 9);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'RESUBMIT').length, 9);
    for (let c = 1; c <= 10; c++) {
        assert.ok(entries.some((e) => e.cycleNumber === c), `cycle ${c} present in timelineEntries`);
    }
});

test('concurrent resubmit: only one cycle number allocated', async (t) => {
    const ctx = await resolveContext();
    if (!ctx) {
        t.skip('active tenant with member/supplier/location/item not available');
        return;
    }

    let grn = await freshGrn(ctx);
    grn = await submit(ctx, grn);
    await approveCostOnly(ctx, grn.id);
    grn = await sendBack(ctx, grn.id);

    const version = grn.concurrencyVersion;
    const beforeCount = await prisma.approvalRequest.count({
        where: { grnImportId: grn.id, requestType: 'GRN_IMPORT' },
    });

    const results = await Promise.allSettled([
        grnService.submitForApproval(grn.id, ctx.tenantId, ctx.userId, version),
        grnService.submitForApproval(grn.id, ctx.tenantId, ctx.userId, version),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.ok(fulfilled.length >= 1, 'at least one submit succeeds');
    assert.ok(rejected.length >= 1, 'concurrent duplicate submit rejected');

    const afterCount = await prisma.approvalRequest.count({
        where: { grnImportId: grn.id, requestType: 'GRN_IMPORT' },
    });
    assert.equal(afterCount - beforeCount, 1, 'exactly one new approval request created');

    const cycles = await prisma.approvalRequest.findMany({
        where: { grnImportId: grn.id, requestType: 'GRN_IMPORT' },
        select: { cycleNumber: true },
    });
    const nums = cycles.map((c) => c.cycleNumber);
    assert.equal(new Set(nums).size, nums.length, 'no duplicate cycleNumber for GRN');
});

test.after(async () => {
    await prisma.$disconnect();
});
