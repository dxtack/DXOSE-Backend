'use strict';

const {
    normalizeRoleCode,
    applyRolePermissionPolicy,
} = require('./base-role-permissions');

/**
 * Phase F effective runtime = ur_* grants with role policy (no matrix union).
 * UR legacy codes take precedence when non-empty; otherwise legacy role_permissions.
 */
function computeEffectiveRuntimePermissionCodes(roleCode, urLegacyCodes, legacyPermissionCodes) {
    const rc = normalizeRoleCode(roleCode);
    const source = urLegacyCodes.length > 0 ? urLegacyCodes : legacyPermissionCodes;
    return applyRolePermissionPolicy(rc, source).sort();
}

module.exports = {
    computeEffectiveRuntimePermissionCodes,
};
