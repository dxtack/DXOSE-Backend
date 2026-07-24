'use strict';

const { resolveDisplayTitleKey } = require('./timelineEntry.i18n-keys');
const { userDisplayName, toIso } = require('../../utils/timeline-present.util');
const {
    buildApprovalTimelineRawEntries,
    isResubmitAudit,
    AUTO_POSTED_ACTOR,
} = require('./approvalTimeline.builder');

/** GRN workflow stepNumber → canonical stageKey (ACC chain order). */
const GRN_STEP_STAGE = Object.freeze({
    1: 'COST_CONTROL',
    2: 'FINANCE',
});

function stageKeyForStep(stepNumber) {
    return GRN_STEP_STAGE[stepNumber] || `STEP_${stepNumber}`;
}

function completedApprovalEntry(cycleNumber, step, stepNumber) {
    const stageKey = stageKeyForStep(stepNumber);
    return {
        cycleNumber,
        entryType: 'APPROVAL_STEP_COMPLETED',
        stageKey,
        displayTitleKey: resolveDisplayTitleKey({
            stageKey,
            entryType: 'APPROVAL_STEP_COMPLETED',
            status: 'COMPLETED',
        }),
        status: 'COMPLETED',
        actor: step.actedByUser ? { id: step.actedBy, name: userDisplayName(step.actedByUser) } : null,
        actedAt: toIso(step.actedAt),
        reason: null,
        note: step.comment || null,
        stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
    };
}

function currentApprovalEntry(cycleNumber, step, stepNumber) {
    const stageKey = stageKeyForStep(stepNumber);
    return {
        cycleNumber,
        entryType: 'APPROVAL_STEP_CURRENT',
        stageKey,
        displayTitleKey: resolveDisplayTitleKey({
            stageKey,
            entryType: 'APPROVAL_STEP_CURRENT',
            status: 'IN_PROGRESS',
        }),
        status: 'IN_PROGRESS',
        actor: null,
        actedAt: null,
        stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
    };
}

function futureApprovalEntry(cycleNumber, step, stepNumber) {
    const stageKey = stageKeyForStep(stepNumber);
    return {
        cycleNumber,
        entryType: 'APPROVAL_STEP_FUTURE',
        stageKey,
        displayTitleKey: resolveDisplayTitleKey({
            stageKey,
            entryType: 'APPROVAL_STEP_FUTURE',
            status: 'PENDING',
        }),
        status: 'PENDING',
        actor: null,
        actedAt: null,
        stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
    };
}

function milestoneReceivedValidated(grn) {
    return {
        cycleNumber: 1,
        entryType: 'MILESTONE_COMPLETED',
        stageKey: 'RECEIVED_VALIDATED',
        displayTitleKey: resolveDisplayTitleKey({
            stageKey: 'RECEIVED_VALIDATED',
            entryType: 'MILESTONE_COMPLETED',
            status: 'COMPLETED',
        }),
        status: 'COMPLETED',
        actor: grn.importedByUser ? { id: grn.importedBy, name: userDisplayName(grn.importedByUser) } : null,
        actedAt: toIso(grn.createdAt),
        stepNumber: 0,
    };
}

function extractAuditNoteBody(note) {
    if (!note || typeof note !== 'string') return null;
    const parts = note.split(' | ');
    return parts.length > 1 ? parts.slice(1).join(' | ') : note;
}

function lifecycleFromAudit(audit, cycleNumber, lifecycleEventType) {
    const key =
        lifecycleEventType === 'RESUBMIT' ? 'TIMELINE.LIFECYCLE.RESUBMIT' : 'TIMELINE.LIFECYCLE.SEND_BACK';
    const after = audit.afterValue && typeof audit.afterValue === 'object' ? audit.afterValue : {};
    return {
        cycleNumber: lifecycleEventType === 'RESUBMIT' ? after.newCycleNumber ?? cycleNumber : cycleNumber,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: key,
        status: 'COMPLETED',
        lifecycleEventType,
        actor: audit.changedByUser ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) } : null,
        actedAt: toIso(audit.changedAt),
        reason: lifecycleEventType === 'SEND_BACK' ? extractAuditNoteBody(audit.note) : null,
        previousCycleNumber: after.previousCycleNumber ?? null,
        newCycleNumber: after.newCycleNumber ?? null,
        stepNumber: 0,
        sourceRef: { auditLogId: audit.id },
    };
}

function constitutionalAuditsForActiveRequest(auditEvents, activeRequestId) {
    return auditEvents.filter((a) => {
        const action = String(a.action || '').toUpperCase();
        const after = a.afterValue && typeof a.afterValue === 'object' ? a.afterValue : {};
        if (action === 'SEND_BACK') {
            if (after.approvalRequestId && activeRequestId) {
                return after.approvalRequestId === activeRequestId;
            }
            return String(a.note || '').includes('WORKFLOW_SEND_BACK');
        }
        if (action === 'SUBMIT') {
            if (typeof a.note === 'string' && a.note.startsWith('GRN_RESUBMIT')) return false;
            return isResubmitAudit(a);
        }
        if (action === 'REJECT') return true;
        return false;
    });
}

