'use strict';

/**
 * ACC role-code string helpers — Stage S4A prep for workflow step approverRole references.
 * Re-exports canonical constants; does not alter session or permission resolution.
 */

const {
    SYSTEM_ROLE_CODES,
    SYSTEM_ROLE_CODE_SET,
    ASSIGNABLE_ROLE_CODES,
    ASSIGNABLE_ROLE_CODE_SET,
    PROTECTED_ROLE_CODES,
    PROTECTED_ROLE_CODE_SET,
    ROLE_CODE_ALIASES,
    toRoleCodeString,
    isKnownRoleCode,
    isAssignableRoleCode,
} = require('../constants/role-codes.constants');

module.exports = {
    SYSTEM_ROLE_CODES,
    SYSTEM_ROLE_CODE_SET,
    ASSIGNABLE_ROLE_CODES,
    ASSIGNABLE_ROLE_CODE_SET,
    PROTECTED_ROLE_CODES,
    PROTECTED_ROLE_CODE_SET,
    ROLE_CODE_ALIASES,
    toRoleCodeString,
    isKnownRoleCode,
    isAssignableRoleCode,
};
