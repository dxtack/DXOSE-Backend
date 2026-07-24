'use strict';

const { hashPassword } = require('../../src/utils/password');

const GRN_VIEW = 'GRN_VIEW';
const GRN_MANAGE = 'GRN_MANAGE';

function grnFixtureCodes(runId) {
    return {
        tenantSlugA: `it-grn-a-${runId}`,
        tenantSlugB: `it-grn-b-${runId}`,
        grantedRoleCode: `IT_GRN_GRANTED_${runId}`,
        deniedRoleCode: `IT_GRN_DENIED_${runId}`,
        scopeRoleCode: `IT_GRN_SCOPE_${runId}`,
        otherPermLegacy: `IT_GRN_OTHER_${runId}`,
        deptACode: `IT_GRN_DEPT_A_${runId}`,
        deptBCode: `IT_GRN_DEPT_B_${runId}`,
        locAName: `IT_GRN_LOC_A_${runId}`,
        locBName: `IT_GRN_LOC_B_${runId}`,
    };
}

async function ensureCanonicalPermission(prisma, legacyCode, runId) {
    const existing = await prisma.urPermission.findUnique({ where: { legacyCode } });
    if (existing) {
        return { permission: existing, created: false };
    }

    const resource = await prisma.urResource.create({
        data: {
            code: `IT_GRN_RES_${legacyCode}_${runId}`,
            name: `GRN ${legacyCode} Resource ${runId}`,
            category: 'Integration',
            displayOrder: 0,
        },
    });

    const action = await prisma.urAction.create({
        data: {
            code: `IT_GRN_ACT_${legacyCode}_${runId}`,
            name: `GRN ${legacyCode} Action ${runId}`,
            displayOrder: 0,
        },
    });

    const permission = await prisma.urPermission.create({
        data: {
            resourceId: resource.id,
            actionId: action.id,
            legacyCode,
            name: `Integration ${legacyCode} ${runId}`,
        },
    });

    return {
        permission,
        created: true,
        resourceId: resource.id,
        actionId: action.id,
    };
}

async function ensureOtherPermission(prisma, legacyCode, runId) {
    const resource = await prisma.urResource.create({
        data: {
            code: `IT_GRN_RES_OTHER_${runId}`,
            name: `GRN Other Resource ${runId}`,
            category: 'Integration',
            displayOrder: 0,
        },
    });

    const action = await prisma.urAction.create({
        data: {
            code: `IT_GRN_ACT_OTHER_${runId}`,
            name: `GRN Other Action ${runId}`,
            displayOrder: 0,
        },
    });

    const permission = await prisma.urPermission.create({
        data: {
            resourceId: resource.id,
            actionId: action.id,
            legacyCode,
            name: `Integration Other ${runId}`,
        },
    });

    return { permission, resourceId: resource.id, actionId: action.id };
}

async function createRoleWithPermissions(prisma, roleCode, name, permissionIds) {
    const role = await prisma.role.create({
        data: {
            code: roleCode,
            name,
            tenantId: null,
            isActive: true,
        },
    });

    if (permissionIds.length) {
        await prisma.urRolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
    }

    return role;
}

async function createUserWithMembership(prisma, { email, tenantId, roleId, firstName }) {
    const passwordHash = await hashPassword('integration-test-password-not-used');
    const user = await prisma.user.create({
        data: {
            email,
            passwordHash,
            firstName,
            lastName: email.split('@')[0],
            isActive: true,
        },
    });

    const membership = await prisma.tenantMember.create({
        data: {
            tenantId,
            userId: user.id,
            roleId,
            isActive: true,
        },
        include: { role: { select: { id: true, code: true } } },
    });

    return { user, membership };
}

async function createAssignment(prisma, { userId, roleId, tenantId, departmentId = null }) {
    const data = {
        userId,
        roleId,
        isActive: true,
        properties: { create: [{ propertyId: tenantId }] },
    };
    if (departmentId) {
        data.departments = { create: [{ departmentId }] };
    }
    return prisma.urUserAssignment.create({ data });
}

