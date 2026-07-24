'use strict';

const prisma = require('../src/config/database');
const { getBreakages } = require('../src/services/breakage.service');
const { listLostItems } = require('../src/services/lostItems.service');

(async () => {
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'roma-1' } });
    const hkMember = await prisma.tenantMember.findFirst({
        where: {
            tenantId: tenant.id,
            isActive: true,
            role: { code: 'DEPT_MANAGER' },
            department: { code: 'HK' },
        },
        include: { user: true, role: true },
    });

    const user = {
        id: hkMember.userId,
        role: hkMember.role.code,
        departmentId: hkMember.departmentId,
        tenantId: tenant.id,
    };

    const query = {
        skip: 0,
        take: 15,
        status: 'DRAFT,DEPT_APPROVED,COST_CONTROL_APPROVED,FINANCE_APPROVED',
        sourceType: 'INTERNAL',
    };

    const brk = await getBreakages(tenant.id, query, user);
    const lost = await listLostItems(tenant.id, query, user);

    console.log('HK user', hkMember.user.email);
    console.log('\nBREAKAGE list service:');
    console.log({
        total: brk.total,
        totalUnscoped: brk.totalUnscoped,
        totalAfterScope: brk.totalAfterScope,
        scopeLabel: brk.scopeLabel,
        scopeApplied: brk.scopeApplied,
        reason: brk.reason,
        docs: brk.documents.map((d) => d.documentNo),
    });
    if (brk.scopeDebug) console.log('scopeDebug', brk.scopeDebug);

    console.log('\nLOST list service:');
    console.log({
        total: lost.total,
        totalUnscoped: lost.totalUnscoped,
        totalAfterScope: lost.totalAfterScope,
        scopeLabel: lost.scopeLabel,
        docs: lost.items.map((d) => d.documentNo),
    });

    await prisma.$disconnect();
})();
