'use strict';

/**
 * Ch.2.3 — Map internal workflow statuses to user-facing lifecycle states.
 * Wave 2 (SYS-DEC-02 / BUS-DEC-01 / BUS-DEC-06): central SSOT — no raw enums to UI.
 */

const SEND_BACK_NOTES_MARKER = '[Send Back]';

const GRN_USER_STATE = {
    DRAFT: 'Draft',
    VALIDATED: 'In Review',
    PENDING_APPROVAL: 'In Review',
    PENDING_FINANCE: 'In Review',
    APPROVED: 'Approved',
    POSTED: 'Posted',
    REJECTED: 'Rejected',
};

const TRANSFER_USER_STATE = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    PENDING_DEPT: 'In Review',
    PENDING_FINANCE: 'In Review',
    PENDING_FINAL: 'In Review',
    APPROVED: 'Approved',
    IN_TRANSIT: 'In Review',
    RECEIVED: 'Posted',
    CLOSED: 'Posted',
    POSTED: 'Posted',
    REJECTED: 'Rejected',
};

const MOVEMENT_USER_STATE = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    DEPT_APPROVED: 'In Review',
    COST_CONTROL_APPROVED: 'In Review',
    FINANCE_APPROVED: 'In Review',
    PENDING: 'In Review',
    PENDING_COST_CONTROL: 'In Review',
    PENDING_DEPT: 'In Review',
    PENDING_FINANCE: 'In Review',
    PENDING_GM: 'In Review',
    PENDING_APPROVAL: 'In Review',
    APPROVED: 'Posted',
    POSTED: 'Posted',
    REJECTED: 'Rejected',
    VOID: 'Voided',
};

const COUNT_USER_STATE = {
    DRAFT: 'Draft',
    COUNTING: 'In Review',
    REVEAL_REVIEW: 'In Review',
    RECOUNTING: 'In Review',
    PENDING_COST_CONTROL: 'In Review',
    PENDING_DEPT: 'In Review',
    PENDING_FINANCE: 'In Review',
    PENDING_GM: 'In Review',
    PENDING_APPROVAL: 'In Review',
    DEPT_APPROVED: 'In Review',
    COST_CONTROL_APPROVED: 'In Review',
    FINANCE_APPROVED: 'In Review',
    POSTED: 'Posted',
    REJECTED: 'Rejected',
    CANCELLED: 'Voided',
    VOID: 'Voided',
};

const GET_PASS_USER_STATE = {
    DRAFT: 'Draft',
    PENDING_DEPT: 'In Review',
    PENDING_COST_CONTROL: 'In Review',
    PENDING_FINANCE: 'In Review',
    PENDING_GM: 'In Review',
    PENDING_SECURITY: 'In Review',
    APPROVED: 'Approved',
    OUT: 'In Review',
    DISPATCHED: 'In Review',
    IN_TRANSIT: 'In Review',
    RECEIVED_AT_DESTINATION: 'In Review',
    RETURNING: 'In Review',
    RETURN_RECEIVED_AT_GATE: 'In Review',
    PARTIALLY_RETURNED: 'In Review',
    RETURNED: 'Closed',
    PENDING_FORCE_CLOSE_SETTLEMENT: 'In Review',
    CLOSED: 'Closed',
    REJECTED: 'Rejected',
};

/** DRAFT + Send Back notes marker → user-facing Returned (BUS-DEC-01). */
function isSendBackReturned(internalStatus, notes) {
    if (String(internalStatus || '').toUpperCase() !== 'DRAFT') return false;
    return String(notes || '').includes(SEND_BACK_NOTES_MARKER);
}

/** @deprecated use isSendBackReturned */
const isGrnReturned = isSendBackReturned;

/** @deprecated use isSendBackReturned */
const isGetPassReturned = isSendBackReturned;

function appendSendBackNotes(existingNotes, reason) {
    const trimmed = String(reason || '').trim();
    const line = trimmed ? `${SEND_BACK_NOTES_MARKER} ${trimmed}` : SEND_BACK_NOTES_MARKER;
    const base = existingNotes != null ? String(existingNotes).trim() : '';
    return base ? `${base}\n${line}` : line;
}

/** Remove Send Back marker lines after creator resubmit (Get Pass / Breakage / Lost). */
function stripSendBackNotes(notes) {
    if (notes == null) return null;
    const cleaned = String(notes)
        .split('\n')
        .filter((line) => !line.trim().startsWith(SEND_BACK_NOTES_MARKER))
        .join('\n')
        .trim();
    return cleaned || null;
}

function mapUserFacingState(moduleKey, internalStatus, context = {}) {
    const key = String(moduleKey || '').toUpperCase();
    const status = String(internalStatus || '').toUpperCase();
    if (isSendBackReturned(internalStatus, context.notes)) {
        return 'Returned';
    }
    if (key === 'GRN') return GRN_USER_STATE[status] || 'In Review';
    if (key === 'GET_PASS') return GET_PASS_USER_STATE[status] || 'In Review';
    if (key === 'TRANSFER') return TRANSFER_USER_STATE[status] || 'In Review';
    if (['BREAKAGE', 'LOST', 'MOVEMENT'].includes(key)) {
        return MOVEMENT_USER_STATE[status] || 'In Review';
    }
    if (['INVENTORY_COUNT', 'COUNT'].includes(key)) return COUNT_USER_STATE[status] || 'In Review';
    return 'In Review';
}

function withUserFacingState(moduleKey, row, context = {}) {
    if (!row || typeof row !== 'object') return row;
    const ctx = {
        notes: context.notes ?? row.notes,
    };
    return {
        ...row,
        userFacingState: mapUserFacingState(moduleKey, row.status, ctx),
    };
}

function isEditableUserState(userState) {
    return userState === 'Draft' || userState === 'Returned';
}

/** Ch.2.5 — Central guard: Voided and other terminal user-facing states are not editable. */
function assertDocumentEditableByLifecycle(moduleKey, internalStatus, context = {}) {
    const userState = mapUserFacingState(moduleKey, internalStatus, context);
    if (!isEditableUserState(userState)) {
        throw Object.assign(
            new Error(`Document is ${userState} and cannot be edited (Ch.2.5).`),
            { status: 423, code: 'DOCUMENT_NOT_EDITABLE' },
        );
    }
}

module.exports = {
    mapUserFacingState,
    withUserFacingState,
    isSendBackReturned,
    isGrnReturned,
    isGetPassReturned,
    isEditableUserState,
    assertDocumentEditableByLifecycle,
    appendSendBackNotes,
    stripSendBackNotes,
    SEND_BACK_NOTES_MARKER,
    GRN_USER_STATE,
    TRANSFER_USER_STATE,
    MOVEMENT_USER_STATE,
    GET_PASS_USER_STATE,
    COUNT_USER_STATE,
};
