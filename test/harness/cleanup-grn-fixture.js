'use strict';

const { grnFixtureCodes } = require('./disposable-grn-fixture');
const { deleteGrnCascade } = require('./grn-id-cleanup');

async function deleteAssignments(prisma, assignmentIds) {
    const ids = assignmentIds.filter(Boolean);
    if (!ids.length) return;

    await prisma.urAssignmentDepartment.deleteMany({ where: { assignmentId: { in: ids } } });
    await prisma.urAssignmentProperty.deleteMany({ where: { assignmentId: { in: ids } } });
    await prisma.urUserAssignment.deleteMany({ where: { id: { in: ids } } });
}

async function deleteUsers(prisma, userIds) {
    const ids = userIds.filter(Boolean);
    if (!ids.length) return;

    await prisma.auditLog.deleteMany({ where: { changedBy: { in: ids } } });
    await prisma.urUserAssignment.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tenantMember.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    for (const userId of ids) {
        await prisma.user.delete({ where: { id: userId } });
    }
}

async function deleteRoles(prisma, roleIds) {
    const ids = roleIds.filter(Boolean);
    if (!ids.length) return;

    await prisma.urRolePermission.deleteMany({ where: { roleId: { in: ids } } });
    for (const roleId of ids) {
        await prisma.role.delete({ where: { id: roleId } });
    }
}

async function deleteOptionalUrPermission(prisma, { permissionId, resourceId, actionId, created }) {
    if (!created || !permissionId) return;

    await prisma.urRolePermission.deleteMany({ where: { permissionId } });
    await prisma.urPermission.delete({ where: { id: permissionId } }).catch(() => {});
    if (actionId) {
        await prisma.urAction.delete({ where: { id: actionId } }).catch(() => {});
    }
    if (resourceId) {
        await prisma.urResource.delete({ where: { id: resourceId } }).catch(() => {});
    }
}

async function cleanupGrnAuthorizationFixture(prisma, { runContext, fixture }) {
    const errors = [];
    const runId = runContext.runId;
    const codes = grnFixtureCodes(runId);

    try {
        await deleteGrnCascade(prisma, [fixture.grnInScopeId, fixture.grnOutOfScopeId]);
    } catch (err) {
        errors.push(`GRN delete failed: ${err.message}`);
    }

    try {
        await deleteAssignments(prisma, [
            fixture.authorizedAssignmentId,
            fixture.deniedAssignmentId,
            fixture.scopeAssignmentId,
        ]);
    } catch (err) {
        errors.push(`assignments delete failed: ${err.message}`);
    }

    try {
        await prisma.tenantMember.deleteMany({ where: { tenantId: fixture.tenantId } });
    } catch (err) {
        errors.push(`tenant_members delete failed: ${err.message}`);
    }

    try {
        await deleteUsers(prisma, [fixture.authorizedUserId, fixture.deniedUserId, fixture.scopeUserId]);
    } catch (err) {
        errors.push(`users delete failed: ${err.message}`);
    }

    try {
        await deleteRoles(prisma, [fixture.grantedRoleId, fixture.deniedRoleId, fixture.scopeRoleId]);
    } catch (err) {
        errors.push(`roles delete failed: ${err.message}`);
    }

    try {
        await prisma.urPermission.delete({ where: { id: fixture.otherPermissionId } });
        await prisma.urAction.delete({ where: { id: fixture.otherActionId } });
        await prisma.urResource.delete({ where: { id: fixture.otherResourceId } });
    } catch (err) {
        errors.push(`other permission catalog delete failed: ${err.message}`);
    }

    await deleteOptionalUrPermission(prisma, {
        permissionId: fixture.viewPermissionId,
        resourceId: fixture.viewResourceId,
        actionId: fixture.viewActionId,
        created: fixture.createdViewPerm,
    });

    await deleteOptionalUrPermission(prisma, {
        permissionId: fixture.managePermissionId,
        resourceId: fixture.manageResourceId,
        actionId: fixture.manageActionId,
        created: fixture.createdManagePerm,
    });

    const locationIds = [fixture.locationAId, fixture.locationBId].filter(Boolean);
    if (locationIds.length) {
        try {
            await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
        } catch (err) {
            errors.push(`locations delete failed: ${err.message}`);
        }
    }

    const departmentIds = [fixture.departmentAId, fixture.departmentBId].filter(Boolean);
    if (departmentIds.length) {
        try {
            await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
        } catch (err) {
            errors.push(`departments delete failed: ${err.message}`);
        }
    }

    if (fixture.tenantId) {
        try {
            await prisma.tenant.delete({ where: { id: fixture.tenantId } });
        } catch (err) {
            errors.push(`tenant delete failed: ${err.message}`);
        }
    }

    await assertGrnCleanupResiduals(prisma, { runId, codes, errors, fixture, kind: 'authorization' });

    if (errors.length) {
        throw new Error(`[test-harness:grn-cleanup] runId=${runId} — ${errors.join('; ')}`);
    }
}

