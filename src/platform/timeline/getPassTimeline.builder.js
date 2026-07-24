'use strict';

const { resolveDisplayTitleKey } = require('./timelineEntry.i18n-keys');

const GET_PASS_APPROVAL_STEPS = Object.freeze([
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
    {
        stepNumber: 3,
        stageKey: 'FINANCE',
        approvedAtField: 'financeApprovedAt',
        approverField: 'financeApprover',
        pendingStatus: 'PENDING_FINANCE',
    },
    {
        stepNumber: 4,
        stageKey: 'GENERAL_MANAGER',
        approvedAtField: 'gmApprovedAt',
        approverField: 'gmApprover',
        pendingStatus: 'PENDING_GM',
    },
    {
        stepNumber: 5,
        stageKey: 'SECURITY',
        approvedAtField: 'securityApprovedAt',
        approverField: 'securityApprover',
        pendingStatus: 'PENDING_SECURITY',
    },
]);

const STAGE_KEY_BY_PENDING_STATUS = Object.freeze({
    PENDING_DEPT: 'DEPT',
    PENDING_COST_CONTROL: 'COST_CONTROL',
    PENDING_FINANCE: 'FINANCE',
    PENDING_GM: 'GENERAL_MANAGER',
    PENDING_SECURITY: 'SECURITY',
});

const FIELD_BY_PENDING_STATUS = Object.freeze({
    PENDING_DEPT: { approvedAtField: 'deptApprovedAt', approverField: 'deptApprover' },
    PENDING_COST_CONTROL: { approvedAtField: 'costControlApprovedAt', approverField: 'costControlApprover' },
    PENDING_FINANCE: { approvedAtField: 'financeApprovedAt', approverField: 'financeApprover' },
    PENDING_GM: { approvedAtField: 'gmApprovedAt', approverField: 'gmApprover' },
    PENDING_SECURITY: { approvedAtField: 'securityApprovedAt', approverField: 'securityApprover' },
});

function buildApprovalStepsFromAccChain(accSteps) {
    if (!Array.isArray(accSteps) || accSteps.length === 0) return GET_PASS_APPROVAL_STEPS;
    const mapped = accSteps
        .map((s, i) => {
            const pendingStatus = String(s.statusKey || '').trim().toUpperCase();
            const fields = FIELD_BY_PENDING_STATUS[pendingStatus];
            if (!fields) return null;
            return {
                stepNumber: s.stepOrder ?? i + 1,
                stageKey: STAGE_KEY_BY_PENDING_STATUS[pendingStatus] || pendingStatus.replace(/^PENDING_/, ''),
                pendingStatus,
                ...fields,
            };
        })
        .filter(Boolean);
    return mapped.length ? mapped : GET_PASS_APPROVAL_STEPS;
}

function resolveApprovalSteps(options = {}) {
    return options.approvalSteps?.length ? options.approvalSteps : GET_PASS_APPROVAL_STEPS;
}

/** Issuing-hotel approval chain — default when no pinned ACC version steps supplied. */
const POST_APPROVAL_STATUSES = Object.freeze(
    new Set([
        'APPROVED',
        'OUT',
        'RECEIVED_AT_DESTINATION',
        'RETURNING',
        'RETURN_RECEIVED_AT_GATE',
        'PARTIALLY_RETURNED',
        'RETURNED',
        'PENDING_FORCE_CLOSE_SETTLEMENT',
        'CLOSED',
    ]),
);

const OPERATIONAL_AUDIT_NOTES = Object.freeze({
    GET_PASS_CONFIRM_RECEIPT_DESTINATION: 'DESTINATION_RECEIPT',
    GET_PASS_ACCEPT_DESTINATION_DEPARTMENT: 'DESTINATION_DEPT_ACCEPT',
    GET_PASS_SHIP_BACK: 'RETURN_SHIP_BACK',
    GET_PASS_CONFIRM_RETURN_EXIT: 'RETURN_EXIT',
    GET_PASS_CONFIRM_RETURN_ARRIVAL: 'RETURN_ARRIVAL',
    GET_PASS_ACCEPT_RETURN_DEPARTMENT: 'RETURN_DEPT_ACCEPT',
    // GET_PASS_PROCESS_RETURN handled separately — one timeline row per return event
    GET_PASS_CLOSE: 'CLOSED',
});

