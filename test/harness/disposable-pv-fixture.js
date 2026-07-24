'use strict';

const { hashPassword } = require('../../src/utils/password');

function pvCodes(runId) {
    return {
        tenantSlug: `it-pv-main-${runId}`,
        roleCode: `IT_ACC_PV_ROLE_${runId}`,
    };
}

async function createDisposablePvFixture(prisma, runContext) {
    const codes = pvCodes(runContext.runId);
    const userEmail = runContext.integrationEmail('it-pv');
    const passwordHash = await hashPassword('integration-test-password-not-used');

    const role = await prisma.role.create({
        data: {
            code: codes.roleCode,
            name: `Integration PV Role ${runContext.runId}`,
            tenantId: null,
            isActive: true,
        },
    });

    const tenant = await prisma.tenant.create({
        data: {
            name: `Integration PV Main ${runContext.runId}`,
            slug: codes.tenantSlug,
            isActive: true,
        },
    });

    const user = await prisma.user.create({
        data: {
            email: userEmail,
            passwordHash,
            firstName: 'PV',
            lastName: `User ${runContext.runId}`,
            isActive: true,
        },
    });

    const membership = await prisma.tenantMember.create({
        data: {
            tenantId: tenant.id,
            userId: user.id,
            roleId: role.id,
            isActive: true,
        },
    });

    const userRow = await prisma.user.findUnique({
        where: { id: user.id },
        select: { permissionVersion: true },
    });

    return {
        ...codes,
        tenantId: tenant.id,
        roleId: role.id,
        userId: user.id,
        userEmail,
        membershipId: membership.id,
        permissionVersion: userRow?.permissionVersion ?? 0,
    };
}

module.exports = {
    pvCodes,
    createDisposablePvFixture,
};
