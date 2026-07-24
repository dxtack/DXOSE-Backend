const {
    isGovernedMovementType,
    isMovementWorkflowLocked,
} = require('../constants/governed-movement.constants');
const { mapUserFacingState, isEditableUserState } = require('../platform/lifecyclePresentation.service');

function movementRegisterGuardError(message, code = 'MOVEMENT_REGISTER_GOVERNED') {
    const error = new Error(message);
    error.statusCode = 403;
    error.code = code;
    return error;
}

/**
 * Movement Register is view/audit only for workflow-governed movement types.
 * Posting and draft updates must go through module workflow APIs.
 */
function assertMovementRegisterMutable(document, action = 'modify') {
    if (!document) {
        throw movementRegisterGuardError('Movement document not found.', 'NOT_FOUND');
    }
    if (!isGovernedMovementType(document.movementType)) {
        return;
    }
    if (action === 'post') {
        throw movementRegisterGuardError(
            `${document.movementType} documents must be posted through workflow approval, not from Movement Register.`,
            'GOVERNED_POST_FORBIDDEN',
        );
    }
    if (isMovementWorkflowLocked(document)) {
        throw movementRegisterGuardError(
            `${document.movementType} document ${document.documentNo || document.id} is in workflow and cannot be ${action} from Movement Register.`,
            'GOVERNED_WORKFLOW_LOCKED',
        );
    }
    const userState = mapUserFacingState('MOVEMENT', document.status);
    if (!isEditableUserState(userState)) {
        throw movementRegisterGuardError(
            `${document.movementType} document is ${userState} and cannot be ${action} (Ch.2.5).`,
            'DOCUMENT_NOT_EDITABLE',
        );
    }
}

module.exports = {
    assertMovementRegisterMutable,
    isMovementWorkflowLocked,
};
