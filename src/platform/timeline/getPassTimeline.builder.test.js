'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTimelineEntries } = require('./timelineEntry.merge');
const {
    buildGetPassTimelineRawEntries,
    workflowActiveIndex,
    rejectionErrorStepIndex,
} = require('./getPassTimeline.builder');

const user = (id, name) => ({ id, firstName: name.split(' ')[0], lastName: name.split(' ')[1] || '' });

function buildEntries(gp, auditEvents = []) {
    return buildTimelineEntries([buildGetPassTimelineRawEntries(gp, auditEvents)]);
}

test('Active workflow: current step IN_PROGRESS, future PENDING, no past-tense on pending', () => {
    const gp = {
        id: 'gp-1',
        status: 'PENDING_COST_CONTROL',
        deptApprovedAt: new Date('2026-06-01T10:00:00Z'),
        deptApprover: user('u1', 'Dept User'),
    };
    const entries = buildEntries(gp, [{ id: 'a1', action: 'SUBMIT', changedAt: new Date('2026-06-01T09:00:00Z'), changedBy: 'u0', changedByUser: user('u0', 'Creator') }]);
    const dept = entries.find((e) => e.stageKey === 'DEPT' && e.entryType === 'APPROVAL_STEP_COMPLETED');
    const costCurrent = entries.find((e) => e.stageKey === 'COST_CONTROL' && e.entryType === 'APPROVAL_STEP_CURRENT');
    const financeFuture = entries.find((e) => e.stageKey === 'FINANCE' && e.entryType === 'APPROVAL_STEP_FUTURE');
    assert.ok(dept);
    assert.equal(dept.displayTitleKey, 'TIMELINE.STAGE.DEPT_COMPLETED');
    assert.ok(costCurrent);
    assert.equal(costCurrent.status, 'IN_PROGRESS');
    assert.equal(costCurrent.displayTitleKey, 'TIMELINE.STAGE.COST_CONTROL_APPROVAL');
    assert.ok(financeFuture);
    assert.equal(financeFuture.status, 'PENDING');
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'REJECT').length, 0);
});

test('Not yet OUT: PENDING_SECURITY has no SECURITY_OUT milestone', () => {
    const gp = {
        id: 'gp-2',
        status: 'PENDING_SECURITY',
        deptApprovedAt: new Date('2026-06-01T10:00:00Z'),
        costControlApprovedAt: new Date('2026-06-01T11:00:00Z'),
        financeApprovedAt: new Date('2026-06-01T12:00:00Z'),
        gmApprovedAt: new Date('2026-06-01T13:00:00Z'),
        deptApprover: user('u1', 'A B'),
        costControlApprover: user('u2', 'C D'),
        financeApprover: user('u3', 'E F'),
        gmApprover: user('u4', 'G H'),
    };
    const entries = buildEntries(gp);
    assert.equal(entries.some((e) => e.stageKey === 'SECURITY_OUT'), false);
    const secCurrent = entries.find((e) => e.stageKey === 'SECURITY' && e.entryType === 'APPROVAL_STEP_CURRENT');
    assert.ok(secCurrent);
});

test('Fully released: SECURITY_OUT milestone after security approval', () => {
    const exitAt = new Date('2026-06-01T14:00:00Z');
    const gp = {
        id: 'gp-3',
        status: 'OUT',
        deptApprovedAt: new Date('2026-06-01T10:00:00Z'),
        costControlApprovedAt: new Date('2026-06-01T11:00:00Z'),
        financeApprovedAt: new Date('2026-06-01T12:00:00Z'),
        gmApprovedAt: new Date('2026-06-01T13:00:00Z'),
        securityApprovedAt: exitAt,
        checkedOutAt: exitAt,
        deptApprover: user('u1', 'A B'),
        costControlApprover: user('u2', 'C D'),
        financeApprover: user('u3', 'E F'),
        gmApprover: user('u4', 'G H'),
        securityApprover: user('u5', 'Sec User'),
        checkoutUser: user('u5', 'Sec User'),
    };
    const entries = buildEntries(gp);
    const out = entries.find((e) => e.stageKey === 'SECURITY_OUT');
    assert.ok(out);
    assert.equal(out.entryType, 'MILESTONE_COMPLETED');
    assert.equal(out.displayTitleKey, 'TIMELINE.STAGE.SECURITY_OUT_COMPLETED');
    assert.equal(out.actedAt, exitAt.toISOString());
});

