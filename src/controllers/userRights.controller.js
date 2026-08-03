'use strict';

/**
 * User Rights Controller — Wave 6 (Access Control Center)
 * Reads and writes to the ur_* tables only.
 * Does NOT connect to authorization runtime. No changes to Legacy RBAC.
 */

const { PrismaClient } = require('@prisma/client');
const {
    createAssignmentsWithProvisioning,
} = require('../services/acc-assignment-fanout.service');
const {
    deactivateAssignmentWithMembership,
    reactivateAssignmentWithMembership,
    deleteAssignmentWithGovernance,
} = require('../services/acc-assignment-lifecycle.service');
const {
    editAssignment,
    listAssignments,
    getAssignment,
} = require('../engines/assignment.service');
const {
    addProperty,
    removeProperty,
    listProperties,
} = require('../engines/assignment-property.service');
const {
    addDepartment,
    removeDepartment,
    listDepartments,
} = require('../engines/assignment-department.service');
const { grant, deny, reset, listOverrides } = require('../engines/user-override.engine');
const { ValidationError } = require('../engines/assignment.validators');
const { userNotesFromAssignmentNotes, isLegacyTaggedNotes } = require('../services/acc-membership-assignment-sync.service');
const auditLogger = require('../engines/ur-audit.logger');
const { isAccLegacyDualWriteEnabled } = require('../acc-runtime/featureFlags');
const { computeEffectiveRuntimePermissionCodes } = require('../acc-authority/effective-runtime-permissions.util');
const {
    AccRoleError,
    createCustomRole,
    cloneRole: cloneAccRole,
    updateRoleMetadata,
    retireCustomRole,
    reactivateCustomRole,
    mapRoleListItem,
} = require('../engines/acc-role.service');
const { resolveEffectivePermissions, resolveEffectivePermissionsForSession } = require('../engines/permission-resolution.engine');
const { membershipRoleCode } = require('../services/rbac.service');
const {
    ACC_OPERATIONAL_EXCLUDED_ROLE_CODES,
    isAccOperationalExcludedRoleCode,
    PROTECTED_ROLE_CODE_SET,
} = require('../constants/role-codes.constants');
const {
    assertGmMayModifyTargetUser,
    assertGmMayModifyAssignment,
} = require('../utils/roleHierarchyGuard');

const prisma = new PrismaClient();

const _accOperationalExcludedArr = [...ACC_OPERATIONAL_EXCLUDED_ROLE_CODES];

/** Hotel ACC must not expose platform-only roles (SUPER_ADMIN) or legacy ADMIN. */
const _operationalRoleNotFound = (roleCode, res) => {
    if (isAccOperationalExcludedRoleCode(roleCode)) {
        res.status(404).json({ success: false, message: `Role '${roleCode}' not found.` });
        return true;
    }
    return false;
};

const _scopedOperationalAssignmentCount = (currentTenantId) => ({
    isActive: true,
    role: { code: { notIn: _accOperationalExcludedArr } },
    OR: [
        { properties: { none: {} } },
        { properties: { some: { propertyId: currentTenantId } } },
    ],
});

/** FY 01 P6 — org-group scoped operational assignment count (active only). */
const _orgGroupOperationalAssignmentCount = (orgGroupIds) => {
    const orgGroupArr = [...orgGroupIds];
    return {
        isActive: true,
        role: { code: { notIn: _accOperationalExcludedArr } },
        OR: [
            { properties: { none: {} } },
            { properties: { some: { propertyId: { in: orgGroupArr } } } },
        ],
    };
};

const _orgGroupAssignmentScope = (orgGroupIds) => {
    const orgGroupArr = [...orgGroupIds];
    return {
        OR: [
            { properties: { none: {} } },
            { properties: { some: { propertyId: { in: orgGroupArr } } } },
        ],
    };
};

const _operationalAssignmentsWhere = (userId, orgGroupIds, { includeInactive = false } = {}) => ({
    userId,
    role: { code: { notIn: _accOperationalExcludedArr } },
    ...(includeInactive ? {} : { isActive: true }),
    ..._orgGroupAssignmentScope(orgGroupIds),
});

/**
 * Map ur_permission IDs → legacy permissions.id via legacyCode.
 * Throws ValidationError when any legacyCode has no permissions row.
 */
const _resolveLegacyPermissionIds = async (db, urPermissionIds) => {
    if (!urPermissionIds.length) return [];

    const urRows = await db.urPermission.findMany({
        where:  { id: { in: urPermissionIds } },
        select: { id: true, legacyCode: true },
    });
    const legacyCodes = [...new Set(urRows.map((r) => r.legacyCode))];
    if (legacyCodes.length === 0) return [];

    const permRows = await db.permission.findMany({
        where:  { code: { in: legacyCodes } },
        select: { id: true, code: true },
    });
    const codeToId = new Map(permRows.map((p) => [p.code, p.id]));
    const missing  = legacyCodes.filter((c) => !codeToId.has(c));
    if (missing.length > 0) {
        throw new ValidationError(
            `Cannot sync to legacy RBAC — no permissions.code for legacyCode(s): ${missing.join(', ')}`,
        );
    }
    return legacyCodes.map((c) => codeToId.get(c));
};

/** Dual-write: sync role_permissions to match ur_role_permissions (same transaction client). */
const _syncLegacyRolePermissions = async (tx, roleId, urPermissionIds) => {
    const targetLegacyIds = await _resolveLegacyPermissionIds(tx, urPermissionIds);

    const currentRows = await tx.rolePermission.findMany({
        where:  { roleId },
        select: { permissionId: true },
    });
    const currentIds  = currentRows.map((r) => r.permissionId);
    const targetSet     = new Set(targetLegacyIds);
    const currentSet    = new Set(currentIds);
    const toDelete      = currentIds.filter((id) => !targetSet.has(id));
    const toInsert      = targetLegacyIds.filter((id) => !currentSet.has(id));

    if (toDelete.length > 0) {
        await tx.rolePermission.deleteMany({
            where: { roleId, permissionId: { in: toDelete } },
        });
    }
    if (toInsert.length > 0) {
        await tx.rolePermission.createMany({
            data:           toInsert.map((permissionId) => ({ roleId, permissionId })),
            skipDuplicates: true,
        });
    }

    return toDelete.length > 0 || toInsert.length > 0;
};

