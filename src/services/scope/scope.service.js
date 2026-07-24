'use strict';

const prisma = require('../../config/database');
const { normalizeRole } = require('../rbac.service');
const { createScopeError } = require('../../utils/scopeError');
const {
    SCOPE_MODULE,
    SCOPE_PROFILE,
    SCOPE_SOURCE,
    REASON,
} = require('./scope.constants');

const emptyLocationList = () => ({ id: { in: [] } });

/**
 * @param {string} tenantId
 * @param {string} userId
 */
const loadAllowedLocationIds = async (tenantId, userId) => {
    if (!tenantId || !userId) return [];
    const rows = await prisma.locationUser.findMany({
        where: {
            userId,
            location: { tenantId, isActive: true },
        },
        select: { locationId: true },
    });
    return rows.map((r) => r.locationId);
};

/**
 * @param {string} tenantId
 * @param {string} departmentId
 */
const loadLocationIdsForDepartment = async (tenantId, departmentId, opts = {}) => {
    if (!tenantId || !departmentId) return [];
    const where = { tenantId, departmentId };
    if (!opts.includeInactive) {
        where.isActive = true;
    }
    const rows = await prisma.location.findMany({
        where,
        select: { id: true },
    });
    return rows.map((r) => r.id);
};

const GOVERNANCE_TENANT_WIDE_ROLES = new Set(['ORG_MANAGER', 'SUPER_ADMIN']);

/** Approved FY scope: full property visibility; ACC dept rows must not narrow these roles. */
const PROPERTY_WIDE_OVERSIGHT_ROLES = new Set([
    'FINANCE_MANAGER',
    'COST_CONTROL',
    'GENERAL_MANAGER',
    'STOREKEEPER',
    // Gate / security exit — must see all Get Passes at the property (GET_PASS_GATE intent).
    'SECURITY',
]);

const isPropertyWideOversightRole = (role) =>
    PROPERTY_WIDE_OVERSIGHT_ROLES.has(normalizeRole(role));

function _propertyWideOversightScope(user, role) {
    const isSecurity = role === 'SECURITY';
    return {
        role,
        // Security uses dedicated gate profile (same empty WHERE as tenant-wide for Get Pass).
        profile: isSecurity ? SCOPE_PROFILE.GET_PASS_GATE : SCOPE_PROFILE.TENANT_WIDE,
        scopeSource: SCOPE_SOURCE.ROLE_DEFAULT,
        isTenantWide: true,
        departmentId: null,
        allowedDepartmentIds: [],
        allowedLocationIds: [],
        canViewAllDepartments: true,
        canViewAllLocations: true,
        scopeLabel: isSecurity ? 'Get Pass gate (property-wide)' : 'Property-wide',
        userId: user?.id,
    };
}

function _governanceTenantWideScope(user, role) {
    const scopeSource = role === 'ORG_MANAGER' ? SCOPE_SOURCE.ORG_BYPASS : SCOPE_SOURCE.GOVERNANCE_BYPASS;
    return {
        role,
        profile: SCOPE_PROFILE.TENANT_WIDE,
        scopeSource,
        isTenantWide: true,
        departmentId: null,
        allowedDepartmentIds: [],
        allowedLocationIds: [],
        canViewAllDepartments: true,
        canViewAllLocations: true,
        scopeLabel: 'Tenant-wide',
        userId: user?.id,
    };
}

function _emptyAssignmentScope(user, role, scopeLabel = 'No ACC scope assignment') {
    return {
        role,
        profile: SCOPE_PROFILE.LOCATIONS,
        scopeSource: SCOPE_SOURCE.UR_ASSIGNMENT,
        isTenantWide: false,
        departmentId: null,
        allowedDepartmentIds: [],
        allowedLocationIds: [],
        canViewAllDepartments: false,
        canViewAllLocations: false,
        scopeLabel,
        userId: user?.id,
    };
}

/**
 * Resolve scope from ACC ur_user_assignments (P26 — sole path, no legacy fallback).
 * Property-wide oversight roles (Finance, Cost Control, Storekeeper, GM) and governance
 * roles (Org Manager, Super Admin) stay tenant-wide even on mutation paths (assignmentOnly).
 */
