'use strict';

const { catalogCodes } = require('./acc-minimal-catalog');

/**
 * FK-safe cleanup for a single ACC characterization run. Fail-closed on residual rows.
 */

async function cleanupAccFixture(prisma, { runContext, catalog, actors, runtimeSettingIdsBefore = new Set() }) {
    const errors = [];
    const runId = runContext.runId;
    const codes = catalogCodes(runId);
    const userIds = [actors.grantedUserId, actors.deniedUserId].filter(Boolean);
    const assignmentIds = [actors.grantedAssignmentId, actors.deniedAssignmentId].filter(Boolean);
    const roleIds = [catalog.grantedRoleId, catalog.deniedRoleId].filter(Boolean);

    if (assignmentIds.length) {
        try {
            await prisma.urUserOverride.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
        } catch (err) {
            errors.push(`ur_user_overrides delete failed: ${err.message}`);
        }

        try {
            await prisma.urAssignmentDepartment.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
        } catch (err) {
            errors.push(`ur_assignment_departments delete failed: ${err.message}`);
        }

        try {
            await prisma.urAssignmentProperty.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
        } catch (err) {
            errors.push(`ur_assignment_properties delete failed: ${err.message}`);
        }

        try {
            await prisma.urUserAssignment.deleteMany({ where: { id: { in: assignmentIds } } });
        } catch (err) {
            errors.push(`ur_user_assignments delete failed: ${err.message}`);
        }
    }

    if (actors.tenantId) {
        try {
            await prisma.tenantMember.deleteMany({ where: { tenantId: actors.tenantId } });
        } catch (err) {
            errors.push(`tenant_members delete failed: ${err.message}`);
        }
    }

    if (userIds.length) {
        try {
            await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
        } catch (err) {
            errors.push(`refresh_tokens delete failed: ${err.message}`);
        }

        for (const userId of userIds) {
            try {
                await prisma.user.delete({ where: { id: userId } });
            } catch (err) {
                errors.push(`user delete failed (${userId}): ${err.message}`);
            }
        }
    }

    if (roleIds.length) {
        try {
            await prisma.urRolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
        } catch (err) {
            errors.push(`ur_role_permissions delete failed: ${err.message}`);
        }

        for (const roleId of roleIds) {
            try {
                await prisma.role.delete({ where: { id: roleId } });
            } catch (err) {
                errors.push(`role delete failed (${roleId}): ${err.message}`);
            }
        }
    }

    if (catalog.permissionId) {
        try {
            await prisma.urPermission.delete({ where: { id: catalog.permissionId } });
        } catch (err) {
            errors.push(`ur_permission delete failed: ${err.message}`);
        }
    }

    if (catalog.actionId) {
        try {
            await prisma.urAction.delete({ where: { id: catalog.actionId } });
        } catch (err) {
            errors.push(`ur_action delete failed: ${err.message}`);
        }
    }

    if (catalog.resourceId) {
        try {
            await prisma.urResource.delete({ where: { id: catalog.resourceId } });
        } catch (err) {
            errors.push(`ur_resource delete failed: ${err.message}`);
        }
    }

    if (actors.tenantId) {
        try {
            await prisma.department.deleteMany({ where: { tenantId: actors.tenantId } });
        } catch (err) {
            errors.push(`departments delete failed: ${err.message}`);
        }

        try {
            await prisma.tenant.delete({ where: { id: actors.tenantId } });
        } catch (err) {
            errors.push(`tenant delete failed: ${err.message}`);
        }
    }

    const afterSettings = await prisma.accRuntimeSetting.findMany({ select: { id: true } });
    const newSettingIds = afterSettings.map((row) => row.id).filter((id) => !runtimeSettingIdsBefore.has(id));
    if (newSettingIds.length) {
        try {
            await prisma.accRuntimeSetting.deleteMany({ where: { id: { in: newSettingIds } } });
        } catch (err) {
            errors.push(`acc_runtime_settings side-effect cleanup failed: ${err.message}`);
        }
    }

    const tenant = actors.tenantId
        ? await prisma.tenant.findUnique({ where: { id: actors.tenantId } })
        : null;
    if (tenant) {
        errors.push('tenant record still exists after cleanup');
    }

    const residualUsers = await prisma.user.count({
        where: {
            OR: [{ email: actors.grantedEmail }, { email: actors.deniedEmail }],
        },
    });
    if (residualUsers !== 0) {
        errors.push(`expected 0 test users, found ${residualUsers}`);
    }

    const residualAssignments = userIds.length
        ? await prisma.urUserAssignment.count({ where: { userId: { in: userIds } } })
        : 0;
    if (residualAssignments !== 0) {
        errors.push(`expected 0 assignments for test users, found ${residualAssignments}`);
    }

    const residualRoles = await prisma.role.count({
        where: {
            OR: [{ code: codes.grantedRoleCode }, { code: codes.deniedRoleCode }],
        },
    });
    if (residualRoles !== 0) {
        errors.push(`expected 0 test roles, found ${residualRoles}`);
    }

    const residualResources = await prisma.urResource.count({ where: { code: codes.resourceCode } });
    if (residualResources !== 0) {
        errors.push(`expected 0 test resources, found ${residualResources}`);
    }

    const residualActions = await prisma.urAction.count({ where: { code: codes.actionCode } });
    if (residualActions !== 0) {
        errors.push(`expected 0 test actions, found ${residualActions}`);
    }

    const residualPermissions = await prisma.urPermission.count({ where: { legacyCode: codes.legacyCode } });
    if (residualPermissions !== 0) {
        errors.push(`expected 0 test permissions, found ${residualPermissions}`);
    }

    const residualRolePerms = roleIds.length
        ? await prisma.urRolePermission.count({ where: { permissionId: catalog.permissionId } })
        : 0;
    if (residualRolePerms !== 0) {
        errors.push(`expected 0 test role-permission mappings, found ${residualRolePerms}`);
    }

    if (errors.length) {
        throw new Error(`[test-harness:acc-cleanup] runId=${runId} — ${errors.join('; ')}`);
    }
}

module.exports = {
    cleanupAccFixture,
};
