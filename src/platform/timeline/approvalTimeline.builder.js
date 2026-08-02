'use strict';

const { resolveDisplayTitleKey } = require('./timelineEntry.i18n-keys');
const { userDisplayName, toIso } = require('../../utils/timeline-present.util');

/** roleCode → canonical stageKey for unified timeline i18n. */
const ROLE_CODE_TO_STAGE_KEY = Object.freeze({
    DEPT_MANAGER: 'DEPT',
    COST_CONTROL: 'COST_CONTROL',
    COST_CONTROLLER: 'COST_CONTROL',
    FINANCE_MANAGER: 'FINANCE',
    GENERAL_MANAGER: 'GENERAL_MANAGER',
    SECURITY: 'SECURITY',
    STOREKEEPER: 'STOREKEEPER',
    ADMIN: 'ADMIN',
});

function stageKeyForStep(step) {
    const roleCode = step.requiredRole?.code ?? step.requiredRole;
    if (roleCode && ROLE_CODE_TO_STAGE_KEY[roleCode]) {
        return ROLE_CODE_TO_STAGE_KEY[roleCode];
    }
    return `STEP_${step.stepNumber}`;
}

const LEGACY_AUTO_APPROVE_NOTE_RE =
    /^auto-approved by system due to high-level authority\.?$/i;

function sanitizeStepComment(comment) {
    const text = typeof comment === 'string' ? comment.trim() : '';
    if (!text || LEGACY_AUTO_APPROVE_NOTE_RE.test(text)) return null;
    return text;
}

function completedApprovalEntry(cycleNumber, step, stepNumber) {
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
        reason: null,
        note: sanitizeStepComment(step.comment),
        stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
    };
}

function currentApprovalEntry(cycleNumber, step, stepNumber) {
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
        stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
    };
}

function creatorPendingEntry(cycleNumber) {
    return {
        cycleNumber,
        entryType: 'APPROVAL_STEP_CURRENT',
        stageKey: 'CREATOR',
        displayTitleKey: 'TIMELINE.STAGE.CREATOR_PENDING_CORRECTION',
        status: 'IN_PROGRESS',
        actor: null,
        actedAt: null,
        stepNumber: 0,
        sourceRef: {},
    };
}

function futureApprovalEntry(cycleNumber, step, stepNumber) {
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
        stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
    };
}