async function cleanupGrnTenantIsolationFixture(prisma, { runContext, fixture }) {
    const errors = [];
    const runId = runContext.runId;
    const codes = grnFixtureCodes(runId);

    try {
        await deleteGrnCascade(prisma, [fixture.grnAId, fixture.grnBId]);
    } catch (err) {
        errors.push(`GRN delete failed: ${err.message}`);
    }

    try {
        await deleteAssignments(prisma, [fixture.assignmentAId, fixture.assignmentBId]);
    } catch (err) {
        errors.push(`assignments delete failed: ${err.message}`);
    }

    for (const tenantId of [fixture.tenantAId, fixture.tenantBId]) {
        try {
            await prisma.tenantMember.deleteMany({ where: { tenantId } });
        } catch (err) {
            errors.push(`tenant_members delete failed (${tenantId}): ${err.message}`);
        }
    }

    try {
        await deleteUsers(prisma, [fixture.userAId, fixture.userBId]);
    } catch (err) {
        errors.push(`users delete failed: ${err.message}`);
    }

    try {
        await deleteRoles(prisma, [fixture.roleAId, fixture.roleBId]);
    } catch (err) {
        errors.push(`roles delete failed: ${err.message}`);
    }

    await deleteOptionalUrPermission(prisma, {
        permissionId: fixture.viewPermissionId,
        resourceId: fixture.viewResourceId,
        actionId: fixture.viewActionId,
        created: fixture.createdViewPerm,
    });

    await deleteOptionalUrPermission(prisma, {
        permissionId: fixture.managePermissionId,
        resourceId: fixture.manageResourceId,
        actionId: fixture.manageActionId,
        created: fixture.createdManagePerm,
    });

    for (const tenantId of [fixture.tenantAId, fixture.tenantBId]) {
        try {
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.department.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        } catch (err) {
            errors.push(`tenant cascade delete failed (${tenantId}): ${err.message}`);
        }
    }

    await assertGrnCleanupResiduals(prisma, { runId, codes, errors, fixture, kind: 'isolation' });

    if (errors.length) {
        throw new Error(`[test-harness:grn-cleanup] runId=${runId} — ${errors.join('; ')}`);
    }
}

async function assertGrnCleanupResiduals(prisma, { runId, codes, errors, fixture, kind }) {
    const grnCount = await prisma.grnImport.count({
        where: {
            OR: [
                { grnNumber: { contains: runId } },
                { vendorNameSnapshot: { contains: runId } },
            ],
        },
    });
    if (grnCount !== 0) errors.push(`expected 0 GRN headers, found ${grnCount}`);

    const lineCount = await prisma.grnLine.count({
        where: { futurelogItemCode: { contains: runId } },
    });
    if (lineCount !== 0) errors.push(`expected 0 GRN lines, found ${lineCount}`);

    const approvalCount = await prisma.approvalRequest.count({
        where: { tenantId: { in: [fixture.tenantId, fixture.tenantAId, fixture.tenantBId].filter(Boolean) } },
    });
    if (approvalCount !== 0) errors.push(`expected 0 approval requests, found ${approvalCount}`);

    const auditCount = await prisma.auditLog.count({
        where: {
            entityId: {
                in: [
                    fixture.grnInScopeId,
                    fixture.grnOutOfScopeId,
                    fixture.grnAId,
                    fixture.grnBId,
                ].filter(Boolean),
            },
        },
    });
    if (auditCount !== 0) errors.push(`expected 0 audit rows for test GRNs, found ${auditCount}`);

    const ledgerCount = await prisma.inventoryLedger.count({
        where: {
            tenantId: { in: [fixture.tenantId, fixture.tenantAId, fixture.tenantBId].filter(Boolean) },
        },
    });
    if (ledgerCount !== 0) errors.push(`expected 0 ledger rows, found ${ledgerCount}`);

    if (kind === 'authorization') {
        const userCount = await prisma.user.count({
            where: {
                OR: [
                    { email: fixture.authorizedEmail },
                    { email: fixture.deniedEmail },
                    { email: fixture.scopeEmail },
                ],
            },
        });
        if (userCount !== 0) errors.push(`expected 0 test users, found ${userCount}`);

        const tenant = await prisma.tenant.findUnique({ where: { id: fixture.tenantId } });
        if (tenant) errors.push('tenant still exists after cleanup');
    }

    if (kind === 'isolation') {
        const userCount = await prisma.user.count({
            where: {
                OR: [{ email: fixture.userAEmail }, { email: fixture.userBEmail }],
            },
        });
        if (userCount !== 0) errors.push(`expected 0 test users, found ${userCount}`);

        for (const slug of [codes.tenantSlugA, codes.tenantSlugB]) {
            const tenant = await prisma.tenant.findFirst({ where: { slug } });
            if (tenant) errors.push(`tenant ${slug} still exists after cleanup`);
        }
    }
}

module.exports = {
    cleanupGrnAuthorizationFixture,
    cleanupGrnTenantIsolationFixture,
};
