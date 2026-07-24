'use strict';

/**
 * ACC P1 — Tenant custom role lifecycle (registry only — no enforcement change).
 */

const prisma = require('../config/database');
const {
    SYSTEM_ROLE_CODE_SET,
    PROTECTED_ROLE_CODE_SET,
    toRoleCodeString,
} = require('../constants/role-codes.constants');
const auditLogger = require('./ur-audit.logger');

const CODE_SEGMENT_RE = /^[A-Z0-9][A-Z0-9_]{0,62}$/;

class AccRoleError extends Error {
    constructor(message, statusCode = 400, code = 'ACC_ROLE_ERROR') {
        super(message);
        this.name = 'AccRoleError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

async function resolveOrgRootForTenant(tenantId) {
    if (!tenantId) {
        throw new AccRoleError('No property context.', 400, 'NO_TENANT_CONTEXT');
    }
    const currentTenant = await prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { id: true, parentId: true, slug: true, name: true, isActive: true },
    });
    if (!currentTenant?.isActive) {
        throw new AccRoleError('Property context is invalid.', 400, 'INVALID_TENANT');
    }
    const orgRootId = currentTenant.parentId ?? currentTenant.id;
    const orgRoot = orgRootId === currentTenant.id
        ? currentTenant
        : await prisma.tenant.findUnique({
            where:  { id: orgRootId },
            select: { id: true, slug: true, name: true, isActive: true },
        });
    if (!orgRoot?.isActive) {
        throw new AccRoleError('Organization root not found.', 400, 'ORG_ROOT_NOT_FOUND');
    }
    const slug = String(orgRoot.slug || '').trim().toLowerCase().replace(/-/g, '_');
    if (!slug) {
        throw new AccRoleError('Organization slug is required for custom roles.', 400, 'ORG_SLUG_MISSING');
    }
    return { orgRootId: orgRoot.id, orgRootSlug: slug, orgRootName: orgRoot.name };
}

