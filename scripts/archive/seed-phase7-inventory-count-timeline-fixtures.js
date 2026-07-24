#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { getDocumentTimeline } = require('../src/platform/documentTimeline.service');
const {
    FIXTURE_TAG,
    resolvePhase7Actors,
    resolveCountContext,
    createActiveApproval,
    createPosted,
    createRejected,
    createRecountRound2,
    verifyPostingReconciliation,
    findExistingFixture,
} = require('./lib/phase7-inventory-count-fixture.helpers');

const prisma = new PrismaClient();
const REPORT = path.join(
    __dirname,
    '../governance-evidence-archive/timeline-remediation/backfill-reports/PHASE7_TIMELINE_FIXTURES.json',
);

const EXPECTED = Object.freeze({
    active_approval: 'PENDING_APPROVAL',
    posted: 'POSTED',
    rejected: 'REJECTED',
    recount_round2: 'POSTED',
});

async function snapshot(scenario, sessionId, tenantId, sessionNo, status, extra = {}) {
    const timeline = await getDocumentTimeline('INVENTORY_COUNT', sessionId, tenantId);
    return {
        scenario,
        moduleKey: 'INVENTORY_COUNT',
        documentId: sessionId,
        sessionNo,
        status,
        timelineEntryCount: timeline.timelineEntries.length,
        timelineEntries: timeline.timelineEntries,
        workflowSlotsCount: timeline.workflowSlots?.length ?? 0,
        auditEventsCount: timeline.auditEvents?.length ?? 0,
        ...extra,
    };
}

async function seedScenario(tenantId, actors, ctx, def) {
    let doc = await findExistingFixture(prisma, tenantId, def.scenario);
    if (doc && doc.status === EXPECTED[def.scenario]) {
        let reuse = true;
        if (def.scenario === 'posted' || def.scenario === 'recount_round2') {
            try {
                await verifyPostingReconciliation(prisma, tenantId, doc.id);
            } catch {
                reuse = false;
            }
        }
        if (reuse) {
            console.log(`Reuse ${def.scenario}:`, doc.sessionNo, doc.status);
        } else {
            doc = null;
        }
    }
    if (!doc || doc.status !== EXPECTED[def.scenario]) {
        console.log(`Seeding ${def.scenario}...`);
        doc = await def.seed();
        if (doc.status !== EXPECTED[def.scenario]) {
            throw new Error(`${def.scenario}: expected ${EXPECTED[def.scenario]}, got ${doc.status}`);
        }
    }
    const extra = {};
    if (def.scenario === 'posted' || def.scenario === 'recount_round2') {
        extra.postingReconciliation = await verifyPostingReconciliation(prisma, tenantId, doc.id);
    }
    return snapshot(def.scenario, doc.id, tenantId, doc.sessionNo, doc.status, extra);
}

async function main() {
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'grand-horizon', isActive: true } });
    if (!tenant) throw new Error('grand-horizon tenant not found');

    const actors = await resolvePhase7Actors(prisma, tenant.id);
    if (!actors) throw new Error('Missing Phase 7 actors');

    const ctx = await resolveCountContext(prisma, tenant.id);
    if (!ctx) throw new Error('Missing count context (department + location with stock)');

    const scenarios = [
        {
            scenario: 'active_approval',
            seed: () => createActiveApproval(prisma, tenant.id, actors, ctx),
        },
        {
            scenario: 'posted',
            seed: () => createPosted(prisma, tenant.id, actors, ctx),
        },
        {
            scenario: 'rejected',
            seed: () => createRejected(prisma, tenant.id, actors, ctx),
        },
        {
            scenario: 'recount_round2',
            seed: () => createRecountRound2(prisma, tenant.id, actors, ctx),
        },
    ];

    const fixtures = [];
    for (const def of scenarios) {
        fixtures.push(await seedScenario(tenant.id, actors, ctx, def));
    }

    const report = {
        at: new Date().toISOString(),
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        fixtureTag: FIXTURE_TAG,
        fixtures,
    };

    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log('Phase 7 fixtures written:', REPORT);
    console.log(
        JSON.stringify(
            fixtures.map((f) => ({
                scenario: f.scenario,
                documentId: f.documentId,
                sessionNo: f.sessionNo,
                status: f.status,
                timelineEntryCount: f.timelineEntryCount,
                postingReconciliation: f.postingReconciliation
                    ? { ledgerCount: f.postingReconciliation.ledgerCount, mismatches: f.postingReconciliation.mismatches.length }
                    : undefined,
            })),
            null,
            2,
        ),
    );

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
