'use strict';

const DIRECT_ADJUSTMENT_TYPE_ONLY = 'DIRECT_ADJUSTMENT_TYPE_ONLY';
const MOVEMENT_DRAFT_ORIGIN_REQUIRED = 'MOVEMENT_DRAFT_ORIGIN_REQUIRED';
const MOVEMENT_DRAFT_ORIGIN_INVALID = 'MOVEMENT_DRAFT_ORIGIN_INVALID';

const ALLOWED_ORIGINS = Object.freeze(new Set(['DIRECT_API', 'INTERNAL']));

function movementGuardError(message, statusCode, code) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.code = code;
    return err;
}

/**
 * Fail-closed: every createMovementDraft call must declare origin explicitly.
 * @param {unknown} options
 */
function assertCreateDraftOrigin(options) {
    if (!options || typeof options !== 'object' || !options.origin) {
        throw movementGuardError(
            'createMovementDraft requires explicit options.origin (DIRECT_API or INTERNAL).',
            500,
            MOVEMENT_DRAFT_ORIGIN_REQUIRED,
        );
    }
    const origin = String(options.origin).trim().toUpperCase();
    if (!ALLOWED_ORIGINS.has(origin)) {
        throw movementGuardError(
            `createMovementDraft options.origin must be DIRECT_API or INTERNAL, got "${options.origin}".`,
            500,
            MOVEMENT_DRAFT_ORIGIN_INVALID,
        );
    }
    return origin;
}

/**
 * Direct HTTP create — reject before normalize if not ADJUSTMENT.
 * @param {unknown} movementType
 */
function assertDirectApiCreateType(movementType) {
    const requested = String(movementType ?? '').trim().toUpperCase();
    if (requested !== 'ADJUSTMENT') {
        throw movementGuardError(
            'Direct movement create accepts ADJUSTMENT only.',
            422,
            DIRECT_ADJUSTMENT_TYPE_ONLY,
        );
    }
    return requested;
}

/**
 * Resolve mutation permission for movement register HTTP APIs.
 * @param {string} movementType
 * @returns {'ADJUSTMENT_CREATE' | 'MOVEMENT_CREATE'}
 */
function resolveMovementMutationPermission(movementType) {
    return String(movementType || '').trim().toUpperCase() === 'ADJUSTMENT'
        ? 'ADJUSTMENT_CREATE'
        : 'MOVEMENT_CREATE';
}

module.exports = {
    ALLOWED_ORIGINS,
    DIRECT_ADJUSTMENT_TYPE_ONLY,
    MOVEMENT_DRAFT_ORIGIN_REQUIRED,
    MOVEMENT_DRAFT_ORIGIN_INVALID,
    assertCreateDraftOrigin,
    assertDirectApiCreateType,
    resolveMovementMutationPermission,
};
