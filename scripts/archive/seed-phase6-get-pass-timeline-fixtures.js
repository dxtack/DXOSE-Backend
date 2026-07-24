#!/usr/bin/env node
'use strict';

/**
 * Phase 6 — Seed Get Pass timeline fixtures via production services + write report JSON.
 * Run: node scripts/seed-phase6-get-pass-timeline-fixtures.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { getDocumentTimeline } = require('../src/platform/documentTimeline.service');
const {
    FIXTURE_TAG,
    GM_FIXTURE_EMAIL,
    SECURITY_FIXTURE_EMAIL,
    findDistinctStockLines,
    resolvePhase6Actors,
    createActiveWorkflow,
    createPendingSecurity,
    createSecurityOut,
    createReturned,
    createRejected,
    assertApproveAfterRejectBlocked,
    findExistingFixture,
} = require('./lib/phase6-get-pass-fixture.helpers');

const prisma = new PrismaClient();
const REPORT = path.join(
    __dirname,
    '../governance-evidence-archive/timeline-remediation/backfill-reports/PHASE6_TIMELINE_FIXTURES.json',
);

const EXPECTED_STATUS = Object.freeze({
    active_workflow: 'PENDING_COST_CONTROL',
    pending_security: 'PENDING_SECURITY',
    security_out: 'OUT',
    returned: 'RETURNED',
    rejected: 'REJECTED',
});

async function snapshot(scenario, documentId, tenantId, passNo, status) {
    const timeline = await getDocumentTimeline('GET_PASS', documentId, tenantId);
    return {
        scenario,
        moduleKey: 'GET_PASS',
        documentId,
        passNo,
        status,
        timelineEntryCount: timeline.timelineEntries.length,
        timelineEntries: timeline.timelineEntries,
        workflowSlotsCount: timeline.workflowSlots?.length ?? 0,
        auditEventsCount: timeline.auditEvents?.length ?? 0,
    };
}

async function seedScenario(tenantId, def, stockLine) {
    let doc = await findExistingFixture(prisma, tenantId, def.scenario);
    if (doc && doc.status === EXPECTED_STATUS[def.scenario]) {
        console.log(`Reuse ${def.scenario}:`, doc.passNo, doc.status);
    } else {
        console.log(`Seeding ${def.scenario}...`);
        doc = await def.seed(stockLine);
        if (doc.status !== EXPECTED_STATUS[def.scenario]) {
            throw new Error(`${def.scenario}: expected ${EXPECTED_STATUS[def.scenario]}, got ${doc.status}`);
        }
    }
    return snapshot(def.scenario, doc.id, tenantId, doc.passNo, doc.status);
}

async function main() {
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'grand-horizon', isActive: true } });
    if (!tenant) {
        throw new Error('grand-horizon tenant not found');
    }

    const actors = await resolvePhase6Actors(prisma, tenant.id);
    if (!actors) {
        throw new Error('Missing Phase 6 actors for grand-horizon');
    }

    const stockLines = await findDistinctStockLines(prisma, tenant.id, 5);
    if (stockLines.length === 0) {
        throw new Error('No stock lines available for Phase 6 fixtures');
    }
    while (stockLines.length < 5) {
        stockLines.push({ ...stockLines[0] });
    }

    const scenarios = [
        {
            scenario: 'active_workflow',
            seed: (stockLine) => createActiveWorkflow(prisma, tenant.id, actors, stockLine),
        },
        {
            scenario: 'pending_security',
            seed: (stockLine) => createPendingSecurity(prisma, tenant.id, actors, stockLine),
        },
        {
            scenario: 'security_out',
            seed: (stockLine) => createSecurityOut(prisma, tenant.id, actors, stockLine),
        },
        {
            scenario: 'returned',
            seed: (stockLine) => createReturned(prisma, tenant.id, actors, stockLine),
        },
        {
            scenario: 'rejected',
            seed: (stockLine) => createRejected(prisma, tenant.id, actors, stockLine),
        },
    ];

    const fixtures = [];
    for (let i = 0; i < scenarios.length; i++) {
        fixtures.push(await seedScenario(tenant.id, scenarios[i], stockLines[i]));
    }

    const rejectedFixture = fixtures.find((f) => f.scenario === 'rejected');
    const rejectBlocked = rejectedFixture
        ? await assertApproveAfterRejectBlocked(rejectedFixture.documentId, tenant.id, actors)
        : false;

    const report = {
        at: new Date().toISOString(),
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        fixtureTag: FIXTURE_TAG,
        actors: {
            creator: 'store@grandhorizon.com',
            dept: 'hk.manager@grandhorizon.com',
            cost: 'cost@grandhorizon.com',
            finance: 'finance@grandhorizon.com',
            gm: GM_FIXTURE_EMAIL,
            security: SECURITY_FIXTURE_EMAIL,
        },
        rejectApproveBlocked: rejectBlocked,
        fixtures,
    };

    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log('Phase 6 fixtures written:', REPORT);
    console.log(
        JSON.stringify(
            fixtures.map((f) => ({
                scenario: f.scenario,
                documentId: f.documentId,
                passNo: f.passNo,
                status: f.status,
                timelineEntryCount: f.timelineEntryCount,
            })),
            null,
            2,
        ),
    );
    if (!rejectBlocked) {
        throw new Error('Approve after REJECTED was not blocked');
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
