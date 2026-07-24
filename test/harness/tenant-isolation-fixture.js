'use strict';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../test/harness/run-context');
const {
    createGrnTenantIsolationFixture,
    createGrnRecord,
    ensureCanonicalPermission,
} = require('../../test/harness/disposable-grn-fixture');
const { hashPassword } = require('../../src/utils/password');
const { connectRole } = require('../../src/services/rbac.service');

const INTEGRATION_PASSWORD = 'integration-test-password-not-used';

async function ensurePermission(prisma, legacyCode, runId) {
    return ensureCanonicalPermission(prisma, legacyCode, runId);
}

async function createOrgWithChildren(prisma, runId) {
    const orgRoot = await prisma.tenant.create({
        data: {
            name: `TI Org Root ${runId}`,
            slug: `ti-org-${runId}`,
            isActive: true,
        },
    });

    const childA = await prisma.tenant.create({
        data: {
            name: `TI Child A ${runId}`,
            slug: `ti-child-a-${runId}`,
            parentId: orgRoot.id,
            isActive: true,
        },
    });

    const childB = await prisma.tenant.create({
        data: {
            name: `TI Child B ${runId}`,
            slug: `ti-child-b-${runId}`,
            parentId: orgRoot.id,
            isActive: true,
        },
    });

    const outsider = await prisma.tenant.create({
        data: {
            name: `TI Outsider ${runId}`,
            slug: `ti-outsider-${runId}`,
            isActive: true,
        },
    });

    return { orgRoot, childA, childB, outsider };
}

async function createTenantIsolationFixture(prisma, runContext) {
    const runId = runContext.runId;
    const grnFixture = await createGrnTenantIsolationFixture(prisma, runContext);

    const getPassView = await ensurePermission(prisma, 'GET_PASS_VIEW', runId);
    const getPassCreate = await ensurePermission(prisma, 'GET_PASS_CREATE', runId);
    const grnManage = await ensurePermission(prisma, 'GRN_MANAGE', runId);

    const org = await createOrgWithChildren(prisma, runId);

    let orgManagerRole = await prisma.role.findUnique({ where: { code: 'ORG_MANAGER' } });
    if (!orgManagerRole) {
        orgManagerRole = await prisma.role.create({
            data: { code: 'ORG_MANAGER', name: 'Org Manager', tenantId: null, isActive: true },
        });
    }

    const orgManagerPermIds = [
        getPassView.permission.id,
        grnFixture.viewPermissionId,
        grnManage.permission.id,
    ];
    await prisma.urRolePermission.deleteMany({ where: { roleId: orgManagerRole.id } });
    await prisma.urRolePermission.createMany({
        data: orgManagerPermIds.map((permissionId) => ({ roleId: orgManagerRole.id, permissionId })),
    });

    const orgManagerEmail = runContext.integrationEmail('ti-org-mgr');
    const orgManagerUser = await prisma.user.create({
        data: {
            email: orgManagerEmail,
            passwordHash: await hashPassword(INTEGRATION_PASSWORD),
            firstName: 'Org',
            lastName: 'Manager',
            isActive: true,
        },
    });

    await prisma.tenantMember.create({
        data: {
            tenantId: org.orgRoot.id,
            userId: orgManagerUser.id,
            roleId: orgManagerRole.id,
            isActive: true,
        },
    });

    const deptA = await prisma.department.create({
        data: {
            tenantId: org.childA.id,
            code: `TI_DEPT_A_${runId}`,
            name: 'Child A Dept',
            isActive: true,
        },
    });
    const locA = await prisma.location.create({
        data: {
            tenantId: org.childA.id,
            departmentId: deptA.id,
            name: `TI_LOC_A_${runId}`,
            isActive: true,
        },
    });

    const deptB = await prisma.department.create({
        data: {
            tenantId: org.childB.id,
            code: `TI_DEPT_B_${runId}`,
            name: 'Child B Dept',
            isActive: true,
        },
    });
    const locB = await prisma.location.create({
        data: {
            tenantId: org.childB.id,
            departmentId: deptB.id,
            name: `TI_LOC_B_${runId}`,
            isActive: true,
        },
    });

    const grnChildA = await createGrnRecord(prisma, {
        tenantId: org.childA.id,
        locationId: locA.id,
        importedBy: orgManagerUser.id,
        grnNumber: `TI-GRN-CHILD-A-${runId}`,
        runId,
        suffix: 'child-a',
    });

    const grnChildB = await createGrnRecord(prisma, {
        tenantId: org.childB.id,
        locationId: locB.id,
        importedBy: orgManagerUser.id,
        grnNumber: `TI-GRN-CHILD-B-${runId}`,
        runId,
        suffix: 'child-b',
    });

    const getPassA = await prisma.getPass.create({
        data: {
            tenantId: org.childA.id,
            passNo: `TI-GP-A-${runId}`,
            transferType: 'TEMPORARY',
            borrowingEntity: 'TI Borrower A',
            status: 'OUT',
            createdBy: orgManagerUser.id,
            isInternalTransfer: true,
            targetTenantId: org.childB.id,
        },
    });

    const getPassB = await prisma.getPass.create({
        data: {
            tenantId: org.childB.id,
            passNo: `TI-GP-B-${runId}`,
            transferType: 'TEMPORARY',
            borrowingEntity: 'TI Borrower B',
            status: 'OUT',
            createdBy: orgManagerUser.id,
        },
    });

    return {
        runId,
        password: INTEGRATION_PASSWORD,
        grn: grnFixture,
        org: {
            orgRootId: org.orgRoot.id,
            orgRootSlug: org.orgRoot.slug,
            childAId: org.childA.id,
            childASlug: org.childA.slug,
            childBId: org.childB.id,
            childBSlug: org.childB.slug,
            outsiderId: org.outsider.id,
            outsiderSlug: org.outsider.slug,
            grnChildAId: grnChildA.id,
            grnChildBId: grnChildB.id,
            getPassAId: getPassA.id,
            getPassBId: getPassB.id,
            getPassInternalTargetId: getPassA.id,
            locBId: locB.id,
            deptBId: deptB.id,
        },
        orgManager: {
            userId: orgManagerUser.id,
            email: orgManagerEmail,
        },
        tenantIds: [
            grnFixture.tenantAId,
            grnFixture.tenantBId,
            org.orgRoot.id,
            org.childA.id,
            org.childB.id,
            org.outsider.id,
        ],
        grnIds: [grnFixture.grnAId, grnFixture.grnBId, grnChildA.id, grnChildB.id],
        getPassIds: [getPassA.id, getPassB.id],
        userIds: [grnFixture.userAId, grnFixture.userBId, orgManagerUser.id],
    };
}

