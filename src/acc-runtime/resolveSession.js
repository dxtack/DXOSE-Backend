'use strict';

const {
    getRoleIdByCode,
    resolveUserBestRole,
    membershipRoleCode,
} = require('../services/rbac.service');
const { resolvePermissionsForMembership } = require('./resolvePermissions');

/**
 * Resolve session role + capability codes for a membership context.
 * S9/S14: ACC primary when enforcement active (global or pilot tenant), legacy fallback on miss/error/drift.
 * Wired from authenticate.js (Stage S2).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {object|null} [params.membership]
 * @param {object} [params.decoded] — JWT payload fallbacks (role, roleId)
 * @param {string|null} [params.tenantId]
 */
const resolveSession = async ({ userId, membership = null, decoded = {}, tenantId = null }) => {
    const membershipRole = membership ? membershipRoleCode(membership) : decoded.role;
    const roleCode =
        (await resolveUserBestRole(userId, membershipRole)) ?? membershipRole ?? decoded.role;

    let permissions = [];
    if (membership || roleCode) {
        const roleIdForPerm =
            roleCode === 'ORG_MANAGER'
                ? (await getRoleIdByCode('ORG_MANAGER')) ?? membership?.roleId ?? decoded.roleId
                : membership?.roleId ?? decoded.roleId;
        permissions = await resolvePermissionsForMembership({
            userId,
            membership,
            roleId: roleIdForPerm,
            roleCode: roleCode === 'ORG_MANAGER' ? 'ORG_MANAGER' : roleCode,
            tenantId: tenantId ?? membership?.tenantId ?? membership?.tenant?.id ?? null,
            tenantSlug: membership?.tenant?.slug ?? null,
            assignmentId: typeof decoded.assignmentId === 'string' ? decoded.assignmentId : null,
        });
    }

    return {
        userId,
        tenantId,
        role: roleCode,
        roleId: membership?.roleId ?? decoded.roleId ?? null,
        permissions,
        departmentId: membership?.departmentId ?? null,
        assignmentId: typeof decoded.assignmentId === 'string' ? decoded.assignmentId : null,
    };
};

module.exports = { resolveSession };
