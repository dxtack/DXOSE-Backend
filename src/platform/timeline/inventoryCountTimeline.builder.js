'use strict';

const { buildApprovalTimelineRawEntries } = require('./approvalTimeline.builder');
const { resolveDisplayTitleKey } = require('./timelineEntry.i18n-keys');
const { userDisplayName, toIso } = require('../../utils/timeline-present.util');

const SUBMIT_COUNTS_NOTE = 'INVENTORY_COUNT_SUBMIT_COUNTS';
const SUBMIT_APPROVAL_NOTE = 'INVENTORY_COUNT_SUBMIT_FOR_APPROVAL';
const RECOUNT_NOTE = 'INVENTORY_COUNT_RECOUNT_REQUESTED';
const POST_NOTE = 'INVENTORY_COUNT_POSTED';
const SEND_BACK_NOTE = 'INVENTORY_COUNT_SEND_BACK';
const CANCEL_NOTE = 'INVENTORY_COUNT_CANCELLED';
const CREATED_NOTE = 'INVENTORY_COUNT_CREATED_BY';

function actorFromUser(user, id) {
    if (!user?.id && !id) return null;
    return { id: user?.id || id, name: userDisplayName(user) || 'Unknown' };
}

function findAuditByNote(auditEvents, fragment) {
    return auditEvents.find((a) => String(a.note || '').includes(fragment)) ?? null;
}

function findAllAuditsByNote(auditEvents, fragment) {
    return auditEvents.filter((a) => String(a.note || '').includes(fragment));
}

function countSubmitMilestone(roundNo, audit, stepBase = 1) {
    return {
        cycleNumber: roundNo,
        entryType: 'MILESTONE_COMPLETED',
        stageKey: 'COUNT_SUBMITTED',
        displayTitleKey: 'TIMELINE.STAGE.COUNT_SUBMITTED_COMPLETED',
        status: 'COMPLETED',
        actor: audit?.changedByUser
            ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
            : null,
        actedAt: toIso(audit?.changedAt),
        note: roundNo > 1 ? `Round ${roundNo}` : null,
        stepNumber: stepBase + roundNo - 1,
        sourceRef: audit ? { auditLogId: audit.id, roundNo } : { roundNo },
    };
}

function recountLifecycleEntry(audit, stepNumber) {
    return {
        cycleNumber: 1,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: 'TIMELINE.LIFECYCLE.RECOUNT',
        status: 'COMPLETED',
        lifecycleEventType: 'RECOUNT',
        actor: audit?.changedByUser
            ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
            : null,
        actedAt: toIso(audit?.changedAt),
        stepNumber,
        sourceRef: audit ? { auditLogId: audit.id } : {},
    };
}

function varianceReviewMilestone(session, submitCountsAudits, stepNumber) {
    const firstSubmit = submitCountsAudits[0] ?? null;
    const terminal = session.status === 'VOID' || session.status === 'POSTED';
    const pastReveal = terminal || !['DRAFT', 'COUNTING', 'RECOUNTING'].includes(session.status);
    const inReveal = !terminal && session.status === 'REVEAL_REVIEW';
    return {
        cycleNumber: 1,
        entryType: inReveal ? 'MILESTONE_COMPLETED' : pastReveal ? 'MILESTONE_COMPLETED' : 'APPROVAL_STEP_FUTURE',
        stageKey: 'VARIANCE_REVIEW',
        displayTitleKey: inReveal || pastReveal
            ? 'TIMELINE.STAGE.VARIANCE_REVIEW_COMPLETED'
            : 'TIMELINE.STAGE.VARIANCE_REVIEW_APPROVAL',
        status: inReveal ? 'IN_PROGRESS' : pastReveal ? 'COMPLETED' : 'PENDING',
        actor: null,
        actedAt: toIso(firstSubmit?.changedAt),
        stepNumber,
        sourceRef: firstSubmit ? { auditLogId: firstSubmit.id } : { sessionId: session.id },
    };
}

const AUTO_POSTED_ACTOR = Object.freeze({ id: 'system:dx-auto-post', name: 'Auto posted by DX' });

function cancelLifecycleEntry(audit, stepNumber) {
    return {
        cycleNumber: 1,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: 'TIMELINE.LIFECYCLE.CANCEL',
        status: 'COMPLETED',
        lifecycleEventType: 'CANCEL',
        actor: audit?.changedByUser
            ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
            : null,
        actedAt: toIso(audit?.changedAt),
        stepNumber,
        sourceRef: audit ? { auditLogId: audit.id } : {},
    };
}