const _resolveUserScopeFromAssignments = async (user, tenantId, opts = {}) => {
    const userId = user?.id;
    const role = normalizeRole(user?.role);

    if (GOVERNANCE_TENANT_WIDE_ROLES.has(role)) {
        return _governanceTenantWideScope(user, role);
    }

    if (isPropertyWideOversightRole(role)) {
        if (!tenantId) {
            return _emptyAssignmentScope(user, role, 'Tenant context required');
        }
        return _propertyWideOversightScope(user, role);
    }

    if (!userId || !tenantId) {
        return _emptyAssignmentScope(user, role, 'Tenant context required');
    }

    let assignments;
    try {
        assignments = await prisma.urUserAssignment.findMany({
            where:   { userId, isActive: true },
            include: {
                role:        { select: { id: true, code: true, name: true } },
                properties:  { select: { propertyId: true } },
                departments: { select: { departmentId: true } },
            },
        });
    } catch (err) {
        console.error('[scope/assignment] DB error:', err.message);
        throw createScopeError('ACC scope assignment lookup failed', 503);
    }

    if (!assignments || assignments.length === 0) {
        return _emptyAssignmentScope(user, role);
    }

    // Filter assignments applicable to the current tenant (property)
    const relevantAssignments = assignments.filter((a) => {
        if (a.properties.length === 0) return true;          // All-properties assignment
        return a.properties.some((p) => p.propertyId === tenantId);
    });

    // No relevant assignment for this property → user has no access here
    // Return empty scope (zero locations) so existing scope checks return no records
    if (relevantAssignments.length === 0) {
        return _emptyAssignmentScope(user, role, 'No assignment for this property');
    }

    // If ANY relevant assignment has no department rows → tenant-wide for this property
    const isTenantWide = relevantAssignments.some((a) => a.departments.length === 0);

    const primaryRoleCode = relevantAssignments[0]?.role?.code ?? role;

    if (isTenantWide) {
        return {
            role:                 primaryRoleCode,
            profile:              SCOPE_PROFILE.TENANT_WIDE,
            scopeSource:          SCOPE_SOURCE.UR_ASSIGNMENT,
            isTenantWide:         true,
            departmentId:         null,
            allowedDepartmentIds: [],
            allowedLocationIds:   [],
            canViewAllDepartments: true,
            canViewAllLocations:  true,
            scopeLabel:           'Tenant-wide',
            userId,
        };
    }

    // Collect ALL department IDs from all relevant assignments (union)
    const departmentIdSet = new Set();
    for (const a of relevantAssignments) {
        a.departments.forEach((d) => departmentIdSet.add(d.departmentId));
    }
    const assignmentDepartmentIds = [...departmentIdSet];

    // ACC UI can attach a same-named dept from another hotel. Remap onto this property.
    let allowedDepartmentIds = [];
    try {
        allowedDepartmentIds = await resolveAllowedDepartmentIdsForProperty(
            tenantId,
            assignmentDepartmentIds,
        );
    } catch (err) {
        console.error('[scope/assignment] Department remap error:', err.message);
        throw createScopeError('ACC scope department lookup failed', 503);
    }

    // Translate property-local department IDs to location IDs
    let locations = [];
    try {
        locations = allowedDepartmentIds.length
            ? await prisma.location.findMany({
                where: {
                    tenantId,
                    departmentId: { in: allowedDepartmentIds },
                    // Include inactive to match legacy behaviour for historical documents
                    // (mirrors loadLocationIdsForDepartment with includeInactive: true)
                },
                select: { id: true, departmentId: true },
            })
            : [];
    } catch (err) {
        console.error('[scope/assignment] Location lookup error:', err.message);
        throw createScopeError('ACC scope location lookup failed', 503);
    }

    const allowedLocationIds = locations.map((l) => l.id);
    const primaryDeptId      = allowedDepartmentIds[0] ?? null;

    // Build a human-readable scope label
    let scopeLabel = `${allowedDepartmentIds.length} department(s)`;
    if (allowedDepartmentIds.length === 1 && opts.loadDepartmentName !== false) {
        try {
            const dept = await prisma.department.findFirst({
                where: { id: primaryDeptId, tenantId },
                select: { name: true, code: true },
            });
            scopeLabel = dept?.name ?? dept?.code ?? primaryDeptId;
        } catch (_) { /* non-fatal */ }
    }

    return {
        role:                 primaryRoleCode,
        profile:              SCOPE_PROFILE.LOCATIONS,
        scopeSource:          SCOPE_SOURCE.UR_ASSIGNMENT,
        isTenantWide:         false,
        departmentId:         primaryDeptId,
        // Property-local ACC departments (remapped) — even when the dept has zero locations
        allowedDepartmentIds,
        allowedLocationIds,
        canViewAllDepartments: false,
        canViewAllLocations:  false,
        scopeLabel,
        userId,
    };
};

