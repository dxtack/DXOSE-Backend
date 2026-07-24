'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateTimelineEntry, validateTimelineEntries } = require('./timelineEntry.validation');
const { assignGlobalOrder, resolveActiveCycleNumber } = require('./timelineEntry.sort');
const { buildTimelineEntries, dedupeTimelineEntries, timelineEntryDedupeKey } = require('./timelineEntry.merge');
const { enrichTimelineEntriesWithDuration } = require('./timelineEntry.duration');
const { resolveDisplayTitleKey } = require('./timelineEntry.i18n-keys');
const { attachTimelineEntries } = require('./timelinePayload.util');

function iso(baseMs, offsetMin = 0) {
    return new Date(baseMs + offsetMin * 60_000).toISOString();
}

function completedStep(cycle, stepNumber, actedAt, stageKey = 'COST_CONTROL') {
    return {
        cycleNumber: cycle,
        entryType: 'APPROVAL_STEP_COMPLETED',
        stageKey,
        displayTitleKey: `TIMELINE.STAGE.${stageKey}_COMPLETED`,
        status: 'COMPLETED',
        actor: { name: `Actor C${cycle}S${stepNumber}` },
        actedAt,
        stepNumber,
    };
}

function financeCompleted(cycle, actedAt) {
    return completedStep(cycle, 2, actedAt, 'FINANCE');
}

function sendBack(cycle, actedAt, reason) {
    return {
        cycleNumber: cycle,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: 'TIMELINE.LIFECYCLE.SEND_BACK',
        status: 'COMPLETED',
        lifecycleEventType: 'SEND_BACK',
        actor: { name: 'Reviewer' },
        actedAt,
        reason,
        stepNumber: 0,
    };
}

function resubmit(cycle, actedAt) {
    return {
        cycleNumber: cycle,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: 'TIMELINE.LIFECYCLE.RESUBMIT',
        status: 'COMPLETED',
        lifecycleEventType: 'RESUBMIT',
        actor: { name: 'Creator' },
        actedAt,
        previousCycleNumber: cycle - 1,
        newCycleNumber: cycle,
        stepNumber: 0,
    };
}

function currentCost(cycle) {
    return {
        cycleNumber: cycle,
        entryType: 'APPROVAL_STEP_CURRENT',
        stageKey: 'COST_CONTROL',
        displayTitleKey: 'TIMELINE.STAGE.COST_CONTROL_APPROVAL',
        status: 'IN_PROGRESS',
        stepNumber: 1,
    };
}

function futureFinance(cycle) {
    return {
        cycleNumber: cycle,
        entryType: 'APPROVAL_STEP_FUTURE',
        stageKey: 'FINANCE',
        displayTitleKey: 'TIMELINE.STAGE.FINANCE_APPROVAL',
        status: 'PENDING',
        stepNumber: 2,
    };
}

function receivedValidated(actedAt) {
    return {
        cycleNumber: 1,
        entryType: 'MILESTONE_COMPLETED',
        stageKey: 'RECEIVED_VALIDATED',
        displayTitleKey: 'TIMELINE.STAGE.RECEIVED_VALIDATED_COMPLETED',
        status: 'COMPLETED',
        actor: { name: 'Importer' },
        actedAt,
        stepNumber: 0,
    };
}

/** Build N completed cycles + optional active cycle (4-cycle = 3 SB + cycle 4 active). */
function buildMultiCycleFixture(totalCycles, activeCycle) {
    const base = Date.parse('2026-06-01T10:00:00.000Z');
    const entries = [receivedValidated(iso(base, 0))];
    let t = 10;
    for (let c = 1; c <= totalCycles; c++) {
        const activeIncomplete = c === activeCycle && c === totalCycles;
        if (!activeIncomplete) {
            entries.push(completedStep(c, 1, iso(base, t)));
            t += 10;
            entries.push(financeCompleted(c, iso(base, t)));
            t += 10;
        }
        if (c < totalCycles) {
            entries.push(sendBack(c, iso(base, t), `Send back reason cycle ${c}`));
            t += 5;
            entries.push(resubmit(c + 1, iso(base, t)));
            t += 5;
        }
    }
    if (activeCycle === totalCycles) {
        entries.push(currentCost(activeCycle));
        entries.push(futureFinance(activeCycle));
    }
    return entries;
}

