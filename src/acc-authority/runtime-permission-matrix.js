'use strict';

/**
 * ACC Phase F — permission → roles[] matrix derived from constitution grants.
 * Replaces duplicate static PERMISSIONS block in authorize.js.
 */

const { PERMISSION_MAP } = require('./catalog.constitution');
const { buildRolePermissionMap, applyRolePermissionPolicy, normalizeRoleCode } = require('./base-role-permissions');

function buildPermissionToRolesMatrix() {
    const rolePermissions = buildRolePermissionMap();
    const matrix = {};

    for (const [role, codes] of Object.entries(rolePermissions)) {
        const rc = normalizeRoleCode(role);
        const filtered = applyRolePermissionPolicy(rc, codes);
        for (const code of filtered) {
            if (!matrix[code]) matrix[code] = [];
            if (!matrix[code].includes(rc)) matrix[code].push(rc);
        }
    }

    for (const entry of PERMISSION_MAP) {
        if (!matrix[entry.legacyCode]) {
            matrix[entry.legacyCode] = [];
        }
    }

    for (const key of Object.keys(matrix)) {
        matrix[key].sort();
    }

    return Object.freeze(matrix);
}

const PERMISSIONS = buildPermissionToRolesMatrix();

module.exports = {
    PERMISSIONS,
    buildPermissionToRolesMatrix,
};
