'use strict';

/**
 * Phase 5 DB integration — approval timeline builder against live documents when available.
 * Run: node --test scripts/phase5-timeline-db-integration.test.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { getDocumentTimeline } = require('../src/platform/documentTimeline.service');
const { FIXTURE_TAG } = require('./lib/phase5-timeline-fixture.helpers');

const prisma = new PrismaClient();

async function tenantId() {
    const t = await prisma.tenant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    return t?.id ?? null;
}

test('Transfer timeline: entries populated, CANCELLED not PENDING', async () => {
    const tid = await tenantId();
    assert.ok(tid, 'tenant required — run seed-phase5-timeline-fixtures.js');
    const trf = await prisma.storeTransfer.findFirst({
        where: { tenantId: tid, approvalRequest: { isNot: null } },
        orderBy: { updatedAt: 'desc' },
    });
    assert.ok(trf, 'transfer with approval required');
    const timeline = await getDocumentTimeline('TRANSFER', trf.id, tid);
    assert.ok(Array.isArray(timeline.timelineEntries));
    assert.ok(Array.isArray(timeline.workflowSlots));
    if (trf.status === 'REJECTED') {
        assert.equal(timeline.timelineEntries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 0);
        assert.ok(timeline.timelineEntries.some((e) => e.lifecycleEventType === 'REJECT'));
    }
    if (trf.status === 'POSTED') {
        assert.ok(
            timeline.timelineEntries.some((e) => e.entryType === 'POSTING'),
            'POSTED transfer must include posting entry (ledger recovery when postedAt null)',
        );
    }
    if (timeline.timelineEntries.length) {
        assert.ok(timeline.timelineEntries.every((e) => e.globalOrder > 0));
    }
});

test('Breakage timeline: fixture happy + reject invariants', async () => {
    const tid = await tenantId();
    assert.ok(tid, 'tenant required');
    const happy = await prisma.movementDocument.findFirst({
        where: {
            tenantId: tid,
            movementType: 'BREAKAGE',
            notes: FIXTURE_TAG,
            status: 'FINANCE_APPROVED',
            approvalRequests: { isNot: null },
        },
        orderBy: { createdAt: 'desc' },
    });
    assert.ok(happy, 'breakage happy fixture required — run seed-phase5-timeline-fixtures.js');
    const happyTimeline = await getDocumentTimeline('BREAKAGE', happy.id, tid);
    assert.ok(happyTimeline.timelineEntries.length >= 3);
    const completed = happyTimeline.timelineEntries.filter((e) => e.entryType === 'APPROVAL_STEP_COMPLETED');
    assert.ok(completed.length >= 2);
    for (const e of completed) {
        assert.match(e.displayTitleKey, /_COMPLETED$/);
    }

    const rejected = await prisma.movementDocument.findFirst({
        where: {
            tenantId: tid,
            movementType: 'BREAKAGE',
            notes: FIXTURE_TAG,
            status: 'REJECTED',
            approvalRequests: { isNot: null },
        },
        orderBy: { createdAt: 'desc' },
    });
    assert.ok(rejected, 'breakage reject fixture required');
    const rejectTimeline = await getDocumentTimeline('BREAKAGE', rejected.id, tid);
    assert.equal(rejectTimeline.timelineEntries.filter((e) => e.lifecycleEventType === 'REJECT').length, 1);
    assert.equal(rejectTimeline.timelineEntries.filter((e) => e.status === 'PENDING').length, 0);
    assert.equal(rejectTimeline.timelineEntries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 0);
    const rejectEntry = rejectTimeline.timelineEntries.find((e) => e.lifecycleEventType === 'REJECT');
    assert.ok(rejectEntry?.reason || rejectEntry?.note);
    assert.ok(rejectEntry?.actor?.name);
    assert.ok(rejectEntry?.actedAt);
});

test('Lost timeline: fixture happy + reject invariants', async () => {
    const tid = await tenantId();
    assert.ok(tid, 'tenant required');
    const happy = await prisma.movementDocument.findFirst({
        where: {
            tenantId: tid,
            movementType: 'LOST',
            notes: FIXTURE_TAG,
            status: 'FINANCE_APPROVED',
            approvalRequests: { isNot: null },
        },
        orderBy: { createdAt: 'desc' },
    });
    assert.ok(happy, 'lost happy fixture required — run seed-phase5-timeline-fixtures.js');
    const happyTimeline = await getDocumentTimeline('LOST', happy.id, tid);
    assert.ok(happyTimeline.timelineEntries.length >= 3);
    assert.ok(Array.isArray(happyTimeline.workflowSlots));
    assert.ok(Array.isArray(happyTimeline.auditEvents));

    const rejected = await prisma.movementDocument.findFirst({
        where: {
            tenantId: tid,
            movementType: 'LOST',
            notes: FIXTURE_TAG,
            status: 'REJECTED',
            approvalRequests: { isNot: null },
        },
        orderBy: { createdAt: 'desc' },
    });
    assert.ok(rejected, 'lost reject fixture required');
    const rejectTimeline = await getDocumentTimeline('LOST', rejected.id, tid);
    assert.equal(rejectTimeline.timelineEntries.filter((e) => e.lifecycleEventType === 'REJECT').length, 1);
    assert.equal(rejectTimeline.timelineEntries.filter((e) => e.status === 'PENDING').length, 0);
});
