'use strict';

/**
 * Phase 6 — Get Pass timeline DB integration (Grand Horizon seeded fixtures).
 * Prerequisite: node scripts/seed-phase6-get-pass-timeline-fixtures.js
 * Run: node --test scripts/phase6-timeline-db-integration.test.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { getDocumentTimeline } = require('../src/platform/documentTimeline.service');
const getPassService = require('../src/services/getPass.service');
const {
    resolvePhase6Actors,
    assertApproveAfterRejectBlocked,
} = require('./lib/phase6-get-pass-fixture.helpers');

const prisma = new PrismaClient();
const FIXTURE_REPORT = path.join(
    __dirname,
    '../governance-evidence-archive/timeline-remediation/backfill-reports/PHASE6_TIMELINE_FIXTURES.json',
);

function loadFixtures() {
    if (!fs.existsSync(FIXTURE_REPORT)) {
        throw new Error(`Missing fixture report: ${FIXTURE_REPORT}. Run seed-phase6-get-pass-timeline-fixtures.js first.`);
    }
    const report = JSON.parse(fs.readFileSync(FIXTURE_REPORT, 'utf8'));
    const byScenario = Object.fromEntries(report.fixtures.map((f) => [f.scenario, f]));
    return { tenantId: report.tenantId, byScenario, report };
}

function entrySummary(entries) {
    return entries.map((e) => ({
        globalOrder: e.globalOrder,
        entryType: e.entryType,
        stageKey: e.stageKey,
        displayTitleKey: e.displayTitleKey,
        status: e.status,
        lifecycleEventType: e.lifecycleEventType ?? null,
        actorId: e.actor?.id ?? null,
        actedAt: e.actedAt,
        reason: e.reason ?? null,
        note: e.note ?? null,
    }));
}

test('Phase 6 fixtures report exists with all 5 scenarios', () => {
    const { byScenario } = loadFixtures();
    for (const key of ['active_workflow', 'pending_security', 'security_out', 'returned', 'rejected']) {
        assert.ok(byScenario[key]?.documentId, `missing fixture: ${key}`);
    }
});

test('Active workflow: completed/current/future steps; no OUT/Return', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.active_workflow;
    const timeline = await getDocumentTimeline('GET_PASS', fx.documentId, tenantId);
    const entries = timeline.timelineEntries;
    assert.ok(entries.length >= 4);
    assert.ok(entries.some((e) => e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'DEPT'));
    assert.ok(entries.some((e) => e.entryType === 'APPROVAL_STEP_CURRENT' && e.stageKey === 'COST_CONTROL'));
    assert.ok(entries.some((e) => e.entryType === 'APPROVAL_STEP_FUTURE'));
    assert.equal(entries.some((e) => e.stageKey === 'SECURITY_OUT'), false);
    assert.equal(entries.some((e) => e.stageKey === 'RETURN_PROCESSED'), false);
    assert.equal(
        entries.find((e) => e.entryType === 'APPROVAL_STEP_FUTURE' && e.displayTitleKey.endsWith('_COMPLETED')),
        undefined,
    );
});

test('Pending security: all prior steps completed; SECURITY current; no OUT', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.pending_security;
    const timeline = await getDocumentTimeline('GET_PASS', fx.documentId, tenantId);
    const entries = timeline.timelineEntries;
    assert.ok(entries.some((e) => e.stageKey === 'GENERAL_MANAGER' && e.entryType === 'APPROVAL_STEP_COMPLETED'));
    const secCurrent = entries.find((e) => e.stageKey === 'SECURITY' && e.entryType === 'APPROVAL_STEP_CURRENT');
    assert.ok(secCurrent);
    assert.equal(secCurrent.status, 'IN_PROGRESS');
    assert.equal(entries.some((e) => e.stageKey === 'SECURITY_OUT'), false);
});

test('Security OUT: milestone with actor/datetime; not approval-only duplicate', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.security_out;
    const gp = await prisma.getPass.findFirst({
        where: { id: fx.documentId },
        include: { checkoutUser: true, securityApprover: true },
    });
    const timeline = await getDocumentTimeline('GET_PASS', fx.documentId, tenantId);
    const entries = timeline.timelineEntries;
    const out = entries.find((e) => e.stageKey === 'SECURITY_OUT');
    assert.ok(out);
    assert.equal(out.entryType, 'MILESTONE_COMPLETED');
    assert.equal(out.displayTitleKey, 'TIMELINE.STAGE.SECURITY_OUT_COMPLETED');
    assert.equal(out.actedAt, gp.checkedOutAt.toISOString());
    assert.equal(out.actor?.id, gp.checkedOutBy);
    const securitySteps = entries.filter((e) => e.stageKey === 'SECURITY' && e.entryType.startsWith('APPROVAL_STEP'));
    assert.equal(securitySteps.length, 1);
    assert.equal(securitySteps[0].entryType, 'APPROVAL_STEP_COMPLETED');
    assert.equal(entries.filter((e) => e.stageKey === 'SECURITY_OUT').length, 1);
});

test('Returned: OUT before RETURN_PROCESSED; return is milestone not approval', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.returned;
    const timeline = await getDocumentTimeline('GET_PASS', fx.documentId, tenantId);
    const entries = timeline.timelineEntries;
    const out = entries.find((e) => e.stageKey === 'SECURITY_OUT');
    const ret = entries.find((e) => e.stageKey === 'RETURN_PROCESSED');
    assert.ok(out && ret);
    assert.equal(out.entryType, 'MILESTONE_COMPLETED');
    assert.equal(ret.entryType, 'MILESTONE_COMPLETED');
    assert.ok(new Date(out.actedAt).getTime() < new Date(ret.actedAt).getTime());
    assert.equal(entries.filter((e) => e.stageKey === 'RETURN_PROCESSED').length, 1);
});

test('Rejected: single REJECT lifecycle; correct stage; no pending after', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.rejected;
    const gp = await prisma.getPass.findFirst({ where: { id: fx.documentId } });
    const timeline = await getDocumentTimeline('GET_PASS', fx.documentId, tenantId);
    const entries = timeline.timelineEntries;
    const rejects = entries.filter((e) => e.lifecycleEventType === 'REJECT');
    assert.equal(rejects.length, 1);
    assert.equal(rejects[0].stageKey, 'COST_CONTROL');
    assert.ok(rejects[0].reason?.includes('PHASE6_TIMELINE_FIXTURE') || gp.rejectionReason);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 0);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_CURRENT').length, 0);
});

test('Reject guard: approve after REJECTED is blocked', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const actors = await resolvePhase6Actors(prisma, tenantId);
    assert.ok(actors);
    const blocked = await assertApproveAfterRejectBlocked(byScenario.rejected.documentId, tenantId, actors);
    assert.equal(blocked, true);
});

test('Legacy workflowSlots + auditEvents unchanged', async () => {
    const { tenantId, byScenario } = loadFixtures();
    const fx = byScenario.security_out;
    const timeline = await getDocumentTimeline('GET_PASS', fx.documentId, tenantId);
    assert.ok(Array.isArray(timeline.workflowSlots));
    assert.ok(timeline.workflowSlots.length >= 5);
    assert.ok(Array.isArray(timeline.auditEvents));
});

test('Entry ordering: globalOrder monotonic per fixture', async () => {
    const { tenantId, byScenario } = loadFixtures();
    for (const fx of Object.values(byScenario)) {
        const timeline = await getDocumentTimeline('GET_PASS', fx.documentId, tenantId);
        const orders = timeline.timelineEntries.map((e) => e.globalOrder);
        for (let i = 1; i < orders.length; i++) {
            assert.ok(orders[i] >= orders[i - 1], `${fx.scenario} globalOrder not monotonic`);
        }
    }
});

test.after(async () => {
    await prisma.$disconnect();
});