async function createGrnRecord(prisma, { tenantId, locationId, importedBy, grnNumber, runId, suffix }) {
    return prisma.grnImport.create({
        data: {
            tenantId,
            grnNumber,
            vendorNameSnapshot: `Integration Supplier ${runId}-${suffix}`,
            locationId,
            receivingDate: new Date(),
            pdfAttachmentUrl: `integration/grn/${runId}/${suffix}.pdf`,
            status: 'DRAFT',
            importedBy,
            lines: {
                create: [{
                    futurelogItemCode: `IT-ITEM-${runId}-${suffix}`,
                    futurelogDescription: `Integration line ${suffix}`,
                    futurelogUom: 'EA',
                    orderedQty: 1,
                    receivedQty: 1,
                    unitPrice: 10,
                    isMapped: true,
                }],
            },
        },
        include: { lines: true },
    });
}

async function createTenantWithDepartments(prisma, { slug, name, runId }) {
    const codes = grnFixtureCodes(runId);
    const tenant = await prisma.tenant.create({
        data: {
            name,
            slug,
            isActive: true,
        },
    });

    const departmentA = await prisma.department.create({
        data: {
            tenantId: tenant.id,
            code: `${codes.deptACode}-${slug}`,
            name: `GRN Dept A ${runId}`,
            isActive: true,
        },
    });

    const departmentB = await prisma.department.create({
        data: {
            tenantId: tenant.id,
            code: `${codes.deptBCode}-${slug}`,
            name: `GRN Dept B ${runId}`,
            isActive: true,
        },
    });

    const locationA = await prisma.location.create({
        data: {
            tenantId: tenant.id,
            departmentId: departmentA.id,
            name: `${codes.locAName}-${slug}`,
            isActive: true,
        },
    });

    const locationB = await prisma.location.create({
        data: {
            tenantId: tenant.id,
            departmentId: departmentB.id,
            name: `${codes.locBName}-${slug}`,
            isActive: true,
        },
    });

    return { tenant, departmentA, departmentB, locationA, locationB };
}

/**
 * Fixture for API authorization characterization (single tenant, multi-user).
 */