function postingEntryFromSession(session, postAudit) {
    return {
        cycleNumber: 1,
        entryType: 'POSTING',
        stageKey: 'POSTED',
        displayTitleKey: 'TIMELINE.STAGE.POSTED_COMPLETED',
        status: 'POSTED',
        actor: AUTO_POSTED_ACTOR,
        actedAt: toIso(session.postedAt || postAudit?.changedAt),
        stepNumber: 99,
        sourceRef: postAudit
            ? { auditLogId: postAudit.id, sessionId: session.id }
            : { sessionId: session.id, milestone: 'POSTED' },
    };
}

/**
 * Build unified timeline entries for Inventory Count sessions.
 *
 * @param {object} session — StockCountSession with approvalRequest + users
 * @param {object[]} auditEvents — STOCK_COUNT audit rows asc
 * @param {object} [options]
 * @param {number[]} [options.roundNumbers] — distinct roundNo values with counts
 * @returns {import('./timelineEntry.types').TimelineEntry[]}
 */
function buildInventoryCountTimelineRawEntries(session, auditEvents = [], options = {}) {
    if (!session) return [];

    const entries = [];
    const submitCountAudits = findAllAuditsByNote(auditEvents, SUBMIT_COUNTS_NOTE);
    const recountAudits = findAllAuditsByNote(auditEvents, RECOUNT_NOTE);
    const roundNumbers =
        options.roundNumbers?.length
            ? [...options.roundNumbers].sort((a, b) => a - b)
            : submitCountAudits.length
              ? submitCountAudits.map((_, i) => i + 1)
              : [session.currentRound || 1];

    let stepCursor = 1;
    for (let i = 0; i < roundNumbers.length; i++) {
        const roundNo = roundNumbers[i];
        if (i > 0 && recountAudits[i - 1]) {
            entries.push(recountLifecycleEntry(recountAudits[i - 1], stepCursor++));
        } else if (i > 0) {
            entries.push(recountLifecycleEntry(null, stepCursor++));
        }
        const submitAudit = submitCountAudits[i] ?? submitCountAudits[submitCountAudits.length - 1] ?? null;
        if (submitAudit || roundNo <= (session.currentRound || 1)) {
            entries.push(countSubmitMilestone(roundNo, submitAudit, stepCursor));
            stepCursor += 1;
        }
    }

    const hasSubmittedCounts =
        submitCountAudits.length > 0 ||
        !['DRAFT', 'COUNTING'].includes(session.status);
    if (hasSubmittedCounts) {
        entries.push(varianceReviewMilestone(session, submitCountAudits, stepCursor++));
    }

    const submitApprovalAudit = findAuditByNote(auditEvents, SUBMIT_APPROVAL_NOTE);
    const approvalRequest = session.approvalRequest;
    const rejectionReason =
        session.status === 'REJECTED' ? session.notes?.split('Rejected:').pop()?.trim() || null : null;

    const approvalPhaseAudits = auditEvents.filter((a) => {
        const note = String(a.note || '');
        const action = String(a.action || '').toUpperCase();
        if (note.includes(SUBMIT_APPROVAL_NOTE)) return true;
        if (note.includes(SEND_BACK_NOTE)) return true;
        if (note.includes(CANCEL_NOTE) || note.includes(CREATED_NOTE)) return true;
        if (action === 'COUNT_APPROVE' || action === 'COUNT_REJECT' || action === 'SEND_BACK' || action === 'CANCEL') {
            return true;
        }
        return false;
    });

    if (submitApprovalAudit) {
        approvalPhaseAudits.unshift(submitApprovalAudit);
    }

    const approvalEntries = buildApprovalTimelineRawEntries(approvalRequest, {
        auditEvents: approvalPhaseAudits,
        rejectionReason,
        postedAt: null,
        includePosting: false,
        documentStatus: session.status,
    });

    for (const entry of approvalEntries) {
        entries.push({ ...entry, stepNumber: (entry.stepNumber || 0) + stepCursor });
    }
    stepCursor += approvalEntries.length;

    if (session.status === 'POSTED' && session.postedAt) {
        const postAudit =
            findAuditByNote(auditEvents, POST_NOTE) ||
            auditEvents.find((a) => String(a.action || '').toUpperCase() === 'POST') ||
            null;
        entries.push(postingEntryFromSession(session, postAudit));
    }

    if (session.status === 'VOID') {
        const cancelAudit =
            findAuditByNote(auditEvents, CANCEL_NOTE) ||
            auditEvents.find((a) => String(a.action || '').toUpperCase() === 'CANCEL') ||
            null;
        if (cancelAudit) {
            entries.push(cancelLifecycleEntry(cancelAudit, stepCursor));
        }
    }

    return entries;
}

module.exports = {
    buildInventoryCountTimelineRawEntries,
    SUBMIT_COUNTS_NOTE,
    SUBMIT_APPROVAL_NOTE,
    RECOUNT_NOTE,
    POST_NOTE,
    AUTO_POSTED_ACTOR,
};