const PROCESS_RETURN_AUDIT_NOTE = 'GET_PASS_PROCESS_RETURN';

const { userDisplayName, toIso } = require('../../utils/timeline-present.util');
const {
    sendBackLifecycleFromAudit,
    resubmitLifecycleFromAudit,
    isResubmitAudit,
    creatorPendingEntry,
    stageKeyForStep,
    postingEntry,
} = require('./approvalTimeline.builder');

function workflowActiveIndex(status, steps = GET_PASS_APPROVAL_STEPS) {
    if (status === 'DRAFT') return 0;
    const idx = steps.findIndex((s) => s.pendingStatus === status);
    if (idx >= 0) return idx;
    switch (status) {
        case 'PENDING_DEPT':
            return 0;
        case 'PENDING_COST_CONTROL':
            return 1;
        case 'PENDING_FINANCE':
            return 2;
        case 'PENDING_GM':
            return steps.findIndex((s) => s.pendingStatus === 'PENDING_GM');
        case 'PENDING_SECURITY':
            return steps.findIndex((s) => s.pendingStatus === 'PENDING_SECURITY');
        default:
            return POST_APPROVAL_STATUSES.has(status) ? steps.length : 0;
    }
}

function rejectionErrorStepIndex(gp, steps = GET_PASS_APPROVAL_STEPS) {
    for (let i = 0; i < steps.length; i++) {
        if (!gp[steps[i].approvedAtField]) return i;
    }
    return steps.length;
}

function actorFromUser(user) {
    if (!user?.id && !userDisplayName(user)) return null;
    return { id: user.id, name: userDisplayName(user) || 'Unknown' };
}

/** Live pending steps belong to the highest Send Back / Resubmit round present. */
function resolveLiveCycleNumber(auditEvents = []) {
    let max = 1;
    for (const audit of auditEvents) {
        const action = String(audit.action || '').toUpperCase();
        const after = audit?.afterValue && typeof audit.afterValue === 'object' ? audit.afterValue : {};
        if (action === 'SEND_BACK') {
            const round = Number(after.workflowRound);
            max = Math.max(max, Number.isFinite(round) && round > 0 ? round : max);
        } else if (isResubmitAudit(audit)) {
            const round = Number(after.workflowRound ?? after.newCycleNumber);
            max = Math.max(max, Number.isFinite(round) && round > 0 ? round : max + 1);
        }
    }
    return max;
}

/** Historical approvals before the Nth Send Back stay in cycle N. */
function cycleNumberForActedAt(actedAt, auditEvents = []) {
    if (!actedAt) return 1;
    const ms = new Date(actedAt).getTime();
    if (Number.isNaN(ms)) return 1;
    let cycle = 1;
    for (const audit of auditEvents) {
        if (String(audit.action || '').toUpperCase() !== 'SEND_BACK') continue;
        const at = new Date(audit.changedAt).getTime();
        if (!Number.isNaN(at) && at < ms) cycle += 1;
    }
    return cycle;
}

const STAGE_STAMP_FIELDS = Object.freeze({
    DEPT: { approvedAtField: 'deptApprovedAt', approverField: 'deptApprover' },
    COST_CONTROL: { approvedAtField: 'costControlApprovedAt', approverField: 'costControlApprover' },
    FINANCE: { approvedAtField: 'financeApprovedAt', approverField: 'financeApprover' },
    GENERAL_MANAGER: { approvedAtField: 'gmApprovedAt', approverField: 'gmApprover' },
    SECURITY: { approvedAtField: 'securityApprovedAt', approverField: 'securityApprover' },
});

function completedApprovalEntryFromRequestStep(step, cycleNumber = 1) {
    const stageKey = stageKeyForStep(step);
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
        stepNumber: step.stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
    };
}

function currentApprovalEntryFromRequestStep(step, cycleNumber = 1) {
    const stageKey = stageKeyForStep(step);
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
        stepNumber: step.stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
    };
}