test('Rejected: single REJECT lifecycle, no pending after reject', () => {
    const gp = {
        id: 'gp-4',
        status: 'REJECTED',
        deptApprovedAt: new Date('2026-06-01T10:00:00Z'),
        deptApprover: user('u1', 'Dept User'),
        rejectionReason: 'Budget not approved',
        updatedAt: new Date('2026-06-01T11:00:00Z'),
    };
    const auditEvents = [
        { id: 'r1', action: 'REJECT', changedAt: new Date('2026-06-01T11:00:00Z'), changedBy: 'u2', changedByUser: user('u2', 'Cost User') },
    ];
    const entries = buildEntries(gp, auditEvents);
    const rejects = entries.filter((e) => e.lifecycleEventType === 'REJECT');
    assert.equal(rejects.length, 1);
    assert.equal(rejects[0].reason, 'Budget not approved');
    assert.equal(rejects[0].stageKey, 'COST_CONTROL');
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_FUTURE').length, 0);
    assert.equal(entries.filter((e) => e.entryType === 'APPROVAL_STEP_CURRENT').length, 0);
});

test('Return flow: OUT then RETURN_PROCESSED audit after OUT chronologically', () => {
    const outAt = new Date('2026-06-01T14:00:00Z');
    const returnAt = new Date('2026-06-02T10:00:00Z');
    const gp = {
        id: 'gp-5',
        status: 'RETURNED',
        deptApprovedAt: new Date('2026-06-01T10:00:00Z'),
        costControlApprovedAt: new Date('2026-06-01T11:00:00Z'),
        financeApprovedAt: new Date('2026-06-01T12:00:00Z'),
        gmApprovedAt: new Date('2026-06-01T13:00:00Z'),
        securityApprovedAt: outAt,
        checkedOutAt: outAt,
        deptApprover: user('u1', 'A B'),
        costControlApprover: user('u2', 'C D'),
        financeApprover: user('u3', 'E F'),
        gmApprover: user('u4', 'G H'),
        securityApprover: user('u5', 'Sec User'),
        checkoutUser: user('u5', 'Sec User'),
    };
    const auditEvents = [
        { id: 'ret1', action: 'UPDATE', note: 'GET_PASS_PROCESS_RETURN', changedAt: returnAt, changedBy: 'u6', changedByUser: user('u6', 'Return User') },
    ];
    const entries = buildEntries(gp, auditEvents);
    const out = entries.find((e) => e.stageKey === 'SECURITY_OUT');
    const ret = entries.find((e) => e.stageKey === 'RETURN_PROCESSED');
    assert.ok(out && ret);
    assert.ok(new Date(out.actedAt).getTime() < new Date(ret.actedAt).getTime());
});

test('workflowActiveIndex and rejectionErrorStepIndex helpers', () => {
    assert.equal(workflowActiveIndex('PENDING_FINANCE'), 2);
    assert.equal(workflowActiveIndex('OUT'), 5);
    assert.equal(rejectionErrorStepIndex({ deptApprovedAt: new Date(), costControlApprovedAt: null }), 1);
});