/**
 * Resolve ACC assignment department IDs onto the current property.
 * Prefer exact IDs that already belong to the tenant; otherwise remap by code/name
 * (guards against ACC linking another hotel's department with the same display name).
 *
 * @param {string} tenantId
 * @param {string[]} assignmentDepartmentIds
 * @returns {Promise<string[]>}
 */
async function resolveAllowedDepartmentIdsForProperty(tenantId, assignmentDepartmentIds) {
    if (!tenantId || !assignmentDepartmentIds?.length) return [];

    const assigned = await prisma.department.findMany({
        where: { id: { in: assignmentDepartmentIds } },
        select: { id: true, tenantId: true, name: true, code: true },
    });
    if (!assigned.length) return [];

    const onProperty = assigned.filter((d) => d.tenantId === tenantId).map((d) => d.id);
    if (onProperty.length) return [...new Set(onProperty)];

    const codes = [...new Set(assigned.map((d) => d.code).filter(Boolean))];
    const names = [...new Set(assigned.map((d) => d.name).filter(Boolean))];
    const or = [];
    if (codes.length) or.push({ code: { in: codes } });
    if (names.length) or.push({ name: { in: names } });
    if (!or.length) return [];

    const remapped = await prisma.department.findMany({
        where: { tenantId, OR: or },
        select: { id: true },
    });
    return [...new Set(remapped.map((d) => d.id))];
}

/**
 * Pure helper for tests — choose local department ids from assigned rows + remap candidates.
 * @param {{ id: string, tenantId: string }[]} assignedDepts
 * @param {string} tenantId
 * @param {{ id: string }[]} remappedLocalDepts
 */
function pickAllowedDepartmentIds(assignedDepts, tenantId, remappedLocalDepts = []) {
    const onProperty = (assignedDepts || [])
        .filter((d) => d.tenantId === tenantId)
        .map((d) => d.id);
    if (onProperty.length) return [...new Set(onProperty)];
    return [...new Set((remappedLocalDepts || []).map((d) => d.id))];
}

// ─── Public dispatcher ────────────────────────────────────────────────────────

/**
 * Resolve user scope for the current request (ACC ur_user_assignments only).
 */
const resolveUserScope = async (user, tenantId, opts = {}) =>
    _resolveUserScopeFromAssignments(user, tenantId, opts);

const isScopeTenantWide = (scope) => Boolean(scope?.isTenantWide);

/**
 * Movement docs (Breakage/Lost): department via line location and/or header sourceLocationId.
 * Visibility is department-scoped — not limited to createdBy.
 */
const movementDocumentScopeWhere = (scope, _opts = {}) => {
    if (isScopeTenantWide(scope)) return {};

    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        const orPredicates = [
            { lines: { some: { location: { departmentId: scope.departmentId } } } },
        ];
        if (scope.allowedLocationIds?.length) {
            orPredicates.push({ sourceLocationId: { in: scope.allowedLocationIds } });
        }
        return { OR: orPredicates };
    }

    if (scope.allowedLocationIds?.length) {
        return {
            OR: [
                { lines: { some: { locationId: { in: scope.allowedLocationIds } } } },
                { sourceLocationId: { in: scope.allowedLocationIds } },
            ],
        };
    }

    return { id: { in: [] } };
};

const transferScopeWhere = (scope) => {
    if (isScopeTenantWide(scope)) return {};
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        return {
            OR: [
                { sourceLocation: { departmentId: scope.departmentId } },
                { destLocation: { departmentId: scope.departmentId } },
            ],
        };
    }
    if (scope.allowedLocationIds.length === 0) {
        return { id: { in: [] } };
    }
    return {
        OR: [
            { sourceLocationId: { in: scope.allowedLocationIds } },
            { destLocationId: { in: scope.allowedLocationIds } },
        ],
    };
};

