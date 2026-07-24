'use strict';

const prisma = require('../src/config/database');
const departmentService = require('../src/services/department.service');
const locationService = require('../src/services/location.service');

(async () => {
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'roma-1' } });
    const hkMember = await prisma.tenantMember.findFirst({
        where: {
            tenantId: tenant.id,
            isActive: true,
            role: { code: 'DEPT_MANAGER' },
            department: { code: 'HK' },
        },
        include: { user: true, role: true, department: true },
    });
    if (!hkMember) {
        console.log('No HK manager on roma-1');
        return;
    }

    const user = {
        id: hkMember.userId,
        role: hkMember.role.code,
        departmentId: hkMember.departmentId,
    };

    const { resolveUserScope, departmentLookupScopeWhere, mergeScopeIntoWhere } = require('../src/services/scope/scope.service');
    const scope = await resolveUserScope(user, tenant.id);
    console.log('scope', {
        profile: scope.profile,
        departmentId: scope.departmentId,
        scopeLabel: scope.scopeLabel,
        locCount: scope.allowedLocationIds?.length,
    });
    console.log('deptWhere', departmentLookupScopeWhere(scope));

    const raw = await prisma.department.findFirst({ where: { id: hkMember.departmentId } });
    console.log('raw dept', raw?.name, 'isActive', raw?.isActive);

    const where = mergeScopeIntoWhere(
        { tenantId: tenant.id, isActive: true },
        departmentLookupScopeWhere(scope),
    );
    const direct = await prisma.department.findMany({ where, take: 5 });
    console.log('direct prisma count', direct.length, 'tenant', tenant.id);

    const { departments } = await departmentService.getDepartments(tenant.id, { take: 100, isActive: true }, user);
    console.log('HK manager departments:', departments.map((d) => d.name));

    const { locations } = await locationService.getLocations(
        tenant.id,
        { take: 100, isActive: true, departmentId: hkMember.departmentId },
        user,
    );
    console.log('HK locations count:', locations.length);

    await prisma.$disconnect();
})();