async function createGrnAuthorizationFixture(prisma, runContext) {
    const runId = runContext.runId;
    const codes = grnFixtureCodes(runId);

    const viewPerm = await ensureCanonicalPermission(prisma, GRN_VIEW, runId);
    const managePerm = await ensureCanonicalPermission(prisma, GRN_MANAGE, runId);
    const otherPerm = await ensureOtherPermission(prisma, codes.otherPermLegacy, runId);

    const grnPermissionIds = [viewPerm.permission.id, managePerm.permission.id];

    const grantedRole = await createRoleWithPermissions(
        prisma,
        codes.grantedRoleCode,
        `GRN Granted ${runId}`,
        grnPermissionIds,
    );

    const scopeRole = await createRoleWithPermissions(
        prisma,
        codes.scopeRoleCode,
        `GRN Scope ${runId}`,
        grnPermissionIds,
    );

    const deniedRole = await createRoleWithPermissions(
        prisma,
        codes.deniedRoleCode,
        `GRN Denied ${runId}`,
        [otherPerm.permission.id],
    );

    const { tenant, departmentA, departmentB, locationA, locationB } = await createTenantWithDepartments(
        prisma,
        {
            slug: codes.tenantSlugA,
            name: `GRN Auth Tenant ${runId}`,
            runId,
        },
    );

    const authorizedEmail = runContext.integrationEmail('it-grn-authorized');
    const deniedEmail = runContext.integrationEmail('it-grn-denied');
    const scopeEmail = runContext.integrationEmail('it-grn-scope');

    const { user: authorizedUser, membership: authorizedMembership } = await createUserWithMembership(
        prisma,
        { email: authorizedEmail, tenantId: tenant.id, roleId: grantedRole.id, firstName: 'Authorized' },
    );

    const { user: deniedUser, membership: deniedMembership } = await createUserWithMembership(
        prisma,
        { email: deniedEmail, tenantId: tenant.id, roleId: deniedRole.id, firstName: 'Denied' },
    );

    const { user: scopeUser, membership: scopeMembership } = await createUserWithMembership(
        prisma,
        { email: scopeEmail, tenantId: tenant.id, roleId: scopeRole.id, firstName: 'Scope' },
    );

    const authorizedAssignment = await createAssignment(prisma, {
        userId: authorizedUser.id,
        roleId: grantedRole.id,
        tenantId: tenant.id,
        departmentId: departmentA.id,
    });

    const deniedAssignment = await createAssignment(prisma, {
        userId: deniedUser.id,
        roleId: deniedRole.id,
        tenantId: tenant.id,
        departmentId: departmentA.id,
    });

    const scopeAssignment = await createAssignment(prisma, {
        userId: scopeUser.id,
        roleId: scopeRole.id,
        tenantId: tenant.id,
        departmentId: departmentA.id,
    });

    const grnInScope = await createGrnRecord(prisma, {
        tenantId: tenant.id,
        locationId: locationA.id,
        importedBy: authorizedUser.id,
        grnNumber: `IT-GRN-IN-${runId}`,
        runId,
        suffix: 'in',
    });

    const grnOutOfScope = await createGrnRecord(prisma, {
        tenantId: tenant.id,
        locationId: locationB.id,
        importedBy: authorizedUser.id,
        grnNumber: `IT-GRN-OUT-${runId}`,
        runId,
        suffix: 'out',
    });

    const permissionVersions = {};
    for (const [key, userId] of [
        ['authorized', authorizedUser.id],
        ['denied', deniedUser.id],
        ['scope', scopeUser.id],
    ]) {
        const row = await prisma.user.findUnique({
            where: { id: userId },
            select: { permissionVersion: true },
        });
        permissionVersions[key] = row?.permissionVersion ?? 0;
    }

    return {
        kind: 'authorization',
        codes,
        tenantId: tenant.id,
        tenantSlug: codes.tenantSlugA,
        departmentAId: departmentA.id,
        departmentBId: departmentB.id,
        locationAId: locationA.id,
        locationBId: locationB.id,
        grantedRoleId: grantedRole.id,
        deniedRoleId: deniedRole.id,
        scopeRoleId: scopeRole.id,
        viewPermissionId: viewPerm.permission.id,
        managePermissionId: managePerm.permission.id,
        otherPermissionId: otherPerm.permission.id,
        createdViewPerm: viewPerm.created,
        createdManagePerm: managePerm.created,
        otherResourceId: otherPerm.resourceId,
        otherActionId: otherPerm.actionId,
        viewResourceId: viewPerm.resourceId,
        viewActionId: viewPerm.actionId,
        manageResourceId: managePerm.resourceId,
        manageActionId: managePerm.actionId,
        authorizedUserId: authorizedUser.id,
        deniedUserId: deniedUser.id,
        scopeUserId: scopeUser.id,
        authorizedEmail,
        deniedEmail,
        scopeEmail,
        authorizedMembershipId: authorizedMembership.id,
        deniedMembershipId: deniedMembership.id,
        scopeMembershipId: scopeMembership.id,
        authorizedAssignmentId: authorizedAssignment.id,
        deniedAssignmentId: deniedAssignment.id,
        scopeAssignmentId: scopeAssignment.id,
        grnInScopeId: grnInScope.id,
        grnOutOfScopeId: grnOutOfScope.id,
        grnInScopeNumber: grnInScope.grnNumber,
        grnOutOfScopeNumber: grnOutOfScope.grnNumber,
        permissionVersions,
    };
}

/**
 * Fixture for cross-tenant GRN isolation (two tenants, one GRN each).
 */