function postingEntry(grn) {
    return {
        cycleNumber: Math.max(1, grn._maxCycleNumber || 1),
        entryType: 'POSTING',
        stageKey: 'POSTED',
        displayTitleKey: resolveDisplayTitleKey({
            stageKey: 'POSTED',
            entryType: 'POSTING',
            status: 'POSTED',
        }),
        status: 'POSTED',
        actor: AUTO_POSTED_ACTOR,
        actedAt: toIso(grn.postedAt),
        stepNumber: 99,
    };
}

/**
 * Build raw timeline entries from GRN + approval history + explicit lifecycle audits.
 * Does not mutate legacy workflowSlots / auditEvents.
 *
 * @param {object} grn — with importedByUser, postedByUser, approvalRequest, approvalHistory
 * @param {object[]} auditEvents — ordered asc by changedAt
 * @returns {import('./timelineEntry.types').TimelineEntry[]}
 */
function buildGrnTimelineRawEntries(grn, auditEvents = []) {
    const entries = [];
    const active = grn.approvalRequest || null;
    const history = (grn.approvalHistory || []).filter((r) => !active || r.id !== active.id);
    const allRequests = [...history];
    if (active && !allRequests.some((r) => r.id === active.id)) {
        allRequests.push(active);
    }
    allRequests.sort((a, b) => (a.cycleNumber || 1) - (b.cycleNumber || 1));

    const maxCycle = allRequests.reduce((m, r) => Math.max(m, r.cycleNumber || 1), 1);
    grn._maxCycleNumber = maxCycle;

    entries.push(milestoneReceivedValidated(grn));

    const sendBackAudits = auditEvents.filter((a) => a.action === 'SEND_BACK');
    const resubmitAudits = auditEvents.filter(
        (a) => a.action === 'SUBMIT' && typeof a.note === 'string' && a.note.startsWith('GRN_RESUBMIT'),
    );

    for (const request of allRequests) {
        const cycle = request.cycleNumber || 1;
        const steps = [...(request.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);
        const isActive = active && request.id === active.id;
        const isCancelled = request.status === 'CANCELLED';
        const isClosed = request.status === 'APPROVED' || isCancelled;

        if (isActive && request.status === 'PENDING') {
            const constitutionalAudits = constitutionalAuditsForActiveRequest(auditEvents, request.id);
            entries.push(
                ...buildApprovalTimelineRawEntries(request, {
                    auditEvents: constitutionalAudits,
                    includePosting: false,
                }),
            );
            continue;
        }

        if (isActive && (request.status === 'APPROVED' || request.status === 'REJECTED')) {
            for (const step of steps) {
                step.requestId = request.id;
                if (step.status === 'APPROVED') {
                    entries.push(completedApprovalEntry(cycle, step, step.stepNumber));
                }
            }
            continue;
        }

        for (const step of steps) {
            step.requestId = request.id;
            if (step.status === 'APPROVED') {
                entries.push(completedApprovalEntry(cycle, step, step.stepNumber));
            } else if (isActive && step.status === 'PENDING' && step.stepNumber === request.currentStep) {
                entries.push(currentApprovalEntry(cycle, step, step.stepNumber));
            } else if (isActive && step.status === 'PENDING' && step.stepNumber > request.currentStep) {
                entries.push(futureApprovalEntry(cycle, step, step.stepNumber));
            } else if (isClosed && step.status === 'PENDING' && isCancelled) {
                // cancelled cycle — skip future pending steps
            }
        }

        if (isCancelled) {
            const sb = sendBackAudits.find((a) => {
                const t = new Date(a.changedAt).getTime();
                const start = new Date(request.createdAt).getTime();
                const end = request.resolvedAt ? new Date(request.resolvedAt).getTime() : Number.MAX_SAFE_INTEGER;
                return t >= start && t <= end + 60_000;
            });
            if (sb) {
                entries.push(lifecycleFromAudit(sb, cycle, 'SEND_BACK'));
            }
        }
    }

    for (const rs of resubmitAudits) {
        const after = rs.afterValue && typeof rs.afterValue === 'object' ? rs.afterValue : {};
        entries.push(lifecycleFromAudit(rs, after.newCycleNumber || 1, 'RESUBMIT'));
    }

    if (grn.status === 'POSTED' && grn.postedAt) {
        entries.push(postingEntry(grn));
    }

    return entries;
}

module.exports = {
    buildGrnTimelineRawEntries,
    stageKeyForStep,
    GRN_STEP_STAGE,
    constitutionalAuditsForActiveRequest,
};
