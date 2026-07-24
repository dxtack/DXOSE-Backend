'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGrnTimelineRawEntries } = require('./grnTimeline.builder');
const { buildTimelineEntries } = require('./timelineEntry.merge');
const { resolveActiveCycleNumber } = require('./timelineEntry.sort');

function iso(baseMs, offsetMin = 0) {
    return new Date(baseMs + offsetMin * 60_000).toISOString();
}

function user(name) {
    return { firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') || 'User' };
}

function approvedStep(stepNumber, actedAt, actorName, requestId, stepId) {
    return {
        id: stepId,
        stepNumber,
        status: 'APPROVED',
        actedAt,
        actedBy: `user-${stepNumber}`,
        actedByUser: user(actorName),
        comment: null,
        requestId,
    };
}

function pendingStep(stepNumber, requestId, stepId) {
    return {
        id: stepId,
        stepNumber,
        status: 'PENDING',
        actedAt: null,
        actedBy: null,
        actedByUser: null,
        requestId,
    };
}

function cancelledRequest(cycle, createdAt, resolvedAt, steps) {
    return {
        id: `ar-c${cycle}`,
        cycleNumber: cycle,
        status: 'CANCELLED',
        currentStep: 0,
        createdAt,
        resolvedAt,
        steps,
    };
}

function activeRequest(cycle, currentStep, steps) {
    return {
        id: `ar-active-c${cycle}`,
        cycleNumber: cycle,
        status: 'PENDING',
        currentStep,
        createdAt: iso(0, cycle * 100),
        resolvedAt: null,
        steps,
    };
}

function buildMultiCycleGrn(totalCycles, activeCycle) {
    const base = Date.parse('2026-06-01T10:00:00.000Z');
    const history = [];
    const audits = [];
    let t = 5;

    for (let c = 1; c < activeCycle; c++) {
        const createdAt = iso(base, t);
        t += 5;
        const costAt = iso(base, t);
        t += 10;
        const finAt = iso(base, t);
        t += 10;
        const sbAt = iso(base, t);
        t += 5;
        const rsAt = iso(base, t);
        t += 5;

        history.push(
            cancelledRequest(c, createdAt, sbAt, [
                approvedStep(1, costAt, `Cost C${c}`, `ar-c${c}`, `s${c}-1`),
                approvedStep(2, finAt, `Finance C${c}`, `ar-c${c}`, `s${c}-2`),
            ]),
        );
        audits.push({
            id: `sb-${c}`,
            action: 'SEND_BACK',
            changedAt: sbAt,
            note: `GRN_SEND_BACK | Send back reason cycle ${c}`,
            changedBy: 'reviewer',
            changedByUser: user('Reviewer One'),
            afterValue: null,
        });
        audits.push({
            id: `rs-${c}`,
            action: 'SUBMIT',
            changedAt: rsAt,
            note: 'GRN_RESUBMIT',
            changedBy: 'creator',
            changedByUser: user('Creator One'),
            afterValue: { previousCycleNumber: c, newCycleNumber: c + 1 },
        });
    }

    const grn = {
        id: 'grn-1',
        status: activeCycle === totalCycles ? 'PENDING_FINANCE' : 'DRAFT',
        createdAt: iso(base, 0),
        importedBy: 'creator',
        importedByUser: user('Creator One'),
        approvalRequest: null,
        approvalHistory: history,
    };

    if (activeCycle === totalCycles) {
        grn.approvalRequest = activeRequest(activeCycle, 1, [
            pendingStep(1, `ar-active-c${activeCycle}`, 'sA1'),
            pendingStep(2, `ar-active-c${activeCycle}`, 'sA2'),
        ]);
        grn.status = 'PENDING_APPROVAL';
    }

    return { grn, audits, totalCycles, activeCycle };
}

function buildGrnEntries(totalCycles, activeCycle) {
    const { grn, audits } = buildMultiCycleGrn(totalCycles, activeCycle);
    const raw = buildGrnTimelineRawEntries(grn, audits);
    return buildTimelineEntries([raw]);
}

test('GRN builder 4-cycle: 3 Send Back + cycle 4 active', () => {
    const entries = buildGrnEntries(4, 4);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length, 3);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'RESUBMIT').length, 3);
    assert.equal(
        entries.filter((e) => e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'COST_CONTROL').length,
        3,
    );
    assert.equal(
        entries.filter((e) => e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'FINANCE').length,
        3,
    );
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_CURRENT').length, 1);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 1);
    assert.equal(entries.length, 15, 'mandatory 15-entry 4-cycle scenario');
    assert.equal(resolveActiveCycleNumber(entries), 4);
    for (const sb of entries.filter((e) => e.lifecycleEventType === 'SEND_BACK')) {
        assert.ok(sb.reason?.includes('Send back reason'));
        assert.ok(sb.actor?.name);
    }
});

test('GRN builder 10-cycle mandatory: unlimited history preserved', () => {
    const entries = buildGrnEntries(10, 10);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length, 9);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'RESUBMIT').length, 9);
    for (let c = 1; c <= 9; c++) {
        const cost = entries.filter(
            (e) => e.cycleNumber === c && e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'COST_CONTROL',
        );
        const fin = entries.filter(
            (e) => e.cycleNumber === c && e.entryType === 'APPROVAL_STEP_COMPLETED' && e.stageKey === 'FINANCE',
        );
        assert.equal(cost.length, 1, `cycle ${c} cost`);
        assert.equal(fin.length, 1, `cycle ${c} finance`);
        assert.ok(cost[0].actor?.name);
        assert.ok(fin[0].actedAt);
    }
    assert.equal(resolveActiveCycleNumber(entries), 10);
    const cycles = new Set(entries.map((e) => e.cycleNumber));
    for (let c = 1; c <= 10; c++) {
        assert.ok(cycles.has(c), `missing cycle ${c}`);
    }
});