const locationIdScope = (scope, field = 'locationId') => {
    if (scope.isTenantWide) return {};
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        return { [field]: { in: scope.allowedLocationIds.length ? scope.allowedLocationIds : ['00000000-0000-0000-0000-000000000000'] } };
    }
    if (scope.allowedLocationIds.length === 0) {
        return { [field]: { in: [] } };
    }
    return { [field]: { in: scope.allowedLocationIds } };
};

const getPassScopeWhere = (scope) => {
    if (isScopeTenantWide(scope)) return {};
    if (scope.profile === SCOPE_PROFILE.GET_PASS_GATE) {
        return {};
    }
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        return {
            OR: [
                { departmentId: scope.departmentId },
                { lines: { some: { location: { departmentId: scope.departmentId } } } },
            ],
        };
    }
    if (scope.allowedLocationIds.length === 0) {
        return { id: { in: [] } };
    }
    return {
        OR: [
            { lines: { some: { locationId: { in: scope.allowedLocationIds } } } },
        ],
    };
};

const inventoryCountScopeWhere = (scope) => {
    if (isScopeTenantWide(scope)) return {};
    if (scope.allowedLocationIds.length === 0 && scope.profile === SCOPE_PROFILE.DEPARTMENT) {
        return { locationId: { in: [] } };
    }
    return locationIdScope(scope, 'locationId');
};

/**
 * @param {string} module — SCOPE_MODULE value
 * @param {object} scope — from resolveUserScope
 */
const buildScopeWhere = (module, scope, opts = {}) => {
    if (isScopeTenantWide(scope)) {
        return {};
    }
    switch (module) {
        case SCOPE_MODULE.BREAKAGE:
        case SCOPE_MODULE.LOST:
        case SCOPE_MODULE.MOVEMENT:
        case SCOPE_MODULE.ISSUE:
            return movementDocumentScopeWhere(scope, opts);
        case SCOPE_MODULE.TRANSFER:
            return transferScopeWhere(scope);
        case SCOPE_MODULE.LEDGER:
        case SCOPE_MODULE.STOCK:
            return locationIdScope(scope, 'locationId');
        case SCOPE_MODULE.GET_PASS:
            return getPassScopeWhere(scope);
        case SCOPE_MODULE.INVENTORY_COUNT:
            return inventoryCountScopeWhere(scope);
        case SCOPE_MODULE.GRN:
            return isScopeTenantWide(scope)
                ? {}
                : scope.allowedLocationIds.length
                  ? { OR: [{ locationId: { in: scope.allowedLocationIds } }, { locationId: null }] }
                  : { locationId: { in: [] } };
        case SCOPE_MODULE.REPORTS:
        case SCOPE_MODULE.DASHBOARD:
            return {};
        default:
            return {};
    }
};

const documentHasAccessibleLine = async (documentId, scope) => {
    if (isScopeTenantWide(scope)) return true;

    const doc = await prisma.movementDocument.findFirst({
        where: { id: documentId },
        select: {
            status: true,
            createdBy: true,
            sourceLocationId: true,
            lines: {
                select: {
                    locationId: true,
                    location: { select: { departmentId: true } },
                },
            },
        },
    });
    if (!doc) return false;

    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        if (
            doc.sourceLocationId &&
            scope.allowedLocationIds?.length &&
            scope.allowedLocationIds.includes(doc.sourceLocationId)
        ) {
            return true;
        }
        if (doc.lines?.some((line) => line.location?.departmentId === scope.departmentId)) {
            return true;
        }
        return false;
    }

    if (
        doc.sourceLocationId &&
        scope.allowedLocationIds?.length &&
        scope.allowedLocationIds.includes(doc.sourceLocationId)
    ) {
        return true;
    }

    if (!scope.allowedLocationIds?.length) {
        return false;
    }
    const hit = await prisma.movementLine.findFirst({
        where: { documentId, locationId: { in: scope.allowedLocationIds } },
        select: { id: true },
    });
    return Boolean(hit);
};

const transferInScope = async (transfer, scope) => {
    if (isScopeTenantWide(scope)) return true;
    if (!transfer) return false;
    const { sourceLocationId, destLocationId } = transfer;
    const ids = scope.allowedLocationIds;
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        const locs = await prisma.location.findMany({
            where: {
                id: { in: [sourceLocationId, destLocationId].filter(Boolean) },
                tenantId: transfer.tenantId,
            },
            select: { id: true, departmentId: true },
        });
        return locs.some((l) => l.departmentId === scope.departmentId);
    }
    if (!ids.length) return false;
    return (
        (sourceLocationId && ids.includes(sourceLocationId)) ||
        (destLocationId && ids.includes(destLocationId))
    );
};

