'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTimelineEntries } = require('./timelineEntry.merge');
const { buildApprovalTimelineRawEntries } = require('./approvalTimeline.builder');

const user = (id, name) => ({
    id,
    firstName: name.split(' ')[0],
    lastName: name.split(' ')[1] || '',
});

function step(stepNumber, roleCode, status, actedAt = null, actedBy = null) {
    return {
        id: `step-${stepNumber}`,
        stepNumber,
        status,
        actedAt,
        actedByUser: actedBy ? user(actedBy, actedBy) : null,
        requiredRole: { code: roleCode },
    };
}

/**
 * Constitutional Breakage story (mirrors Get Pass A/B/C):
 * Submit → Dept approve → Cost approve → Finance Send Back → Creator
 * → Resubmit → Dept CURRENT → Cost/Finance/GM FUTURE
 */
test('Breakage constitutional order: Submit → Approvals → Send Back → Resubmit → Current → Future', () => {
    const approvalRequest = {
        id: 'ar-brk-1',
        status: 'PENDING',
        currentStep: 1,
        cycleNumber: 2,
        steps: [
            step(1, 'DEPT_MANAGER', 'PENDING'),
            step(2, 'COST_CONTROL', 'PENDING'),
            step(3, 'FINANCE_MANAGER', 'PENDING'),
            step(4, 'GENERAL_MANAGER', 'PENDING'),
        ],
    };

    const audits = [
        {
            id: 'a-submit',
                action: 'SUBMIT',
            changedAt: new Date('2026-07-17T07:50:00Z'),
            changedBy: 'creator',
            changedByUser: user('creator', 'Creator User'),
        },
        {
            id: 'a-dept',
            action: 'APPROVE',
            note: 'BREAKAGE_APPROVE_STEP:1:DEPT_MANAGER',
            changedAt: new Date('2026-07-17T07:55:00Z'),
            changedBy: 'dept',
            changedByUser: user('dept', 'Dept Manager'),
        },
        {
            id: 'a-cost',
            action: 'APPROVE',
            note: 'BREAKAGE_APPROVE_STEP:2:COST_CONTROL',
            changedAt: new Date('2026-07-17T07:58:00Z'),
            changedBy: 'cost',
            changedByUser: user('cost', 'Olivia Parker'),
        },
        {
            id: 'a-sendback',
            action: 'SEND_BACK',
            changedAt: new Date('2026-07-17T07:59:00Z'),
            changedBy: 'finance',
            changedByUser: user('finance', 'Jonathan Miller'),
            afterValue: {
                workflowRound: 1,
                sourceStepNumber: 3,
                sourceStepRole: 'FINANCE_MANAGER',
                targetStepNumber: 0,
                targetType: 'CREATOR',
                reason: 'add more items',
            },
        },
        {
            id: 'a-resubmit',
            action: 'SUBMIT',
            note: 'BREAKAGE_RESUBMIT round=2 approvalRequestId=ar-brk-1',
            changedAt: new Date('2026-07-17T08:00:00Z'),
            changedBy: 'creator',
            changedByUser: user('creator', 'Creator User'),
            afterValue: { resubmit: true, workflowRound: 2, currentStep: 1 },
        },
    ];

    const entries = buildTimelineEntries([
        buildApprovalTimelineRawEntries(approvalRequest, { auditEvents: audits }),
    ]);

    const titles = entries.map(
        (e) => `${e.entryType}:${e.lifecycleEventType || e.stageKey}`,
    );

    assert.equal(titles[0], 'LIFECYCLE_EVENT:SUBMIT_FOR_APPROVAL');

    const deptIdx = entries.findIndex(
        (e) => e.stageKey === 'DEPT' && e.entryType === 'APPROVAL_STEP_COMPLETED',
    );
    const costIdx = entries.findIndex(
        (e) => e.stageKey === 'COST_CONTROL' && e.entryType === 'APPROVAL_STEP_COMPLETED',
    );
    const sendBackIdx = entries.findIndex((e) => e.lifecycleEventType === 'SEND_BACK');
    const resubmitIdx = entries.findIndex((e) => e.lifecycleEventType === 'RESUBMIT');
    const deptCurrentIdx = entries.findIndex(
        (e) => e.stageKey === 'DEPT' && e.entryType === 'APPROVAL_STEP_CURRENT',
    );
    const costFutureIdx = entries.findIndex(
        (e) => e.stageKey === 'COST_CONTROL' && e.entryType === 'APPROVAL_STEP_FUTURE',
    );
    const financeFutureIdx = entries.findIndex(
        (e) => e.stageKey === 'FINANCE' && e.entryType === 'APPROVAL_STEP_FUTURE',
    );
    const gmFutureIdx = entries.findIndex(
        (e) => e.stageKey === 'GENERAL_MANAGER' && e.entryType === 'APPROVAL_STEP_FUTURE',
    );

    assert.ok(deptIdx > 0, 'Dept completed must appear after Submit');
    assert.ok(costIdx > deptIdx, 'Cost completed after Dept');
    assert.ok(sendBackIdx > costIdx, 'Send Back after Cost approve');
    assert.ok(resubmitIdx > sendBackIdx, 'Resubmit after Send Back');
    assert.ok(deptCurrentIdx > resubmitIdx, 'Dept CURRENT after Resubmit');
    assert.ok(costFutureIdx > deptCurrentIdx);
    assert.ok(financeFutureIdx > costFutureIdx);
    assert.ok(gmFutureIdx > financeFutureIdx);

    assert.equal(entries[sendBackIdx].reason, 'add more items');
    assert.equal(entries[sendBackIdx].targetType, 'CREATOR');
});