test('Get Pass: approval chain from ApprovalRequest.currentStep', () => {
    const gp = {
        id: 'gp-ar',
        status: 'PENDING_COST_CONTROL',
    };
    const approvalRequest = {
        id: 'ar-gp',
        status: 'PENDING',
        currentStep: 2,
        steps: [
            {
                id: 's1',
                stepNumber: 1,
                status: 'APPROVED',
                actedAt: new Date('2026-06-01T10:00:00Z'),
                actedBy: 'u1',
                actedByUser: user('u1', 'Dept User'),
                requiredRole: { code: 'DEPT_MANAGER' },
            },
            {
                id: 's2',
                stepNumber: 2,
                status: 'PENDING',
                requiredRole: { code: 'COST_CONTROL' },
            },
            {
                id: 's3',
                stepNumber: 3,
                status: 'PENDING',
                requiredRole: { code: 'FINANCE_MANAGER' },
            },
        ],
    };
    const entries = buildTimelineEntries([
        buildGetPassTimelineRawEntries(gp, [], { approvalRequest }),
    ]);
    const dept = entries.find((e) => e.stageKey === 'DEPT' && e.entryType === 'APPROVAL_STEP_COMPLETED');
    const costCurrent = entries.find(
        (e) => e.stageKey === 'COST_CONTROL' && e.entryType === 'APPROVAL_STEP_CURRENT',
    );
    assert.ok(dept);
    assert.ok(costCurrent);
});

test('Get Pass: SEND_BACK audit emits constitutional metadata', () => {
    const gp = { id: 'gp-sb', status: 'PENDING_FINANCE' };
    const audits = [
        {
            id: 'sb',
            action: 'SEND_BACK',
            changedAt: new Date('2026-06-01T11:00:00Z'),
            changedBy: 'fm',
            changedByUser: user('u2', 'Finance Mgr'),
            afterValue: {
                workflowRound: 1,
                sourceStepRole: 'FINANCE_MANAGER',
                targetType: 'CREATOR',
                reason: 'Fix docs',
            },
        },
    ];
    const entries = buildTimelineEntries([buildGetPassTimelineRawEntries(gp, audits)]);
    const sb = entries.find((e) => e.lifecycleEventType === 'SEND_BACK');
    assert.ok(sb);
    assert.equal(sb.targetType, 'CREATOR');
    assert.equal(sb.reason, 'Fix docs');
    assert.equal(sb.sourceStepRole, 'FINANCE_MANAGER');
});

