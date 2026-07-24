'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTimelineEntries } = require('./timelineEntry.merge');
const { buildInventoryCountTimelineRawEntries } = require('./inventoryCountTimeline.builder');

const user = (id, name) => ({ id, firstName: name.split(' ')[0], lastName: name.split(' ')[1] || '' });

function buildEntries(session, auditEvents = [], options = {}) {
    return buildTimelineEntries([buildInventoryCountTimelineRawEntries(session, auditEvents, options)]);
}

test('Active approval: finance current, GM future, no posting', () => {
    const session = {
        id: 's1',
        status: 'PENDING_APPROVAL',
        currentRound: 1,
        approvalRequest: {
            id: 'ar1',
            status: 'PENDING',
            currentStep: 1,
            totalSteps: 2,
            steps: [
                {
                    id: 'st1',
                    stepNumber: 1,
                    status: 'PENDING',
                    requiredRole: { code: 'FINANCE_MANAGER' },
                },
                {
                    id: 'st2',
                    stepNumber: 2,
                    status: 'PENDING',
                    requiredRole: { code: 'GENERAL_MANAGER' },
                },
            ],
        },
    };
    const audit = [
        {
            id: 'a1',
            action: 'SUBMIT',
            note: 'INVENTORY_COUNT_SUBMIT_COUNTS sessionNo=CNT-1',
            changedAt: new Date('2026-06-01T09:00:00Z'),
            changedBy: 'u0',
            changedByUser: user('u0', 'Op User'),
        },
        {
            id: 'a2',
            action: 'SUBMIT',
            note: 'INVENTORY_COUNT_SUBMIT_FOR_APPROVAL sessionNo=CNT-1',
            changedAt: new Date('2026-06-01T10:00:00Z'),
            changedBy: 'u0',
            changedByUser: user('u0', 'Op User'),
        },
    ];
    const entries = buildEntries(session, audit, { roundNumbers: [1] });
    assert.ok(entries.some((e) => e.stageKey === 'COUNT_SUBMITTED'));
    assert.ok(entries.some((e) => e.stageKey === 'FINANCE' && e.entryType === 'APPROVAL_STEP_CURRENT'));
    assert.ok(entries.some((e) => e.stageKey === 'GENERAL_MANAGER' && e.entryType === 'APPROVAL_STEP_FUTURE'));
    assert.equal(entries.some((e) => e.entryType === 'POSTING'), false);
});

test('Posted: includes POSTING milestone after GM approval', () => {
    const postedAt = new Date('2026-06-01T12:00:00Z');
    const session = {
        id: 's2',
        status: 'POSTED',
        currentRound: 1,
        postedAt,
        createdByUser: user('u3', 'GM User'),
        approvalRequest: {
            id: 'ar2',
            status: 'APPROVED',
            currentStep: 2,
            totalSteps: 2,
            steps: [
                {
                    id: 'st1',
                    stepNumber: 1,
                    status: 'APPROVED',
                    actedAt: new Date('2026-06-01T11:00:00Z'),
                    actedBy: 'u1',
                    actedByUser: user('u1', 'Finance User'),
                    requiredRole: { code: 'FINANCE_MANAGER' },
                },
                {
                    id: 'st2',
                    stepNumber: 2,
                    status: 'APPROVED',
                    actedAt: postedAt,
                    actedBy: 'u3',
                    actedByUser: user('u3', 'GM User'),
                    requiredRole: { code: 'GENERAL_MANAGER' },
                },
            ],
        },
    };
    const audit = [
        {
            id: 'p1',
            action: 'POST',
            note: 'INVENTORY_COUNT_POSTED referenceType=COUNT_SESSION',
            changedAt: postedAt,
            changedBy: 'u3',
            changedByUser: user('u3', 'GM User'),
        },
    ];
    const entries = buildEntries(session, audit, { roundNumbers: [1] });
    const posting = entries.find((e) => e.entryType === 'POSTING');
    assert.ok(posting);
    assert.equal(posting.stageKey, 'POSTED');
    assert.equal(posting.actor?.name, 'Auto posted by DX');
    assert.notEqual(posting.actor?.name, 'GM User');
});