async function createGrnTenantIsolationFixture(prisma, runContext) {
    const runId = runContext.runId;
    const codes = grnFixtureCodes(runId);

    const viewPerm = await ensureCanonicalPermission(prisma, GRN_VIEW, runId);
    const managePerm = await ensureCanonicalPermission(prisma, GRN_MANAGE, runId);
    const grnPermissionIds = [viewPerm.permission.id, managePerm.permission.id];

    const roleA = await createRoleWithPermissions(
        prisma,
        `${codes.grantedRoleCode}_A`,
        `GRN Tenant A ${runId}`,
        grnPermissionIds,
    );

    const roleB = await createRoleWithPermissions(
        prisma,
        `${codes.grantedRoleCode}_B`,
        `GRN Tenant B ${runId}`,
        grnPermissionIds,
    );

    const tenantAData = await createTenantWithDepartments(prisma, {
        slug: codes.tenantSlugA,
        name: `GRN Isolation Tenant A ${runId}`,
        runId,
    });

    const tenantBData = await createTenantWithDepartments(prisma, {
        slug: codes.tenantSlugB,
        name: `GRN Isolation Tenant B ${runId}`,
        runId,
    });

    const userAEmail = runContext.integrationEmail('it-grn-user-a');
    const userBEmail = runContext.integrationEmail('it-grn-user-b');

    const { user: userA } = await createUserWithMembership(prisma, {
        email: userAEmail,
        tenantId: tenantAData.tenant.id,
        roleId: roleA.id,
        firstName: 'UserA',
    });

    const { user: userB } = await createUserWithMembership(prisma, {
        email: userBEmail,
        tenantId: tenantBData.tenant.id,
        roleId: roleB.id,
        firstName: 'UserB',
    });

    const assignmentA = await createAssignment(prisma, {
        userId: userA.id,
        roleId: roleA.id,
        tenantId: tenantAData.tenant.id,
        departmentId: tenantAData.departmentA.id,
    });

    const assignmentB = await createAssignment(prisma, {
        userId: userB.id,
        roleId: roleB.id,
        tenantId: tenantBData.tenant.id,
        departmentId: tenantBData.departmentA.id,
    });

    const grnA = await createGrnRecord(prisma, {
        tenantId: tenantAData.tenant.id,
        locationId: tenantAData.locationA.id,
        importedBy: userA.id,
        grnNumber: `IT-GRN-A-${runId}`,
        runId,
        suffix: 'a',
    });

    const grnB = await createGrnRecord(prisma, {
        tenantId: tenantBData.tenant.id,
        locationId: tenantBData.locationA.id,
        importedBy: userB.id,
        grnNumber: `IT-GRN-B-${runId}`,
        runId,
        suffix: 'b',
    });

    return {
        kind: 'isolation',
        codes,
        tenantAId: tenantAData.tenant.id,
        tenantBId: tenantBData.tenant.id,
        tenantSlugA: codes.tenantSlugA,
        tenantSlugB: codes.tenantSlugB,
        roleAId: roleA.id,
        roleBId: roleB.id,
        viewPermissionId: viewPerm.permission.id,
        managePermissionId: managePerm.permission.id,
        createdViewPerm: viewPerm.created,
        createdManagePerm: managePerm.created,
        viewResourceId: viewPerm.resourceId,
        viewActionId: viewPerm.actionId,
        manageResourceId: managePerm.resourceId,
        manageActionId: managePerm.actionId,
        userAId: userA.id,
        userBId: userB.id,
        userAEmail,
        userBEmail,
        assignmentAId: assignmentA.id,
        assignmentBId: assignmentB.id,
        departmentAId: tenantAData.departmentA.id,
        departmentBId: tenantAData.departmentB.id,
        locationAId: tenantAData.locationA.id,
        locationBId: tenantAData.locationB.id,
        grnAId: grnA.id,
        grnBId: grnB.id,
        grnANumber: grnA.grnNumber,
        grnBNumber: grnB.grnNumber,
        grnAStatus: grnA.status,
        grnBStatus: grnB.status,
    };
}

async function issueGrnAccessToken(userId, tenantSlug) {
    const { switchTenant } = require('../../src/services/auth.service');
    const session = await switchTenant({
        userId,
        tenantSlug,
        ipAddress: '127.0.0.1',
        userAgent: 'integration-grn-api-test',
    });
    if (!session?.accessToken) {
        throw new Error('switchTenant did not return accessToken');
    }
    return session.accessToken;
}

/**
 * Sign an access token without persisting refresh tokens (for stale-JWT cases).
 */
async function signGrnAccessToken(prisma, { userId, tenantId, roleId, roleCode, email }) {
    const { generateAccessToken } = require('../../src/utils/jwt');
    const accRuntime = require('../../src/acc-runtime');
    const userRow = await prisma.user.findUnique({
        where: { id: userId },
        select: { permissionVersion: true, email: true },
    });
    const membership = await prisma.tenantMember.findFirst({
        where: { userId, tenantId, isActive: true },
        include: { role: { select: { id: true, code: true } }, tenant: { select: { slug: true } } },
    });
    const session = await accRuntime.resolveSession({
        userId,
        membership,
        decoded: { role: roleCode, roleId },
        tenantId,
    });
    return generateAccessToken({
        userId,
        tenantId,
        role: session.role || roleCode,
        email: email || userRow?.email,
        roleId: session.roleId || roleId,
        permissions: session.permissions,
        permissionVersion: userRow?.permissionVersion ?? 0,
    });
}

module.exports = {
    GRN_VIEW,
    GRN_MANAGE,
    grnFixtureCodes,
    ensureCanonicalPermission,
    createGrnRecord,
    createGrnAuthorizationFixture,
    createGrnTenantIsolationFixture,
    issueGrnAccessToken,
    signGrnAccessToken,
};
