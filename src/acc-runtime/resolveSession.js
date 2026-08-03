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
 * Tenant-scoped requests use the membership (or JWT) role as-is — no global
 * ORG_MANAGER promotion from other tenants. Platform / null-tenant may promote.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {object|null} [params.membership]
 * @param {object} [params.decoded] — JWT payload fallbacks (role, roleId)
 * @param {string|null} [params.tenantId]
 */
const resolveSession = async ({ userId, membership = null, decoded = {}, tenantId = null }) => {
    const membershipRole = membership ? membershipRoleCode(membership) : decoded.role;
    const scopedTenantId = tenantId ?? membership?.tenantId ?? membership?.tenant?.id ?? null;
    const roleCode = scopedTenantId
        ? (membershipRole ?? decoded.role)
        : ((await resolveUserBestRole(userId, membershipRole)) ?? membershipRole ?? decoded.role);

    let roleId = membership?.roleId ?? decoded.roleId ?? null;
    if (roleCode) {
        const byCode = await getRoleIdByCode(roleCode);
        if (byCode) roleId = byCode;
    }

    let permissions = [];
    if (membership || roleCode) {
        permissions = await resolvePermissionsForMembership({
            userId,
            membership,
            roleId,
            roleCode,
            tenantId: scopedTenantId,
            tenantSlug: membership?.tenant?.slug ?? null,
            assignmentId: typeof decoded.assignmentId === 'string' ? decoded.assignmentId : null,
        });
    }

    return {
        userId,
        tenantId: scopedTenantId,
        role: roleCode,
        roleId,
        permissions,
        departmentId: membership?.departmentId ?? null,
        assignmentId: typeof decoded.assignmentId === 'string' ? decoded.assignmentId : null,
    };
};

module.exports = { resolveSession };
