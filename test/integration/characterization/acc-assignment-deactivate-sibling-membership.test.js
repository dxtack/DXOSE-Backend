'use strict';

/**
 * Deactivating one assignment must NOT retire TenantMember (or User.isActive)
 * when the user still has another active assignment on the same property.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { hashPassword } = require('../../../src/utils/password');

test('deactivate one of two sibling assignments keeps membership + user active', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    const runId = runContext.runId;
    const passwordHash = await hashPassword('integration-test-password-not-used');

    let tenantId;
    let roleAId;
    let roleBId;
    let actorUserId;
    let targetUserId;
    let membershipId;
    let assignmentAId;
    let assignmentBId;

    try {
        const roleA = await prisma.role.create({
            data: {
                code: `IT_SIB_ROLE_A_${runId}`.toUpperCase(),
                name: `Sibling Role A ${runId}`,
                tenantId: null,
                isActive: true,
            },
        });
        roleAId = roleA.id;

        const roleB = await prisma.role.create({
            data: {
                code: `IT_SIB_ROLE_B_${runId}`.toUpperCase(),
                name: `Sibling Role B ${runId}`,
                tenantId: null,
                isActive: true,
            },
        });
        roleBId = roleB.id;

        const tenant = await prisma.tenant.create({
            data: {
                name: `Sibling Hotel ${runId}`,
                slug: `it-sibling-${runId}`,
                isActive: true,
            },
        });
        tenantId = tenant.id;

        const actor = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('it-sib-actor'),
                passwordHash,
                firstName: 'Sibling',
                lastName: `Actor ${runId}`,
                isActive: true,
            },
        });
        actorUserId = actor.id;

        const target = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('it-sib-target'),
                passwordHash,
                firstName: 'Sibling',
                lastName: `Target ${runId}`,
                isActive: true,
            },
        });
        targetUserId = target.id;

        const membership = await prisma.tenantMember.create({
            data: {
                tenantId,
                userId: targetUserId,
                roleId: roleAId,
                isActive: true,
            },
        });
        membershipId = membership.id;

        const assignmentA = await prisma.urUserAssignment.create({
            data: {
                userId: targetUserId,
                roleId: roleAId,
                isActive: true,
                notes: `legacy:${membershipId}`,
                properties: { create: [{ propertyId: tenantId }] },
            },
        });
        assignmentAId = assignmentA.id;

        const assignmentB = await prisma.urUserAssignment.create({
            data: {
                userId: targetUserId,
                roleId: roleBId,
                isActive: true,
                properties: { create: [{ propertyId: tenantId }] },
            },
        });
        assignmentBId = assignmentB.id;

        const { deactivateAssignmentWithMembership } = require('../../../src/services/acc-assignment-lifecycle.service');

        // Deactivate B (no legacy tag) — historically this retired the shared membership.
        const updated = await deactivateAssignmentWithMembership(actorUserId, assignmentBId, {
            actorRoleCode: 'INTEGRATION_TEST',
        });
        assert.equal(updated.isActive, false);

        const assignmentAAfter = await prisma.urUserAssignment.findUnique({
            where: { id: assignmentAId },
            select: { isActive: true },
        });
        const membershipAfter = await prisma.tenantMember.findUnique({
            where: { id: membershipId },
            select: { isActive: true, roleId: true },
        });
        const userAfter = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { isActive: true },
        });

        assert.equal(assignmentAAfter?.isActive, true);
        assert.equal(membershipAfter?.isActive, true, 'shared membership must stay active');
        assert.equal(membershipAfter?.roleId, roleAId, 'membership role realigns to sibling A');
        assert.equal(userAfter?.isActive, true, 'User.isActive must not flip on assignment deactivate');

        // Deactivating the last active assignment should retire membership only.
        await deactivateAssignmentWithMembership(actorUserId, assignmentAId, {
            actorRoleCode: 'INTEGRATION_TEST',
        });

        const membershipFinal = await prisma.tenantMember.findUnique({
            where: { id: membershipId },
            select: { isActive: true },
        });
        const userFinal = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { isActive: true },
        });
        assert.equal(membershipFinal?.isActive, false);
        assert.equal(userFinal?.isActive, true);
    } finally {
        const assignmentIds = [assignmentAId, assignmentBId].filter(Boolean);
        for (const assignmentId of assignmentIds) {
            await prisma.urAuditEvent.deleteMany({ where: { targetEntityId: assignmentId } }).catch(() => {});
            await prisma.urAssignmentDepartment.deleteMany({ where: { assignmentId } }).catch(() => {});
            await prisma.urAssignmentProperty.deleteMany({ where: { assignmentId } }).catch(() => {});
            await prisma.urUserAssignment.deleteMany({ where: { id: assignmentId } }).catch(() => {});
        }
        if (tenantId) {
            await prisma.tenantMember.deleteMany({ where: { tenantId } }).catch(() => {});
        }
        for (const userId of [actorUserId, targetUserId].filter(Boolean)) {
            await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
        }
        for (const roleId of [roleAId, roleBId].filter(Boolean)) {
            await prisma.role.deleteMany({ where: { id: roleId } }).catch(() => {});
        }
        if (tenantId) {
            await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
        }
        await prisma.$disconnect();
    }
});
