'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');
const { resolveAccPermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
const { membershipRoleCode } = require('../../src/services/rbac.service');

const REQUIRED = ['INVENTORY_VIEW', 'TRANSFER_VIEW'];

(async () => {
    const prisma = new PrismaClient();
    const itemTenants = new Set(
        (await prisma.item.findMany({ select: { tenantId: true }, distinct: ['tenantId'] })).map((r) => r.tenantId),
    );
    const trfGroups = await prisma.storeTransfer.groupBy({ by: ['tenantId'], _count: { _all: true } });
    const candidateTenantIds = trfGroups.map((g) => g.tenantId).filter((tid) => itemTenants.has(tid));
    console.log('candidate tenants', candidateTenantIds.length);

    let best = null;
    for (const tenantId of candidateTenantIds.slice(0, 5)) {
        const members = await prisma.tenantMember.findMany({
            where: { tenantId, isActive: true },
            include: { user: { select: { email: true, isActive: true } }, role: true },
            take: 20,
        });
        for (const m of members) {
            if (!m.user?.isActive) continue;
            const roleCode = membershipRoleCode(m) || m.role;
            try {
                const perms = await resolveAccPermissionsForMembership({
                    userId: m.userId,
                    membership: m,
                    roleId: m.roleId,
                    roleCode,
                });
                const has = REQUIRED.every((p) => perms.includes(p));
                if (has) {
                    console.log('FOUND', m.user.email, roleCode, perms.filter((p) => p.includes('INVENTORY') || p.includes('TRANSFER')));
                    best = m.user.email;
                }
            } catch (e) {
                console.log('ERR', m.user?.email, e.message);
            }
        }
    }
    if (!best) {
        const m = await prisma.tenantMember.findFirst({
            where: { tenantId: candidateTenantIds[0], isActive: true },
            include: { user: true, role: true },
        });
        if (m) {
            const roleCode = membershipRoleCode(m);
            const perms = await resolveAccPermissionsForMembership({
                userId: m.userId,
                membership: m,
                roleId: m.roleId,
                roleCode,
            });
            console.log('sample perms', m.user.email, roleCode, perms.slice(0, 30));
        }
    }
    await prisma.$disconnect();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