/**
 * @param {string} module
 * @param {object} entity — loaded row or { id, ... }
 * @param {object} scope
 * @param {string} [action]
 */
const assertInScope = async (module, entity, scope, action = 'read') => {
    if (!entity) {
        throw createScopeError('Resource not found.', 404, 'NOT_FOUND');
    }
    if (isScopeTenantWide(scope)) return true;

    switch (module) {
        case SCOPE_MODULE.BREAKAGE:
        case SCOPE_MODULE.LOST:
        case SCOPE_MODULE.MOVEMENT:
        case SCOPE_MODULE.ISSUE: {
            const docId = entity.id || entity.documentId;
            const ok = await documentHasAccessibleLine(docId, scope);
            if (!ok) {
                throw createScopeError(
                    `Action "${action}" denied: document outside your department/location scope.`,
                    403,
                );
            }
            return true;
        }
        case SCOPE_MODULE.TRANSFER: {
            const ok = await transferInScope(entity, scope);
            if (!ok) {
                throw createScopeError(
                    `Action "${action}" denied: transfer outside your location scope.`,
                    403,
                );
            }
            return true;
        }
        case SCOPE_MODULE.LEDGER:
        case SCOPE_MODULE.STOCK: {
            const locId = entity.locationId;
            if (locId && scope.allowedLocationIds.length && !scope.allowedLocationIds.includes(locId)) {
                throw createScopeError('Ledger/stock entry outside your location scope.', 403);
            }
            if (
                !scope.isTenantWide &&
                scope.profile !== SCOPE_PROFILE.DEPARTMENT &&
                scope.allowedLocationIds.length === 0
            ) {
                throw createScopeError('No locations assigned to your account.', 403);
            }
            if (scope.profile === SCOPE_PROFILE.DEPARTMENT && locId) {
                const loc = await prisma.location.findFirst({
                    where: { id: locId },
                    select: { departmentId: true },
                });
                if (loc && loc.departmentId !== scope.departmentId) {
                    throw createScopeError('Entry outside your department scope.', 403);
                }
            }
            return true;
        }
        case SCOPE_MODULE.GET_PASS: {
            if (scope.profile === SCOPE_PROFILE.GET_PASS_GATE) return true;
            if (scope.profile === SCOPE_PROFILE.DEPARTMENT && entity.departmentId === scope.departmentId) {
                return true;
            }
            const lineOk = entity.lines?.some((l) =>
                scope.allowedLocationIds.includes(l.locationId),
            );
            if (lineOk) return true;
            throw createScopeError('Get Pass outside your scope.', 403);
        }
        case SCOPE_MODULE.GRN: {
            const locId = entity.locationId;
            if (!locId) return true;
            if (scope.profile === SCOPE_PROFILE.DEPARTMENT) {
                const loc = await prisma.location.findFirst({
                    where: { id: locId },
                    select: { departmentId: true },
                });
                if (loc?.departmentId === scope.departmentId) return true;
            }
            if (scope.allowedLocationIds.includes(locId)) return true;
            throw createScopeError('GRN outside your location scope.', 403);
        }
        case SCOPE_MODULE.INVENTORY_COUNT: {
            const locId = entity.locationId;
            if (!locId) {
                throw createScopeError('Inventory count session has no location.', 403);
            }
            if (scope.allowedLocationIds.includes(locId)) return true;
            if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
                const loc = await prisma.location.findFirst({
                    where: { id: locId },
                    select: { departmentId: true },
                });
                if (loc?.departmentId === scope.departmentId) return true;
            }
            throw createScopeError('Inventory count outside your scope.', 403);
        }
        default:
            return true;
    }
};

