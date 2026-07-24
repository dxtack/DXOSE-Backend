'use strict';

const { hashPassword } = require('../../src/utils/password');

function scopeCodes(runId) {
    return {
        roleCode: `IT_ACC_SCOPE_ROLE_${runId}`,
        tenantSlugMain: `it-scope-main-${runId}`,
        tenantSlugIsolation: `it-scope-isolation-${runId}`,
        deptACode: `IT_SCOPE_DEPT_A_${runId}`,
        deptBCode: `IT_SCOPE_DEPT_B_${runId}`,
        deptXCode: `IT_SCOPE_DEPT_X_${runId}`,
        locAName: `IT_SCOPE_LOC_A_${runId}`,
        locBName: `IT_SCOPE_LOC_B_${runId}`,
        locXName: `IT_SCOPE_LOC_X_${runId}`,
    };
}

async function createDisposableScopeFixture(prisma, runContext) {
    const codes = scopeCodes(runContext.runId);
    const userEmail = runContext.integrationEmail('it-acc-scope');
    const passwordHash = await hashPassword('integration-test-password-not-used');

    const role = await prisma.role.create({
        data: {
            code: codes.roleCode,
            name: `Integration Scope Role ${runContext.runId}`,
            tenantId: null,
            isActive: true,
        },
    });

    const tenantA = await prisma.tenant.create({
        data: {
            name: `Integration Scope Main ${runContext.runId}`,
            slug: codes.tenantSlugMain,
            isActive: true,
        },
    });

    const tenantX = await prisma.tenant.create({
        data: {
            name: `Integration Scope Isolation ${runContext.runId}`,
            slug: codes.tenantSlugIsolation,
            isActive: true,
        },
    });

    const departmentA = await prisma.department.create({
        data: {
            tenantId: tenantA.id,
            code: codes.deptACode,
            name: `Scope Department A ${runContext.runId}`,
            isActive: true,
        },
    });

    const departmentB = await prisma.department.create({
        data: {
            tenantId: tenantA.id,
            code: codes.deptBCode,
            name: `Scope Department B ${runContext.runId}`,
            isActive: true,
        },
    });

    const departmentX = await prisma.department.create({
        data: {
            tenantId: tenantX.id,
            code: codes.deptXCode,
            name: `Scope Department X ${runContext.runId}`,
            isActive: true,
        },
    });

    const locationA = await prisma.location.create({
        data: {
            tenantId: tenantA.id,
            departmentId: departmentA.id,
            name: codes.locAName,
            isActive: true,
        },
    });

    const locationB = await prisma.location.create({
        data: {
            tenantId: tenantA.id,
            departmentId: departmentB.id,
            name: codes.locBName,
            isActive: true,
        },
    });

    const locationX = await prisma.location.create({
        data: {
            tenantId: tenantX.id,
            departmentId: departmentX.id,
            name: codes.locXName,
            isActive: true,
        },
    });

    const user = await prisma.user.create({
        data: {
            email: userEmail,
            passwordHash,
            firstName: 'Scope',
            lastName: `User ${runContext.runId}`,
            isActive: true,
        },
    });

    const membership = await prisma.tenantMember.create({
        data: {
            tenantId: tenantA.id,
            userId: user.id,
            roleId: role.id,
            isActive: true,
        },
    });

    const assignment = await prisma.urUserAssignment.create({
        data: {
            userId: user.id,
            roleId: role.id,
            isActive: true,
            properties: {
                create: [{ propertyId: tenantA.id }],
            },
            departments: {
                create: [{ departmentId: departmentA.id }],
            },
        },
    });

    return {
        ...codes,
        roleId: role.id,
        tenantAId: tenantA.id,
        tenantXId: tenantX.id,
        departmentAId: departmentA.id,
        departmentBId: departmentB.id,
        departmentXId: departmentX.id,
        locationAId: locationA.id,
        locationBId: locationB.id,
        locationXId: locationX.id,
        userId: user.id,
        userEmail,
        membershipId: membership.id,
        assignmentId: assignment.id,
    };
}

module.exports = {
    scopeCodes,
    createDisposableScopeFixture,
};
