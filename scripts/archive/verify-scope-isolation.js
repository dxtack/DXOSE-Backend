'use strict';

/**
 * Quick isolation check: F&B dept manager should not see HK movement lines.
 * Usage: node scripts/verify-scope-isolation.js
 */
const prisma = require('../src/config/database');
const { resolveUserScope, buildScopeWhere, SCOPE_MODULE } = require('../src/services/scope/scope.service');

(async () => {
    const tenantId = 'd7f5e85c-86f9-487d-b17d-708cebcf9ca3';
    const fb = await prisma.user.findUnique({ where: { email: 'fb.manager@grandhorizon.com' } });
    const hkDept = await prisma.department.findFirst({ where: { tenantId, code: 'HK' } });

    const scope = await resolveUserScope(
        { id: fb.id, role: 'DEPT_MANAGER', departmentId: null },
        tenantId,
    );
    const where = {
        tenantId,
        movementType: 'BREAKAGE',
        ...buildScopeWhere(SCOPE_MODULE.BREAKAGE, scope),
    };

    const crossDept = await prisma.movementDocument.count({
        where: {
            ...where,
            lines: { some: { location: { departmentId: hkDept.id } } },
        },
    });
    const total = await prisma.movementDocument.count({ where });

    console.log('F&B manager scope:', scope.scopeLabel, 'profile=', scope.profile);
    console.log('Breakage visible (scoped):', total);
    console.log('Of which touch HK locations (should be 0):', crossDept);

    await prisma.$disconnect();
    if (crossDept > 0) process.exit(1);
})();
