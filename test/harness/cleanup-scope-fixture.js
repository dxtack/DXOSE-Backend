'use strict';

const { scopeCodes } = require('./disposable-scope-fixture');

async function cleanupScopeFixture(prisma, { runContext, fixture }) {
    const errors = [];
    const runId = runContext.runId;
    const codes = scopeCodes(runId);
    const assignmentId = fixture.assignmentId;
    const userId = fixture.userId;

    if (assignmentId) {
        try {
            await prisma.urAssignmentDepartment.deleteMany({ where: { assignmentId } });
        } catch (err) {
            errors.push(`ur_assignment_departments delete failed: ${err.message}`);
        }

        try {
            await prisma.urAssignmentProperty.deleteMany({ where: { assignmentId } });
        } catch (err) {
            errors.push(`ur_assignment_properties delete failed: ${err.message}`);
        }

        try {
            await prisma.urUserAssignment.deleteMany({ where: { id: assignmentId } });
        } catch (err) {
            errors.push(`ur_user_assignments delete failed: ${err.message}`);
        }
    }

    if (fixture.tenantAId) {
        try {
            await prisma.tenantMember.deleteMany({ where: { tenantId: fixture.tenantAId } });
        } catch (err) {
            errors.push(`tenant_members delete failed: ${err.message}`);
        }
    }

    if (userId) {
        try {
            await prisma.refreshToken.deleteMany({ where: { userId } });
        } catch (err) {
            errors.push(`refresh_tokens delete failed: ${err.message}`);
        }

        try {
            await prisma.user.delete({ where: { id: userId } });
        } catch (err) {
            errors.push(`user delete failed: ${err.message}`);
        }
    }

    const locationIds = [fixture.locationAId, fixture.locationBId, fixture.locationXId].filter(Boolean);
    if (locationIds.length) {
        try {
            await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
        } catch (err) {
            errors.push(`locations delete failed: ${err.message}`);
        }
    }

    const departmentIds = [fixture.departmentAId, fixture.departmentBId, fixture.departmentXId].filter(Boolean);
    if (departmentIds.length) {
        try {
            await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
        } catch (err) {
            errors.push(`departments delete failed: ${err.message}`);
        }
    }

    if (fixture.roleId) {
        try {
            await prisma.role.delete({ where: { id: fixture.roleId } });
        } catch (err) {
            errors.push(`role delete failed: ${err.message}`);
        }
    }

    for (const tenantId of [fixture.tenantAId, fixture.tenantXId].filter(Boolean)) {
        try {
            await prisma.tenant.delete({ where: { id: tenantId } });
        } catch (err) {
            errors.push(`tenant delete failed (${tenantId}): ${err.message}`);
        }
    }

    const tenantA = fixture.tenantAId
        ? await prisma.tenant.findUnique({ where: { id: fixture.tenantAId } })
        : null;
    if (tenantA) {
        errors.push('tenant A still exists after cleanup');
    }

    const tenantX = fixture.tenantXId
        ? await prisma.tenant.findUnique({ where: { id: fixture.tenantXId } })
        : null;
    if (tenantX) {
        errors.push('tenant X still exists after cleanup');
    }

    const residualUser = await prisma.user.count({ where: { email: fixture.userEmail } });
    if (residualUser !== 0) {
        errors.push(`expected 0 test users, found ${residualUser}`);
    }

    const residualRole = await prisma.role.count({ where: { code: codes.roleCode } });
    if (residualRole !== 0) {
        errors.push(`expected 0 test roles, found ${residualRole}`);
    }

    const residualDepts = await prisma.department.count({
        where: {
            OR: [
                { code: codes.deptACode },
                { code: codes.deptBCode },
                { code: codes.deptXCode },
            ],
        },
    });
    if (residualDepts !== 0) {
        errors.push(`expected 0 test departments, found ${residualDepts}`);
    }

    const residualLocs = await prisma.location.count({
        where: {
            OR: [
                { name: codes.locAName },
                { name: codes.locBName },
                { name: codes.locXName },
            ],
        },
    });
    if (residualLocs !== 0) {
        errors.push(`expected 0 test locations, found ${residualLocs}`);
    }

    if (userId) {
        const residualAssignments = await prisma.urUserAssignment.count({ where: { userId } });
        if (residualAssignments !== 0) {
            errors.push(`expected 0 assignments, found ${residualAssignments}`);
        }
    }

    if (assignmentId) {
        const residualProps = await prisma.urAssignmentProperty.count({ where: { assignmentId } });
        if (residualProps !== 0) {
            errors.push(`expected 0 assignment properties, found ${residualProps}`);
        }

        const residualDeptsJunction = await prisma.urAssignmentDepartment.count({ where: { assignmentId } });
        if (residualDeptsJunction !== 0) {
            errors.push(`expected 0 assignment departments, found ${residualDeptsJunction}`);
        }
    }

    if (errors.length) {
        throw new Error(`[test-harness:scope-cleanup] runId=${runId} — ${errors.join('; ')}`);
    }
}

module.exports = {
    cleanupScopeFixture,
};
