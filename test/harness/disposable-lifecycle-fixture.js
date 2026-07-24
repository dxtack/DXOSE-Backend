'use strict';

const { hashPassword } = require('../../src/utils/password');

function lifecycleCodes(runId) {
    return {
        tenantSlug: `it-lifecycle-main-${runId}`,
        roleCode: `IT_PV_LIFECYCLE_ROLE_${runId}`.toUpperCase(),
    };
}

async function createDisposableLifecycleFixture(prisma, runContext) {
    const codes = lifecycleCodes(runContext.runId);
    const targetEmail = runContext.integrationEmail('it-pv-lifecycle');
    const actorEmail = runContext.integrationEmail('it-pv-actor');
    const passwordHash = await hashPassword('integration-test-password-not-used');

    const role = await prisma.role.create({
        data: {
            code: codes.roleCode,
            name: `Integration Lifecycle Role ${runContext.runId}`,
            tenantId: null,
            isActive: true,
        },
    });

    const tenant = await prisma.tenant.create({
        data: {
            name: `Integration Lifecycle Main ${runContext.runId}`,
            slug: codes.tenantSlug,
            isActive: true,
        },
    });

    const actorUser = await prisma.user.create({
        data: {
            email: actorEmail,
            passwordHash,
            firstName: 'Lifecycle',
            lastName: `Actor ${runContext.runId}`,
            isActive: true,
        },
    });

    const targetUser = await prisma.user.create({
        data: {
            email: targetEmail,
            passwordHash,
            firstName: 'Lifecycle',
            lastName: `Target ${runContext.runId}`,
            isActive: true,
        },
    });

    const membership = await prisma.tenantMember.create({
        data: {
            tenantId: tenant.id,
            userId: targetUser.id,
            roleId: role.id,
            isActive: true,
        },
    });

    const assignment = await prisma.urUserAssignment.create({
        data: {
            userId: targetUser.id,
            roleId: role.id,
            isActive: true,
            properties: {
                create: [{ propertyId: tenant.id }],
            },
        },
    });

    const userRow = await prisma.user.findUnique({
        where: { id: targetUser.id },
        select: { permissionVersion: true },
    });

    return {
        ...codes,
        tenantId: tenant.id,
        roleId: role.id,
        actorUserId: actorUser.id,
        actorEmail,
        targetUserId: targetUser.id,
        targetEmail,
        membershipId: membership.id,
        assignmentId: assignment.id,
        permissionVersion: userRow?.permissionVersion ?? 0,
    };
}

module.exports = {
    lifecycleCodes,
    createDisposableLifecycleFixture,
};
