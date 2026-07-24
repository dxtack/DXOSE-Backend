'use strict';

const prisma = require('../config/database');

/**
 * Roles assignable in a tenant context (global system roles + tenant-specific copies).
 * Excludes SUPER_ADMIN (platform-only) and ADMIN (legacy — retained in DB for
 * historical approval_steps; must never be assignable).
 */
const listAssignableRoles = async (tenantId) => {
    const rows = await prisma.role.findMany({
        where: {
            isActive: true,
            code: { notIn: ['SUPER_ADMIN', 'ADMIN'] },
            OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
        },
        select: {
            id: true,
            code: true,
            name: true,
        },
        orderBy: [{ name: 'asc' }],
    });

    return rows;
};

module.exports = {
    listAssignableRoles,
};