function normalizeRoleSlug(raw) {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
        .replace(/[^A-Z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

function buildCustomRoleCode(orgRootSlug, roleSlug) {
    const prefix = String(orgRootSlug || '').trim().toLowerCase().replace(/-/g, '_');
    const suffix = normalizeRoleSlug(roleSlug);
    if (!prefix || !suffix) {
        throw new AccRoleError('Role slug is required.', 400, 'ROLE_SLUG_REQUIRED');
    }
    if (!CODE_SEGMENT_RE.test(suffix)) {
        throw new AccRoleError('Role slug must use letters, numbers, and underscores.', 400, 'ROLE_SLUG_INVALID');
    }
    const code = `${prefix}__${suffix}`.toUpperCase();
    if (SYSTEM_ROLE_CODE_SET.has(code) || PROTECTED_ROLE_CODE_SET.has(code)) {
        throw new AccRoleError(`Role code '${code}' is reserved.`, 400, 'ROLE_CODE_RESERVED');
    }
    return code;
}

function deriveRoleSlugFromName(name) {
    const slug = normalizeRoleSlug(name);
    if (!slug) {
        throw new AccRoleError('Could not derive role slug from display name.', 400, 'ROLE_SLUG_REQUIRED');
    }
    return slug;
}

async function resolveUniqueRoleCode(orgRootSlug, baseSlug) {
    const base = normalizeRoleSlug(baseSlug);
    if (!base) {
        throw new AccRoleError('Role slug is required.', 400, 'ROLE_SLUG_REQUIRED');
    }

    for (let i = 0; i < 100; i++) {
        const slug = i === 0 ? base : `${base}_${i + 1}`;
        const code = buildCustomRoleCode(orgRootSlug, slug);
        const existing = await prisma.role.findUnique({ where: { code }, select: { id: true } });
        if (!existing) return { code, slug };
    }

    throw new AccRoleError('Unable to generate a unique role code.', 409, 'ROLE_CODE_COLLISION');
}

async function getRoleByCode(roleCode) {
    const code = toRoleCodeString(roleCode);
    const role = await prisma.role.findUnique({
        where: { code },
        select: {
            id: true, code: true, name: true, description: true,
            tenantId: true, isActive: true, createdAt: true, updatedAt: true,
            _count: { select: { urRolePermissions: true, urAssignments: true } },
        },
    });
    if (!role) {
        throw new AccRoleError(`Role '${code}' not found.`, 404, 'ROLE_NOT_FOUND');
    }
    return role;
}

function assertCustomRole(role) {
    if (!role.tenantId) {
        throw new AccRoleError('Only tenant custom roles support this operation.', 403, 'ROLE_NOT_CUSTOM');
    }
}

async function createCustomRole(actorId, { tenantId, name, roleSlug, description }) {
    const displayName = String(name || '').trim();
    if (!displayName) throw new AccRoleError('Role name is required.', 400, 'ROLE_NAME_REQUIRED');

    const { orgRootId, orgRootSlug } = await resolveOrgRootForTenant(tenantId);
    const slugInput = normalizeRoleSlug(roleSlug) || deriveRoleSlugFromName(displayName);
    const { code, slug } = await resolveUniqueRoleCode(orgRootSlug, slugInput);

    const role = await prisma.role.create({
        data: {
            code,
            name:        displayName,
            description: typeof description === 'string' ? description.trim() || null : null,
            tenantId:    orgRootId,
            isActive:    true,
        },
        select: {
            id: true, code: true, name: true, description: true,
            tenantId: true, isActive: true, createdAt: true, updatedAt: true,
        },
    });

    await auditLogger.logRoleCreated(actorId, role, { roleSlug: slug });
    return role;
}

async function cloneRole(actorId, sourceRoleCode, { tenantId, name, roleSlug }) {
    const source = await getRoleByCode(sourceRoleCode);
    const displayName = String(name || '').trim() || `${source.name} Copy`;
    const { orgRootId, orgRootSlug } = await resolveOrgRootForTenant(tenantId);
    const slugInput = normalizeRoleSlug(roleSlug) || deriveRoleSlugFromName(displayName);
    const { code, slug } = await resolveUniqueRoleCode(orgRootSlug, slugInput);

    const sourcePerms = await prisma.urRolePermission.findMany({
        where:  { roleId: source.id },
        select: { permissionId: true },
    });

    const role = await prisma.$transaction(async (tx) => {
        const created = await tx.role.create({
            data: {
                code,
                name:        displayName,
                description: source.description,
                tenantId:    orgRootId,
                isActive:    true,
            },
            select: {
                id: true, code: true, name: true, description: true,
                tenantId: true, isActive: true, createdAt: true, updatedAt: true,
            },
        });

        if (sourcePerms.length > 0) {
            await tx.urRolePermission.createMany({
                data: sourcePerms.map((p) => ({ roleId: created.id, permissionId: p.permissionId })),
                skipDuplicates: true,
            });
        }

        return created;
    });

    await auditLogger.logRoleCloned(actorId, source, role, { permissionCount: sourcePerms.length });
    return role;
}

async function updateRoleMetadata(actorId, roleCode, { name, description }) {
    const before = await getRoleByCode(roleCode);
    const data = {};

    if (name !== undefined) {
        const displayName = String(name || '').trim();
        if (!displayName) throw new AccRoleError('Role name is required.', 400, 'ROLE_NAME_REQUIRED');
        data.name = displayName;
    }
    if (description !== undefined) {
        data.description = typeof description === 'string' ? description.trim() || null : null;
    }
    if (Object.keys(data).length === 0) {
        throw new AccRoleError('No metadata fields provided.', 400, 'ROLE_METADATA_EMPTY');
    }

    const role = await prisma.role.update({
        where: { id: before.id },
        data,
        select: {
            id: true, code: true, name: true, description: true,
            tenantId: true, isActive: true, createdAt: true, updatedAt: true,
        },
    });

    await auditLogger.logRoleMetadataUpdated(actorId, before, role);
    return role;
}

async function retireCustomRole(actorId, roleCode) {
    const before = await getRoleByCode(roleCode);
    assertCustomRole(before);
    if (!before.isActive) return before;

    const activeAssignments = await prisma.urUserAssignment.count({
        where: { roleId: before.id, isActive: true },
    });

    const role = await prisma.role.update({
        where: { id: before.id },
        data:  { isActive: false },
        select: {
            id: true, code: true, name: true, description: true,
            tenantId: true, isActive: true, createdAt: true, updatedAt: true,
        },
    });

    await auditLogger.logRoleRetired(actorId, before, { activeAssignments });
    return role;
}

async function reactivateCustomRole(actorId, roleCode) {
    const before = await getRoleByCode(roleCode);
    assertCustomRole(before);
    if (before.isActive) return before;

    const role = await prisma.role.update({
        where: { id: before.id },
        data:  { isActive: true },
        select: {
            id: true, code: true, name: true, description: true,
            tenantId: true, isActive: true, createdAt: true, updatedAt: true,
        },
    });

    await auditLogger.logRoleReactivated(actorId, before, role);
    return role;
}

function mapRoleListItem(role) {
    return {
        id:               role.id,
        code:             role.code,
        name:             role.name,
        description:      role.description ?? null,
        tenantId:         role.tenantId ?? null,
        isActive:         role.isActive,
        permissionCount:  role._count?.urRolePermissions ?? 0,
        assignmentCount:  role._count?.urAssignments ?? 0,
        updatedAt:        role.updatedAt,
    };
}

module.exports = {
    AccRoleError,
    buildCustomRoleCode,
    normalizeRoleSlug,
    deriveRoleSlugFromName,
    resolveUniqueRoleCode,
    resolveOrgRootForTenant,
    getRoleByCode,
    createCustomRole,
    cloneRole,
    updateRoleMetadata,
    retireCustomRole,
    reactivateCustomRole,
    mapRoleListItem,
};