/** True when legacy role_permissions does not match ur_role_permissions (by legacyCode mapping). */
const _legacyDriftExists = async (db, roleId, urPermissionIds) => {
    const targetLegacyIds = await _resolveLegacyPermissionIds(db, urPermissionIds);
    const targetSet = new Set(targetLegacyIds);
    const currentRows = await db.rolePermission.findMany({
        where:  { roleId },
        select: { permissionId: true },
    });
    const currentIds = currentRows.map((r) => r.permissionId);
    if (currentIds.length !== targetLegacyIds.length) return true;
    return currentIds.some((id) => !targetSet.has(id));
};

/** Bump permissionVersion for users holding this role via membership or assignment. */
const _bumpPermissionVersionForRole = async (roleId) => {
    const [members, assignments] = await Promise.all([
        prisma.tenantMember.findMany({
            where:  { roleId, isActive: true },
            select: { userId: true },
        }),
        prisma.urUserAssignment.findMany({
            where:  { roleId, isActive: true },
            select: { userId: true },
        }),
    ]);
    const userIds = [...new Set([
        ...members.map((m) => m.userId),
        ...assignments.map((a) => a.userId),
    ])];
    if (userIds.length === 0) return;
    await prisma.user.updateMany({
        where: { id: { in: userIds } },
        data:  { permissionVersion: { increment: 1 } },
    });
};

// ── Error helper ─────────────────────────────────────────────────────────────
const handle = (label, fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof ValidationError) {
            return res.status(err.statusCode ?? 400).json({
                success: false,
                message: err.message,
                code:    err.code ?? undefined,
            });
        }
        if (err instanceof AccRoleError) {
            return res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
        }
        if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
            return res.status(err.statusCode).json({
                success: false,
                message: err.message,
                code:    err.code ?? undefined,
            });
        }
        if (err.statusCode === 404) {
            return res.status(404).json({ success: false, message: err.message });
        }
        console.error(`[user-rights] ${label}:`, err);
        return res.status(500).json({ success: false, message: `Failed: ${label}` });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — Read-only matrix (unchanged)
// ═══════════════════════════════════════════════════════════════════════════

const getMatrix = handle('getMatrix', async (req, res) => {
    const resources = await prisma.urResource.findMany({
        orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
        include: {
            urPermissions: {
                include: { action: { select: { id: true, code: true, name: true, displayOrder: true } } },
                orderBy: { action: { displayOrder: 'asc' } },
            },
        },
    });

    const formatted = resources.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        category: r.category,
        displayOrder: r.displayOrder,
        permissions: r.urPermissions.map((p) => ({
            id: p.id,
            legacyCode: p.legacyCode,
            actionCode: p.action.code,
            actionName: p.action.name,
            actionOrder: p.action.displayOrder,
        })),
    }));

    return res.json({ success: true, data: { resources: formatted } });
});

const getRolePermissions = handle('getRolePermissions', async (req, res) => {
    const { roleCode } = req.params;
    if (_operationalRoleNotFound(roleCode, res)) return;
    const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true, code: true } });
    if (!role) return res.status(404).json({ success: false, message: `Role '${roleCode}' not found.` });

    const rolePerms = await prisma.urRolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionId: true },
    });

    return res.json({ success: true, data: { roleCode: role.code, permissionIds: rolePerms.map((rp) => rp.permissionId) } });
});