function futureApprovalEntryFromRequestStep(step, cycleNumber = 1) {
    const stageKey = stageKeyForStep(step);
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
        stepNumber: step.stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
    };
}

/** Recover cleared AR approvals from document stamps so Send Back does not erase history. */
function completedApprovalEntryFromStamp(stageKey, stepNumber, gp, cycleNumber) {
    const fields = STAGE_STAMP_FIELDS[stageKey];
    if (!fields) return null;
    const actedAt = gp[fields.approvedAtField];
    if (!actedAt) return null;
    const approver = gp[fields.approverField];
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
        actor: actorFromUser(approver),
        actedAt: toIso(actedAt),
        stepNumber,
        sourceRef: { getPassId: gp.id, approvalStepKey: stageKey, historical: true },
    };
}

/** Map GET_PASS APPROVE audit note → stage / step. */
function resolveStageFromApproveNote(note, approvalSteps = GET_PASS_APPROVAL_STEPS) {
    const n = String(note || '');
    if (n === 'GET_PASS_APPROVE_PENDING_SECURITY' || /APPROVE.*PENDING_SECURITY/.test(n)) {
        const step = approvalSteps.find((s) => s.pendingStatus === 'PENDING_SECURITY');
        return {
            stageKey: 'SECURITY',
            stepNumber: step?.stepNumber ?? 5,
            pendingStatus: 'PENDING_SECURITY',
        };
    }
    const match = n.match(/GET_PASS_APPROVE_STEP:(PENDING_[A-Z0-9_]+)/i);
    if (!match) return null;
    const pendingStatus = String(match[1]).toUpperCase();
    const stageKey = STAGE_KEY_BY_PENDING_STATUS[pendingStatus];
    if (!stageKey) return null;
    const step = approvalSteps.find((s) => s.pendingStatus === pendingStatus);
    return {
        stageKey,
        stepNumber: step?.stepNumber ?? 0,
        pendingStatus,
    };
}

/**
 * Immutable approval history from APPROVE audits — survives Send Back + Resubmit
 * (stamps/AR only keep the latest pass).
 */
function buildCompletedApprovalsFromApproveAudits(auditEvents, approvalSteps, gp) {
    const entries = [];
    for (const audit of auditEvents) {
        if (String(audit.action || '').toUpperCase() !== 'APPROVE') continue;
        const resolved = resolveStageFromApproveNote(audit.note, approvalSteps);
        if (!resolved) continue;
        entries.push({
            cycleNumber: cycleNumberForActedAt(audit.changedAt, auditEvents),
            entryType: 'APPROVAL_STEP_COMPLETED',
            stageKey: resolved.stageKey,
            displayTitleKey: resolveDisplayTitleKey({
                stageKey: resolved.stageKey,
                entryType: 'APPROVAL_STEP_COMPLETED',
                status: 'COMPLETED',
            }),
            status: 'COMPLETED',
            actor: audit.changedByUser
                ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
                : null,
            actedAt: toIso(audit.changedAt),
            stepNumber: resolved.stepNumber,
            sourceRef: { auditLogId: audit.id, getPassId: gp?.id, approvalStepKey: resolved.stageKey },
        });
    }
    return entries;
}

function hasGetPassApproveAuditHistory(auditEvents) {
    return auditEvents.some(
        (a) =>
            String(a.action || '').toUpperCase() === 'APPROVE' &&
            resolveStageFromApproveNote(a.note),
    );
}