test('validateTimelineEntry rejects invalid rows', () => {
    const errors = validateTimelineEntry({ cycleNumber: 0, entryType: 'BAD' });
    assert.ok(errors.length >= 2);
});

test('resolveDisplayTitleKey uses action noun for current/future', () => {
    assert.equal(
        resolveDisplayTitleKey({
            stageKey: 'COST_CONTROL',
            entryType: 'APPROVAL_STEP_CURRENT',
            status: 'IN_PROGRESS',
        }),
        'TIMELINE.STAGE.COST_CONTROL_APPROVAL',
    );
    assert.equal(
        resolveDisplayTitleKey({
            stageKey: 'COST_CONTROL',
            entryType: 'APPROVAL_STEP_COMPLETED',
            status: 'COMPLETED',
        }),
        'TIMELINE.STAGE.COST_CONTROL_COMPLETED',
    );
});

test('dedupeTimelineEntries suppresses duplicates inside timelineEntries only', () => {
    const a = completedStep(1, 1, iso(0, 1));
    const b = { ...a };
    const out = dedupeTimelineEntries([a, b]);
    assert.equal(out.length, 1);
    assert.notEqual(timelineEntryDedupeKey(a), timelineEntryDedupeKey({ ...a, cycleNumber: 2 }));
});

test('assignGlobalOrder is deterministic across runs', () => {
    const raw = buildMultiCycleFixture(2, 2);
    const first = assignGlobalOrder(raw);
    const second = assignGlobalOrder([...raw].reverse());
    assert.deepEqual(
        first.map((e) => e.globalOrder),
        second.map((e) => e.globalOrder),
    );
    assert.deepEqual(
        first.map((e) => ({ type: e.entryType, cycle: e.cycleNumber, step: e.stepNumber })),
        second.map((e) => ({ type: e.entryType, cycle: e.cycleNumber, step: e.stepNumber })),
    );
});

test('lifecycle events precede current/future steps of active cycle', () => {
    const raw = buildMultiCycleFixture(4, 4);
    const ordered = assignGlobalOrder(raw);
    const sendBacks = ordered.filter((e) => e.lifecycleEventType === 'SEND_BACK');
    assert.equal(sendBacks.length, 3);
    const lastSendBackOrder = sendBacks[sendBacks.length - 1].globalOrder;
    const current = ordered.find((e) => e.entryType === 'APPROVAL_STEP_CURRENT');
    const future = ordered.find((e) => e.entryType === 'APPROVAL_STEP_FUTURE');
    assert.ok(current);
    assert.ok(future);
    assert.ok(lastSendBackOrder < current.globalOrder);
    assert.ok(current.globalOrder < future.globalOrder);
});

test('4-cycle functional fixture: 3 Send Back + cycle 4 active', () => {
    const raw = buildMultiCycleFixture(4, 4);
    const entries = buildTimelineEntries([raw]);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length, 3);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'RESUBMIT').length, 3);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'COST_CONTROL').length, 3);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'FINANCE').length, 3);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_CURRENT').length, 1);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 1);
    assert.equal(resolveActiveCycleNumber(entries), 4);
    for (let i = 1; i < entries.length; i++) {
        assert.ok(entries[i].globalOrder > entries[i - 1].globalOrder);
    }
});