// Read-only drift report: ur_* vs legacy role_permissions (matrix union retired Phase F).
const getRolePermissionsDrift = handle('getRolePermissionsDrift', async (req, res) => {
    const { roleCode } = req.params;
    if (_operationalRoleNotFound(roleCode, res)) return;
    const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true, code: true } });
    if (!role) return res.status(404).json({ success: false, message: `Role '${roleCode}' not found.` });

    const urRows = await prisma.urRolePermission.findMany({
        where:  { roleId: role.id },
        select: { permissionId: true, permission: { select: { legacyCode: true } } },
    });
    const urPermissionIds  = urRows.map((r) => r.permissionId);
    const urLegacyCodes    = [...new Set(urRows.map((r) => r.permission.legacyCode))].sort();

    const legacyRows = await prisma.rolePermission.findMany({
        where:  { roleId: role.id },
        select: { permission: { select: { code: true } } },
    });
    const legacyPermissionCodes = [...new Set(legacyRows.map((r) => r.permission.code))].sort();

    const effectiveRuntimeCodes = computeEffectiveRuntimePermissionCodes(role.code, urLegacyCodes, legacyPermissionCodes);

    const urLegacySet    = new Set(urLegacyCodes);
    const legacySet      = new Set(legacyPermissionCodes);

    const inUrNotInLegacy = urLegacyCodes.filter((c) => !legacySet.has(c));
    const inLegacyNotInUr = legacyPermissionCodes.filter((c) => !urLegacySet.has(c));

    return res.json({
        success: true,
        data: {
            roleCode:               role.code,
            urPermissionIds,
            urLegacyCodes,
            legacyPermissionCodes,
            matrixBundleCodes:      [],
            effectiveRuntimeCodes,
            drift: {
                inUrNotInLegacy,
                inLegacyNotInUr,
                addedByMatrixUnion:   [],
            },
        },
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROLE PERMISSIONS — Write (Edit/Save model)
// ═══════════════════════════════════════════════════════════════════════════

// Roles whose permission matrix is system-protected and must never be modified.
const PROTECTED_ROLE_CODES = PROTECTED_ROLE_CODE_SET;

/** Legacy + platform roles hidden from hotel operational ACC registry. */
const ACC_REGISTRY_EXCLUDED_ROLE_CODES = new Set(_accOperationalExcludedArr);

const setRolePermissions = handle('setRolePermissions', async (req, res) => {
    const { roleCode } = req.params;
    if (_operationalRoleNotFound(roleCode, res)) return;

    // Guard: reject protected roles unconditionally.
    if (PROTECTED_ROLE_CODES.has(roleCode)) {
        return res.status(403).json({
            success: false,
            message: `Role '${roleCode}' is system-protected. Its permissions cannot be modified.`,
            code:    'ROLE_PROTECTED',
        });
    }

    // Resolve role.
    const role = await prisma.role.findUnique({
        where:  { code: roleCode },
        select: { id: true, code: true },
    });
    if (!role) {
        return res.status(404).json({ success: false, message: `Role '${roleCode}' not found.` });
    }

    // Validate payload shape.
    const raw = req.body?.permissionIds;
    if (!Array.isArray(raw)) {
        return res.status(400).json({ success: false, message: '`permissionIds` must be an array.' });
    }

    // Deduplicate: remove nulls, non-strings, empty strings, and duplicate values.
    const dedupedIds = [...new Set(raw.filter((id) => typeof id === 'string' && id.trim().length > 0))];

    // Validate every submitted ID exists in ur_permissions.
    if (dedupedIds.length > 0) {
        const found = await prisma.urPermission.findMany({
            where:  { id: { in: dedupedIds } },
            select: { id: true },
        });
        const foundSet = new Set(found.map((p) => p.id));
        const unknown  = dedupedIds.filter((id) => !foundSet.has(id));
        if (unknown.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Unknown permission IDs: ${unknown.join(', ')}`,
            });
        }
    }

    // Read current permission set for this role.
    const currentRows = await prisma.urRolePermission.findMany({
        where:  { roleId: role.id },
        select: { permissionId: true },
    });
    const currentIds = currentRows.map((r) => r.permissionId);

    // Sort + deduplicate both sides before comparison.
    const sortedCurrent = [...new Set(currentIds)].sort();
    const sortedNew     = [...dedupedIds].sort();

    // No-op on ur_* only when legacy role_permissions is already aligned.
    const urNoChange =
        sortedCurrent.length === sortedNew.length &&
        sortedCurrent.every((id, i) => id === sortedNew[i]);

    if (urNoChange) {
        const legacyAligned = !isAccLegacyDualWriteEnabled()
            || !(await _legacyDriftExists(prisma, role.id, dedupedIds));
        if (legacyAligned) {
            return res.json({
                success: true,
                data:    { roleCode: role.code, permissionIds: sortedNew },
                changed: false,
            });
        }

        // Legacy drift repair when dual-write enabled.
        let legacyRepaired = false;
        if (isAccLegacyDualWriteEnabled()) {
            await prisma.$transaction(async (tx) => {
                legacyRepaired = await _syncLegacyRolePermissions(tx, role.id, dedupedIds);
            });
            if (legacyRepaired) {
                await _bumpPermissionVersionForRole(role.id);
            }
        }

        return res.json({
            success: true,
            data:    { roleCode: role.code, permissionIds: sortedNew },
            changed: false,
            legacyRepaired,
        });
    }

    // Compute diff.
    const currentSet = new Set(currentIds);
    const newSet     = new Set(dedupedIds);
    const toDelete   = currentIds.filter((id) => !newSet.has(id));
    const toInsert   = dedupedIds.filter((id) => !currentSet.has(id));

    // Atomic transaction: ur_* sole write (optional legacy dual-write for rollback).
    await prisma.$transaction(async (tx) => {
        if (toDelete.length > 0) {
            await tx.urRolePermission.deleteMany({
                where: { roleId: role.id, permissionId: { in: toDelete } },
            });
        }
        if (toInsert.length > 0) {
            await tx.urRolePermission.createMany({
                data:           toInsert.map((permissionId) => ({ roleId: role.id, permissionId })),
                skipDuplicates: true,
            });
        }
        if (isAccLegacyDualWriteEnabled()) {
            await _syncLegacyRolePermissions(tx, role.id, dedupedIds);
        }
    });

    await _bumpPermissionVersionForRole(role.id);

    await auditLogger.logRolePermissionsUpdated(
        req.user.id,
        role.id,
        { permissionIds: sortedCurrent },
        { permissionIds: sortedNew },
    );

    return res.json({
        success: true,
        data:    { roleCode: role.code, permissionIds: sortedNew },
        changed: true,
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 6 — Roles
// ═══════════════════════════════════════════════════════════════════════════

const _roleListSelect = {
    id: true, code: true, name: true, description: true,
    tenantId: true, isActive: true, updatedAt: true,
    _count: { select: { urRolePermissions: true, urAssignments: true } },
};

const getRoles = handle('getRoles', async (req, res) => {
    const roles = await prisma.role.findMany({
        where: {
            code: { notIn: [...ACC_REGISTRY_EXCLUDED_ROLE_CODES] },
            OR: [
                { isActive: true },
                { tenantId: { not: null }, isActive: false },
            ],
        },
        select: _roleListSelect,
        orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });

    return res.json({ success: true, data: roles.map(mapRoleListItem) });
});

const createRole = handle('createRole', async (req, res) => {
    const role = await createCustomRole(req.user.id, {
        tenantId: req.user?.tenantId,
        name:     req.body?.name,
        roleSlug: req.body?.roleSlug,
        description: req.body?.description,
    });
    const withCounts = await prisma.role.findUnique({
        where:  { id: role.id },
        select: _roleListSelect,
    });
    return res.status(201).json({ success: true, data: mapRoleListItem(withCounts) });
});

const cloneRole = handle('cloneRole', async (req, res) => {
    const { roleCode } = req.params;
    if (_operationalRoleNotFound(roleCode, res)) return;
    const role = await cloneAccRole(req.user.id, roleCode, {
        tenantId: req.user?.tenantId,
        name:     req.body?.name,
        roleSlug: req.body?.roleSlug,
    });
    const withCounts = await prisma.role.findUnique({
        where:  { id: role.id },
        select: _roleListSelect,
    });
    return res.status(201).json({ success: true, data: mapRoleListItem(withCounts) });
});

const patchRoleMetadata = handle('patchRoleMetadata', async (req, res) => {
    const { roleCode } = req.params;
    if (_operationalRoleNotFound(roleCode, res)) return;
    const role = await updateRoleMetadata(req.user.id, roleCode, {
        name:        req.body?.name,
        description: req.body?.description,
    });
    const withCounts = await prisma.role.findUnique({
        where:  { id: role.id },
        select: _roleListSelect,
    });
    return res.json({ success: true, data: mapRoleListItem(withCounts) });
});

const retireRole = handle('retireRole', async (req, res) => {
    const { roleCode } = req.params;
    if (_operationalRoleNotFound(roleCode, res)) return;
    const role = await retireCustomRole(req.user.id, roleCode);
    const withCounts = await prisma.role.findUnique({
        where:  { id: role.id },
        select: _roleListSelect,
    });
    return res.json({ success: true, data: mapRoleListItem(withCounts) });
});

const reactivateRole = handle('reactivateRole', async (req, res) => {
    const { roleCode } = req.params;
    if (_operationalRoleNotFound(roleCode, res)) return;
    const role = await reactivateCustomRole(req.user.id, roleCode);
    const withCounts = await prisma.role.findUnique({
        where:  { id: role.id },
        select: _roleListSelect,
    });
    return res.json({ success: true, data: mapRoleListItem(withCounts) });
});

/**
 * Org-group display context for Assigned Users read model (display only — no enforcement change).
 * - orgRoot: parent org tenant (e.g. DX Hospitality Group)
 * - branchProperties: child hotels only (excludes org root)
 */
const _resolveOrgGroupDisplayContext = async (currentTenantId) => {
    const orgGroupIds = await _resolveOrgGroupIds(currentTenantId);
    if (!currentTenantId || orgGroupIds.size === 0) {
        return { orgGroupIds, orgRootId: null, orgRoot: null, branchProperties: [] };
    }

    const currentTenant = await prisma.tenant.findUnique({
        where:  { id: currentTenantId },
        select: { parentId: true },
    });
    const orgRootId = currentTenant?.parentId ?? currentTenantId;

    const tenants = await prisma.tenant.findMany({
        where:  { isActive: true, id: { in: [...orgGroupIds] } },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
    });

    const orgRoot = tenants.find((t) => t.id === orgRootId) ?? null;
    const branchProperties = tenants
        .filter((t) => t.parentId === orgRootId)
        .map((t) => ({ id: t.id, name: t.name }));

    return { orgGroupIds, orgRootId, orgRoot, branchProperties };
};

/**
 * P0.1 — User-centric read model for Role → Assigned Users.
 * All Properties → single org-root tag (whole group). Specific scope → branch hotels only (no root).
 */
const _aggregateRoleAssignedUsers = async (assignments, orgDisplay) => {
    const { orgGroupIds, orgRootId, orgRoot, branchProperties } = orgDisplay;

    /** @type {Map<string, { user: object, propertyMap: Map<string, {id:string,name:string}>, deptMap: Map<string, object>, allProperties: boolean, allDepartments: boolean, assignmentCount: number }>} */
    const byUser = new Map();

    for (const a of assignments) {
        const uid = a.user.id;
        if (!byUser.has(uid)) {
            byUser.set(uid, {
                user:            a.user,
                propertyMap:     new Map(),
                deptMap:         new Map(),
                allProperties:   false,
                allDepartments:  false,
                assignmentCount: 0,
            });
        }
        const entry = byUser.get(uid);
        entry.assignmentCount += 1;

        if (a.properties.length === 0) {
            entry.allProperties = true;
        } else {
            for (const p of a.properties) {
                const prop = p.property;
                if (prop && orgGroupIds.has(prop.id) && prop.id !== orgRootId) {
                    entry.propertyMap.set(prop.id, { id: prop.id, name: prop.name });
                }
            }
        }

        if (a.departments.length === 0) {
            entry.allDepartments = true;
        } else {
            for (const d of a.departments) {
                const dept = d.department;
                if (dept) entry.deptMap.set(dept.id, dept);
            }
        }
    }

    const data = [...byUser.values()]
        .map((entry) => {
            let properties = [];
            let allProperties = false;

            if (entry.allProperties) {
                // Whole org group: one tag = org root name (not root + branch hotels).
                if (orgRoot) {
                    properties = [{ id: orgRoot.id, name: orgRoot.name }];
                } else if (branchProperties.length > 0) {
                    properties = [...branchProperties];
                }
                allProperties = false;
            } else {
                properties = [...entry.propertyMap.values()].sort((a, b) => a.name.localeCompare(b.name));
                if (properties.length === 0 && branchProperties.length === 1) {
                    properties = [...branchProperties];
                }
            }

            const departments = entry.allDepartments
                ? []
                : [...entry.deptMap.values()];

            return {
                userId:           entry.user.id,
                name:             `${entry.user.firstName} ${entry.user.lastName}`,
                email:            entry.user.email,
                isActive:         entry.user.isActive,
                properties,
                allProperties,
                departments,
                allDepartments:   entry.allDepartments,
                assignmentCount:  entry.assignmentCount,
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    return data;
};

const getRoleAssignedUsers = handle('getRoleAssignedUsers', async (req, res) => {
    const { roleCode } = req.params;
    if (_operationalRoleNotFound(roleCode, res)) return;
    const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } });
    if (!role) return res.status(404).json({ success: false, message: `Role '${roleCode}' not found.` });

    // Phase 1.2 Final — scope to org group (same as getUserAssignments).
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) {
        return res.status(400).json({ success: false, message: 'No property context.' });
    }
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const orgGroupArr = [...orgGroupIds];

    const orgGroupScope = {
        OR: [
            { properties: { none: {} } },
            { properties: { some: { propertyId: { in: orgGroupArr } } } },
        ],
    };

    const assignments = await prisma.urUserAssignment.findMany({
        where: { roleId: role.id, isActive: true, ...orgGroupScope },
        include: {
            user:        { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
            properties:  { select: { property: { select: { id: true, name: true } } } },
            departments: { select: { department: { select: { id: true, name: true, code: true } } } },
        },
    });

    const orgDisplay = await _resolveOrgGroupDisplayContext(tenantId);
    const data = await _aggregateRoleAssignedUsers(assignments, orgDisplay);

    return res.json({ success: true, data });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1.2 Final — Three distinct property semantics
//
// 1. Header Property Switcher       → Properties the ACTOR can switch to.
//                                     Source: actor's TenantMember rows.
//                                     Owned by auth.service.js. NOT here.
//
// 2. Add Assignment → Properties    → ALL properties in the current org group.
//                                     Source: Tenant table (parentId chain).
//                                     Owned by _resolveOrgGroupIds().
//
// 3. User Detail Assignments        → Assignments for the TARGET user filtered
//                                     to the org group (prevents cross-org leakage).
//                                     Source: UrUserAssignment filtered by org group.
// ─────────────────────────────────────────────────────────────────────────────

// Returns a Set<string> of all property IDs in the current org group.
// Used for: Add Assignment lookup, getUserAssignments, mutation guards.
const _resolveOrgGroupIds = async (currentTenantId) => {
    if (!currentTenantId) return new Set();
    const currentTenant = await prisma.tenant.findUnique({
        where:  { id: currentTenantId },
        select: { parentId: true },
    });
    const orgRootId = currentTenant?.parentId ?? currentTenantId;
    const rows = await prisma.tenant.findMany({
        where:  { isActive: true, OR: [{ id: orgRootId }, { parentId: orgRootId }] },
        select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
};

// Returns active assignment IDs for a user that belong to the org group.
// Used by getUserOverrides to filter overrides to in-org assignments.
const _visibleAssignmentIds = async (userId, orgGroupIds) => {
    const orgGroupArr = [...orgGroupIds];
    const rows = await prisma.urUserAssignment.findMany({
        where: {
            userId,
            isActive: true,
            OR: [
                { properties: { none: {} } },
                { properties: { some: { propertyId: { in: orgGroupArr } } } },
            ],
        },
        select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
};

// Asserts an assignment ID is within the org group (not any other org).
// Throws 404 if not found. Returns false if out-of-group.
const _assertAssignmentInScope = async (assignmentId, orgGroupIds) => {
    const a = await prisma.urUserAssignment.findUnique({
        where:  { id: assignmentId },
        select: { id: true, properties: { select: { propertyId: true } } },
    });
    if (!a) {
        const err = new Error(`Assignment not found: ${assignmentId}`);
        err.statusCode = 404;
        throw err;
    }
    if (a.properties.length === 0) return true;   // all-properties — always in scope
    return a.properties.some((p) => orgGroupIds.has(p.propertyId));
};

// Inline include shape mirrored from assignment.service.js ASSIGNMENT_INCLUDE.
// Kept local so the service remains unchanged.
const ASSIGNMENT_INCLUDE_SHAPE = {
    role:        { select: { id: true, code: true, name: true } },
    properties:  { select: { id: true, propertyId: true, property: { select: { id: true, name: true, slug: true } } } },
    departments: { select: { id: true, departmentId: true, department: { select: { id: true, name: true, code: true } } } },
};

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 6 — Users
// ═══════════════════════════════════════════════════════════════════════════

const getUsers = handle('getUsers', async (req, res) => {
    const { search } = req.query;

    // P0 Scope Fix: resolve current property from the authenticated user's context.
    // req.user.tenantId is already set by the auth middleware and respects ORG_MANAGER
    // x-tenant-id header switching — so a single check here covers all roles correctly.
    const currentTenantId = req.user?.tenantId ?? null;

    if (!currentTenantId) {
        return res.status(400).json({
            success: false,
            message: 'No property context. Please log in within a property.',
        });
    }

    const orgGroupIds  = await _resolveOrgGroupIds(currentTenantId);
    const orgGroupArr  = [...orgGroupIds];

    // Build optional name/email search clause
    const searchClause = search
        ? {
            OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName:  { contains: search, mode: 'insensitive' } },
                { email:     { contains: search, mode: 'insensitive' } },
            ],
          }
        : {};

    // A user is visible in this property if they have EITHER:
    //   (A) An active UrUserAssignment that covers this property
    //       — assignment with no property rows = all-properties (still counts)
    //       — assignment with a property row matching currentTenantId
    //   OR
    //   (B) A legacy TenantMember row for this property (isActive = true)
    const propertyFilter = {
        OR: [
            {
                urAssignments: {
                    some: {
                        isActive: true,
                        role: { code: { notIn: _accOperationalExcludedArr } },
                        OR: [
                            // All-properties assignment — no property rows
                            { properties: { none: {} } },
                            // Property-specific assignment matching current property
                            { properties: { some: { propertyId: currentTenantId } } },
                        ],
                    },
                },
            },
            {
                // Legacy membership for this property (exclude platform-only roles)
                memberships: {
                    some: {
                        tenantId:  currentTenantId,
                        isActive: true,
                        role: { code: { notIn: _accOperationalExcludedArr } },
                    },
                },
            },
        ],
    };

    const users = await prisma.user.findMany({
        where: { isActive: true, ...propertyFilter, ...searchClause },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
            // Only return the membership for the current property (for legacyRole display)
            memberships: {
                where: { tenantId: currentTenantId, isActive: true },
                select: { role: { select: { code: true, name: true } } },
                take: 1,
            },
            urAssignments: {
                where: _orgGroupOperationalAssignmentCount(orgGroupIds),
                select: {
                    id: true,
                    isActive: true,
                    role: { select: { code: true, name: true } },
                    properties: {
                        select: {
                            propertyId: true,
                            property: { select: { id: true, name: true } },
                        },
                    },
                    departments: {
                        select: {
                            departmentId: true,
                            department: { select: { id: true, name: true } },
                        },
                    },
                },
                orderBy: { updatedAt: 'desc' },
            },
            _count: {
                select: {
                    urAssignments: {
                        where: _orgGroupOperationalAssignmentCount(orgGroupIds),
                    },
                },
            },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 200,
    });

    const data = users
        .map((u) => {
            const assignments = (u.urAssignments ?? []).map((a) => {
                const allProperties = (a.properties ?? []).length === 0;
                const scopeLabel = allProperties
                    ? 'All Properties'
                    : (a.properties[0]?.property?.name ?? a.properties[0]?.propertyId ?? '—');
                const departmentLabels = (a.departments ?? []).length === 0
                    ? []
                    : a.departments.map((d) => d.department?.name ?? d.departmentId).filter(Boolean);
                return {
                    id: a.id,
                    roleName: a.role?.name ?? a.role?.code ?? '—',
                    roleCode: a.role?.code ?? null,
                    scopeLabel,
                    departmentLabels,
                    isActive: a.isActive,
                };
            });
            return {
                id: u.id,
                name: `${u.firstName} ${u.lastName}`,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                phone: u.phone ?? null,
                isActive: u.isActive,
                legacyRole: u.memberships[0]?.role?.code ?? null,
                assignmentCount: u._count.urAssignments,
                assignments,
            };
        })
        .filter(
            (u) =>
                u.assignmentCount > 0
                || (u.legacyRole && !isAccOperationalExcludedRoleCode(u.legacyRole)),
        );

    return res.json({ success: true, data });
});

const getUserAssignments = handle('getUserAssignments', async (req, res) => {
    const { userId } = req.params;
    const { includeInactive } = req.query;

    // Phase 1.2 Final — scope to org group (not single property).
    // User Detail shows ALL assignments for the target user within the org group.
    // "All Properties" assignments (no property rows) are always included.
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) {
        return res.status(400).json({ success: false, message: 'No property context.' });
    }
    const orgGroupIds  = await _resolveOrgGroupIds(tenantId);

    const where = _operationalAssignmentsWhere(userId, orgGroupIds, {
        includeInactive: includeInactive === 'true',
    });

    const inactiveWhere = {
        userId,
        isActive: false,
        role: { code: { notIn: _accOperationalExcludedArr } },
        ..._orgGroupAssignmentScope(orgGroupIds),
    };

    const [assignments, activeCount, inactiveCount] = await Promise.all([
        prisma.urUserAssignment.findMany({
            where,
            include: ASSIGNMENT_INCLUDE_SHAPE,
            orderBy: { createdAt: 'asc' },
        }),
        prisma.urUserAssignment.count({
            where: _operationalAssignmentsWhere(userId, orgGroupIds, { includeInactive: false }),
        }),
        prisma.urUserAssignment.count({ where: inactiveWhere }),
    ]);

    const data = assignments.map((a) => ({
        id:         a.id,
        roleId:     a.roleId,
        roleCode:   a.role.code,
        roleName:   a.role.name,
        isActive:   a.isActive,
        notes:      userNotesFromAssignmentNotes(a.notes),
        isMigrated: isLegacyTaggedNotes(a.notes),
        properties: a.properties.map((p) => ({ id: p.propertyId, name: p.property?.name })),
        departments: a.departments.map((d) => ({ id: d.departmentId, name: d.department?.name })),
        allProperties:  a.properties.length === 0,
        allDepartments: a.departments.length === 0,
        createdAt:  a.createdAt,
    }));

    return res.json({
        success: true,
        data,
        meta: {
            activeCount,
            inactiveCount,
            totalCount: activeCount + inactiveCount,
            includeInactive: includeInactive === 'true',
        },
    });
});

const createUserAssignment = handle('createUserAssignment', async (req, res) => {
    const { userId }           = req.params;
    const actorId              = req.user.id;
    const { propertyIds = [] } = req.body;
    const tenantId             = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });

    await assertGmMayModifyTargetUser(prisma, {
        actorRoleCode: req.user?.role ?? null,
        targetUserId: userId,
    });

    const orgGroupIds = await _resolveOrgGroupIds(tenantId);

    if (propertyIds.length > 0) {
        const outOfScope  = propertyIds.filter((pid) => !orgGroupIds.has(pid));
        if (outOfScope.length > 0) {
            return res.status(403).json({
                success: false,
                message: `Cannot assign to properties outside the organization group: ${outOfScope.join(', ')}`,
            });
        }
    }
    // Empty propertyIds = All Properties — only ORG_MANAGER may grant cross-property access
    if (propertyIds.length === 0 && req.user?.role !== 'ORG_MANAGER') {
        return res.status(403).json({
            success: false,
            message: 'Only Organization Managers may create All-Properties assignments.',
        });
    }

    const result = await createAssignmentsWithProvisioning(
        actorId,
        { userId, ...req.body },
        { orgGroupIds, actorRoleCode: req.user?.role },
    );

    if (!result.assignment) {
        return res.status(500).json({ success: false, message: 'Failed to create assignment.' });
    }

    const data = {
        id:         result.assignment.id,
        roleId:     result.assignment.roleId,
        roleCode:   result.assignment.role?.code,
        roleName:   result.assignment.role?.name,
        isActive:   result.assignment.isActive,
        notes:      userNotesFromAssignmentNotes(result.assignment.notes),
        isMigrated: isLegacyTaggedNotes(result.assignment.notes),
        properties: (result.assignment.properties ?? []).map((p) => ({
            id: p.propertyId,
            name: p.property?.name,
        })),
        departments: (result.assignment.departments ?? []).map((d) => ({
            id: d.departmentId,
            name: d.department?.name,
        })),
        allProperties:  (result.assignment.properties ?? []).length === 0,
        allDepartments: (result.assignment.departments ?? []).length === 0,
        createdAt:  result.assignment.createdAt,
    };

    return res.status(result.created ? 201 : 200).json({
        success: true,
        data,
        meta: { created: result.created },
    });
});

const updateUserAssignment = handle('updateUserAssignment', async (req, res) => {
    const { assignmentId } = req.params;
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
    if (!inScope) {
        return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    }
    await assertGmMayModifyAssignment(prisma, {
        actorRoleCode: req.user?.role ?? null,
        assignmentId,
    });
    const assignment = await editAssignment(req.user.id, assignmentId, req.body, {
        actorRoleCode: req.user?.role ?? null,
    });
    return res.json({ success: true, data: assignment });
});

const deactivateUserAssignment = handle('deactivateUserAssignment', async (req, res) => {
    const { assignmentId } = req.params;
    const actorId  = req.user.id;
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    // Phase 1.2 Final — guard against cross-org mutations (org group scope)
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
    if (!inScope) return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    await assertGmMayModifyAssignment(prisma, {
        actorRoleCode: req.user?.role ?? null,
        assignmentId,
    });
    const assignment = await deactivateAssignmentWithMembership(actorId, assignmentId, {
        actorRoleCode: req.user?.role ?? null,
    });
    return res.json({ success: true, data: assignment });
});

const reactivateUserAssignment = handle('reactivateUserAssignment', async (req, res) => {
    const { assignmentId } = req.params;
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
    if (!inScope) return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    await assertGmMayModifyAssignment(prisma, {
        actorRoleCode: req.user?.role ?? null,
        assignmentId,
    });
    const assignment = await reactivateAssignmentWithMembership(req.user.id, assignmentId, {
        actorRoleCode: req.user?.role ?? null,
    });
    return res.json({ success: true, data: assignment });
});

const deleteUserAssignment = handle('deleteUserAssignment', async (req, res) => {
    const { assignmentId } = req.params;
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
    if (!inScope) return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    await assertGmMayModifyAssignment(prisma, {
        actorRoleCode: req.user?.role ?? null,
        assignmentId,
    });
    const result = await deleteAssignmentWithGovernance(req.user.id, assignmentId, {
        actorRoleCode: req.user?.role ?? null,
    });
    return res.json({ success: true, data: result });
});

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 6 — Property Scope
// ═══════════════════════════════════════════════════════════════════════════

const getAssignmentProperties = handle('getAssignmentProperties', async (req, res) => {
    const rows = await listProperties(req.params.assignmentId);
    return res.json({ success: true, data: rows });
});

const addAssignmentProperty = handle('addAssignmentProperty', async (req, res) => {
    const { assignmentId } = req.params;
    const { propertyId }   = req.body;
    const tenantId         = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
    if (!inScope) return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    // Also validate the target propertyId being added is within the org group
    if (propertyId && !orgGroupIds.has(propertyId)) {
        return res.status(403).json({ success: false, message: 'Cannot add a property outside the current organization group.' });
    }
    const row = await addProperty(req.user.id, assignmentId, propertyId);
    return res.status(201).json({ success: true, data: row });
});

const removeAssignmentProperty = handle('removeAssignmentProperty', async (req, res) => {
    const { assignmentId, propertyId } = req.params;
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
    if (!inScope) return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    const result = await removeProperty(req.user.id, assignmentId, propertyId);
    return res.json({ success: true, data: result });
});

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 6 — Department Scope
// ═══════════════════════════════════════════════════════════════════════════

const getAssignmentDepartments = handle('getAssignmentDepartments', async (req, res) => {
    const rows = await listDepartments(req.params.assignmentId);
    return res.json({ success: true, data: rows });
});

const addAssignmentDepartment = handle('addAssignmentDepartment', async (req, res) => {
    const { assignmentId } = req.params;
    const { departmentId } = req.body;
    const tenantId         = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
    if (!inScope) return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    const row = await addDepartment(req.user.id, assignmentId, departmentId, {
        actorRoleCode: req.user?.role ?? null,
    });
    return res.status(201).json({ success: true, data: row });
});

const removeAssignmentDepartment = handle('removeAssignmentDepartment', async (req, res) => {
    const { assignmentId, departmentId } = req.params;
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
    if (!inScope) return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    const result = await removeDepartment(req.user.id, assignmentId, departmentId, {
        actorRoleCode: req.user?.role ?? null,
    });
    return res.json({ success: true, data: result });
});

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 6 — Overrides
// ═══════════════════════════════════════════════════════════════════════════

const getUserOverrides = handle('getUserOverrides', async (req, res) => {
    const { userId } = req.params;
    const tenantId   = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });

    const overrides = await listOverrides(userId);

    // Phase 1.2 Final — filter overrides to org group.
    // Global overrides (assignmentId = null) always included.
    // Assignment-scoped overrides: only if the assignment belongs to the org group.
    const orgGroupIds = await _resolveOrgGroupIds(tenantId);
    const visibleIds  = await _visibleAssignmentIds(userId, orgGroupIds);

    const scoped = overrides.filter(
        (o) => o.assignmentId === null || visibleIds.has(o.assignmentId),
    );

    const data = scoped.map((o) => ({
        id:             o.id,
        permissionId:   o.permissionId,
        legacyCode:     o.permission.legacyCode,
        permissionName: o.permission.name,
        resourceName:   o.permission.resource?.name,
        actionName:     o.permission.action?.name,
        isGranted:      o.isGranted,
        reason:         o.reason,
        expiresAt:      o.expiresAt,
        assignmentId:   o.assignmentId,
        createdAt:      o.createdAt,
    }));

    return res.json({ success: true, data });
});

const setUserOverride = handle('setUserOverride', async (req, res) => {
    const { userId } = req.params;
    const { permissionId, isGranted, reason, expiresAt, assignmentId } = req.body;
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    if (assignmentId) {
        // Phase 1.2 Final — guard against cross-org override operations
        const orgGroupIds = await _resolveOrgGroupIds(tenantId);
        const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
        if (!inScope) return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    }

    let result;
    const auditOpts = { actorId: req.user?.id ?? null };
    if (isGranted === true) {
        result = await grant(userId, permissionId, {
            assignmentId: assignmentId ?? null,
            reason,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            ...auditOpts,
        });
    } else if (isGranted === false) {
        result = await deny(userId, permissionId, {
            assignmentId: assignmentId ?? null,
            reason,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            ...auditOpts,
        });
    } else {
        return res.status(400).json({ success: false, message: 'isGranted must be true or false' });
    }
    return res.json({ success: true, data: result });
});

const resetUserOverride = handle('resetUserOverride', async (req, res) => {
    const { userId, permissionId } = req.params;
    const { assignmentId } = req.query;
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    if (assignmentId) {
        // Phase 1.2 Final — guard against cross-org reset
        const orgGroupIds = await _resolveOrgGroupIds(tenantId);
        const inScope     = await _assertAssignmentInScope(assignmentId, orgGroupIds);
        if (!inScope) return res.status(403).json({ success: false, message: 'Assignment is outside the current organization group.' });
    }

    const result = await reset(userId, permissionId, assignmentId ?? null, {
        actorId: req.user?.id ?? null,
    });
    return res.json({ success: true, data: result });
});

const getUserEffectivePermissions = handle('getUserEffectivePermissions', async (req, res) => {
    const { userId } = req.params;
    const mode = String(req.query.mode || 'session').toLowerCase();
    const tenantId = req.user?.tenantId ?? null;

    let result;
    if (mode !== 'union' && tenantId) {
        const membership = await prisma.tenantMember.findFirst({
            where:  { userId, tenantId, isActive: true },
            include: { role: true, tenant: { select: { slug: true } } },
        });
        if (membership) {
            result = await resolveEffectivePermissionsForSession({
                userId,
                membership,
                roleId:   membership.roleId,
                roleCode: membershipRoleCode(membership),
            });
        }
    }
    if (!result) {
        result = await resolveEffectivePermissions(userId);
    }

    let permissions = [];
    if (result.effectiveCodes.length > 0) {
        const rows = await prisma.urPermission.findMany({
            where:  { legacyCode: { in: result.effectiveCodes } },
            select: {
                id: true,
                legacyCode: true,
                actionName: true,
                resource: { select: { name: true, code: true, category: true } },
            },
        });
        permissions = rows.map((p) => ({
            id:           p.id,
            legacyCode:   p.legacyCode,
            actionName:   p.actionName,
            resourceName: p.resource.name,
            resourceCode: p.resource.code,
            category:     p.resource.category,
        }));
    }

    return res.json({
        success: true,
        data: {
            ...result,
            permissions,
        },
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 6 — Audit
// ═══════════════════════════════════════════════════════════════════════════

const getAuditEvents = handle('getAuditEvents', async (req, res) => {
    const page  = Math.max(1, parseInt(req.query.page  ?? '1',  10));
    const limit = Math.min(100, parseInt(req.query.limit ?? '50', 10));
    const skip  = (page - 1) * limit;
    const { targetUserId } = req.query;
    const where = targetUserId ? { targetUserId } : {};

    const [events, total] = await Promise.all([
        prisma.urAuditEvent.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
                actor: { select: { id: true, firstName: true, lastName: true, email: true } },
                targetUser: { select: { id: true, firstName: true, lastName: true } },
            },
        }),
        prisma.urAuditEvent.count({ where }),
    ]);

    const data = events.map((e) => ({
        id:             e.id,
        action:         e.action,
        actorName:      `${e.actor.firstName} ${e.actor.lastName}`,
        actorEmail:     e.actor.email,
        targetUserId:   e.targetUserId,
        targetUserName: e.targetUser ? `${e.targetUser.firstName} ${e.targetUser.lastName}` : null,
        entityType:     e.entityType,
        oldValue:       e.oldValue,
        newValue:       e.newValue,
        createdAt:      e.createdAt,
    }));

    return res.json({ success: true, data, meta: { total, page, limit } });
});

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 6 — Reference data
// ═══════════════════════════════════════════════════════════════════════════

const getAvailableRoles = handle('getAvailableRoles', async (req, res) => {
    const roles = await prisma.role.findMany({
        where: { isActive: true, code: { notIn: [...ACC_REGISTRY_EXCLUDED_ROLE_CODES] } },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
    });
    return res.json({ success: true, data: roles });
});

const getAvailableProperties = handle('getAvailableProperties', async (req, res) => {
    // Assignment hotel picker — child hotels in the current org group only.
    // Excludes the parent Organization entity (type=PROPERTY semantics via parentId).
    // NOT the actor's personal property list (that is the Header Property Switcher).
    const tenantId = req.user?.tenantId ?? null;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No property context.' });
    const currentTenant = await prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { id: true, name: true, slug: true, parentId: true, hasBranches: true, isActive: true },
    });
    if (!currentTenant) {
        return res.status(400).json({ success: false, message: 'No property context.' });
    }

    const orgRootId = currentTenant.parentId ?? tenantId;
    let properties = await prisma.tenant.findMany({
        where:   { isActive: true, parentId: orgRootId },
        select:  { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
    });

    // Standalone hotel (no org hierarchy): the current tenant is the only property.
    if (
        properties.length === 0 &&
        !currentTenant.parentId &&
        currentTenant.hasBranches !== true &&
        currentTenant.isActive
    ) {
        properties = [{ id: currentTenant.id, name: currentTenant.name, slug: currentTenant.slug }];
    }

    return res.json({ success: true, data: properties });
});

const getAvailableDepartments = handle('getAvailableDepartments', async (req, res) => {
    const { tenantId }   = req.query;
    const callerTenantId = req.user?.tenantId ?? null;

    // Phase 1.2 Final — validate that the requested tenantId is in the org group
    const effectiveTenantId = tenantId ?? callerTenantId ?? null;

    if (effectiveTenantId && callerTenantId) {
        const orgGroupIds = await _resolveOrgGroupIds(callerTenantId);
        if (!orgGroupIds.has(effectiveTenantId)) {
            return res.status(403).json({
                success: false,
                message: 'Requested property is outside the current organization group.',
            });
        }
    }

    const where = { isActive: true };
    if (effectiveTenantId) where.tenantId = effectiveTenantId;

    const departments = await prisma.department.findMany({
        where,
        select: { id: true, name: true, code: true, tenantId: true },
        orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: departments });
});

// ═══════════════════════════════════════════════════════════════════════════
// Presentation-only — Summary stats for dashboard cards
// ═══════════════════════════════════════════════════════════════════════════

const getSummary = handle('getSummary', async (_req, res) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [roleCount, userCount, overrideCount, auditCount] = await Promise.all([
        // ACC registry roles (excludes legacy ADMIN hidden from ACC)
        prisma.role.count({
            where: { isActive: true, code: { notIn: [...ACC_REGISTRY_EXCLUDED_ROLE_CODES] } },
        }),
        // Users with at least one active assignment
        prisma.user.count({ where: { isActive: true, urAssignments: { some: { isActive: true } } } }),
        // Total active overrides (global, for display only)
        prisma.urUserOverride.count(),
        // Audit events in the last 30 days
        prisma.urAuditEvent.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    return res.json({
        success: true,
        data: { roles: roleCount, users: userCount, overrides: overrideCount, auditEvents: auditCount },
    });
});

module.exports = {
    // Phase 2 — Read
    getMatrix,
    getRolePermissions,
    getRolePermissionsDrift,
    // Role Permissions — Write
    setRolePermissions,
    // Wave 6 — Roles
    getRoles,
    createRole,
    cloneRole,
    patchRoleMetadata,
    retireRole,
    reactivateRole,
    getRoleAssignedUsers,
    // Wave 6 — Users
    getUsers,
    getUserAssignments,
    getUserEffectivePermissions,
    createUserAssignment,
    updateUserAssignment,
    deactivateUserAssignment,
    reactivateUserAssignment,
    deleteUserAssignment,
    // Wave 6 — Scope
    getAssignmentProperties,
    addAssignmentProperty,
    removeAssignmentProperty,
    getAssignmentDepartments,
    addAssignmentDepartment,
    removeAssignmentDepartment,
    // Wave 6 — Overrides
    getUserOverrides,
    setUserOverride,
    resetUserOverride,
    // Wave 6 — Audit
    getAuditEvents,
    // Wave 6 — Reference
    getAvailableRoles,
    getAvailableProperties,
    getAvailableDepartments,
    // Presentation-only — summary stats for dashboard cards
    getSummary,
};