function rejectLifecycleEntry(cycleNumber, step, stepNumber, documentRejectionReason) {
    const stageKey = stageKeyForStep(step);
    const stepComment = step.comment?.trim() || null;
    const docReason = documentRejectionReason?.trim() || null;
    return {
        cycleNumber,
        entryType: 'LIFECYCLE_EVENT',
        stageKey,
        displayTitleKey: 'TIMELINE.LIFECYCLE.REJECT',
        status: 'REJECTED',
        lifecycleEventType: 'REJECT',
        actor: step.actedByUser ? { id: step.actedBy, name: userDisplayName(step.actedByUser) } : null,
        actedAt: toIso(step.actedAt),
        reason: docReason || stepComment,
        note: docReason && stepComment && docReason !== stepComment ? stepComment : null,
        stepNumber,
        sourceRef: { approvalRequestId: step.requestId, approvalStepId: step.id },
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

function extractWorkflowSendBackMeta(audit) {
    const after = audit?.afterValue && typeof audit.afterValue === 'object' ? audit.afterValue : {};
    return {
        workflowRound: after.workflowRound ?? 1,
        sourceStepNumber: after.sourceStepNumber ?? null,
        sourceStepRole: after.sourceStepRole ?? null,
        targetStepNumber: after.targetStepNumber ?? null,
        targetStepRole: after.targetStepRole ?? null,
        targetType: after.targetType ?? null,
        reason: after.reason ?? null,
    };
}

function sendBackLifecycleFromAudit(audit, fallbackCycle = 1) {
    const meta = extractWorkflowSendBackMeta(audit);
    const reason =
        meta.reason ||
        (typeof audit.note === 'string' ? audit.note.split('reason=').pop()?.trim() : null) ||
        null;
    return {
        cycleNumber: meta.workflowRound || fallbackCycle,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: 'TIMELINE.LIFECYCLE.SEND_BACK',
        status: 'COMPLETED',
        lifecycleEventType: 'SEND_BACK',
        actor: audit.changedByUser
            ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
            : null,
        actedAt: toIso(audit.changedAt),
        reason,
        stepNumber: meta.sourceStepNumber ?? 0,
        sourceStepNumber: meta.sourceStepNumber,
        sourceStepRole: meta.sourceStepRole,
        targetStepNumber: meta.targetStepNumber,
        targetStepRole: meta.targetStepRole,
        targetType: meta.targetType,
        sourceRef: { auditLogId: audit.id },
    };
}

function resubmitLifecycleFromAudit(audit, fallbackCycle = 1) {
    const after = audit?.afterValue && typeof audit.afterValue === 'object' ? audit.afterValue : {};
    const cycle = after.workflowRound ?? after.newCycleNumber ?? fallbackCycle;
    return {
        cycleNumber: cycle,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: 'TIMELINE.LIFECYCLE.RESUBMIT',
        status: 'COMPLETED',
        lifecycleEventType: 'RESUBMIT',
        actor: audit.changedByUser
            ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
            : null,
        actedAt: toIso(audit.changedAt),
        stepNumber: 0,
        sourceRef: { auditLogId: audit.id },
    };
}

function isResubmitAudit(audit) {
    const action = String(audit?.action || '').toUpperCase();
    const note = String(audit?.note || '');
    const after = audit?.afterValue && typeof audit.afterValue === 'object' ? audit.afterValue : {};
    // Only SUBMIT / RESUBMIT audits become "Resubmitted" lifecycle rows.
    // APPROVE may carry after.resubmit=true for pre-approve-on-resubmit — that is not a Resubmit event.
    if (action === 'RESUBMIT') return true;
    if (action !== 'SUBMIT') return false;
    if (after.resubmit === true) return true;
    return (
        note.includes('WORKFLOW_RESUBMIT') ||
        note.includes('GRN_RESUBMIT') ||
        note.includes('GET_PASS_RESUBMIT') ||
        note.includes('BREAKAGE_RESUBMIT') ||
        note.includes('LOST_RESUBMIT') ||
        note.includes('STORE_TRANSFER_RESUBMIT') ||
        note.startsWith('RESUBMIT')
    );
}

const AUTO_POSTED_ACTOR = Object.freeze({ id: 'system:dx-auto-post', name: 'Auto posted by DX' });

function postingEntry(cycleNumber, postedAt, postedByUser, options = {}) {
    const actor = options.autoPosted
        ? AUTO_POSTED_ACTOR
        : postedByUser
          ? { id: postedByUser.id, name: userDisplayName(postedByUser) }
          : null;
    return {
        cycleNumber,
        entryType: 'POSTING',
        stageKey: 'POSTED',
        displayTitleKey: resolveDisplayTitleKey({
            stageKey: 'POSTED',
            entryType: 'POSTING',
            status: 'POSTED',
        }),
        status: 'POSTED',
        actor,
        actedAt: toIso(postedAt),
        stepNumber: 99,
    };
}

/** Future Posted step — visible in the pipeline with approvals before ledger post. */
function pendingPostingEntry(cycleNumber) {
    return {
        cycleNumber: Math.max(1, Number(cycleNumber) || 1),
        entryType: 'POSTING',
        stageKey: 'POSTED',
        displayTitleKey: resolveDisplayTitleKey({
            stageKey: 'POSTED',
            entryType: 'POSTING',
            status: 'PENDING',
        }),
        status: 'PENDING',
        actor: null,
        actedAt: null,
        stepNumber: 99,
    };
}

/** Ensure Posted sorts after completed approvals when GM approve + ledger post share one transaction. */
function resolvePostingActedAt(postedAt, entries) {
    let postingMs = postedAt ? new Date(postedAt).getTime() : NaN;
    if (!Number.isFinite(postingMs)) postingMs = Date.now();
    for (const e of entries || []) {
        if (
            e.entryType !== 'APPROVAL_STEP_COMPLETED' &&
            e.entryType !== 'MILESTONE_COMPLETED'
        ) {
            continue;
        }
        if (!e.actedAt) continue;
        const t = new Date(e.actedAt).getTime();
        if (Number.isFinite(t)) postingMs = Math.max(postingMs, t);
    }
    return new Date(postingMs + 1);
}

function appendPostingEntry(entries, cycleNumber, options) {
    const maxCycle = Math.max(
        Number(cycleNumber) || 1,
        ...entries.map((e) => Number(e.cycleNumber) || 1),
        1,
    );
    if (options.includePosting && options.postedAt) {
        entries.push(
            postingEntry(maxCycle, resolvePostingActedAt(options.postedAt, entries), options.postedByUser, {
                autoPosted: options.autoPosted !== false,
            }),
        );
        return;
    }
    // Show Posted as a pending pipeline step alongside approvals (Breakage / Lost).
    if (options.showPendingPosting) {
        const docStatus = String(options.documentStatus || '').toUpperCase();
        if (docStatus === 'REJECTED' || docStatus === 'VOID' || docStatus === 'DRAFT') return;
        if (entries.some((e) => e.entryType === 'POSTING')) return;
        entries.push(pendingPostingEntry(maxCycle));
    }
}

function isTerminalApprovalRequest(approvalRequest) {
    const status = String(approvalRequest?.status || '').toUpperCase();
    return status === 'REJECTED' || status === 'APPROVED';
}

function isActiveApprovalRequest(approvalRequest) {
    return String(approvalRequest?.status || '').toUpperCase() === 'PENDING';
}

/** Pattern: BREAKAGE_APPROVE_STEP:<stepNumber>:<roleCode> or LOST_APPROVE_STEP:… */
const MOVEMENT_APPROVE_STEP_RE = /(?:BREAKAGE|LOST)_APPROVE_STEP:(\d+):([A-Z_]*)/;

/**
 * Extract approved steps from APPROVE audit events (Breakage / Lost).
 * These survive Send Back because they are immutable audit records,
 * unlike AR step rows which get cleared on Send Back.
 */
function cycleNumberForActedAt(actedAt, auditEvents = []) {
    if (!actedAt) return 1;
    const t = new Date(actedAt).getTime();
    if (!Number.isFinite(t)) return 1;
    let cycle = 1;
    for (const audit of auditEvents) {
        if (String(audit.action || '').toUpperCase() !== 'SEND_BACK') continue;
        const sendBackAt = new Date(audit.changedAt).getTime();
        if (!Number.isFinite(sendBackAt) || sendBackAt >= t) continue;
        const after = audit?.afterValue && typeof audit.afterValue === 'object' ? audit.afterValue : {};
        const round = Number(after.workflowRound) || 1;
        cycle = Math.max(cycle, round + 1);
    }
    return cycle;
}

function auditBasedCompletedApprovals(auditEvents, approvalRequest) {
    const completedEntries = [];
    const steps = approvalRequest?.steps || [];

    for (const audit of auditEvents) {
        if (String(audit.action || '').toUpperCase() !== 'APPROVE') continue;
        const note = String(audit.note || '');
        const match = MOVEMENT_APPROVE_STEP_RE.exec(note);
        if (!match) continue;
        const stepNumber = Number(match[1]);
        const roleCode = match[2] || null;

        // Find the live step for stage mapping (may be cleared post-send-back).
        const liveStep = steps.find((s) => s.stepNumber === stepNumber);
        const stageKey = liveStep ? stageKeyForStep(liveStep)
            : (roleCode && ROLE_CODE_TO_STAGE_KEY[roleCode]) || `STEP_${stepNumber}`;

        completedEntries.push({
            cycleNumber: cycleNumberForActedAt(audit.changedAt, auditEvents),
            entryType: 'APPROVAL_STEP_COMPLETED',
            stageKey,
            displayTitleKey: resolveDisplayTitleKey({ stageKey, entryType: 'APPROVAL_STEP_COMPLETED', status: 'COMPLETED' }),
            status: 'COMPLETED',
            actor: audit.changedByUser
                ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
                : null,
            actedAt: toIso(audit.changedAt),
            reason: null,
            note: null,
            stepNumber,
            sourceRef: { auditLogId: audit.id },
        });
    }
    return completedEntries;
}

/**
 * Legacy CREATE often entered the pipeline at DEPT_APPROVED without BREAKAGE_APPROVE_STEP:1.
 * When later steps have APPROVE audits, reconstruct Dept so history is not Cost-only.
 */
function inferDeptCompletedFromCreate(auditEvents, approvalRequest, existingStepNumbers) {
    if (existingStepNumbers.has(1)) return null;
    const create = auditEvents.find((a) => String(a.action || '').toUpperCase() === 'CREATE');
    if (!create) return null;
    const after = create.afterValue && typeof create.afterValue === 'object' ? create.afterValue : {};
    const createStatus = String(after.status || '').toUpperCase();
    const hasHigherApprove = [...existingStepNumbers].some((n) => Number(n) > 1);
    const enteredPastDraft =
        createStatus &&
        createStatus !== 'DRAFT' &&
        createStatus !== 'CREATE_DRAFT';
    if (!enteredPastDraft && !hasHigherApprove) return null;

    const step1 = (approvalRequest?.steps || []).find((s) => Number(s.stepNumber) === 1);
    const roleCode = step1?.requiredRole?.code || 'DEPT_MANAGER';
    const stageKey =
        (step1 && stageKeyForStep(step1)) ||
        ROLE_CODE_TO_STAGE_KEY[roleCode] ||
        'DEPT';

    return {
        cycleNumber: 1,
        entryType: 'APPROVAL_STEP_COMPLETED',
        stageKey,
        displayTitleKey: resolveDisplayTitleKey({
            stageKey,
            entryType: 'APPROVAL_STEP_COMPLETED',
            status: 'COMPLETED',
        }),
        status: 'COMPLETED',
        actor: create.changedByUser
            ? { id: create.changedBy, name: userDisplayName(create.changedByUser) }
            : null,
        actedAt: toIso(create.changedAt),
        reason: null,
        note: null,
        stepNumber: 1,
        sourceRef: { auditLogId: create.id, inferredFrom: 'CREATE_PREAPPROVE' },
    };
}

/**
 * Legacy Breakage/Lost submit after Send Back→Creator often advanced currentStep without RESUBMIT audit.
 * Reconstruct Resubmit so timeline matches Get Pass constitutional order.
 */
function inferResubmitAfterCreatorSendBack(auditEvents, approvalRequest) {
    const sendBacks = auditEvents
        .filter((a) => String(a.action || '').toUpperCase() === 'SEND_BACK')
        .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
    if (!sendBacks.length) return null;

    let lastToCreator = null;
    for (let i = sendBacks.length - 1; i >= 0; i -= 1) {
        const meta = extractWorkflowSendBackMeta(sendBacks[i]);
        if (meta.targetType === 'CREATOR' || Number(meta.targetStepNumber) === 0) {
            lastToCreator = sendBacks[i];
            break;
        }
    }
    if (!lastToCreator) return null;

    const sendBackAt = new Date(lastToCreator.changedAt).getTime();
    if (!Number.isFinite(sendBackAt)) return null;

    const hasResubmitAfter = auditEvents.some((a) => {
        if (!isResubmitAudit(a)) return false;
        const t = new Date(a.changedAt).getTime();
        return Number.isFinite(t) && t > sendBackAt;
    });
    if (hasResubmitAfter) return null;

    const currentStep = Number(approvalRequest?.currentStep);
    if (!Number.isFinite(currentStep) || currentStep <= 0) return null;

    const meta = extractWorkflowSendBackMeta(lastToCreator);
    const round = (Number(meta.workflowRound) || 1) + 1;
    const actedAt = new Date(sendBackAt + 1000).toISOString();

    return {
        cycleNumber: round,
        entryType: 'LIFECYCLE_EVENT',
        stageKey: 'LIFECYCLE',
        displayTitleKey: 'TIMELINE.LIFECYCLE.RESUBMIT',
        status: 'COMPLETED',
        lifecycleEventType: 'RESUBMIT',
        actor: null,
        actedAt,
        stepNumber: 0,
        sourceRef: {
            inferredFrom: 'POST_SEND_BACK_REENTRY',
            sendBackAuditId: lastToCreator.id,
        },
    };
}

/**
 * Single-cycle approval timeline from ApprovalRequest steps (Transfer / Breakage / Lost).
 * CANCELLED steps are omitted — never mapped to PENDING.
 * REJECTED steps emit one LIFECYCLE REJECT entry (not duplicated from audit).
 *
 * When APPROVE audit history exists (Breakage / Lost), audit-based completed entries are
 * emitted instead of live AR APPROVED steps, so history survives Send Back.
 *
 * @param {object|null} approvalRequest
 * @param {object} [options]
 * @param {object[]} [options.auditEvents]
 * @param {string|null} [options.rejectionReason] — document-level rejection reason (Transfer)
 * @param {string|null} [options.postedAt]
 * @param {object|null} [options.postedByUser]
 * @param {string|null} [options.documentStatus] — movement document status (e.g. VOID suppresses pending steps)
 * @returns {import('./timelineEntry.types').TimelineEntry[]}
 */
function buildApprovalTimelineRawEntries(approvalRequest, options = {}) {
    const entries = [];
    const auditEvents = options.auditEvents || [];
    const cycleNumber = approvalRequest?.cycleNumber || 1;

    const submitAudit = auditEvents.find(
        (a) => String(a.action || '').toUpperCase() === 'SUBMIT' && !isResubmitAudit(a),
    );
    const createAudit = auditEvents.find(
        (a) => String(a.action || '').toUpperCase() === 'CREATE',
    );
    if (submitAudit) {
        entries.push(submitLifecycleFromAudit(submitAudit));
    } else if (createAudit) {
        // Legacy Breakage/Lost: first pipeline entry was CREATE, not SUBMIT.
        entries.push(submitLifecycleFromAudit(createAudit));
    }

    if (!approvalRequest?.steps?.length) {
        appendPostingEntry(entries, cycleNumber, options);
        return entries;
    }

    // Audit-based completed approvals (Breakage/Lost step audits survive Send Back).
    const auditCompletedSteps = auditBasedCompletedApprovals(auditEvents, approvalRequest);
    const existingStepNumbers = new Set(auditCompletedSteps.map((e) => e.stepNumber));
    const inferredDept = inferDeptCompletedFromCreate(
        auditEvents,
        approvalRequest,
        existingStepNumbers,
    );
    if (inferredDept) {
        auditCompletedSteps.push(inferredDept);
        existingStepNumbers.add(1);
    }
    const hasAuditHistory = auditCompletedSteps.length > 0;
    const auditCompletedStepNumbers = existingStepNumbers;

    const steps = [...approvalRequest.steps].sort((a, b) => a.stepNumber - b.stepNumber);
    const terminal = isTerminalApprovalRequest(approvalRequest);
    const active = isActiveApprovalRequest(approvalRequest);
    const hasRejectedStep = steps.some((s) => s.status === 'REJECTED');
    const docStatus = String(options.documentStatus || '').toUpperCase();
    const documentTerminal =
        docStatus === 'REJECTED' || docStatus === 'CANCELLED' || docStatus === 'VOID';
    const hasVoidTerminal =
        documentTerminal ||
        auditEvents.some((a) => {
            const action = String(a.action || '').toUpperCase();
            return action === 'CANCEL' || action === 'VOID';
        });

    for (const step of steps) {
        step.requestId = approvalRequest.id;
        const stepNumber = step.stepNumber;
        const status = String(step.status || '').toUpperCase();

        if (status === 'APPROVED') {
            // If audit history covers this step, skip the live AR entry (audit wins).
            if (hasAuditHistory && auditCompletedStepNumbers.has(stepNumber)) continue;
            entries.push(completedApprovalEntry(cycleNumber, step, stepNumber));
            continue;
        }

        if (status === 'REJECTED') {
            entries.push(rejectLifecycleEntry(cycleNumber, step, stepNumber, options.rejectionReason));
            continue;
        }

        if (status === 'CANCELLED') {
            continue;
        }

        if (terminal && approvalRequest.status === 'REJECTED') {
            continue;
        }

        if (documentTerminal) {
            continue;
        }

        if (active && !hasVoidTerminal) {
            if (status === 'PENDING' && stepNumber === approvalRequest.currentStep) {
                entries.push(currentApprovalEntry(cycleNumber, step, stepNumber));
            } else if (status === 'PENDING' && stepNumber > approvalRequest.currentStep) {
                entries.push(futureApprovalEntry(cycleNumber, step, stepNumber));
            } else if (status === 'PENDING' && stepNumber < approvalRequest.currentStep) {
                // Stale/mis-pointed currentStep must not hide earlier pending steps.
                entries.push(futureApprovalEntry(cycleNumber, step, stepNumber));
            }
        }
    }

    // Emit audit-based completed steps (after live AR loop so dedup works).
    for (const entry of auditCompletedSteps) {
        entries.push(entry);
    }

    if (active && !hasVoidTerminal && !documentTerminal && Number(approvalRequest.currentStep) === 0) {
        entries.push(creatorPendingEntry(cycleNumber));
    }

    if (!hasRejectedStep) {
        for (const audit of auditEvents) {
            if (String(audit.action || '').toUpperCase() !== 'REJECT') continue;
            const alreadyFromStep = entries.some(
                (e) => e.lifecycleEventType === 'REJECT' && e.sourceRef?.auditLogId === audit.id,
            );
            if (alreadyFromStep) continue;
            if (entries.some((e) => e.lifecycleEventType === 'REJECT')) continue;
            entries.push({
                cycleNumber,
                entryType: 'LIFECYCLE_EVENT',
                stageKey: 'LIFECYCLE',
                displayTitleKey: 'TIMELINE.LIFECYCLE.REJECT',
                status: 'REJECTED',
                lifecycleEventType: 'REJECT',
                actor: audit.changedByUser
                    ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
                    : null,
                actedAt: toIso(audit.changedAt),
                reason: audit.note || null,
                stepNumber: 0,
                sourceRef: { auditLogId: audit.id },
            });
        }
    }

    for (const audit of auditEvents) {
        if (String(audit.action || '').toUpperCase() !== 'CANCEL') continue;
        if (entries.some((e) => e.lifecycleEventType === 'CANCEL' && e.sourceRef?.auditLogId === audit.id)) {
            continue;
        }
        const cancelNote = audit.note?.trim() || null;
        entries.push({
            cycleNumber,
            entryType: 'LIFECYCLE_EVENT',
            stageKey: 'LIFECYCLE',
            displayTitleKey: 'TIMELINE.LIFECYCLE.CANCEL',
            status: 'COMPLETED',
            lifecycleEventType: 'CANCEL',
            actor: audit.changedByUser
                ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
                : null,
            actedAt: toIso(audit.changedAt),
            reason: cancelNote?.replace(/^INVENTORY_COUNT_CANCELLED\s+/, '') || cancelNote,
            stepNumber: 0,
            sourceRef: { auditLogId: audit.id },
        });
    }

    for (const audit of auditEvents) {
        if (String(audit.action || '').toUpperCase() !== 'VOID') continue;
        if (entries.some((e) => e.lifecycleEventType === 'VOID' && e.sourceRef?.auditLogId === audit.id)) {
            continue;
        }
        const voidNote = audit.note?.trim() || null;
        entries.push({
            cycleNumber,
            entryType: 'LIFECYCLE_EVENT',
            stageKey: 'LIFECYCLE',
            displayTitleKey: 'TIMELINE.LIFECYCLE.VOID',
            status: 'COMPLETED',
            lifecycleEventType: 'VOID',
            actor: audit.changedByUser
                ? { id: audit.changedBy, name: userDisplayName(audit.changedByUser) }
                : null,
            actedAt: toIso(audit.changedAt),
            reason: voidNote?.replace(/^Breakage voided:\s*/i, '') || voidNote,
            stepNumber: 0,
            sourceRef: { auditLogId: audit.id },
        });
    }

    for (const audit of auditEvents) {
        const action = String(audit.action || '').toUpperCase();
        if (action === 'SEND_BACK') {
            if (entries.some((e) => e.lifecycleEventType === 'SEND_BACK' && e.sourceRef?.auditLogId === audit.id)) {
                continue;
            }
            entries.push(sendBackLifecycleFromAudit(audit, cycleNumber));
        } else if (isResubmitAudit(audit)) {
            if (entries.some((e) => e.lifecycleEventType === 'RESUBMIT' && e.sourceRef?.auditLogId === audit.id)) {
                continue;
            }
            entries.push(resubmitLifecycleFromAudit(audit, cycleNumber));
        }
    }

    const inferredResubmit = inferResubmitAfterCreatorSendBack(auditEvents, approvalRequest);
    if (inferredResubmit && !entries.some((e) => e.lifecycleEventType === 'RESUBMIT')) {
        entries.push(inferredResubmit);
    }

    appendPostingEntry(entries, cycleNumber, options);

    return entries;
}

module.exports = {
    buildApprovalTimelineRawEntries,
    stageKeyForStep,
    ROLE_CODE_TO_STAGE_KEY,
    AUTO_POSTED_ACTOR,
    creatorPendingEntry,
    sendBackLifecycleFromAudit,
    resubmitLifecycleFromAudit,
    isResubmitAudit,
    postingEntry,
};
