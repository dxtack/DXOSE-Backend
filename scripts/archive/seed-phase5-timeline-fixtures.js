#!/usr/bin/env node
'use strict';

/**
 * Phase 5 — Seed Transfer/Breakage/Lost timeline fixtures + write report JSON.
 * Run: node scripts/seed-phase5-timeline-fixtures.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { getDocumentTimeline } = require('../src/platform/documentTimeline.service');
const { findActorWithRole } = require('./lib/grn-timeline-fixture.helpers');
const {
    FIXTURE_TAG,
    resolvePhase5Actors,
    findDistinctStockLines,
    createBreakageHappyPath,
    createBreakageReject,
    createLostHappyPath,
    createLostReject,
} = require('./lib/phase5-timeline-fixture.helpers');

const prisma = new PrismaClient();
const REPORT = path.join(
    __dirname,
    '../governance-evidence-archive/timeline-remediation/backfill-reports/PHASE5_TIMELINE_FIXTURES.json',
);

async function resolveBaseContext() {
    const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!tenant) return null;
    const member = await prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        include: { user: true, role: true },
    });
    if (!member?.user) return null;
    const deptUser = (await findActorWithRole(prisma, tenant.id, 'DEPT_MANAGER')) || {
        ...member.user,
        role: 'DEPT_MANAGER',
        permissions: ['TRANSFER_MANAGE'],
    };
    const financeUser = await findActorWithRole(prisma, tenant.id, 'FINANCE_MANAGER');
    const costUser = await findActorWithRole(prisma, tenant.id, 'COST_CONTROL');
    const gmUser = await findActorWithRole(prisma, tenant.id, 'GENERAL_MANAGER');
    const location = await prisma.location.findFirst({ where: { tenantId: tenant.id } });
    const item = await prisma.item.findFirst({
        where: { tenantId: tenant.id, itemUnits: { some: {} } },
        include: { itemUnits: { include: { unit: true } } },
    });
    if (!location || !item?.itemUnits?.[0]) return null;
    return {
        tenantId: tenant.id,
        userId: member.user.id,
        user: { ...member.user, role: member.role?.code || 'ORG_MANAGER', permissions: ['TRANSFER_MANAGE', 'GRN_MANAGE'] },
        deptUser,
        financeUser,
        costUser,
        gmUser,
        location,
        item,
    };
}

async function snapshot(moduleKey, documentId, tenantId, scenario) {
    const timeline = await getDocumentTimeline(moduleKey, documentId, tenantId);
    return {
        scenario,
        moduleKey,
        documentId,
        timelineEntryCount: timeline.timelineEntries.length,
        timelineEntries: timeline.timelineEntries,
        workflowSlotsCount: timeline.workflowSlots?.length ?? 0,
        auditEventsCount: timeline.auditEvents?.length ?? 0,
    };
}

async function findExistingTransferFixtures(ctx) {
    const out = [];
    const transferStatuses = ['PENDING_DEPT', 'PENDING_FINANCE', 'POSTED', 'REJECTED'];
    for (const status of transferStatuses) {
        const transfer = await prisma.storeTransfer.findFirst({
            where: { tenantId: ctx.tenantId, status, approvalRequest: { isNot: null } },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, status: true, transferNo: true },
        });
        if (transfer) {
            out.push(await snapshot('TRANSFER', transfer.id, ctx.tenantId, `transfer_${transfer.status.toLowerCase()}`));
        }
    }
    return out;
}

async function findOrSeedMovementFixtures(ctx) {
    const out = [];
    const actors = await resolvePhase5Actors(prisma, ctx.tenantId);
    if (!actors) {
        console.warn('SKIP movement seed: missing actors');
        return out;
    }

    const stockLines = await findDistinctStockLines(prisma, ctx.tenantId, 4);
    if (stockLines.length < 4) {
        console.warn('SKIP movement seed: insufficient stock lines');
        return out;
    }

    const scenarios = [
        {
            key: 'BREAKAGE',
            scenario: 'breakage_happy',
            find: () =>
                prisma.movementDocument.findFirst({
                    where: {
                        tenantId: ctx.tenantId,
                        movementType: 'BREAKAGE',
                        notes: FIXTURE_TAG,
                        status: 'FINANCE_APPROVED',
                        approvalRequests: { isNot: null },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
            seed: () => createBreakageHappyPath(prisma, ctx.tenantId, actors, stockLines[0]),
        },
        {
            key: 'BREAKAGE',
            scenario: 'breakage_rejected',
            find: () =>
                prisma.movementDocument.findFirst({
                    where: {
                        tenantId: ctx.tenantId,
                        movementType: 'BREAKAGE',
                        notes: FIXTURE_TAG,
                        status: 'REJECTED',
                        approvalRequests: { isNot: null },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
            seed: () => createBreakageReject(prisma, ctx.tenantId, actors, stockLines[1]),
        },
        {
            key: 'LOST',
            scenario: 'lost_happy',
            find: () =>
                prisma.movementDocument.findFirst({
                    where: {
                        tenantId: ctx.tenantId,
                        movementType: 'LOST',
                        notes: FIXTURE_TAG,
                        status: 'FINANCE_APPROVED',
                        approvalRequests: { isNot: null },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
            seed: () => createLostHappyPath(prisma, ctx.tenantId, actors, stockLines[2]),
        },
        {
            key: 'LOST',
            scenario: 'lost_rejected',
            find: () =>
                prisma.movementDocument.findFirst({
                    where: {
                        tenantId: ctx.tenantId,
                        movementType: 'LOST',
                        notes: FIXTURE_TAG,
                        status: 'REJECTED',
                        approvalRequests: { isNot: null },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
            seed: () => createLostReject(prisma, ctx.tenantId, actors, stockLines[3]),
        },
    ];

    for (const s of scenarios) {
        let doc = await s.find();
        if (!doc) {
            console.log(`Seeding ${s.scenario}...`);
            doc = await s.seed();
        }
        out.push(await snapshot(s.key, doc.id, ctx.tenantId, s.scenario));
    }
    return out;
}

async function main() {
    const ctx = await resolveBaseContext();
    if (!ctx) {
        console.error('SKIP: missing tenant context');
        process.exit(1);
    }

    const fixtures = [
        ...(await findExistingTransferFixtures(ctx)),
        ...(await findOrSeedMovementFixtures(ctx)),
    ];
    const report = {
        at: new Date().toISOString(),
        tenantId: ctx.tenantId,
        fixtures,
    };

    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log('Phase 5 fixtures written:', REPORT);
    console.log(JSON.stringify(fixtures.map((f) => ({
        scenario: f.scenario,
        moduleKey: f.moduleKey,
        documentId: f.documentId,
        timelineEntryCount: f.timelineEntryCount,
    })), null, 2));

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
