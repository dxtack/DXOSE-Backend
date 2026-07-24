'use strict';

/**
 * Phase 7 — Inventory Count timeline DB integration.
 * Prerequisite: node scripts/seed-phase7-inventory-count-timeline-fixtures.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { getDocumentTimeline } = require('../src/platform/documentTimeline.service');
const inventoryCount = require('../src/services/inventoryCount.service');

const prisma = new PrismaClient();
const FIXTURE_REPORT = path.join(
    __dirname,
    '../governance-evidence-archive/timeline-remediation/backfill-reports/PHASE7_TIMELINE_FIXTURES.json',
);

function loadFixtures() {
    if (!fs.existsSync(FIXTURE_REPORT)) {
        throw new Error(`Missing ${FIXTURE_REPORT}`);
    }
    const report = JSON.parse(fs.readFileSync(FIXTURE_REPORT, 'utf8'));
    const byScenario = Object.fromEntries(report.fixtures.map((f) => [f.scenario, f]));
    return { tenantId: report.tenantId, byScenario, report };
}

test('Phase 7 fixtures report has all required scenarios', () => {
    const { byScenario } = loadFixtures();
    for (const key of ['active_approval', 'posted', 'rejected', 'recount_round2']) {
        assert.ok(byScenario[key]?.documentId, `missing ${key}`);
    }
});

test('Active approval: finance current, no posting entry', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.active_approval;
    const timeline = await getDocumentTimeline('INVENTORY_COUNT', fx.documentId, tenantId);
    assert.ok(timeline.timelineEntries.length >= 3);
    assert.ok(timeline.timelineEntries.some((e) => e.stageKey === 'FINANCE' && e.entryType === 'APPROVAL_STEP_CURRENT'));
    assert.equal(timeline.timelineEntries.some((e) => e.entryType === 'POSTING'), false);
    assert.ok(timeline.auditEvents.length > 0);
});

test('Posted: POSTING entry and ledger reconciliation', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.posted;
    const timeline = await getDocumentTimeline('INVENTORY_COUNT', fx.documentId, tenantId);
    const posting = timeline.timelineEntries.find((e) => e.entryType === 'POSTING');
    assert.ok(posting);
    assert.equal(posting.stageKey, 'POSTED');
    assert.equal(fx.postingReconciliation?.mismatches?.length ?? 0, 0);
    assert.ok((fx.postingReconciliation?.ledgerCount ?? 0) > 0);
});

test('Rejected: single REJECT lifecycle, no pending after', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.rejected;
    const timeline = await getDocumentTimeline('INVENTORY_COUNT', fx.documentId, tenantId);
    const rejects = timeline.timelineEntries.filter((e) => e.lifecycleEventType === 'REJECT');
    assert.equal(rejects.length, 1);
    assert.equal(rejects[0].stageKey, 'FINANCE');
    assert.equal(timeline.timelineEntries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 0);
});

test('Recount round 2: two count submits and recount lifecycle', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.recount_round2;
    const timeline = await getDocumentTimeline('INVENTORY_COUNT', fx.documentId, tenantId);
    assert.equal(timeline.timelineEntries.filter((e) => e.stageKey === 'COUNT_SUBMITTED').length, 2);
    assert.ok(timeline.timelineEntries.some((e) => e.lifecycleEventType === 'RECOUNT'));
    const posting = timeline.timelineEntries.find((e) => e.entryType === 'POSTING');
    assert.ok(posting);
});

test('Reject guard: approve after REJECTED fails', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const { resolvePhase7Actors } = require('./lib/phase7-inventory-count-fixture.helpers');
    const actors = await resolvePhase7Actors(prisma, tenantId);
    assert.ok(actors);
    let blocked = false;
    try {
        await inventoryCount.approve(tenantId, actors.financeUser.id, actors.financeUser, byScenario.rejected.documentId, {});
    } catch {
        blocked = true;
    }
    assert.equal(blocked, true);
});

test.after(async () => {
    await prisma.$disconnect();
});
