const prisma = require('../config/database');
const {
    isScopeEngineEnabled,
    resolveUserScope,
    departmentLookupScopeWhere,
    mergeScopeIntoWhere,
    assertDepartmentInScope,
    parseMasterDataTenantWideQuery,
} = require('./scope/scope.service');

const createDepartment = async (data, tenantId) => {
    const [dupName, dupCode] = await Promise.all([
        prisma.department.findFirst({ where: { name: data.name, tenantId } }),
        prisma.department.findFirst({ where: { code: data.code, tenantId } }),
    ]);
    if (dupName) { const e = new Error('Department name already exists.'); e.statusCode = 400; throw e; }
    if (dupCode) { const e = new Error('Department code already exists.'); e.statusCode = 400; throw e; }

    return prisma.department.create({
        data: { name: data.name, code: data.code.toUpperCase(), tenantId },
        include: { _count: { select: { locations: true, items: true } } },
    });
};

const MAX_DEPARTMENT_PAGE = 500;

const parseBoolQuery = (value) => value === true || value === 'true';

const parseDepartmentPagination = (querySkip, queryTake, defaultTake = 50) => {
    let skip = parseInt(querySkip, 10);
    if (!Number.isFinite(skip) || skip < 0) skip = 0;
    let take = parseInt(queryTake, 10);
    if (!Number.isFinite(take) || take < 1) take = defaultTake;
    take = Math.min(take, MAX_DEPARTMENT_PAGE);
    return { skip, take };
};

const getDepartments = async (tenantId, query = {}, user = null) => {
    const { search, isActive, includeInactive, slim } = query;
    const { skip, take } = parseDepartmentPagination(query.skip, query.take, 50);
    const masterDataMode = parseMasterDataTenantWideQuery(query);

    const hasExplicitIsActive = Object.prototype.hasOwnProperty.call(query, 'isActive');
    const includeAllInactive = includeInactive === 'true' || includeInactive === true;

    let where = {
        tenantId,
        ...(!hasExplicitIsActive && !includeAllInactive ? { isActive: true } : {}),
        ...(hasExplicitIsActive ? { isActive: parseBoolQuery(isActive) } : {}),
        ...(search && {
            OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ]
        }),
    };

    if (user && isScopeEngineEnabled() && !masterDataMode) {
        const scope = await resolveUserScope(user, tenantId);
        where = mergeScopeIntoWhere(where, departmentLookupScopeWhere(scope));
    }

    const slimMode = !masterDataMode && (slim === 'true' || slim === true);
    const include = slimMode
        ? { _count: { select: { locations: true, items: true } } }
        : {
              _count: { select: { locations: true, items: true } },
              locations: {
                  select: { id: true, name: true, type: true, isActive: true },
                  orderBy: { name: 'asc' },
              },
          };

    const [rows, total] = await Promise.all([
        prisma.department.findMany({
            where,
            skip,
            take,
            orderBy: { name: 'asc' },
            include,
        }),
        prisma.department.count({ where }),
    ]);

    const departments = masterDataMode
        ? rows.map(mapDepartmentMasterDataRow)
        : rows;

    return { departments, total, skip, take };
};

/** Master-data list shape: counts + nested locations (empty array when none). */
const mapDepartmentMasterDataRow = (dept) => {
    const locationsCount = dept._count?.locations ?? (dept.locations?.length ?? 0);
    const itemsCount = dept._count?.items ?? 0;
    const locations = (dept.locations || []).map((loc) => ({
        id: loc.id,
        name: loc.name,
        // Location has no dedicated code column; expose type for expand-row display.
        type: loc.type,
        isActive: loc.isActive,
    }));

    return {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        isActive: dept.isActive,
        createdAt: dept.createdAt,
        updatedAt: dept.updatedAt,
        tenantId: dept.tenantId,
        itemsCount,
        locationsCount,
        locations,
        // Keep Prisma-style _count for existing master-data UI bindings.
        _count: {
            locations: locationsCount,
            items: itemsCount,
        },
    };
};

/**
 * Lookup: departments that have at least one linked location (any status).
 * Matches `_count.locations` on the departments list — inactive linked stores still count.
 * Pass locationIsActive=true|false to require an active/inactive location specifically.
 * Nested location rows (non-slim) follow the same locationIsActive filter when set.
 */