test('Breakage pre-approve Dept audit survives Send Back to Creator (history not Cost-only)', () => {
    const approvalRequest = {
        id: 'ar-brk-2',
        status: 'PENDING',
        currentStep: 0,
        cycleNumber: 1,
        steps: [
            step(1, 'DEPT_MANAGER', 'CANCELLED'),
            step(2, 'COST_CONTROL', 'CANCELLED'),
            step(3, 'FINANCE_MANAGER', 'CANCELLED'),
            step(4, 'GENERAL_MANAGER', 'CANCELLED'),
        ],
    };

    const audits = [
        {
            id: 'a-submit',
            action: 'SUBMIT',
            changedAt: new Date('2026-07-17T07:50:00Z'),
            changedBy: 'dept',
            changedByUser: user('dept', 'Dept Manager'),
        },
        {
            id: 'a-dept-pre',
            action: 'APPROVE',
            note: 'BREAKAGE_APPROVE_STEP:1:DEPT_MANAGER',
            changedAt: new Date('2026-07-17T07:50:01Z'),
            changedBy: 'dept',
            changedByUser: user('dept', 'Dept Manager'),
            afterValue: { preApprove: true },
        },
        {
            id: 'a-cost',
            action: 'APPROVE',
            note: 'BREAKAGE_APPROVE_STEP:2:COST_CONTROL',
            changedAt: new Date('2026-07-17T07:58:00Z'),
            changedBy: 'cost',
            changedByUser: user('cost', 'Olivia Parker'),
        },
        {
            id: 'a-sendback',
            action: 'SEND_BACK',
            changedAt: new Date('2026-07-17T07:59:00Z'),
            changedBy: 'finance',
            changedByUser: user('finance', 'Jonathan Miller'),
            afterValue: {
                workflowRound: 1,
                sourceStepNumber: 3,
                sourceStepRole: 'FINANCE_MANAGER',
                targetStepNumber: 0,
                targetType: 'CREATOR',
                reason: 'add more items',
            },
        },
    ];

    const entries = buildTimelineEntries([
        buildApprovalTimelineRawEntries(approvalRequest, {
            auditEvents: audits,
            documentStatus: 'DRAFT',
        }),
    ]);

    const dept = entries.find(
        (e) => e.stageKey === 'DEPT' && e.entryType === 'APPROVAL_STEP_COMPLETED',
    );
    const cost = entries.find(
        (e) => e.stageKey === 'COST_CONTROL' && e.entryType === 'APPROVAL_STEP_COMPLETED',
    );
    const sendBack = entries.find((e) => e.lifecycleEventType === 'SEND_BACK');
    const creatorPending = entries.find(
        (e) => e.entryType === 'APPROVAL_STEP_CURRENT' && (e.stageKey === 'CREATOR' || e.stepNumber === 0),
    );

    assert.ok(dept, 'Dept pre-approve must survive as COMPLETED from audit');
    assert.ok(cost, 'Cost approve must survive');
    assert.ok(sendBack);
    assert.ok(
        entries.indexOf(dept) < entries.indexOf(cost),
        'Dept before Cost in history',
    );
    assert.ok(
        entries.indexOf(cost) < entries.indexOf(sendBack),
        'Cost before Send Back',
    );
    assert.ok(creatorPending, 'Creator pending after Send Back to Creator');
});

test('Lost APPROVE_STEP notes map into completed timeline history', () => {
    const approvalRequest = {
        id: 'ar-lost-1',
        status: 'PENDING',
        currentStep: 2,
        steps: [
            step(1, 'DEPT_MANAGER', 'APPROVED', new Date('2026-07-17T08:00:00Z'), 'dept'),
            step(2, 'COST_CONTROL', 'PENDING'),
            step(3, 'FINANCE_MANAGER', 'PENDING'),
        ],
    };
    const audits = [
        {
            id: 'a-lost-dept',
            action: 'APPROVE',
            note: 'LOST_APPROVE_STEP:1:DEPT_MANAGER',
            changedAt: new Date('2026-07-17T08:00:00Z'),
            changedBy: 'dept',
            changedByUser: user('dept', 'Dept Manager'),
        },
    ];
    const entries = buildTimelineEntries([
        buildApprovalTimelineRawEntries(approvalRequest, { auditEvents: audits }),
    ]);
    assert.ok(
        entries.some((e) => e.stageKey === 'DEPT' && e.entryType === 'APPROVAL_STEP_COMPLETED'),
    );
    assert.ok(
        entries.some((e) => e.stageKey === 'COST_CONTROL' && e.entryType === 'APPROVAL_STEP_CURRENT'),
    );
});

