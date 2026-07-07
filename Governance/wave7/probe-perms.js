'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');
const { resolveAccPermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
const { membershipRoleCode } = require('../../src/services/rbac.service');

(async () => {
    const prisma = new PrismaClient();
    const members = await prisma.tenantMember.findMany({
        where: { isActive: true },
        include: { user: { select: { email: true, isActive: true } }, role: true },
    });
    const hits = [];
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
            if (perms.includes('INVENTORY_VIEW') || perms.includes('TRANSFER_VIEW')) {
                hits.push({ email: m.user.email, roleCode, inv: perms.includes('INVENTORY_VIEW'), trf: perms.includes('TRANSFER_VIEW') });
            }
        } catch { /* skip */ }
    }
    console.log(JSON.stringify(hits, null, 2));
    await prisma.$disconnect();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