const buildScopeMeta = (scope, { total = 0, totalUnscoped = null, scopeWhere = null } = {}) => {
    const tenantWide = isScopeTenantWide(scope);
    const scopeApplied = !tenantWide;
    let reason = null;
    if (scopeApplied && total === 0) {
        if (!scope.departmentId && scope.profile === SCOPE_PROFILE.DEPARTMENT) {
            reason = 'SCOPE_DEPARTMENT_NOT_ASSIGNED';
        } else if (scope.profile === SCOPE_PROFILE.LOCATIONS && !scope.allowedLocationIds?.length) {
            reason = 'SCOPE_NO_LOCATIONS_ASSIGNED';
        } else if (totalUnscoped > 0) {
            reason = REASON.SCOPE_NO_VISIBLE_RECORDS;
        } else {
            reason = REASON.SCOPE_NO_VISIBLE_RECORDS;
        }
    }
    const meta = {
        scope: {
            profile: scope.profile,
            scopeSource: scope.scopeSource,
            scopeLabel: scope.scopeLabel,
            departmentId: scope.departmentId,
            role: scope.role,
            allowedLocationCount: tenantWide ? null : scope.allowedLocationIds?.length ?? 0,
        },
        scopeLabel: scope.scopeLabel,
        scopeApplied,
        reason,
        ...(totalUnscoped != null ? { totalUnscoped } : {}),
        ...(totalUnscoped != null ? { totalAfterScope: total } : {}),
    };
    const debugScope =
        process.env.SCOPE_DEBUG === 'true' ||
        (process.env.NODE_ENV !== 'production' && process.env.SCOPE_DEBUG !== 'false');
    if (debugScope && scopeWhere != null) {
        meta.scopeDebug = { scopeWhere };
    }
    return meta;
};

const isScopeEngineEnabled = (moduleKey = '') => {
    if (process.env.ENABLE_SCOPE_ENGINE === 'false') return false;
    const mod = String(moduleKey || '').toUpperCase().replace(/-/g, '_');
    if (mod && process.env[`ENABLE_${mod}_SCOPE`] === 'false') return false;
    return true;
};

const parseMasterDataTenantWideQuery = (query = {}) =>
    query.masterData === 'true' || query.masterData === true;

/** Master-data / form lookups: departments visible to scoped users. */
const departmentLookupScopeWhere = (scope) => {
    if (isScopeTenantWide(scope)) return {};
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        return { id: scope.departmentId };
    }
    // Prefer ACC department IDs so assigned depts still appear with zero locations
    if (scope.allowedDepartmentIds?.length) {
        return { id: { in: scope.allowedDepartmentIds } };
    }
    if (scope.departmentId) {
        return { id: scope.departmentId };
    }
    if (scope.allowedLocationIds?.length) {
        return {
            locations: { some: { id: { in: scope.allowedLocationIds } } },
        };
    }
    return { id: { in: [] } };
};

/** Master-data / form lookups: locations visible to scoped users. */
const locationLookupScopeWhere = (scope) => {
    if (isScopeTenantWide(scope)) return {};
    if (scope.allowedLocationIds?.length) {
        return { id: { in: scope.allowedLocationIds } };
    }
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        return { departmentId: scope.departmentId };
    }
    return { id: { in: [] } };
};

/**
 * Transfer destination picker only — cross-department operational targets.
 * Does not apply to stock/breakage/lost lookups; use only with lookupPurpose=transfer_destination.
 */
const locationTransferDestinationLookupScopeWhere = (_scope) => ({});

const LOCATION_LOOKUP_PURPOSE = {
    DEFAULT: 'default',
    TRANSFER_DESTINATION: 'transfer_destination',
};

const resolveLocationLookupScopeWhere = (scope, lookupPurpose) => {
    const purpose = String(lookupPurpose || '')
        .trim()
        .toLowerCase()
        .replace(/-/g, '_');
    if (purpose === LOCATION_LOOKUP_PURPOSE.TRANSFER_DESTINATION) {
        return locationTransferDestinationLookupScopeWhere(scope);
    }
    return locationLookupScopeWhere(scope);
};

const mergeScopeIntoWhere = (baseWhere, scopeWhere) => {
    if (!scopeWhere || !Object.keys(scopeWhere).length) return baseWhere;
    return { AND: [baseWhere, scopeWhere] };
};