const getDepartmentsWithLocations = async (tenantId, query = {}, user = null) => {
    const { search, isActive, includeInactive, slim } = query;
    const { skip, take } = parseDepartmentPagination(query.skip, query.take, 50);

    const hasExplicitIsActive = Object.prototype.hasOwnProperty.call(query, 'isActive');
    const includeAllInactive = includeInactive === 'true' || includeInactive === true;
    const hasExplicitLocationIsActive = Object.prototype.hasOwnProperty.call(query, 'locationIsActive');

    // Default: any linked location (align with Locations column). Optional locationIsActive narrows EXISTS.
    const locationSome = hasExplicitLocationIsActive
        ? { isActive: parseBoolQuery(query.locationIsActive) }
        : {};

    let where = {
        tenantId,
        locations: { some: locationSome },
        ...(!hasExplicitIsActive && !includeAllInactive ? { isActive: true } : {}),
        ...(hasExplicitIsActive ? { isActive: parseBoolQuery(isActive) } : {}),
        ...(search && {
            OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ],
        }),
    };

    if (user && isScopeEngineEnabled() && !parseMasterDataTenantWideQuery(query)) {
        const scope = await resolveUserScope(user, tenantId);
        where = mergeScopeIntoWhere(where, departmentLookupScopeWhere(scope));
    }

    const slimMode = slim === 'true' || slim === true;
    const include = slimMode
        ? { _count: { select: { locations: true, items: true } } }
        : {
              _count: { select: { locations: true, items: true } },
              locations: {
                  ...(hasExplicitLocationIsActive ? { where: locationSome } : {}),
                  select: { id: true, name: true, type: true, isActive: true },
                  orderBy: { name: 'asc' },
              },
          };

    const [departments, total] = await Promise.all([
        prisma.department.findMany({
            where,
            skip,
            take,
            orderBy: { name: 'asc' },
            include,
        }),
        prisma.department.count({ where }),
    ]);
    return { departments, total, skip, take };
};

const getDepartmentById = async (id, tenantId, user = null) => {
    if (user && isScopeEngineEnabled()) {
        const scope = await resolveUserScope(user, tenantId);
        await assertDepartmentInScope(id, tenantId, scope, 'read');
    }
    const dept = await prisma.department.findFirst({
        where: { id, tenantId },
        include: {
            _count: { select: { locations: true, items: true } },
            locations: { select: { id: true, name: true, type: true, isActive: true } },
        },
    });
    if (!dept) { const e = new Error('Department not found'); e.statusCode = 404; throw e; }
    return dept;
};

const updateDepartment = async (id, data, tenantId) => {
    await getDepartmentById(id, tenantId);

    if (data.name) {
        const dup = await prisma.department.findFirst({ where: { name: data.name, tenantId, id: { not: id } } });
        if (dup) { const e = new Error('Department name already exists.'); e.statusCode = 400; throw e; }
    }
    if (data.code) {
        const dup = await prisma.department.findFirst({ where: { code: data.code.toUpperCase(), tenantId, id: { not: id } } });
        if (dup) { const e = new Error('Department code already exists.'); e.statusCode = 400; throw e; }
        data.code = data.code.toUpperCase();
    }

    return prisma.department.update({
        where: { id }, data,
        include: { _count: { select: { locations: true, items: true } } },
    });
};

const deleteDepartment = async (id, tenantId) => {
    const dept = await getDepartmentById(id, tenantId);
    if (dept._count.items > 0) { const e = new Error('Cannot delete department with items. Reassign items first.'); e.statusCode = 400; throw e; }
    if (dept._count.locations > 0) { const e = new Error('Cannot delete department with locations. Reassign locations first.'); e.statusCode = 400; throw e; }
    return prisma.department.delete({ where: { id } });
};

const toggleDepartment = async (id, tenantId) => {
    const dept = await getDepartmentById(id, tenantId);
    return prisma.department.update({
        where: { id }, data: { isActive: !dept.isActive },
        include: { _count: { select: { locations: true, items: true } } },
    });
};

module.exports = {
    createDepartment,
    getDepartments,
    getDepartmentsWithLocations,
    getDepartmentById,
    updateDepartment,
    deleteDepartment,
    toggleDepartment,
};
