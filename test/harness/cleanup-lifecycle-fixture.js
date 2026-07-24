'use strict';

const { lifecycleCodes } = require('./disposable-lifecycle-fixture');

async function cleanupLifecycleFixture(prisma, { runContext, fixture }) {
    const errors = [];
    const runId = runContext.runId;
    const codes = lifecycleCodes(runId);
    const assignmentId = fixture.assignmentId;
    const actorUserId = fixture.actorUserId;
    const targetUserId = fixture.targetUserId;

    const auditScope = {
        OR: [
            ...(assignmentId ? [{ targetEntityId: assignmentId }] : []),
            ...(actorUserId ? [{ actorId: actorUserId }] : []),
            ...(targetUserId ? [{ targetUserId }] : []),
        ],
    };

    if (auditScope.OR.length) {
        try {
            await prisma.urAuditEvent.deleteMany({ where: auditScope });
        } catch (err) {
            errors.push(`ur_audit_events delete failed: ${err.message}`);
        }
    }

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

    if (fixture.tenantId) {
        try {
            await prisma.tenantMember.deleteMany({ where: { tenantId: fixture.tenantId } });
        } catch (err) {
            errors.push(`tenant_members delete failed: ${err.message}`);
        }
    }

    for (const userId of [actorUserId, targetUserId].filter(Boolean)) {
        try {
            await prisma.user.delete({ where: { id: userId } });
        } catch (err) {
            errors.push(`user delete failed (${userId}): ${err.message}`);
        }
    }

    if (fixture.roleId) {
        try {
            await prisma.role.delete({ where: { id: fixture.roleId } });
        } catch (err) {
            errors.push(`role delete failed: ${err.message}`);
        }
    }

    if (fixture.tenantId) {
        try {
            await prisma.tenant.delete({ where: { id: fixture.tenantId } });
        } catch (err) {
            errors.push(`tenant delete failed: ${err.message}`);
        }
    }

    const auditRemaining = assignmentId
        ? await prisma.urAuditEvent.count({ where: { targetEntityId: assignmentId } })
        : 0;
    if (auditRemaining !== 0) {
        errors.push(`expected 0 audit events for assignment, found ${auditRemaining}`);
    }

    const assignmentRemaining = assignmentId
        ? await prisma.urUserAssignment.count({ where: { id: assignmentId } })
        : 0;
    if (assignmentRemaining !== 0) {
        errors.push(`expected 0 assignments, found ${assignmentRemaining}`);
    }

    const membershipRemaining = fixture.tenantId
        ? await prisma.tenantMember.count({ where: { tenantId: fixture.tenantId } })
        : 0;
    if (membershipRemaining !== 0) {
        errors.push(`expected 0 memberships, found ${membershipRemaining}`);
    }

    const targetUserRemaining = await prisma.user.count({ where: { email: fixture.targetEmail } });
    if (targetUserRemaining !== 0) {
        errors.push(`expected 0 target users, found ${targetUserRemaining}`);
    }

    const actorUserRemaining = await prisma.user.count({ where: { email: fixture.actorEmail } });
    if (actorUserRemaining !== 0) {
        errors.push(`expected 0 actor users, found ${actorUserRemaining}`);
    }

    const roleRemaining = await prisma.role.count({ where: { code: codes.roleCode } });
    if (roleRemaining !== 0) {
        errors.push(`expected 0 test roles, found ${roleRemaining}`);
    }

    const tenantRemaining = await prisma.tenant.count({ where: { slug: codes.tenantSlug } });
    if (tenantRemaining !== 0) {
        errors.push(`expected 0 test tenants, found ${tenantRemaining}`);
    }

    if (errors.length) {
        throw new Error(`[test-harness:lifecycle-cleanup] runId=${runId} — ${errors.join('; ')}`);
    }
}

module.exports = {
    cleanupLifecycleFixture,
};
