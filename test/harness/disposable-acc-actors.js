'use strict';

const { hashPassword } = require('../../src/utils/password');

/**
 * Disposable tenant, users, memberships, and property-scoped assignments.
 * Uses UrAssignmentProperty canonical path only — no legacy notes tagging.
 */

async function createDisposableAccActors(prisma, runContext, catalog) {
    const tenant = await prisma.tenant.create({
        data: {
            name: `Integration ACC Test ${runContext.runId}`,
            slug: runContext.tenantSlug,
            isActive: true,
        },
    });

    const grantedEmail = runContext.integrationEmail('it-acc-granted');
    const deniedEmail = runContext.integrationEmail('it-acc-denied');
    const passwordHash = await hashPassword('integration-test-password-not-used');

    const grantedUser = await prisma.user.create({
        data: {
            email: grantedEmail,
            passwordHash,
            firstName: 'Granted',
            lastName: `User ${runContext.runId}`,
            isActive: true,
        },
    });

    const deniedUser = await prisma.user.create({
        data: {
            email: deniedEmail,
            passwordHash,
            firstName: 'Denied',
            lastName: `User ${runContext.runId}`,
            isActive: true,
        },
    });

    const grantedMembership = await prisma.tenantMember.create({
        data: {
            tenantId: tenant.id,
            userId: grantedUser.id,
            roleId: catalog.grantedRoleId,
            isActive: true,
        },
        include: {
            role: { select: { id: true, code: true } },
        },
    });

    const deniedMembership = await prisma.tenantMember.create({
        data: {
            tenantId: tenant.id,
            userId: deniedUser.id,
            roleId: catalog.deniedRoleId,
            isActive: true,
        },
        include: {
            role: { select: { id: true, code: true } },
        },
    });

    const grantedAssignment = await prisma.urUserAssignment.create({
        data: {
            userId: grantedUser.id,
            roleId: catalog.grantedRoleId,
            isActive: true,
            properties: {
                create: [{ propertyId: tenant.id }],
            },
        },
    });

    const deniedAssignment = await prisma.urUserAssignment.create({
        data: {
            userId: deniedUser.id,
            roleId: catalog.deniedRoleId,
            isActive: true,
            properties: {
                create: [{ propertyId: tenant.id }],
            },
        },
    });

    const membershipShape = (membership) => ({
        id: membership.id,
        tenantId: membership.tenantId,
        roleId: membership.roleId,
        role: membership.role,
        tenant: { slug: tenant.slug },
    });

    return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        grantedUserId: grantedUser.id,
        deniedUserId: deniedUser.id,
        grantedEmail,
        deniedEmail,
        grantedMembership: membershipShape(grantedMembership),
        deniedMembership: membershipShape(deniedMembership),
        grantedAssignmentId: grantedAssignment.id,
        deniedAssignmentId: deniedAssignment.id,
    };
}

module.exports = {
    createDisposableAccActors,
};
