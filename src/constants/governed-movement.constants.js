/** Movement types whose stock impact must post only via workflow completion. */
const GOVERNED_MOVEMENT_TYPES = new Set(['BREAKAGE', 'LOST', 'COUNT_ADJUSTMENT']);

/** Stored statuses while workflow is in progress (Movement Register must not mutate). */
const MOVEMENT_WORKFLOW_IN_PROGRESS_STATUSES = new Set([
    'COUNTING',
    'REVEAL_REVIEW',
    'RECOUNTING',
    'PENDING_APPROVAL',
    'DEPT_APPROVED',
    'COST_CONTROL_APPROVED',
    'FINANCE_APPROVED',
    'PENDING_GM',
    'PENDING_FINAL',
    'APPROVED', // final workflow approval before/at governed post — not manual register post
]);

const MOVEMENT_REGISTER_MUTABLE_STATUSES = new Set(['DRAFT', 'REJECTED']);

function isGovernedMovementType(movementType) {
    return GOVERNED_MOVEMENT_TYPES.has(String(movementType || '').toUpperCase());
}

function isMovementWorkflowLocked(document) {
    if (!document) return false;
    const status = String(document.status || '').toUpperCase();
    if (document.postedAt || status === 'POSTED') return true;
    if (!isGovernedMovementType(document.movementType)) return false;
    if (MOVEMENT_REGISTER_MUTABLE_STATUSES.has(status)) return false;
    return true;
}

module.exports = {
    GOVERNED_MOVEMENT_TYPES,
    MOVEMENT_WORKFLOW_IN_PROGRESS_STATUSES,
    MOVEMENT_REGISTER_MUTABLE_STATUSES,
    isGovernedMovementType,
    isMovementWorkflowLocked,
};