test('Legacy BRK shape: CREATE preapprove + Cost + SendBack→Creator + reentry without Resubmit audit', () => {
    const approvalRequest = {
        id: 'ar-legacy',
        status: 'PENDING',
        currentStep: 1,
        steps: [
            step(1, 'DEPT_MANAGER', 'PENDING'),
            step(2, 'COST_CONTROL', 'PENDING'),
            step(3, 'FINANCE_MANAGER', 'PENDING'),
            step(4, 'GENERAL_MANAGER', 'PENDING'),
        ],
    };
    const audits = [
        {
            id: 'a-create',
            action: 'CREATE',
            changedAt: new Date('2026-07-16T23:43:36Z'),
            changedBy: 'michael',
            changedByUser: user('michael', 'Michael Reed'),
            afterValue: { status: 'DEPT_APPROVED', documentNo: 'BRK-LEGACY' },
        },
        {
            id: 'a-cost',
            action: 'APPROVE',
            note: 'BREAKAGE_APPROVE_STEP:2:COST_CONTROL',
            changedAt: new Date('2026-07-17T07:58:01Z'),
            changedBy: 'olivia',
            changedByUser: user('olivia', 'Olivia Parker'),
        },
        {
            id: 'a-sb',
            action: 'SEND_BACK',
            changedAt: new Date('2026-07-17T07:59:26Z'),
            changedBy: 'jonathan',
            changedByUser: user('jonathan', 'Jonathan Miller'),
            afterValue: {
                workflowRound: 1,
                sourceStepNumber: 3,
                sourceStepRole: 'FINANCE_MANAGER',
                targetStepNumber: 0,
                targetType: 'CREATOR',
                reason: 'add more items',
            },
        },
    ];
    const entries = buildTimelineEntries([
        buildApprovalTimelineRawEntries(approvalRequest, {
            auditEvents: audits,
            documentStatus: 'PENDING_DEPT',
        }),
    ]);
    const titles = entries.map(
        (e) => `${e.entryType}:${e.lifecycleEventType || e.stageKey}`,
    );
    assert.equal(titles[0], 'LIFECYCLE_EVENT:SUBMIT_FOR_APPROVAL');
    assert.ok(titles.includes('APPROVAL_STEP_COMPLETED:DEPT'));
    assert.ok(titles.includes('APPROVAL_STEP_COMPLETED:COST_CONTROL'));
    assert.ok(titles.includes('LIFECYCLE_EVENT:SEND_BACK'));
    assert.ok(titles.includes('LIFECYCLE_EVENT:RESUBMIT'));
    assert.ok(titles.includes('APPROVAL_STEP_CURRENT:DEPT'));

    const deptDone = entries.findIndex(
        (e) => e.stageKey === 'DEPT' && e.entryType === 'APPROVAL_STEP_COMPLETED',
    );
    const costDone = entries.findIndex(
        (e) => e.stageKey === 'COST_CONTROL' && e.entryType === 'APPROVAL_STEP_COMPLETED',
    );
    const sb = entries.findIndex((e) => e.lifecycleEventType === 'SEND_BACK');
    const rs = entries.findIndex((e) => e.lifecycleEventType === 'RESUBMIT');
    const deptNow = entries.findIndex(
        (e) => e.stageKey === 'DEPT' && e.entryType === 'APPROVAL_STEP_CURRENT',
    );
    assert.ok(deptDone < costDone && costDone < sb && sb < rs && rs < deptNow);
});

test('Breakage showPendingPosting: Posted appears after GM future step', () => {
    const approvalRequest = {
        id: 'ar-brk-posted-pending',
        status: 'PENDING',
        currentStep: 1,
        cycleNumber: 1,
        steps: [
            step(1, 'DEPT_MANAGER', 'PENDING'),
            step(2, 'COST_CONTROL', 'PENDING'),
            step(3, 'FINANCE_MANAGER', 'PENDING'),
            step(4, 'GENERAL_MANAGER', 'PENDING'),
        ],
    };
    const entries = buildTimelineEntries([
        buildApprovalTimelineRawEntries(approvalRequest, {
            auditEvents: [
                {
                    id: 'a-create',
                    action: 'CREATE',
                    changedAt: new Date('2026-07-20T08:00:00Z'),
                    changedBy: 'creator',
                    changedByUser: user('creator', 'Steven Clark'),
                },
            ],
            documentStatus: 'IN_REVIEW',
            includePosting: false,
            showPendingPosting: true,
        }),
    ]);
    const last = entries[entries.length - 1];
    assert.equal(last.entryType, 'POSTING');
    assert.equal(last.status, 'PENDING');
    assert.equal(last.displayTitleKey, 'TIMELINE.STAGE.POSTED_APPROVAL');
    const gmIdx = entries.findIndex((e) => e.stageKey === 'GENERAL_MANAGER');
    const postIdx = entries.findIndex((e) => e.entryType === 'POSTING');
    assert.ok(gmIdx >= 0 && postIdx > gmIdx);
});