function buildApprovalChainFromRequest(approvalRequest, options = {}) {
    if (!approvalRequest?.steps?.length) return [];
    const status = String(approvalRequest.status || '').toUpperCase();
    const steps = [...approvalRequest.steps].sort((a, b) => a.stepNumber - b.stepNumber);
    const liveCycle = options.liveCycleNumber || 1;
    const auditEvents = options.auditEvents || [];
    const gp = options.getPass || null;
    const omitCompleted = options.omitCompleted === true;
    const entries = [];

    if (status === 'REJECTED') {
        if (!omitCompleted) {
            for (const step of steps) {
                step.requestId = approvalRequest.id;
                const stepStatus = String(step.status || '').toUpperCase();
                if (stepStatus === 'APPROVED') {
                    entries.push(
                        completedApprovalEntryFromRequestStep(
                            step,
                            cycleNumberForActedAt(step.actedAt, auditEvents),
                        ),
                    );
                } else if (stepStatus === 'REJECTED') {
                    break;
                }
            }
        }
        return entries;
    }

    if (status === 'PENDING') {
        if (Number(approvalRequest.currentStep) === 0) {
            entries.push(creatorPendingEntry(liveCycle));
        }
        for (const step of steps) {
            step.requestId = approvalRequest.id;
            const stepStatus = String(step.status || '').toUpperCase();
            if (stepStatus === 'APPROVED') {
                if (!omitCompleted) {
                    entries.push(
                        completedApprovalEntryFromRequestStep(
                            step,
                            cycleNumberForActedAt(step.actedAt, auditEvents),
                        ),
                    );
                }
            } else if (stepStatus === 'PENDING') {
                if (!omitCompleted && gp) {
                    const stageKey = stageKeyForStep(step);
                    const historical = completedApprovalEntryFromStamp(
                        stageKey,
                        step.stepNumber,
                        gp,
                        cycleNumberForActedAt(gp[STAGE_STAMP_FIELDS[stageKey]?.approvedAtField], auditEvents),
                    );
                    if (historical) entries.push(historical);
                }
                if (step.stepNumber === approvalRequest.currentStep && approvalRequest.currentStep > 0) {
                    entries.push(currentApprovalEntryFromRequestStep(step, liveCycle));
                } else if (step.stepNumber > approvalRequest.currentStep) {
                    entries.push(futureApprovalEntryFromRequestStep(step, liveCycle));
                }
            }
        }
        return entries;
    }

    if (!omitCompleted) {
        for (const step of steps) {
            step.requestId = approvalRequest.id;
            if (String(step.status || '').toUpperCase() === 'APPROVED') {
                entries.push(
                    completedApprovalEntryFromRequestStep(
                        step,
                        cycleNumberForActedAt(step.actedAt, auditEvents),
                    ),
                );
            }
        }
    }
    return entries;
}

function completedApprovalEntry(stepDef, gp, cycleNumber = 1) {
    const approver = gp[stepDef.approverField];
    return {
        cycleNumber,
        entryType: 'APPROVAL_STEP_COMPLETED',
        stageKey: stepDef.stageKey,
        displayTitleKey: resolveDisplayTitleKey({
            stageKey: stepDef.stageKey,
            entryType: 'APPROVAL_STEP_COMPLETED',
            status: 'COMPLETED',
        }),
        status: 'COMPLETED',
        actor: actorFromUser(approver),
        actedAt: toIso(gp[stepDef.approvedAtField]),
        stepNumber: stepDef.stepNumber,
        sourceRef: { getPassId: gp.id, approvalStepKey: stepDef.stageKey },
    };
}

function currentApprovalEntry(stepDef, cycleNumber = 1) {
    return {
        cycleNumber,
        entryType: 'APPROVAL_STEP_CURRENT',
        stageKey: stepDef.stageKey,
        displayTitleKey: resolveDisplayTitleKey({
            stageKey: stepDef.stageKey,
            entryType: 'APPROVAL_STEP_CURRENT',
            status: 'IN_PROGRESS',
        }),
        status: 'IN_PROGRESS',
        actor: null,
        actedAt: null,
        stepNumber: stepDef.stepNumber,
        sourceRef: { getPassId: null, approvalStepKey: stepDef.stageKey },
    };
}

function futureApprovalEntry(stepDef, cycleNumber = 1) {
    return {
        cycleNumber,
        entryType: 'APPROVAL_STEP_FUTURE',
        stageKey: stepDef.stageKey,
        displayTitleKey: resolveDisplayTitleKey({
            stageKey: stepDef.stageKey,
            entryType: 'APPROVAL_STEP_FUTURE',
            status: 'PENDING',
        }),
        status: 'PENDING',
        actor: null,
        actedAt: null,
        stepNumber: stepDef.stepNumber,
        sourceRef: { getPassId: null, approvalStepKey: stepDef.stageKey },
    };
}

