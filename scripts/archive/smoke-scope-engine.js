'use strict';

/**
 * Phase 1 scope smoke — validates resolveUserScope + buildScopeWhere without HTTP.
 * Usage: node scripts/smoke-scope-engine.js
 */
const prisma = require('../src/config/database');
const {
    resolveUserScope,
    buildScopeWhere,
    SCOPE_MODULE,
} = require('../src/services/scope/scope.service');

const ok = (label) => console.log(`  OK  ${label}`);
const fail = (label, err) => {
    console.error(` FAIL ${label}:`, err?.message || err);
    process.exitCode = 1;
};

async function main() {
    const tenant = await prisma.tenant.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
    });
    if (!tenant) {
        console.log('No tenant — skip smoke (seed required).');
        return;
    }

    const members = await prisma.tenantMember.findMany({
        where: { tenantId: tenant.id, isActive: true },
        include: { user: true, role: true, department: true },
        take: 20,
    });

    for (const m of members) {
        const user = {
            id: m.userId,
            role: m.role?.code,
            departmentId: m.departmentId,
        };
        const scope = await resolveUserScope(user, tenant.id);
        const breakageWhere = buildScopeWhere(SCOPE_MODULE.BREAKAGE, scope);
        console.log(
            `\n${m.role?.code} (${m.user?.email || m.userId}) → profile=${scope.profile} source=${scope.scopeSource} label=${scope.scopeLabel}`,
        );
        if (scope.profile === 'DEPARTMENT' && !scope.departmentId) {
            if (m.role?.code === 'DEPT_MANAGER') {
                fail('DEPT_MANAGER must have tenant_members.departmentId (run backfill migration)');
            } else {
                fail('department profile without departmentId');
            }
        } else {
            ok('resolveUserScope');
        }
        if (scope.isTenantWide && Object.keys(breakageWhere).length) {
            fail('tenant-wide should not add breakage where');
        } else {
            ok('buildScopeWhere breakage');
        }
    }

    await prisma.$disconnect();
    console.log('\nSmoke finished.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