test('Get Pass: after Send Back, order is submit → approvals → send back → pending chain', () => {
    const gp = {
        id: 'gp-order',
        status: 'PENDING_FINANCE',
        deptApprovedAt: new Date('2026-06-01T10:00:00Z'),
        costControlApprovedAt: new Date('2026-06-01T10:30:00Z'),
        financeApprovedAt: new Date('2026-06-01T11:00:00Z'),
        gmApprovedAt: new Date('2026-06-01T11:30:00Z'),
        deptApprover: user('u1', 'Dept User'),
        costControlApprover: user('u2', 'Cost User'),
        financeApprover: user('u3', 'Finance User'),
        gmApprover: user('u4', 'GM User'),
    };
    const approvalRequest = {
        id: 'ar-order',
        status: 'PENDING',
        currentStep: 3,
        steps: [
            {
                id: 's1',
                stepNumber: 1,
                status: 'APPROVED',
                actedAt: new Date('2026-06-01T10:00:00Z'),
                actedBy: 'u1',
                actedByUser: user('u1', 'Dept User'),
                requiredRole: { code: 'DEPT_MANAGER' },
            },
            {
                id: 's2',
                stepNumber: 2,
                status: 'APPROVED',
                actedAt: new Date('2026-06-01T10:30:00Z'),
                actedBy: 'u2',
                actedByUser: user('u2', 'Cost User'),
                requiredRole: { code: 'COST_CONTROL' },
            },
            {
                id: 's3',
                stepNumber: 3,
                status: 'PENDING',
                requiredRole: { code: 'FINANCE_MANAGER' },
            },
            {
                id: 's4',
                stepNumber: 4,
                status: 'PENDING',
                requiredRole: { code: 'GENERAL_MANAGER' },
            },
            {
                id: 's5',
                stepNumber: 5,
                status: 'PENDING',
                requiredRole: { code: 'SECURITY' },
            },
        ],
    };
    const audits = [
        {
            id: 'sub',
            action: 'SUBMIT',
            changedAt: new Date('2026-06-01T09:00:00Z'),
            changedBy: 'u0',
            changedByUser: user('u0', 'Creator'),
        },
        {
            id: 'sb1',
            action: 'SEND_BACK',
            changedAt: new Date('2026-06-01T12:00:00Z'),
            changedBy: 'u5',
            changedByUser: user('u5', 'Sec User'),
            afterValue: {
                workflowRound: 1,
                sourceStepNumber: 5,
                sourceStepRole: 'SECURITY',
                targetStepNumber: 4,
                targetStepRole: 'GENERAL_MANAGER',
                targetType: 'STEP',
                reason: 'check',
            },
        },
        {
            id: 'sb2',
            action: 'SEND_BACK',
            changedAt: new Date('2026-06-01T12:05:00Z'),
            changedBy: 'u4',
            changedByUser: user('u4', 'GM User'),
            afterValue: {
                workflowRound: 2,
                sourceStepNumber: 4,
                sourceStepRole: 'GENERAL_MANAGER',
                targetStepNumber: 3,
                targetStepRole: 'FINANCE_MANAGER',
                targetType: 'STEP',
                reason: 'test',
            },
        },
    ];
    const entries = buildTimelineEntries([
        buildGetPassTimelineRawEntries(gp, audits, { approvalRequest }),
    ]);

    const titles = entries.map(
        (e) => `${e.entryType}:${e.lifecycleEventType || e.stageKey}`,
    );
    assert.equal(titles[0], 'LIFECYCLE_EVENT:SUBMIT_FOR_APPROVAL');
    assert.ok(titles.indexOf('APPROVAL_STEP_COMPLETED:DEPT') > 0);
    assert.ok(titles.indexOf('APPROVAL_STEP_COMPLETED:COST_CONTROL') > titles.indexOf('APPROVAL_STEP_COMPLETED:DEPT'));
    assert.ok(titles.indexOf('LIFECYCLE_EVENT:SEND_BACK') > titles.indexOf('APPROVAL_STEP_COMPLETED:COST_CONTROL'));
    assert.equal(entries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length, 2);

    const lastSendBackIdx = entries.map((e) => e.lifecycleEventType).lastIndexOf('SEND_BACK');
    const financeCurrentIdx = entries.findIndex(
        (e) => e.stageKey === 'FINANCE' && e.entryType === 'APPROVAL_STEP_CURRENT',
    );
    const gmFutureIdx = entries.findIndex(
        (e) => e.stageKey === 'GENERAL_MANAGER' && e.entryType === 'APPROVAL_STEP_FUTURE',
    );
    const secFutureIdx = entries.findIndex(
        (e) => e.stageKey === 'SECURITY' && e.entryType === 'APPROVAL_STEP_FUTURE',
    );
    assert.ok(financeCurrentIdx > lastSendBackIdx);
    assert.ok(gmFutureIdx > financeCurrentIdx);
    assert.ok(secFutureIdx > gmFutureIdx);

    // Cleared Finance/GM AR rows still recover stamp history before pending.
    assert.ok(
        entries.some((e) => e.stageKey === 'FINANCE' && e.entryType === 'APPROVAL_STEP_COMPLETED'),
    );
    assert.ok(
        entries.some((e) => e.stageKey === 'GENERAL_MANAGER' && e.entryType === 'APPROVAL_STEP_COMPLETED'),
    );
});