const assertDepartmentInScope = async (departmentId, tenantId, scope, action = 'access') => {
    if (isScopeTenantWide(scope) || !departmentId) return true;
    const dept = await prisma.department.findFirst({
        where: { id: departmentId, tenantId },
        select: { id: true },
    });
    if (!dept) {
        throw createScopeError('Department not found.', 404, 'NOT_FOUND');
    }
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        if (departmentId === scope.departmentId) return true;
        throw createScopeError(`Department outside your scope (${action}).`, 403);
    }
    if (scope.allowedDepartmentIds?.length) {
        if (scope.allowedDepartmentIds.includes(departmentId)) return true;
        throw createScopeError(`Department outside your scope (${action}).`, 403);
    }
    if (scope.departmentId && departmentId === scope.departmentId) return true;
    if (scope.allowedLocationIds?.length) {
        const hit = await prisma.location.findFirst({
            where: {
                tenantId,
                departmentId,
                id: { in: scope.allowedLocationIds },
            },
            select: { id: true },
        });
        if (hit) return true;
        throw createScopeError(`Department outside your scope (${action}).`, 403);
    }
    throw createScopeError('No department scope assigned to your account.', 403);
};

const clampCategoryLookupQuery = (query, scope) => {
    if (isScopeTenantWide(scope)) return query;
    const next = { ...query };
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        next.departmentId = scope.departmentId;
        delete next.departmentIds;
    }
    return next;
};

const assertLocationInScope = async (locationId, tenantId, scope, action = 'access') => {
    if (isScopeTenantWide(scope) || !locationId) return true;
    const loc = await prisma.location.findFirst({
        where: { id: locationId, tenantId },
        select: { id: true, departmentId: true },
    });
    if (!loc) {
        throw createScopeError('Location not found.', 404, 'NOT_FOUND');
    }
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        if (loc.departmentId === scope.departmentId) return true;
        throw createScopeError(`Location outside your department scope (${action}).`, 403);
    }
    if (scope.allowedLocationIds?.includes(locationId)) return true;
    throw createScopeError(`Location outside your assigned scope (${action}).`, 403);
};

/** Resolve scope for lookup/write paths (forms, dropdowns, item search). */
const resolveLookupScope = async (user, tenantId) => {
    if (!user || !isScopeEngineEnabled()) return null;
    return resolveUserScope(user, tenantId);
};

const clampReportFilters = (filters, scope) => {
    if (isScopeTenantWide(scope)) return filters;
    const next = { ...filters };
    if (scope.profile === SCOPE_PROFILE.DEPARTMENT && scope.departmentId) {
        const deptIds = Array.isArray(next.departmentIds) ? next.departmentIds : [];
        if (deptIds.length && !deptIds.includes(scope.departmentId)) {
            throw createScopeError('Report department filter outside your scope.', 400);
        }
        if (!deptIds.length) next.departmentIds = [scope.departmentId];
        const locIds = Array.isArray(next.locationIds) ? next.locationIds : [];
        if (locIds.length) {
            next.locationIds = locIds.filter((id) => scope.allowedLocationIds.includes(id));
        } else if (scope.allowedLocationIds.length) {
            next.locationIds = [...scope.allowedLocationIds];
        }
    } else if (scope.allowedLocationIds.length) {
        const locIds = Array.isArray(next.locationIds) ? next.locationIds : [];
        if (locIds.length) {
            const clamped = locIds.filter((id) => scope.allowedLocationIds.includes(id));
            if (!clamped.length && locIds.length) {
                throw createScopeError('Report location filter outside your scope.', 400);
            }
            next.locationIds = clamped.length ? clamped : scope.allowedLocationIds;
        } else {
            next.locationIds = [...scope.allowedLocationIds];
        }
    }
    return next;
};

module.exports = {
    SCOPE_MODULE,
    SCOPE_PROFILE,
    SCOPE_SOURCE,
    REASON,
    resolveUserScope,
    buildScopeWhere,
    assertInScope,
    buildScopeMeta,
    clampReportFilters,
    assertLocationInScope,
    assertDepartmentInScope,
    departmentLookupScopeWhere,
    locationLookupScopeWhere,
    locationTransferDestinationLookupScopeWhere,
    resolveLocationLookupScopeWhere,
    LOCATION_LOOKUP_PURPOSE,
    mergeScopeIntoWhere,
    clampCategoryLookupQuery,
    resolveLookupScope,
    isScopeTenantWide,
    isScopeEngineEnabled,
    parseMasterDataTenantWideQuery,
    loadAllowedLocationIds,
    loadLocationIdsForDepartment,
    resolveAllowedDepartmentIdsForProperty,
    pickAllowedDepartmentIds,
    PROPERTY_WIDE_OVERSIGHT_ROLES,
    isPropertyWideOversightRole,
};
