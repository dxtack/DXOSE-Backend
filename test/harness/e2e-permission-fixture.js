'use strict';

/**
 * Disposable E2E permission fixtures (run-scoped role codes).
 * These roles are intentional test artifacts only — never seed them into
 * long-lived environments. Prefer cleanup via e2e-permission-cleanup.js
 * after the suite; leftover roles on ose_inventory were retired in P1 #22.
 */

const { hashPassword } = require('../../src/utils/password');
const { createGrnRecord, ensureCanonicalPermission } = require('./disposable-grn-fixture');

const GRN_VIEW = 'GRN_VIEW';
const GRN_MANAGE = 'GRN_MANAGE';
const E2E_PASSWORD = 'integration-test-password-not-used';

function e2eCodes(runId) {
    return {
        tenantASlug: `e2e-perm-a-${runId}`,
        tenantBSlug: `e2e-perm-b-${runId}`,
        tenantDeniedSlug: `e2e-denied-${runId}`,
        tenantViewSlug: `e2e-view-${runId}`,
        roleA: `E2E_ROLE_A_${runId}`,
        roleB: `E2E_ROLE_B_${runId}`,
        roleOrgDenied: `E2E_ORG_DENIED_${runId}`,
        roleViewOnly: `E2E_VIEW_ONLY_${runId}`,
        otherPerm: `E2E_OTHER_${runId}`,
    };
}

async function ensureOtherPermission(prisma, legacyCode, runId) {
    const resource = await prisma.urResource.create({
        data: {
            code: `E2E_RES_OTHER_${runId}`,
            name: `E2E Other Resource ${runId}`,
            category: 'Integration',
            displayOrder: 0,
        },
    });
    const action = await prisma.urAction.create({
        data: {
            code: `E2E_ACT_OTHER_${runId}`,
            name: `E2E Other Action ${runId}`,
            displayOrder: 0,
        },
    });
    const permission = await prisma.urPermission.create({
        data: {
            resourceId: resource.id,
            actionId: action.id,
            legacyCode,
            name: `E2E Other ${runId}`,
        },
    });
    return { permission, resourceId: resource.id, actionId: action.id };
}

async function createRoleWithPermissions(prisma, code, name, permissionIds) {
    const role = await prisma.role.create({
        data: { code, name, tenantId: null, isActive: true },
    });
    if (permissionIds.length) {
        await prisma.urRolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
    }
    return role;
}

async function createTenantWithDeptLoc(prisma, { slug, name, runId, suffix }) {
    const tenant = await prisma.tenant.create({
        data: { name, slug, isActive: true },
    });
    const department = await prisma.department.create({
        data: {
            tenantId: tenant.id,
            code: `E2E_DEPT_${suffix}_${runId}`,
            name: `E2E Dept ${suffix}`,
            isActive: true,
        },
    });
    const location = await prisma.location.create({
        data: {
            tenantId: tenant.id,
            departmentId: department.id,
            name: `E2E_LOC_${suffix}_${runId}`,
            isActive: true,
        },
    });
    return { tenant, department, location };
}

async function createUser(prisma, email) {
    const passwordHash = await hashPassword(E2E_PASSWORD);
    return prisma.user.create({
        data: {
            email,
            passwordHash,
            firstName: 'E2E',
            lastName: email.split('@')[0],
            isActive: true,
        },
    });
}

/**
 * Disposable E2E permission fixtures — dynamic per run, test DB only.
 */
