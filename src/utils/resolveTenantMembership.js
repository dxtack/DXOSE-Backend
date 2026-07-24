const prisma = require('../config/database');

const parentOrgManagerInclude = {
    role: true,
    tenant: { select: { id: true, isActive: true, parentId: true } },
};

/**
 * Resolve effective tenant access for a user.
 * Inactive direct memberships do not block ORG_MANAGER inheritance from the parent org.
 *
 * @returns {Promise<{ membership: object|null, isInherited: boolean, inactiveDirect: object|null }>}
 */
const resolveTenantMembership = async (db, userId, tenantId, options = {}) => {
    if (!userId || !tenantId) {
        return { membership: null, isInherited: false, inactiveDirect: null };
    }

    const include = options.include || {};
    const directMembership = await db.tenantMember.findFirst({
        where: { userId, tenantId },
        include,
    });

    if (directMembership?.isActive) {
        return { membership: directMembership, isInherited: false, inactiveDirect: null };
    }

    const targetTenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            slug: true,
            name: true,
            parentId: true,
            isActive: true,
            subStatus: true,
            ...(options.tenantSelect || {}),
        },
    });

    if (targetTenant?.parentId && targetTenant.isActive) {
        const parentTenant = await db.tenant.findUnique({
            where: { id: targetTenant.parentId },
            select: { id: true, parentId: true, isActive: true },
        });

        const parentOrgMembership =
            parentTenant?.isActive && parentTenant.parentId === null
                ? await db.tenantMember.findFirst({
                      where: {
                          userId,
                          tenantId: parentTenant.id,
                          role: { code: 'ORG_MANAGER' },
                          isActive: true,
                      },
                      include: parentOrgManagerInclude,
                  })
                : null;

        if (parentOrgMembership) {
            return {
                membership: {
                    tenantId: targetTenant.id,
                    role: parentOrgMembership.role,
                    roleId: parentOrgMembership.roleId,
                    isActive: true,
                    isInherited: true,
                    departmentId: parentOrgMembership.departmentId ?? null,
                    ...(options.attachTenant ? { tenant: targetTenant } : {}),
                },
                isInherited: true,
                inactiveDirect: directMembership?.isActive === false ? directMembership : null,
            };
        }
    }

    return {
        membership: null,
        isInherited: false,
        inactiveDirect: directMembership?.isActive === false ? directMembership : null,
    };
};

module.exports = {
    resolveTenantMembership,
};
