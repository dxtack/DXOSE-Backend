'use strict';

const prisma = require('../config/database');
const {
    applyRolePermissionPolicy,
    mergeAuthorityGrants,
    BASE_ROLE_PERMISSIONS,
} = require('../acc-authority/base-role-permissions');
const { toRoleCodeString } = require('../constants/role-codes.constants');

const roleIdByCodeCache = new Map();

/** @deprecated prefer accRuntime.toRoleCodeString — kept for legacy imports. */
const normalizeRole = toRoleCodeString;

/** Resolve role code from TenantMember (relation object or legacy string). */
const membershipRoleCode = (m) => {
    if (!m?.role) return null;
    if (typeof m.role === 'object' && m.role !== null && 'code' in m.role) return m.role.code;
    return m.role;
};

/**
 * Load permission codes granted to a role from the legacy role_permissions table.
 */
const loadPermissionCodesForRoleId = async (roleId) => {
    if (!roleId) return [];
    const rows = await prisma.rolePermission.findMany({
        where: { roleId },
        select: { permission: { select: { code: true } } },
    });
    return rows.map((r) => r.permission.code);
};

const loadUrPermissionCodesForRoleId = async (roleId) => {
    if (!roleId) return [];
    const rows = await prisma.urRolePermission.findMany({
        where: { roleId },
        select: { permission: { select: { legacyCode: true } } },
    });
    return rows.map((r) => r.permission.legacyCode);
};

const loadAllPermissionCodes = async () => {
    const rows = await prisma.permission.findMany({
        select: { code: true },
    });
    return rows.map((r) => r.code);
};

const roleHasUrPermissions = async (roleId) => {
    if (!roleId) return false;
    const count = await prisma.urRolePermission.count({ where: { roleId } });
    return count > 0;
};

/**
 * @deprecated Phase F — operational matrix union retired; applies DEPT_MANAGER policy only.
 */
const mergeWithOperationalMatrix = (roleCode, dbCodes) =>
    applyRolePermissionPolicy(normalizeRole(roleCode), dbCodes || []);

/**
 * Resolve role UUID by stable code (cached).
 */
const getRoleIdByCode = async (code) => {
    const c = normalizeRole(code);
    if (roleIdByCodeCache.has(c)) return roleIdByCodeCache.get(c);
    const row = await prisma.role.findUnique({ where: { code: c }, select: { id: true } });
    if (row) roleIdByCodeCache.set(c, row.id);
    return row?.id ?? null;
};

/**
 * Permissions for a membership — ur_* primary.
 * P1 #23 / Phase 3 P9: no legacy role_permissions fallback for any role
 * (active or inactive). Empty UR configuration yields [].
 */
const getPermissionsForMembership = async ({ roleId, roleCode }) => {
    const rc = normalizeRole(roleCode);
    if (!roleId) return [];

    const urConfigured = await roleHasUrPermissions(roleId);
    if (urConfigured) {
        return applyRolePermissionPolicy(rc, await loadUrPermissionCodesForRoleId(roleId));
    }

    return applyRolePermissionPolicy(rc, []);
};

/** Prisma nested connect by stable role code. */
const connectRole = (code) => ({ connect: { code: normalizeRole(code) } });

/**
 * Effective business role for display and session (sync).
 * Promotes to ORG_MANAGER when the user has any active ORG_MANAGER membership elsewhere.
 */
const resolveMembershipBusinessRole = (currentMembershipRole, hasOrgManagerMembership) => {
    if (currentMembershipRole != null && String(currentMembershipRole).trim() !== '') {
        const n = normalizeRole(currentMembershipRole);
        if (n === 'SUPER_ADMIN') return 'SUPER_ADMIN';
        if (n === 'ORG_MANAGER') return 'ORG_MANAGER';
    }

    if (hasOrgManagerMembership) {
        return 'ORG_MANAGER';
    }

    if (currentMembershipRole != null && String(currentMembershipRole).trim() !== '') {
        return normalizeRole(currentMembershipRole);
    }

    return null;
};

/** Batch: user IDs with at least one active ORG_MANAGER membership. */
const loadOrgManagerUserIdSet = async (userIds, db = prisma) => {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (ids.length === 0) return new Set();

    const rows = await db.tenantMember.findMany({
        where: {
            userId: { in: ids },
            isActive: true,
            role: { code: 'ORG_MANAGER' },
        },
        select: { userId: true },
        distinct: ['userId'],
    });

    return new Set(rows.map((row) => row.userId));
};

const userHasOrgManagerMembership = async (userId, db = prisma) => {
    if (!userId) return false;
    const row = await db.tenantMember.findFirst({
        where: {
            userId,
            isActive: true,
            role: { code: 'ORG_MANAGER' },
        },
        select: { id: true },
    });
    return Boolean(row);
};

/**
 * Effective session role: keep SUPER_ADMIN / ORG_MANAGER from the membership row; if the
 * current row has no/lower role, promote to ORG_MANAGER when the user has any active ORG_MANAGER membership.
 */
const resolveUserBestRole = async (userId, currentMembershipRole) => {
    const hasOrgManagerMembership = await userHasOrgManagerMembership(userId);
    return resolveMembershipBusinessRole(currentMembershipRole, hasOrgManagerMembership);
};

module.exports = {
    normalizeRole,
    membershipRoleCode,
    loadPermissionCodesForRoleId,
    loadUrPermissionCodesForRoleId,
    roleHasUrPermissions,
    getRoleIdByCode,
    getPermissionsForMembership,
    connectRole,
    resolveMembershipBusinessRole,
    loadOrgManagerUserIdSet,
    userHasOrgManagerMembership,
    resolveUserBestRole,
    applyRolePermissionPolicy,
    loadAllPermissionCodes,
    mergeWithOperationalMatrix,
    mergeAuthorityGrants,
    BASE_ROLE_PERMISSIONS,
};