test('GRN builder: RESUBMIT not inferred from notes field on GRN', () => {
    const base = Date.parse('2026-06-01T10:00:00.000Z');
    const grn = {
        id: 'grn-notes',
        status: 'DRAFT',
        createdAt: iso(base, 0),
        importedBy: 'u1',
        importedByUser: user('Creator One'),
        notes: '[Send Back] fix invoice — must not emit RESUBMIT',
        approvalRequest: null,
        approvalHistory: [],
    };
    const audits = [];
    const raw = buildGrnTimelineRawEntries(grn, audits);
    assert.equal(raw.filter((e) => e.lifecycleEventType === 'RESUBMIT').length, 0);
});

test('GRN builder: constitutional SEND_BACK on active PENDING ApprovalRequest', () => {
    const base = Date.parse('2026-06-01T10:00:00.000Z');
    const activeId = 'ar-active-1';
    const grn = {
        id: 'grn-constitutional',
        status: 'PENDING_APPROVAL',
        createdAt: iso(base, 0),
        importedBy: 'creator',
        importedByUser: user('Creator One'),
        approvalRequest: {
            id: activeId,
            cycleNumber: 1,
            status: 'PENDING',
            currentStep: 1,
            steps: [
                {
                    id: 's1',
                    stepNumber: 1,
                    status: 'PENDING',
                    requiredRole: { code: 'COST_CONTROL' },
                },
                {
                    id: 's2',
                    stepNumber: 2,
                    status: 'PENDING',
                    requiredRole: { code: 'FINANCE_MANAGER' },
                },
            ],
        },
        approvalHistory: [],
    };
    const audits = [
        {
            id: 'sb-constitutional',
            action: 'SEND_BACK',
            changedAt: iso(base, 10),
            changedBy: 'fm',
            changedByUser: user('Finance Mgr'),
            note: 'WORKFLOW_SEND_BACK',
            afterValue: {
                approvalRequestId: activeId,
                workflowRound: 2,
                sourceStepNumber: 2,
                sourceStepRole: 'FINANCE_MANAGER',
                targetStepNumber: 1,
                targetStepRole: 'COST_CONTROL',
                targetType: 'STEP',
                reason: 'Incorrect allocation',
            },
        },
        {
            id: 'rs-constitutional',
            action: 'SUBMIT',
            changedAt: iso(base, 20),
            changedBy: 'creator',
            changedByUser: user('Creator One'),
            note: 'WORKFLOW_RESUBMIT',
            afterValue: { approvalRequestId: activeId, workflowRound: 2, resubmit: true },
        },
    ];
    const entries = buildTimelineEntries([buildGrnTimelineRawEntries(grn, audits)]);
    const sendBack = entries.find((e) => e.lifecycleEventType === 'SEND_BACK');
    assert.ok(sendBack, 'SEND_BACK should appear on active PENDING request');
    assert.equal(sendBack.reason, 'Incorrect allocation');
    assert.equal(sendBack.sourceStepRole, 'FINANCE_MANAGER');
    assert.equal(sendBack.targetStepRole, 'COST_CONTROL');
    assert.equal(sendBack.cycleNumber, 2);
    assert.ok(entries.some((e) => e.lifecycleEventType === 'RESUBMIT'));
    assert.ok(entries.some((e) => e.entryType === 'APPROVAL_STEP_CURRENT'));
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 1);
});

test('GRN builder: POSTED actor is Auto posted by DX', () => {
    const grn = {
        id: 'grn-posted',
        status: 'POSTED',
        postedAt: '2026-06-01T12:00:00.000Z',
        postedBy: 'human',
        postedByUser: user('Finance Human'),
        createdAt: '2026-06-01T10:00:00.000Z',
        importedBy: 'c',
        importedByUser: user('Creator'),
        approvalRequest: null,
        approvalHistory: [],
    };
    const posted = buildGrnTimelineRawEntries(grn, []).find((e) => e.entryType === 'POSTING');
    assert.ok(posted);
    assert.equal(posted.actor.name, 'Auto posted by DX');
});

test('GRN builder: no future steps after POSTED terminal', () => {
    const base = Date.parse('2026-06-01T10:00:00.000Z');
    const grn = {
        id: 'grn-terminal',
        status: 'POSTED',
        postedAt: iso(base, 60),
        createdAt: iso(base, 0),
        importedBy: 'c',
        importedByUser: user('Creator'),
        approvalRequest: {
            id: 'ar-done',
            cycleNumber: 1,
            status: 'APPROVED',
            currentStep: 2,
            steps: [
                {
                    id: 's1',
                    stepNumber: 1,
                    status: 'APPROVED',
                    actedAt: iso(base, 20),
                    actedBy: 'cc',
                    actedByUser: user('Cost User'),
                },
                {
                    id: 's2',
                    stepNumber: 2,
                    status: 'APPROVED',
                    actedAt: iso(base, 40),
                    actedBy: 'fin',
                    actedByUser: user('Finance User'),
                },
            ],
        },
        approvalHistory: [],
    };
    const entries = buildTimelineEntries([buildGrnTimelineRawEntries(grn, [])]);
    const postedIdx = entries.findIndex((e) => e.entryType === 'POSTING');
    assert.ok(postedIdx >= 0);
    assert.equal(
        entries.slice(postedIdx + 1).filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length,
        0,
    );
});