function extractAuditNoteBody(note) {
    if (!note || typeof note !== 'string') return null;
    const parts = note.split(' | ');
    return parts.length > 1 ? parts.slice(1).join(' | ') : note;
}

function lifecycleFromAudit(audit, lifecycleEventType) {
    const key =
        lifecycleEventType === 'RESUBMIT' ? 'TIMELINE.LIFECYCLE.RESUBMIT' : 'TIMELINE.LIFECYCLE.SEND_BACK';
    return {
        cycleNumber: 1,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: key,
        status: 'COMPLETED',
        lifecycleEventType,
        actor: audit.changedByUser
            ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
            : null,
        actedAt: toIso(audit.changedAt),
        reason: lifecycleEventType === 'SEND_BACK' ? extractAuditNoteBody(audit.note) : null,
        stepNumber: 0,
        sourceRef: { auditLogId: audit.id },
    };
}

function submitLifecycleFromAudit(audit) {
    return {
        cycleNumber: 1,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: 'TIMELINE.LIFECYCLE.SUBMIT_FOR_APPROVAL',
        status: 'COMPLETED',
        lifecycleEventType: 'SUBMIT_FOR_APPROVAL',
        actor: audit.changedByUser
            ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
            : null,
        actedAt: toIso(audit.changedAt),
        stepNumber: 0,
        sourceRef: { auditLogId: audit.id },
    };
}

function rejectLifecycleEntry(gp, auditEvents, steps = GET_PASS_APPROVAL_STEPS) {
    const rejectStepIdx = rejectionErrorStepIndex(gp, steps);
    const stepDef = steps[rejectStepIdx] || steps[0];
    const rejectAudit = auditEvents.find((a) => a.action === 'REJECT');
    const reason = typeof gp.rejectionReason === 'string' ? gp.rejectionReason.trim() : null;
    return {
        cycleNumber: 1,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: stepDef.stageKey,
        displayTitleKey: 'TIMELINE.LIFECYCLE.REJECT',
        status: 'REJECTED',
        lifecycleEventType: 'REJECT',
        actor: rejectAudit?.changedByUser
            ? { id: rejectAudit.changedBy, name: userDisplayName(rejectAudit.changedByUser) }
            : null,
        actedAt: toIso(rejectAudit?.changedAt || gp.updatedAt),
        reason: reason || null,
        stepNumber: stepDef.stepNumber,
        sourceRef: rejectAudit ? { auditLogId: rejectAudit.id } : { getPassId: gp.id },
    };
}

function milestoneEntry(stageKey, actor, actedAt, { note = null, reason = null, sourceRef = {}, stepNumber = 90 } = {}) {
    return {
        cycleNumber: 1,
        entryType: 'MILESTONE_COMPLETED',
        stageKey,
        displayTitleKey: resolveDisplayTitleKey({
            stageKey,
            entryType: 'MILESTONE_COMPLETED',
            status: 'COMPLETED',
        }),
        status: 'COMPLETED',
        actor: actorFromUser(actor),
        actedAt: toIso(actedAt),
        reason,
        note,
        stepNumber,
        sourceRef,
    };
}

function milestoneFromAudit(audit, stageKey, stepNumber = 90) {
    return milestoneEntry(stageKey, audit.changedByUser, audit.changedAt, {
        sourceRef: { auditLogId: audit.id },
        stepNumber,
    });
}

function buildApprovalChainEntries(gp, steps = GET_PASS_APPROVAL_STEPS, options = {}) {
    const status = gp.status;
    const liveCycle = options.liveCycleNumber || 1;
    const auditEvents = options.auditEvents || [];
    const omitCompleted = options.omitCompleted === true;

    if (status === 'REJECTED') {
        if (omitCompleted) return [];
        const entries = [];
        const rejectIdx = rejectionErrorStepIndex(gp, steps);
        for (let i = 0; i < rejectIdx; i++) {
            const step = steps[i];
            if (gp[step.approvedAtField]) {
                entries.push(
                    completedApprovalEntry(
                        step,
                        gp,
                        cycleNumberForActedAt(gp[step.approvedAtField], auditEvents),
                    ),
                );
            }
        }
        return entries;
    }

    const activeIdx = workflowActiveIndex(status, steps);
    const pastChain = POST_APPROVAL_STATUSES.has(status);
    const entries = [];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stamp = gp[step.approvedAtField];
        if (!omitCompleted && stamp) {
            entries.push(
                completedApprovalEntry(step, gp, cycleNumberForActedAt(stamp, auditEvents)),
            );
        }
        if (!pastChain) {
            if (i === activeIdx) {
                entries.push(currentApprovalEntry(step, liveCycle));
            } else if (i > activeIdx) {
                entries.push(futureApprovalEntry(step, liveCycle));
            }
        }
    }
    return entries;
}