async function createE2ePermissionFixture(prisma, runContext) {
    const runId = runContext.runId;
    const codes = e2eCodes(runId);

    const viewPerm = await ensureCanonicalPermission(prisma, GRN_VIEW, runId);
    const managePerm = await ensureCanonicalPermission(prisma, GRN_MANAGE, runId);
    const dashboardPerm = await ensureCanonicalPermission(prisma, 'VIEW_DASHBOARD', runId);
    const otherPerm = await ensureOtherPermission(prisma, codes.otherPerm, runId);

    const tenantAData = await createTenantWithDeptLoc(prisma, {
        slug: codes.tenantASlug,
        name: `E2E Tenant A ${runId}`,
        runId,
        suffix: 'A',
    });
    const tenantBData = await createTenantWithDeptLoc(prisma, {
        slug: codes.tenantBSlug,
        name: `E2E Tenant B ${runId}`,
        runId,
        suffix: 'B',
    });
    const tenantDeniedData = await createTenantWithDeptLoc(prisma, {
        slug: codes.tenantDeniedSlug,
        name: `E2E Denied Tenant ${runId}`,
        runId,
        suffix: 'D',
    });
    const tenantViewData = await createTenantWithDeptLoc(prisma, {
        slug: codes.tenantViewSlug,
        name: `E2E View Tenant ${runId}`,
        runId,
        suffix: 'V',
    });

    const roleA = await createRoleWithPermissions(
        prisma,
        codes.roleA,
        `E2E Role A ${runId}`,
        [viewPerm.permission.id, managePerm.permission.id, dashboardPerm.permission.id],
    );
    const roleB = await createRoleWithPermissions(
        prisma,
        codes.roleB,
        `E2E Role B ${runId}`,
        [otherPerm.permission.id, dashboardPerm.permission.id],
    );
    const roleViewOnly = await createRoleWithPermissions(
        prisma,
        codes.roleViewOnly,
        `E2E View Only ${runId}`,
        [viewPerm.permission.id],
    );

    let orgManagerRole = await prisma.role.findUnique({ where: { code: 'ORG_MANAGER' } });
    let orgManagerRolePermSnapshot = null;
    if (orgManagerRole) {
        orgManagerRolePermSnapshot = await prisma.urRolePermission.findMany({
            where: { roleId: orgManagerRole.id },
        });
        await prisma.urRolePermission.deleteMany({ where: { roleId: orgManagerRole.id } });
        await prisma.urRolePermission.create({
            data: { roleId: orgManagerRole.id, permissionId: otherPerm.permission.id },
        });
        await prisma.urRolePermission.create({
            data: { roleId: orgManagerRole.id, permissionId: dashboardPerm.permission.id },
        });
    } else {
        orgManagerRole = await createRoleWithPermissions(
            prisma,
            'ORG_MANAGER',
            `E2E ORG Manager ${runId}`,
            [otherPerm.permission.id, dashboardPerm.permission.id],
        );
    }

    const dualTenantEmail = runContext.integrationEmail('e2e-dual-tenant');
    const orgDeniedEmail = runContext.integrationEmail('e2e-org-denied');
    const viewOnlyEmail = runContext.integrationEmail('e2e-grn-view');

    const dualUser = await createUser(prisma, dualTenantEmail);
    const orgDeniedUser = await createUser(prisma, orgDeniedEmail);
    const viewOnlyUser = await createUser(prisma, viewOnlyEmail);

    await prisma.tenantMember.create({
        data: {
            tenantId: tenantAData.tenant.id,
            userId: dualUser.id,
            roleId: roleA.id,
            isActive: true,
        },
    });
    await prisma.tenantMember.create({
        data: {
            tenantId: tenantBData.tenant.id,
            userId: dualUser.id,
            roleId: roleB.id,
            isActive: true,
        },
    });

    await prisma.urUserAssignment.create({
        data: {
            userId: dualUser.id,
            roleId: roleA.id,
            isActive: true,
            properties: { create: [{ propertyId: tenantAData.tenant.id }] },
            departments: { create: [{ departmentId: tenantAData.department.id }] },
        },
    });
    await prisma.urUserAssignment.create({
        data: {
            userId: dualUser.id,
            roleId: roleB.id,
            isActive: true,
            properties: { create: [{ propertyId: tenantBData.tenant.id }] },
            departments: { create: [{ departmentId: tenantBData.department.id }] },
        },
    });

    await prisma.tenantMember.create({
        data: {
            tenantId: tenantDeniedData.tenant.id,
            userId: orgDeniedUser.id,
            roleId: orgManagerRole.id,
            isActive: true,
        },
    });
    await prisma.urUserAssignment.create({
        data: {
            userId: orgDeniedUser.id,
            roleId: orgManagerRole.id,
            isActive: true,
            properties: { create: [{ propertyId: tenantDeniedData.tenant.id }] },
            departments: { create: [{ departmentId: tenantDeniedData.department.id }] },
        },
    });

    await prisma.tenantMember.create({
        data: {
            tenantId: tenantViewData.tenant.id,
            userId: viewOnlyUser.id,
            roleId: roleViewOnly.id,
            isActive: true,
        },
    });
    await prisma.urUserAssignment.create({
        data: {
            userId: viewOnlyUser.id,
            roleId: roleViewOnly.id,
            isActive: true,
            properties: { create: [{ propertyId: tenantViewData.tenant.id }] },
            departments: { create: [{ departmentId: tenantViewData.department.id }] },
        },
    });

    const grnValidated = await createGrnRecord(prisma, {
        tenantId: tenantViewData.tenant.id,
        locationId: tenantViewData.location.id,
        importedBy: viewOnlyUser.id,
        grnNumber: `E2E-GRN-${runId}`,
        runId,
        suffix: 'validated',
    });
    await prisma.grnImport.update({
        where: { id: grnValidated.id },
        data: { status: 'VALIDATED' },
    });

    return {
        runId,
        password: E2E_PASSWORD,
        codes,
        viewPermissionId: viewPerm.permission.id,
        managePermissionId: managePerm.permission.id,
        dashboardPermissionId: dashboardPerm.permission.id,
        otherPermissionId: otherPerm.permission.id,
        createdViewPerm: viewPerm.created,
        createdManagePerm: managePerm.created,
        createdDashboardPerm: dashboardPerm.created,
        otherResourceId: otherPerm.resourceId,
        otherActionId: otherPerm.actionId,
        viewResourceId: viewPerm.resourceId,
        viewActionId: viewPerm.actionId,
        manageResourceId: managePerm.resourceId,
        manageActionId: managePerm.actionId,
        dashboardResourceId: dashboardPerm.resourceId,
        dashboardActionId: dashboardPerm.actionId,
        dualTenant: {
            userId: dualUser.id,
            email: dualTenantEmail,
            tenantA: { id: tenantAData.tenant.id, slug: codes.tenantASlug, name: tenantAData.tenant.name },
            tenantB: { id: tenantBData.tenant.id, slug: codes.tenantBSlug, name: tenantBData.tenant.name },
            roleAId: roleA.id,
            roleBId: roleB.id,
            assignmentAId: null,
            assignmentBId: null,
        },
        orgManagerDenied: {
            userId: orgDeniedUser.id,
            email: orgDeniedEmail,
            tenantId: tenantDeniedData.tenant.id,
            tenantSlug: codes.tenantDeniedSlug,
            roleId: orgManagerRole.id,
        },
        grnViewOnly: {
            userId: viewOnlyUser.id,
            email: viewOnlyEmail,
            tenantId: tenantViewData.tenant.id,
            tenantSlug: codes.tenantViewSlug,
            roleId: roleViewOnly.id,
            grnId: grnValidated.id,
            grnNumber: grnValidated.grnNumber,
            grnStatus: 'VALIDATED',
            locationId: tenantViewData.location.id,
            departmentId: tenantViewData.department.id,
        },
        tenantIds: [
            tenantAData.tenant.id,
            tenantBData.tenant.id,
            tenantDeniedData.tenant.id,
            tenantViewData.tenant.id,
        ],
        userIds: [dualUser.id, orgDeniedUser.id, viewOnlyUser.id],
        roleIds: [roleA.id, roleB.id, orgManagerRole.id, roleViewOnly.id],
        orgManagerRolePermSnapshot,
        orgManagerRoleCreatedFresh: !orgManagerRolePermSnapshot,
        grnIds: [grnValidated.id],
        locationIds: [
            tenantAData.location.id,
            tenantBData.location.id,
            tenantDeniedData.location.id,
            tenantViewData.location.id,
        ],
        departmentIds: [
            tenantAData.department.id,
            tenantBData.department.id,
            tenantDeniedData.department.id,
            tenantViewData.department.id,
        ],
    };
}

module.exports = {
    E2E_PASSWORD,
    e2eCodes,
    createE2ePermissionFixture,
};
