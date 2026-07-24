'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createDisposableLifecycleFixture } = require('../../harness/disposable-lifecycle-fixture');
const { cleanupLifecycleFixture } = require('../../harness/cleanup-lifecycle-fixture');

test('assignment deactivate — product lifecycle bumps permissionVersion once', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let fixture;

    try {
        fixture = await createDisposableLifecycleFixture(prisma, runContext);
        const permissionVersionBefore = fixture.permissionVersion;

        const assignmentBefore = await prisma.urUserAssignment.findUnique({
            where: { id: fixture.assignmentId },
            select: { isActive: true },
        });
        const membershipBefore = await prisma.tenantMember.findUnique({
            where: {
                tenantId_userId: { tenantId: fixture.tenantId, userId: fixture.targetUserId },
            },
            select: { isActive: true },
        });

        assert.equal(assignmentBefore?.isActive, true);
        assert.equal(membershipBefore?.isActive, true);

        const { deactivateAssignmentWithMembership } = require('../../../src/services/acc-assignment-lifecycle.service');

        const updated = await deactivateAssignmentWithMembership(
            fixture.actorUserId,
            fixture.assignmentId,
            { actorRoleCode: 'INTEGRATION_TEST' },
        );

        assert.equal(updated.isActive, false);

        const assignmentAfter = await prisma.urUserAssignment.findUnique({
            where: { id: fixture.assignmentId },
            select: { isActive: true },
        });
        const membershipAfter = await prisma.tenantMember.findUnique({
            where: {
                tenantId_userId: { tenantId: fixture.tenantId, userId: fixture.targetUserId },
            },
            select: { isActive: true },
        });
        const userAfter = await prisma.user.findUnique({
            where: { id: fixture.targetUserId },
            select: { permissionVersion: true },
        });

        assert.equal(assignmentAfter?.isActive, false);
        assert.equal(membershipAfter?.isActive, false);
        assert.equal(userAfter?.permissionVersion, permissionVersionBefore + 1);

        const auditCount = await prisma.urAuditEvent.count({
            where: {
                action: 'ASSIGNMENT_DEACTIVATED',
                targetEntityId: fixture.assignmentId,
                targetUserId: fixture.targetUserId,
            },
        });
        assert.equal(auditCount, 1);

        const idempotent = await deactivateAssignmentWithMembership(
            fixture.actorUserId,
            fixture.assignmentId,
            { actorRoleCode: 'INTEGRATION_TEST' },
        );
        assert.equal(idempotent.isActive, false);

        const userAfterIdempotent = await prisma.user.findUnique({
            where: { id: fixture.targetUserId },
            select: { permissionVersion: true },
        });
        assert.equal(userAfterIdempotent?.permissionVersion, permissionVersionBefore + 1);
    } finally {
        try {
            if (fixture) {
                await cleanupLifecycleFixture(prisma, { runContext, fixture });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});
