'use strict';

/**
 * Constitutional Send Back — timeline SEND_BACK / RESUBMIT lifecycle entries.
 * NEW test file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildApprovalTimelineRawEntries,
    sendBackLifecycleFromAudit,
    resubmitLifecycleFromAudit,
} = require('./approvalTimeline.builder');
const { buildTimelineEntries } = require('./timelineEntry.merge');

function user(name) {
    return { firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') || 'U' };
}

test('sendBackLifecycleFromAudit — exposes source, target, reason, round', () => {
    const entry = sendBackLifecycleFromAudit({
        id: 'audit-sb-1',
        action: 'SEND_BACK',
        changedAt: '2026-07-02T12:00:00.000Z',
        changedBy: 'u-fin',
        changedByUser: user('Finance Lead'),
        afterValue: {
            workflowRound: 2,
            sourceStepNumber: 3,
            sourceStepRole: 'FINANCE_MANAGER',
            targetStepNumber: 2,
            targetStepRole: 'DEPT_MANAGER',
            targetType: 'STEP',
            reason: 'Wrong department',
            approvalRequestId: 'ar-1',
            accWorkflowVersionId: 'wfv-1',
        },
    });
    assert.equal(entry.lifecycleEventType, 'SEND_BACK');
    assert.equal(entry.cycleNumber, 2);
    assert.equal(entry.sourceStepNumber, 3);
    assert.equal(entry.targetStepNumber, 2);
    assert.equal(entry.targetType, 'STEP');
    assert.equal(entry.reason, 'Wrong department');
    assert.equal(entry.sourceRef.auditLogId, 'audit-sb-1');
});

test('resubmitLifecycleFromAudit — round from afterValue.workflowRound', () => {
    const entry = resubmitLifecycleFromAudit({
        id: 'audit-rs-1',
        action: 'SUBMIT',
        changedAt: '2026-07-02T13:00:00.000Z',
        changedBy: 'u-creator',
        changedByUser: user('Creator One'),
        afterValue: { workflowRound: 2, resubmit: true, approvalRequestId: 'ar-1' },
    });
    assert.equal(entry.lifecycleEventType, 'RESUBMIT');
    assert.equal(entry.cycleNumber, 2);
});

test('buildApprovalTimelineRawEntries — interleaves SEND_BACK with approval steps', () => {
    const ar = {
        id: 'ar-1',
        cycleNumber: 1,
        status: 'PENDING',
        currentStep: 2,
        totalSteps: 3,
        steps: [
            {
                id: 's1', stepNumber: 1, status: 'APPROVED',
                requiredRole: { code: 'DEPT_MANAGER' },
                actedAt: '2026-07-02T10:00:00.000Z', actedBy: 'u-dept', actedByUser: user('Dept Mgr'),
            },
            { id: 's2', stepNumber: 2, status: 'PENDING', requiredRole: { code: 'FINANCE_MANAGER' } },
            { id: 's3', stepNumber: 3, status: 'PENDING', requiredRole: { code: 'GENERAL_MANAGER' } },
        ],
    };
    const raw = buildApprovalTimelineRawEntries(ar, {
        auditEvents: [
            {
                id: 'audit-sb',
                action: 'SEND_BACK',
                changedAt: '2026-07-02T11:00:00.000Z',
                changedBy: 'u-fin',
                changedByUser: user('Finance Lead'),
                afterValue: {
                    workflowRound: 1,
                    sourceStepNumber: 2,
                    sourceStepRole: 'FINANCE_MANAGER',
                    targetStepNumber: 1,
                    targetStepRole: 'DEPT_MANAGER',
                    targetType: 'STEP',
                    reason: 'Fix qty',
                },
            },
            {
                id: 'audit-rs',
                action: 'SUBMIT',
                changedAt: '2026-07-02T11:30:00.000Z',
                changedBy: 'u-creator',
                changedByUser: user('Creator One'),
                note: 'WORKFLOW_RESUBMIT round=1',
                afterValue: { workflowRound: 1, resubmit: true },
            },
        ],
    });
    const entries = buildTimelineEntries([raw]);
    const lifecycle = entries.filter((e) => e.entryType === 'LIFECYCLE_EVENT');
    assert.ok(lifecycle.some((e) => e.lifecycleEventType === 'SEND_BACK'));
    assert.ok(lifecycle.some((e) => e.lifecycleEventType === 'RESUBMIT'));
    const current = entries.find((e) => e.entryType === 'APPROVAL_STEP_CURRENT');
    assert.ok(current, 'current pending step rendered after send-back');
});

test('buildApprovalTimelineRawEntries — Creator target send-back shows targetType CREATOR', () => {
    const raw = buildApprovalTimelineRawEntries(
        {
            id: 'ar-2', cycleNumber: 1, status: 'PENDING', currentStep: 0, totalSteps: 2,
            steps: [
                { id: 's1', stepNumber: 1, status: 'PENDING', requiredRole: { code: 'DEPT_MANAGER' } },
                { id: 's2', stepNumber: 2, status: 'PENDING', requiredRole: { code: 'FINANCE_MANAGER' } },
            ],
        },
        {
            auditEvents: [{
                id: 'audit-sb-creator',
                action: 'SEND_BACK',
                changedAt: '2026-07-02T14:00:00.000Z',
                changedBy: 'u-dept',
                afterValue: {
                    workflowRound: 1,
                    sourceStepNumber: 1,
                    targetStepNumber: 0,
                    targetType: 'CREATOR',
                    reason: 'Edit header',
                },
            }],
        },
    );
    const entries = buildTimelineEntries([raw]);
    const sb = entries.find((e) => e.lifecycleEventType === 'SEND_BACK');
    assert.equal(sb.targetType, 'CREATOR');
    assert.equal(sb.targetStepNumber, 0);
});