function findAuditByNote(auditEvents, note) {
    return auditEvents.find((a) => a.note === note) ?? null;
}

function findAuditsByNote(auditEvents, note) {
    return auditEvents.filter((a) => a.note === note);
}

function resolveProcessReturnStageKey(audit, index, total, gpStatus) {
    const afterStatus = String(audit?.afterValue?.status || '').toUpperCase();
    if (afterStatus === 'RETURNED') return 'RETURN_PROCESSED';
    if (afterStatus === 'PARTIALLY_RETURNED') return 'RETURN_PARTIALLY_PROCESSED';
    // Legacy audits without afterValue: only the last event can be full RETURNED.
    const isLast = index === total - 1;
    if (isLast && String(gpStatus || '').toUpperCase() === 'RETURNED') return 'RETURN_PROCESSED';
    return 'RETURN_PARTIALLY_PROCESSED';
}

function buildProcessReturnMilestoneEntries(gp, auditEvents) {
    const audits = findAuditsByNote(auditEvents, PROCESS_RETURN_AUDIT_NOTE).sort(
        (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    );
    return audits.map((audit, index) => {
        const stageKey = resolveProcessReturnStageKey(audit, index, audits.length, gp.status);
        const entry = milestoneFromAudit(audit, stageKey, 13 + index);
        const returnNotes =
            typeof audit?.afterValue?.returnNotes === 'string' ? audit.afterValue.returnNotes.trim() : '';
        if (returnNotes) entry.note = returnNotes;
        return entry;
    });
}

function buildOperationalMilestoneEntries(gp, auditEvents) {
    const entries = [];
    const usedAuditIds = new Set();

    if (gp.checkedOutAt) {
        entries.push(
            milestoneEntry('SECURITY_OUT', gp.checkoutUser || gp.securityApprover, gp.checkedOutAt, {
                stepNumber: 6,
                sourceRef: { getPassId: gp.id, milestone: 'SECURITY_OUT' },
            }),
        );
    }

    const destReceiptAudit = findAuditByNote(auditEvents, 'GET_PASS_CONFIRM_RECEIPT_DESTINATION');
    if (destReceiptAudit) {
        usedAuditIds.add(destReceiptAudit.id);
        entries.push(
            milestoneFromAudit(destReceiptAudit, 'DESTINATION_RECEIPT', 7),
        );
    } else if (gp.receivedAt && ['RECEIVED_AT_DESTINATION', 'RETURNING', 'RETURN_RECEIVED_AT_GATE', 'CLOSED', 'RETURNED', 'PARTIALLY_RETURNED'].includes(gp.status)) {
        entries.push(
            milestoneEntry('DESTINATION_RECEIPT', gp.receivedBy, gp.receivedAt, {
                note: gp.receivedNotes || null,
                stepNumber: 7,
                sourceRef: { getPassId: gp.id, milestone: 'DESTINATION_RECEIPT' },
            }),
        );
    }

    if (gp.destinationDeptAcceptedAt) {
        entries.push(
            milestoneEntry('DESTINATION_DEPT_ACCEPT', gp.destinationDeptAccepter, gp.destinationDeptAcceptedAt, {
                stepNumber: 8,
                sourceRef: { getPassId: gp.id, milestone: 'DESTINATION_DEPT_ACCEPT' },
            }),
        );
    }

    for (const [auditNote, stageKey] of Object.entries(OPERATIONAL_AUDIT_NOTES)) {
        if (auditNote === 'GET_PASS_CONFIRM_RECEIPT_DESTINATION') continue;
        const audit = findAuditByNote(auditEvents, auditNote);
        if (!audit || usedAuditIds.has(audit.id)) continue;
        usedAuditIds.add(audit.id);
        const stepNum =
            stageKey === 'RETURN_SHIP_BACK'
                ? 9
                : stageKey === 'RETURN_EXIT'
                  ? 10
                  : stageKey === 'RETURN_ARRIVAL'
                    ? 11
                    : stageKey === 'RETURN_DEPT_ACCEPT'
                      ? 12
                      : 14;
        entries.push(milestoneFromAudit(audit, stageKey, stepNum));
    }

    entries.push(...buildProcessReturnMilestoneEntries(gp, auditEvents));

    if (gp.closedAt && !findAuditByNote(auditEvents, 'GET_PASS_CLOSE')) {
        entries.push(
            milestoneEntry('CLOSED', gp.closingUser, gp.closedAt, {
                note: gp.closeReason || null,
                stepNumber: 15,
                sourceRef: { getPassId: gp.id, milestone: 'CLOSED' },
            }),
        );
    }

    if (gp.destinationSecurityExitAt && !findAuditByNote(auditEvents, 'GET_PASS_CONFIRM_RETURN_EXIT')) {
        entries.push(
            milestoneEntry('RETURN_EXIT', gp.destinationSecurityExitUser, gp.destinationSecurityExitAt, {
                stepNumber: 10,
                sourceRef: { getPassId: gp.id, milestone: 'RETURN_EXIT' },
            }),
        );
    }

    return entries;
}

/**
 * Build unified timeline entries for Get Pass (single cycle, no ApprovalRequest).
 *
 * @param {object} gp — GetPass with approver relations + checkout/receipt users
 * @param {object[]} [auditEvents] — asc by changedAt, with changedByUser
 * @returns {import('./timelineEntry.types').TimelineEntry[]}
 */
function buildGetPassTimelineRawEntries(gp, auditEvents = [], options = {}) {
    if (!gp) return [];
    const approvalSteps = resolveApprovalSteps(options);
    const entries = [];
    const liveCycle = resolveLiveCycleNumber(auditEvents);
    const omitCompleted = hasGetPassApproveAuditHistory(auditEvents);

    const submitAudits = auditEvents.filter(
        (a) => String(a.action || '').toUpperCase() === 'SUBMIT' && !isResubmitAudit(a),
    );
    const resubmitAudits = auditEvents.filter((a) => isResubmitAudit(a));
    const sendBackAudits = auditEvents.filter(
        (a) => String(a.action || '').toUpperCase() === 'SEND_BACK',
    );

    const firstSubmit = submitAudits[0];
    if (firstSubmit) {
        entries.push(submitLifecycleFromAudit(firstSubmit));
    }

    // Immutable approval history from APPROVE audits (A approve, …, A resubmit, B approve again…).
    if (omitCompleted) {
        entries.push(...buildCompletedApprovalsFromApproveAudits(auditEvents, approvalSteps, gp));
    }

    const lifecycleAudits = [...sendBackAudits, ...resubmitAudits].sort(
        (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    );
    for (const audit of lifecycleAudits) {
        if (String(audit.action || '').toUpperCase() === 'SEND_BACK') {
            entries.push(sendBackLifecycleFromAudit(audit, 1));
        } else {
            entries.push(resubmitLifecycleFromAudit(audit, liveCycle));
        }
    }

    const approvalRequest = options.approvalRequest || null;
    const chainOptions = {
        liveCycleNumber: liveCycle,
        auditEvents,
        getPass: gp,
        omitCompleted,
    };

    if (gp.status === 'REJECTED') {
        if (approvalRequest) {
            entries.push(...buildApprovalChainFromRequest(approvalRequest, chainOptions));
        } else {
            entries.push(...buildApprovalChainEntries(gp, approvalSteps, chainOptions));
        }
        entries.push(rejectLifecycleEntry(gp, auditEvents, approvalSteps));
        return entries;
    }

    const isSentBackDraft =
        gp.status === 'DRAFT' && String(gp.notes || '').includes('[Send Back]') && resubmitAudits.length === 0;
    if (!isSentBackDraft) {
        if (approvalRequest) {
            entries.push(...buildApprovalChainFromRequest(approvalRequest, chainOptions));
        } else {
            entries.push(...buildApprovalChainEntries(gp, approvalSteps, chainOptions));
        }
    } else {
        if (!omitCompleted) {
            // Returned + no APPROVE audits: fall back to stamps / AR rows.
            if (approvalRequest?.steps?.length) {
                for (const step of [...approvalRequest.steps].sort((a, b) => a.stepNumber - b.stepNumber)) {
                    step.requestId = approvalRequest.id;
                    const stepStatus = String(step.status || '').toUpperCase();
                    if (stepStatus === 'APPROVED') {
                        entries.push(
                            completedApprovalEntryFromRequestStep(
                                step,
                                cycleNumberForActedAt(step.actedAt, auditEvents),
                            ),
                        );
                    } else {
                        const stageKey = stageKeyForStep(step);
                        const historical = completedApprovalEntryFromStamp(
                            stageKey,
                            step.stepNumber,
                            gp,
                            cycleNumberForActedAt(gp[STAGE_STAMP_FIELDS[stageKey]?.approvedAtField], auditEvents),
                        );
                        if (historical) entries.push(historical);
                    }
                }
            } else {
                for (const step of approvalSteps) {
                    if (!gp[step.approvedAtField]) continue;
                    entries.push(
                        completedApprovalEntry(
                            step,
                            gp,
                            cycleNumberForActedAt(gp[step.approvedAtField], auditEvents),
                        ),
                    );
                }
            }
        }
        // Creator desk after Send Back — show pending on A before Resubmit.
        entries.push(creatorPendingEntry(liveCycle));
    }

    if (POST_APPROVAL_STATUSES.has(gp.status)) {
        entries.push(...buildOperationalMilestoneEntries(gp, auditEvents));
    }

    // Terminal return + Posted row (same POSTING entry as Breakage/GRN/Lost).
    const terminalStatus = String(gp.status || '').toUpperCase();
    if (terminalStatus === 'RETURNED' || terminalStatus === 'CLOSED') {
        const hasReturnProcessed = entries.some(
            (e) => String(e.stageKey || '').toUpperCase() === 'RETURN_PROCESSED',
        );
        const returnAudits = findAuditsByNote(auditEvents, PROCESS_RETURN_AUDIT_NOTE);
        const lastReturn = returnAudits.length ? returnAudits[returnAudits.length - 1] : null;
        const terminalAt = gp.closedAt || lastReturn?.changedAt || gp.updatedAt;

        if (!hasReturnProcessed) {
            entries.push(
                milestoneEntry(
                    'RETURN_PROCESSED',
                    lastReturn?.changedByUser || gp.closingUser || null,
                    terminalAt,
                    {
                        stepNumber: 98,
                        sourceRef: { getPassId: gp.id, milestone: 'RETURN_PROCESSED' },
                    },
                ),
            );
        }

        const hasPosted = entries.some(
            (e) => e.entryType === 'POSTING' && String(e.stageKey || '').toUpperCase() === 'POSTED',
        );
        if (!hasPosted) {
            // Sort after every prior stamp (same trick as Breakage/GRN posting append).
            let postedMs = terminalAt ? new Date(terminalAt).getTime() : Date.now();
            if (!Number.isFinite(postedMs)) postedMs = Date.now();
            for (const e of entries) {
                if (!e.actedAt) continue;
                const t = new Date(e.actedAt).getTime();
                if (Number.isFinite(t)) postedMs = Math.max(postedMs, t);
            }
            entries.push(
                postingEntry(
                    1,
                    new Date(postedMs + 1),
                    lastReturn?.changedByUser || gp.closingUser || null,
                    { autoPosted: true },
                ),
            );
        }
    }

    return entries;
}

module.exports = {
    buildGetPassTimelineRawEntries,
    buildApprovalStepsFromAccChain,
    buildApprovalChainFromRequest,
    GET_PASS_APPROVAL_STEPS,
    POST_APPROVAL_STATUSES,
    workflowActiveIndex,
    rejectionErrorStepIndex,
};