async function cleanupTenantIsolationFixture(prisma, fixture) {
    const errors = [];
    const { deleteGrnCascade } = require('../../test/harness/grn-id-cleanup');

    try {
        await deleteGrnCascade(prisma, fixture.grnIds);
    } catch (err) {
        errors.push(`grn cleanup: ${err.message}`);
    }

    for (const id of fixture.getPassIds || []) {
        try {
            await prisma.getPassLine.deleteMany({ where: { getPassId: id } });
            await prisma.getPass.delete({ where: { id } });
        } catch (err) {
            errors.push(`getPass ${id}: ${err.message}`);
        }
    }

    for (const tenantId of fixture.tenantIds || []) {
        try {
            await prisma.auditLog.deleteMany({ where: { tenantId } });
        } catch (err) {
            errors.push(`audit tenant ${tenantId}: ${err.message}`);
        }
    }

    for (const userId of fixture.userIds || []) {
        try {
            await prisma.auditLog.deleteMany({ where: { changedBy: userId } });
        } catch (err) {
            errors.push(`audit user ${userId}: ${err.message}`);
        }
    }

    for (const tenantId of fixture.tenantIds || []) {
        try {
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.department.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        } catch (err) {
            errors.push(`tenant ${tenantId}: ${err.message}`);
        }
    }

    for (const userId of fixture.userIds || []) {
        try {
            await prisma.tenantMember.deleteMany({ where: { userId } });
            await prisma.refreshToken.deleteMany({ where: { userId } });
            await prisma.user.delete({ where: { id: userId } });
        } catch (err) {
            errors.push(`user ${userId}: ${err.message}`);
        }
    }

    if (errors.length) {
        throw new Error(errors.join('; '));
    }
}

module.exports = {
    INTEGRATION_PASSWORD,
    createTenantIsolationFixture,
    cleanupTenantIsolationFixture,
    createRunContext,
};
