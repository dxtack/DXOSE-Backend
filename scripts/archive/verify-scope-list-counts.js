'use strict';

const prisma = require('../src/config/database');
const { resolveUserScope, buildScopeWhere, SCOPE_MODULE } = require('../src/services/scope/scope.service');

const scenarios = [
    { email: 'finance@grandhorizon.com', label: 'Finance' },
    { email: 'fb.manager@grandhorizon.com', label: 'F&B' },
    { email: 'hk.manager@grandhorizon.com', label: 'HK' },
];

(async () => {
    for (const { email, label } of scenarios) {
        const user = await prisma.user.findUnique({ where: { email } });
        const m = await prisma.tenantMember.findFirst({
            where: { userId: user.id, isActive: true },
            include: { role: true },
        });
        const ctx = { id: user.id, role: m.role.code, departmentId: m.departmentId };
        const scope = await resolveUserScope(ctx, m.tenantId);
        for (const type of ['BREAKAGE', 'LOST']) {
            const base = { tenantId: m.tenantId, movementType: type };
            const sw = buildScopeWhere(SCOPE_MODULE.BREAKAGE, scope, { userId: user.id });
            const all = await prisma.movementDocument.count({ where: base });
            const scoped = await prisma.movementDocument.count({ where: { ...base, ...sw } });
            console.log(
                `${label} ${type}: tenantWide=${scope.isTenantWide} all=${all} scoped=${scoped} where=${JSON.stringify(sw)}`,
            );
        }
    }
    await prisma.$disconnect();
})();