test('Void cancel: Cancelled lifecycle with actor, no pending approval steps', () => {
    const cancelledAt = new Date('2026-06-01T13:00:00Z');
    const session = {
        id: 's-void',
        status: 'VOID',
        currentRound: 1,
        approvalRequest: {
            id: 'ar-void',
            status: 'PENDING',
            currentStep: 1,
            totalSteps: 2,
            steps: [
                {
                    id: 'st1',
                    stepNumber: 1,
                    status: 'PENDING',
                    requiredRole: { code: 'FINANCE_MANAGER' },
                },
                {
                    id: 'st2',
                    stepNumber: 2,
                    status: 'PENDING',
                    requiredRole: { code: 'GENERAL_MANAGER' },
                },
            ],
        },
    };
    const audit = [
        {
            id: 'c1',
            action: 'CANCEL',
            note: 'INVENTORY_COUNT_CANCELLED sessionNo=CNT-9 reason=Wrong scope',
            changedAt: cancelledAt,
            changedBy: 'u-sk',
            changedByUser: user('u-sk', 'Store Keeper'),
        },
    ];
    const entries = buildEntries(session, audit, { roundNumbers: [1] });
    const cancel = entries.find((e) => e.lifecycleEventType === 'CANCEL');
    assert.ok(cancel);
    assert.equal(cancel.displayTitleKey, 'TIMELINE.LIFECYCLE.CANCEL');
    assert.equal(cancel.actor?.name, 'Store Keeper');
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 0);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_CURRENT').length, 0);
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'REJECT').length, 0);
});

test('Rejected: single REJECT lifecycle at finance stage', () => {
    const session = {
        id: 's3',
        status: 'REJECTED',
        currentRound: 1,
        notes: 'Rejected: Budget exceeded',
        approvalRequest: {
            id: 'ar3',
            status: 'REJECTED',
            currentStep: 1,
            totalSteps: 2,
            steps: [
                {
                    id: 'st1',
                    stepNumber: 1,
                    status: 'REJECTED',
                    actedAt: new Date('2026-06-01T11:00:00Z'),
                    actedBy: 'u1',
                    actedByUser: user('u1', 'Finance User'),
                    comment: 'Budget exceeded',
                    requiredRole: { code: 'FINANCE_MANAGER' },
                },
                {
                    id: 'st2',
                    stepNumber: 2,
                    status: 'PENDING',
                    requiredRole: { code: 'GENERAL_MANAGER' },
                },
            ],
        },
    };
    const entries = buildEntries(session, [], { roundNumbers: [1] });
    const rejects = entries.filter((e) => e.lifecycleEventType === 'REJECT');
    assert.equal(rejects.length, 1);
    assert.equal(rejects[0].stageKey, 'FINANCE');
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 0);
});

test('Recount round 2: recount lifecycle and two count submit milestones', () => {
    const session = {
        id: 's4',
        status: 'POSTED',
        currentRound: 2,
        postedAt: new Date('2026-06-02T12:00:00Z'),
        approvalRequest: {
            id: 'ar4',
            status: 'APPROVED',
            currentStep: 2,
            totalSteps: 2,
            steps: [
                {
                    id: 'st1',
                    stepNumber: 1,
                    status: 'APPROVED',
                    actedAt: new Date('2026-06-02T11:00:00Z'),
                    actedBy: 'u1',
                    actedByUser: user('u1', 'Finance User'),
                    requiredRole: { code: 'FINANCE_MANAGER' },
                },
                {
                    id: 'st2',
                    stepNumber: 2,
                    status: 'APPROVED',
                    actedAt: new Date('2026-06-02T12:00:00Z'),
                    actedBy: 'u3',
                    actedByUser: user('u3', 'GM User'),
                    requiredRole: { code: 'GENERAL_MANAGER' },
                },
            ],
        },
    };
    const audit = [
        {
            id: 'c1',
            action: 'SUBMIT',
            note: 'INVENTORY_COUNT_SUBMIT_COUNTS sessionNo=CNT-2',
            changedAt: new Date('2026-06-01T09:00:00Z'),
            changedBy: 'u0',
            changedByUser: user('u0', 'Op User'),
        },
        {
            id: 'r1',
            action: 'UPDATE',
            note: 'INVENTORY_COUNT_RECOUNT_REQUESTED sessionNo=CNT-2 round=2',
            changedAt: new Date('2026-06-01T10:00:00Z'),
            changedBy: 'u0',
            changedByUser: user('u0', 'Op User'),
        },
        {
            id: 'c2',
            action: 'SUBMIT',
            note: 'INVENTORY_COUNT_SUBMIT_COUNTS sessionNo=CNT-2',
            changedAt: new Date('2026-06-01T11:00:00Z'),
            changedBy: 'u0',
            changedByUser: user('u0', 'Op User'),
        },
    ];
    const entries = buildEntries(session, audit, { roundNumbers: [1, 2] });
    assert.equal(entries.filter((e) => e.stageKey === 'COUNT_SUBMITTED').length, 2);
    assert.ok(entries.some((e) => e.lifecycleEventType === 'RECOUNT'));
});
