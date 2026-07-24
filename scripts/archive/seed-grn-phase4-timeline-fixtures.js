#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — Seed GRN fixtures for timeline verification (3-send-back + posted single-cycle lookup).
 * Writes: governance-evidence-archive/timeline-remediation/backfill-reports/PHASE4_GRN_FIXTURES.json
 *
 * Run: node scripts/seed-grn-phase4-timeline-fixtures.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const grnService = require('../src/services/grn.service');
const { getGrnTimeline } = require('../src/platform/documentTimeline.service');
const {
    findActorWithRole,
    approveCostAndFinanceForSendBackCycle,
} = require('./lib/grn-timeline-fixture.helpers');

const prisma = new PrismaClient();
const REPORT = path.join(
    __dirname,
    '../governance-evidence-archive/timeline-remediation/backfill-reports/PHASE4_GRN_FIXTURES.json',
);

async function resolveContext() {
    const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
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
    if (!costUser || !financeUser) {
        console.error('SKIP: COST_CONTROL and FINANCE_MANAGER tenant members required');
        return null;
    }

    return {
        tenantId: tenant.id,
        user: { ...member.user, role: member?.role?.code || 'ORG_MANAGER', permissions: ['GRN_MANAGE'] },
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

async function freshGrn(ctx, tag) {
    return grnService.createGrn({
        supplierId: ctx.supplierId,
        locationId: ctx.locationId,
        grnNumber: `P4-${tag}`,
        supplierInvoiceNumber: `INV-P4-${tag}`,
        receivingDate: new Date(),
        invoiceUrl: '/uploads/test-invoice.pdf',
        lines: [ctx.line],
        tenantId: ctx.tenantId,
        userId: ctx.userId,
    });
}

async function submit(ctx, grn) {
    return grnService.submitForApproval(grn.id, ctx.tenantId, ctx.userId, grn.concurrencyVersion);
}

async function approveCostAndFinance(ctx, grnId) {
    await approveCostAndFinanceForSendBackCycle(prisma, ctx, grnId, ctx.costUser, ctx.financeUser);
}

async function sendBack(ctx, grnId) {
    let g = await grnService.getGrn(grnId, ctx.tenantId);
    await grnService.sendBackGrn(grnId, ctx.tenantId, ctx.user, 'Send back for correction', g.concurrencyVersion);
    await grnService.validateGrn(grnId, ctx.tenantId);
    return grnService.getGrn(grnId, ctx.tenantId);
}

async function buildThreeSendBackFixture(ctx) {
    let grn = await freshGrn(ctx, `3SB-${Date.now()}`);
    grn = await submit(ctx, grn);
    for (let cycle = 1; cycle <= 3; cycle++) {
        await approveCostAndFinance(ctx, grn.id);
        grn = await sendBack(ctx, grn.id);
        grn = await submit(ctx, grn);
    }
    const timeline = await getGrnTimeline(grn.id, ctx.tenantId);
    const financeCompleted = timeline.timelineEntries.filter(
        (e) => e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'FINANCE',
    ).length;
    return {
        scenario: 'three_send_back_cycle_4_active',
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        status: grn.status,
        timelineEntryCount: timeline.timelineEntries.length,
        expectedEntryCount: 15,
        financeCompletedCount: financeCompleted,
        sendBackCount: timeline.timelineEntries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length,
        resubmitCount: timeline.timelineEntries.filter((e) => e.lifecycleEventType === 'RESUBMIT').length,
        activeCycle: grn.approvalRequest?.cycleNumber ?? null,
        timelineEntries: timeline.timelineEntries,
    };
}

async function findPostedSingleCycle(ctx) {
    const grn = await prisma.grnImport.findFirst({
        where: { tenantId: ctx.tenantId, status: 'POSTED' },
        orderBy: { postedAt: 'desc' },
        select: { id: true, grnNumber: true, status: true },
    });
    if (!grn) return null;
    const timeline = await getGrnTimeline(grn.id, ctx.tenantId);
    return {
        scenario: 'posted_single_cycle',
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        status: grn.status,
        timelineEntryCount: timeline.timelineEntries.length,
        timelineEntries: timeline.timelineEntries,
    };
}

async function main() {
    const ctx = await resolveContext();
    if (!ctx) {
        console.error('SKIP: missing tenant/supplier/location/item context');
        process.exit(1);
    }

    const report = {
        at: new Date().toISOString(),
        tenantId: ctx.tenantId,
        fixtures: [],
    };

    report.fixtures.push(await buildThreeSendBackFixture(ctx));
    const posted = await findPostedSingleCycle(ctx);
    if (posted) report.fixtures.push(posted);

    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log('Phase 4 fixtures written:', REPORT);
    console.log(JSON.stringify(report.fixtures.map((f) => ({
        scenario: f.scenario,
        grnId: f.grnId,
        grnNumber: f.grnNumber,
        timelineEntryCount: f.timelineEntryCount,
    })), null, 2));

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
