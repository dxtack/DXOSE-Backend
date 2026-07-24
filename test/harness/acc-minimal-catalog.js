'use strict';

/**
 * Per-run minimal ACC catalog — no shared stable records between runs.
 */

function catalogCodes(runId) {
    return {
        resourceCode: `IT_ACC_RESOURCE_${runId}`,
        actionCode: `IT_ACC_ACTION_${runId}`,
        legacyCode: `IT_ACC_PERMISSION_${runId}`,
        grantedRoleCode: `IT_ACC_GRANTED_ROLE_${runId}`,
        deniedRoleCode: `IT_ACC_DENIED_ROLE_${runId}`,
    };
}

async function createMinimalAccCatalog(prisma, runContext) {
    const codes = catalogCodes(runContext.runId);

    const resource = await prisma.urResource.create({
        data: {
            code: codes.resourceCode,
            name: `Integration ACC Resource ${runContext.runId}`,
            category: 'Integration',
            displayOrder: 0,
        },
    });

    const action = await prisma.urAction.create({
        data: {
            code: codes.actionCode,
            name: `Integration ACC Action ${runContext.runId}`,
            displayOrder: 0,
        },
    });

    const permission = await prisma.urPermission.create({
        data: {
            resourceId: resource.id,
            actionId: action.id,
            legacyCode: codes.legacyCode,
            name: `Integration ACC Permission ${runContext.runId}`,
        },
    });

    const grantedRole = await prisma.role.create({
        data: {
            code: codes.grantedRoleCode,
            name: `Integration Granted Role ${runContext.runId}`,
            tenantId: null,
            isActive: true,
        },
    });

    const deniedRole = await prisma.role.create({
        data: {
            code: codes.deniedRoleCode,
            name: `Integration Denied Role ${runContext.runId}`,
            tenantId: null,
            isActive: true,
        },
    });

    await prisma.urRolePermission.create({
        data: {
            roleId: grantedRole.id,
            permissionId: permission.id,
        },
    });

    return {
        ...codes,
        resourceId: resource.id,
        actionId: action.id,
        permissionId: permission.id,
        grantedRoleId: grantedRole.id,
        deniedRoleId: deniedRole.id,
    };
}

module.exports = {
    catalogCodes,
    createMinimalAccCatalog,
};