test('Get Pass A/B/C: Submit → B Approve → C Send Back → A Resubmit → B Approve → C Approve', () => {
    const approvalSteps = [
        {
            stepNumber: 1,
            stageKey: 'DEPT',
            approvedAtField: 'deptApprovedAt',
            approverField: 'deptApprover',
            pendingStatus: 'PENDING_DEPT',
        },
        {
            stepNumber: 2,
            stageKey: 'COST_CONTROL',
            approvedAtField: 'costControlApprovedAt',
            approverField: 'costControlApprover',
            pendingStatus: 'PENDING_COST_CONTROL',
        },
    ];
    const gp = {
        id: 'gp-abc',
        status: 'APPROVED',
        deptApprovedAt: new Date('2026-06-01T14:00:00Z'),
        costControlApprovedAt: new Date('2026-06-01T14:30:00Z'),
        deptApprover: user('b', 'Person B'),
        costControlApprover: user('c', 'Person C'),
    };
    const approvalRequest = {
        id: 'ar-abc',
        status: 'APPROVED',
        currentStep: 2,
        steps: [
            {
                id: 's1',
                stepNumber: 1,
                status: 'APPROVED',
                actedAt: new Date('2026-06-01T14:00:00Z'),
                actedBy: 'b',
                actedByUser: user('b', 'Person B'),
                requiredRole: { code: 'DEPT_MANAGER' },
            },
            {
                id: 's2',
                stepNumber: 2,
                status: 'APPROVED',
                actedAt: new Date('2026-06-01T14:30:00Z'),
                actedBy: 'c',
                actedByUser: user('c', 'Person C'),
                requiredRole: { code: 'COST_CONTROL' },
            },
        ],
    };
    const audits = [
        {
            id: 'a-sub',
            action: 'SUBMIT',
            changedAt: new Date('2026-06-01T09:00:00Z'),
            changedBy: 'a',
            changedByUser: user('a', 'Person A'),
        },
        {
            id: 'a-b1',
            action: 'APPROVE',
            note: 'GET_PASS_APPROVE_STEP:PENDING_DEPT',
            changedAt: new Date('2026-06-01T10:00:00Z'),
            changedBy: 'b',
            changedByUser: user('b', 'Person B'),
        },
        {
            id: 'a-sb',
            action: 'SEND_BACK',
            changedAt: new Date('2026-06-01T11:00:00Z'),
            changedBy: 'c',
            changedByUser: user('c', 'Person C'),
            afterValue: {
                workflowRound: 1,
                sourceStepNumber: 2,
                sourceStepRole: 'COST_CONTROL',
                targetType: 'CREATOR',
                targetStepNumber: 0,
                reason: 'fix line',
            },
        },
        {
            id: 'a-re',
            action: 'SUBMIT',
            note: 'GET_PASS_RESUBMIT round=2 approvalRequestId=ar-abc',
            changedAt: new Date('2026-06-01T12:00:00Z'),
            changedBy: 'a',
            changedByUser: user('a', 'Person A'),
            afterValue: { workflowRound: 2, resubmit: true },
        },
        {
            id: 'a-b2',
            action: 'APPROVE',
            note: 'GET_PASS_APPROVE_STEP:PENDING_DEPT',
            changedAt: new Date('2026-06-01T14:00:00Z'),
            changedBy: 'b',
            changedByUser: user('b', 'Person B'),
        },
        {
            id: 'a-c2',
            action: 'APPROVE',
            note: 'GET_PASS_APPROVE_STEP:PENDING_COST_CONTROL',
            changedAt: new Date('2026-06-01T14:30:00Z'),
            changedBy: 'c',
            changedByUser: user('c', 'Person C'),
        },
    ];

    const entries = buildTimelineEntries([
        buildGetPassTimelineRawEntries(gp, audits, { approvalRequest, approvalSteps }),
    ]);

    const story = entries
        .filter(
            (e) =>
                e.lifecycleEventType === 'SUBMIT_FOR_APPROVAL' ||
                e.lifecycleEventType === 'SEND_BACK' ||
                e.lifecycleEventType === 'RESUBMIT' ||
                e.entryType === 'APPROVAL_STEP_COMPLETED',
        )
        .map((e) => {
            if (e.lifecycleEventType === 'SUBMIT_FOR_APPROVAL') return 'A:Submit';
            if (e.lifecycleEventType === 'SEND_BACK') return 'C:SendBack';
            if (e.lifecycleEventType === 'RESUBMIT') return 'A:Resubmit';
            if (e.stageKey === 'DEPT') return 'B:Approve';
            if (e.stageKey === 'COST_CONTROL') return 'C:Approve';
            return `${e.stageKey}:${e.entryType}`;
        });

    assert.deepEqual(story, [
        'A:Submit',
        'B:Approve',
        'C:SendBack',
        'A:Resubmit',
        'B:Approve',
        'C:Approve',
    ]);
});
