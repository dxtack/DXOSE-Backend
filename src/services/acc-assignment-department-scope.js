'use strict';

const prisma = require('../config/database');

/**
 * Departments on an assignment must belong to one of the assignment's properties.
 * Prevents ACC from linking Hotel A's F&B onto Hotel B's assignment (same display name).
 *
 * @param {string[]} departmentIds
 * @param {string[]} propertyIds
 */
async function assertDepartmentsBelongToProperties(departmentIds, propertyIds) {
    const deptIds = [...new Set((departmentIds || []).filter(Boolean))];
    if (!deptIds.length) return;

    const propIds = [...new Set((propertyIds || []).filter(Boolean))];
    if (!propIds.length) {
        const err = new Error('Cannot attach departments without a property on the assignment.');
        err.statusCode = 400;
        err.code = 'DEPARTMENT_REQUIRES_PROPERTY';
        throw err;
    }

    const depts = await prisma.department.findMany({
        where: { id: { in: deptIds } },
        select: { id: true, tenantId: true, name: true },
    });

    if (depts.length !== deptIds.length) {
        const err = new Error('One or more departments were not found.');
        err.statusCode = 400;
        err.code = 'DEPARTMENT_NOT_FOUND';
        throw err;
    }

    const allowed = new Set(propIds);
    const mismatched = depts.filter((d) => !allowed.has(d.tenantId));
    if (mismatched.length) {
        const names = mismatched.map((d) => d.name).join(', ');
        const err = new Error(
            `Departments must belong to the selected property (${names}). ` +
                'Create departments in Master Data for that hotel first, then link them.',
        );
        err.statusCode = 400;
        err.code = 'DEPARTMENT_PROPERTY_MISMATCH';
        throw err;
    }
}

module.exports = { assertDepartmentsBelongToProperties };
