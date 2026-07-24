'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createDisposableLifecycleFixture } = require('../../harness/disposable-lifecycle-fixture');
const { cleanupLifecycleFixture } = require('../../harness/cleanup-lifecycle-fixture');

test('assignment reactivate — product lifecycle bumps permissionVersion exactly once', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let fixture;

    try {
        fixture = await createDisposableLifecycleFixture(prisma, runContext);

        const {
            deactivateAssignmentWithMembership,
            reactivateAssignmentWithMembership,
        } = require('../../../src/services/acc-assignment-lifecycle.service');

        await deactivateAssignmentWithMembership(
            fixture.actorUserId,
            fixture.assignmentId,
            { actorRoleCode: fixture.roleCode },
        );

        const assignmentInactive = await prisma.urUserAssignment.findUnique({
            where: { id: fixture.assignmentId },
            select: { isActive: true },
        });
        const membershipInactive = await prisma.tenantMember.findUnique({
            where: {
                tenantId_userId: { tenantId: fixture.tenantId, userId: fixture.targetUserId },
            },
            select: { isActive: true, tenantId: true, roleId: true },
        });
        const userBeforeReactivate = await prisma.user.findUnique({
            where: { id: fixture.targetUserId },
            select: { permissionVersion: true },
        });
        const propertyJunctionBefore = await prisma.urAssignmentProperty.findMany({
            where: { assignmentId: fixture.assignmentId },
            select: { propertyId: true },
        });

        assert.equal(assignmentInactive?.isActive, false);
        assert.equal(membershipInactive?.isActive, false);
        const permissionVersionBeforeReactivate = userBeforeReactivate?.permissionVersion ?? 0;

        await reactivateAssignmentWithMembership(
            fixture.actorUserId,
            fixture.assignmentId,
            { actorRoleCode: fixture.roleCode },
        );

        const assignmentActive = await prisma.urUserAssignment.findUnique({
            where: { id: fixture.assignmentId },
            select: { isActive: true },
        });
        const membershipActive = await prisma.tenantMember.findUnique({
            where: {
                tenantId_userId: { tenantId: fixture.tenantId, userId: fixture.targetUserId },
            },
            select: { isActive: true, tenantId: true, roleId: true },
        });
        const userAfterFirstReactivate = await prisma.user.findUnique({
            where: { id: fixture.targetUserId },
            select: { permissionVersion: true },
        });
        const propertyJunctionAfter = await prisma.urAssignmentProperty.findMany({
            where: { assignmentId: fixture.assignmentId },
            select: { propertyId: true },
        });

        assert.equal(assignmentActive?.isActive, true);
        assert.equal(membershipActive?.isActive, true);
        assert.equal(membershipActive?.tenantId, membershipInactive?.tenantId);
        assert.equal(membershipActive?.roleId, membershipInactive?.roleId);
        assert.deepEqual(
            propertyJunctionAfter.map((row) => row.propertyId).sort(),
            propertyJunctionBefore.map((row) => row.propertyId).sort(),
        );
        assert.equal(
            userAfterFirstReactivate?.permissionVersion,
            permissionVersionBeforeReactivate + 1,
        );

        const reactivateAuditCount = await prisma.urAuditEvent.count({
            where: {
                action: 'ASSIGNMENT_REACTIVATED',
                targetEntityId: fixture.assignmentId,
                targetUserId: fixture.targetUserId,
                actorId: fixture.actorUserId,
            },
        });
        assert.equal(reactivateAuditCount, 1);

        await reactivateAssignmentWithMembership(
            fixture.actorUserId,
            fixture.assignmentId,
            { actorRoleCode: fixture.roleCode },
        );

        const assignmentStillActive = await prisma.urUserAssignment.findUnique({
            where: { id: fixture.assignmentId },
            select: { isActive: true },
        });
        const membershipStillActive = await prisma.tenantMember.findUnique({
            where: {
                tenantId_userId: { tenantId: fixture.tenantId, userId: fixture.targetUserId },
            },
            select: { isActive: true },
        });
        const userAfterSecondReactivate = await prisma.user.findUnique({
            where: { id: fixture.targetUserId },
            select: { permissionVersion: true },
        });

        assert.equal(assignmentStillActive?.isActive, true);
        assert.equal(membershipStillActive?.isActive, true);
        assert.equal(
            userAfterSecondReactivate?.permissionVersion,
            permissionVersionBeforeReactivate + 1,
        );

        const reactivateAuditCountAfterSecond = await prisma.urAuditEvent.count({
            where: {
                action: 'ASSIGNMENT_REACTIVATED',
                targetEntityId: fixture.assignmentId,
                targetUserId: fixture.targetUserId,
                actorId: fixture.actorUserId,
            },
        });
        assert.equal(reactivateAuditCountAfterSecond, 1);
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
