'use strict';

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('./run-context');
const { createE2ePermissionFixture } = require('./e2e-permission-fixture');
const { deleteGrnCascade } = require('./grn-id-cleanup');

async function cleanupE2ePermissionFixture(prisma, fixture) {
    const errors = [];

    try {
        await deleteGrnCascade(prisma, fixture.grnIds);
    } catch (err) {
        errors.push(`GRN cleanup failed: ${err.message}`);
    }

    if (fixture.userIds?.length) {
        try {
            await prisma.auditLog.deleteMany({ where: { changedBy: { in: fixture.userIds } } });
        } catch (err) {
            errors.push(`audit_log changedBy cleanup failed: ${err.message}`);
        }
    }

    if (fixture.tenantIds?.length) {
        try {
            await prisma.auditLog.deleteMany({ where: { tenantId: { in: fixture.tenantIds } } });
        } catch (err) {
            errors.push(`audit_log tenant cleanup failed: ${err.message}`);
        }
    }

    for (const userId of fixture.userIds) {
        try {
            await prisma.urUserAssignment.deleteMany({ where: { userId } });
            await prisma.refreshToken.deleteMany({ where: { userId } });
            await prisma.tenantMember.deleteMany({ where: { userId } });
            await prisma.user.delete({ where: { id: userId } });
        } catch (err) {
            errors.push(`user cleanup failed (${userId}): ${err.message}`);
        }
    }

    for (const roleId of fixture.roleIds.filter((id) => id !== fixture.orgManagerDenied?.roleId)) {
        try {
            await prisma.urRolePermission.deleteMany({ where: { roleId } });
            await prisma.role.delete({ where: { id: roleId } });
        } catch (err) {
            errors.push(`role cleanup failed (${roleId}): ${err.message}`);
        }
    }

    const orgRoleId = fixture.orgManagerDenied?.roleId;
    if (orgRoleId) {
        try {
            await prisma.urRolePermission.deleteMany({ where: { roleId: orgRoleId } });
            if (fixture.orgManagerRolePermSnapshot?.length) {
                await prisma.urRolePermission.createMany({
                    data: fixture.orgManagerRolePermSnapshot.map((row) => ({
                        roleId: orgRoleId,
                        permissionId: row.permissionId,
                    })),
                });
            } else if (fixture.orgManagerRoleCreatedFresh) {
                await prisma.role.delete({ where: { id: orgRoleId } });
            }
        } catch (err) {
            errors.push(`ORG_MANAGER role restore failed: ${err.message}`);
        }
    }

    if (fixture.otherPermissionId) {
        try {
            await prisma.urPermission.delete({ where: { id: fixture.otherPermissionId } });
            if (fixture.otherActionId) await prisma.urAction.delete({ where: { id: fixture.otherActionId } });
            if (fixture.otherResourceId) await prisma.urResource.delete({ where: { id: fixture.otherResourceId } });
        } catch (err) {
            errors.push(`other permission cleanup failed: ${err.message}`);
        }
    }

    if (fixture.createdDashboardPerm && fixture.dashboardPermissionId) {
        try {
            await prisma.urPermission.delete({ where: { id: fixture.dashboardPermissionId } });
            if (fixture.dashboardActionId) await prisma.urAction.delete({ where: { id: fixture.dashboardActionId } });
            if (fixture.dashboardResourceId) await prisma.urResource.delete({ where: { id: fixture.dashboardResourceId } });
        } catch (err) {
            errors.push(`dashboard permission cleanup failed: ${err.message}`);
        }
    }

    if (fixture.createdViewPerm && fixture.viewPermissionId) {
        try {
            await prisma.urPermission.delete({ where: { id: fixture.viewPermissionId } });
            if (fixture.viewActionId) await prisma.urAction.delete({ where: { id: fixture.viewActionId } });
            if (fixture.viewResourceId) await prisma.urResource.delete({ where: { id: fixture.viewResourceId } });
        } catch (err) {
            errors.push(`view permission cleanup failed: ${err.message}`);
        }
    }

    if (fixture.createdManagePerm && fixture.managePermissionId) {
        try {
            await prisma.urPermission.delete({ where: { id: fixture.managePermissionId } });
            if (fixture.manageActionId) await prisma.urAction.delete({ where: { id: fixture.manageActionId } });
            if (fixture.manageResourceId) await prisma.urResource.delete({ where: { id: fixture.manageResourceId } });
        } catch (err) {
            errors.push(`manage permission cleanup failed: ${err.message}`);
        }
    }

    for (const tenantId of fixture.tenantIds) {
        try {
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.department.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        } catch (err) {
            errors.push(`tenant cleanup failed (${tenantId}): ${err.message}`);
        }
    }

    const residualUsers = await prisma.user.count({
        where: { email: { contains: fixture.runId } },
    });
    if (residualUsers !== 0) {
        errors.push(`expected 0 residual e2e users, found ${residualUsers}`);
    }

    if (errors.length) {
        throw new Error(`[test-harness:e2e-cleanup] ${errors.join('; ')}`);
    }
}

async function setupE2eFixture(outputPath) {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    try {
        const fixture = await createE2ePermissionFixture(prisma, runContext);
        const payload = {
            runId: fixture.runId,
            password: fixture.password,
            dualTenant: fixture.dualTenant,
            orgManagerDenied: fixture.orgManagerDenied,
            grnViewOnly: fixture.grnViewOnly,
            _internal: fixture,
        };
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
        return payload;
    } finally {
        await prisma.$disconnect();
    }
}

async function teardownE2eFixture(fixturePath) {
    if (!fs.existsSync(fixturePath)) return;
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const fixture = raw._internal;
    if (!fixture) return;
    const prisma = new PrismaClient();
    try {
        await cleanupE2ePermissionFixture(prisma, fixture);
    } finally {
        await prisma.$disconnect();
        fs.unlinkSync(fixturePath);
    }
}

module.exports = {
    setupE2eFixture,
    teardownE2eFixture,
    cleanupE2ePermissionFixture,
};