test('10-cycle mandatory: no cap, all cycles preserved', () => {
    const raw = buildMultiCycleFixture(10, 10);
    const entries = buildTimelineEntries([raw]);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length, 9);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'RESUBMIT').length, 9);
    for (let c = 1; c <= 9; c++) {
        const cost = entries.filter(
            (e) =>
                e.cycleNumber === c &&
                e.entryType === 'APPROVAL_STEP_COMPLETED' &&
                e.stageKey === 'COST_CONTROL',
        );
        const fin = entries.filter(
            (e) =>
                e.cycleNumber === c &&
                e.entryType === 'APPROVAL_STEP_COMPLETED' &&
                e.stageKey === 'FINANCE',
        );
        assert.equal(cost.length, 1, `cycle ${c} cost`);
        assert.equal(fin.length, 1, `cycle ${c} finance`);
        assert.ok(cost[0].actor?.name);
        assert.ok(fin[0].actedAt);
    }
    const sendBacks = entries.filter((e) => e.lifecycleEventType === 'SEND_BACK');
    for (const sb of sendBacks) {
        assert.ok(sb.reason?.includes('Send back reason'));
        assert.ok(sb.actor?.name);
        assert.ok(sb.actedAt);
    }
    assert.equal(resolveActiveCycleNumber(entries), 10);
    const cycles = new Set(entries.map((e) => e.cycleNumber));
    for (let c = 1; c <= 10; c++) {
        assert.ok(cycles.has(c), `missing cycle ${c}`);
    }
});

test('enrichTimelineEntriesWithDuration adds durationMs between consecutive actedAt', () => {
    const entries = assignGlobalOrder([
        receivedValidated(iso(0, 0)),
        completedStep(1, 1, iso(0, 60)),
    ]);
    const enriched = enrichTimelineEntriesWithDuration(entries);
    assert.ok(enriched[1].durationMs >= 3_600_000);
});

test('attachTimelineEntries: legacy arrays structurally and semantically unchanged', () => {
    const legacy = {
        documentType: 'GRN',
        documentId: 'g1',
        workflowSlots: [
            { order: 1, stageTitle: 'RECEIVED & VALIDATED', status: 'IN_PROGRESS', actedAt: iso(0, 0) },
            { order: 2, stageTitle: 'COST CONTROL APPROVED', status: 'PENDING' },
        ],
        auditEvents: [{ id: 'a1', action: 'SEND_BACK', changedAt: iso(0, 120), note: 'fix invoice' }],
    };
    const beforeSlots = JSON.stringify(legacy.workflowSlots);
    const beforeAudits = JSON.stringify(legacy.auditEvents);
    const payload = attachTimelineEntries(legacy, []);
    assert.equal(JSON.stringify(payload.workflowSlots), beforeSlots);
    assert.equal(JSON.stringify(payload.auditEvents), beforeAudits);
    assert.deepEqual(payload.workflowSlots, legacy.workflowSlots);
    assert.deepEqual(payload.auditEvents, legacy.auditEvents);
    assert.ok(Array.isArray(payload.timelineEntries));
    assert.equal(payload.timelineEntries.length, 0);
    assert.equal(legacy.workflowSlots[0].status, 'IN_PROGRESS');
    assert.equal(legacy.auditEvents[0].action, 'SEND_BACK');
});

test('buildTimelineEntries validates before sort', () => {
    assert.throws(() => buildTimelineEntries([[{ cycleNumber: 1 }]]), /Invalid timeline entries/);
    const errors = validateTimelineEntries([{ cycleNumber: 1 }]);
    assert.ok(errors.length > 0);
});

test('pending POSTING sorts after future approval steps', () => {
    const entries = assignGlobalOrder([
        completedStep(1, 1, iso(1_700_000_000_000, 0), 'DEPT'),
        currentCost(1),
        futureFinance(1),
        {
            cycleNumber: 1,
            entryType: 'APPROVAL_STEP_FUTURE',
            stageKey: 'GENERAL_MANAGER',
            displayTitleKey: 'TIMELINE.STAGE.GENERAL_MANAGER_APPROVAL',
            status: 'PENDING',
            stepNumber: 4,
        },
        {
            cycleNumber: 1,
            entryType: 'POSTING',
            stageKey: 'POSTED',
            displayTitleKey: 'TIMELINE.STAGE.POSTED_APPROVAL',
            status: 'PENDING',
            stepNumber: 99,
        },
    ]);
    const types = entries.map((e) => `${e.entryType}:${e.stageKey}`);
    assert.deepEqual(types, [
        'APPROVAL_STEP_COMPLETED:DEPT',
        'APPROVAL_STEP_CURRENT:COST_CONTROL',
        'APPROVAL_STEP_FUTURE:FINANCE',
        'APPROVAL_STEP_FUTURE:GENERAL_MANAGER',
        'POSTING:POSTED',
    ]);
});
