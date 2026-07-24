'use strict';

/**
 * SF-007 remediation proof — assignment lifecycle audit atomicity.
 *
 * Before: the lifecycle state mutation committed in a transaction and the audit row was
 * written AFTER commit, so a committed deactivation could exist with no audit record.
 *
 * After: the audit write runs INSIDE the same transaction. This test forces the audit write
 * to fail and asserts the ENTIRE operation rolls back — assignment stays active, membership
 * stays active, permissionVersion is unchanged, and no audit row is left behind.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createDisposableLifecycleFixture } = require('../../harness/disposable-lifecycle-fixture');
const { cleanupLifecycleFixture } = require('../../harness/cleanup-lifecycle-fixture');

test('SF-007 — audit failure rolls back the deactivation (atomic)', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    const auditLogger = require('../../../src/engines/ur-audit.logger');
    const original = auditLogger.logAssignmentDeactivated;
    let fixture;

    try {
        fixture = await createDisposableLifecycleFixture(prisma, runContext);
        const pvBefore = fixture.permissionVersion;

        const { deactivateAssignmentWithMembership } = require('../../../src/services/acc-assignment-lifecycle.service');

        // Force the in-transaction audit write to fail.
        auditLogger.logAssignmentDeactivated = async () => {
            throw new Error('SF-007 injected audit failure');
        };

        await assert.rejects(
            () => deactivateAssignmentWithMembership(fixture.actorUserId, fixture.assignmentId, {
                actorRoleCode: 'INTEGRATION_TEST',
            }),
            /injected audit failure/,
        );

        // Everything must have rolled back.
        const assignmentAfter = await prisma.urUserAssignment.findUnique({
            where: { id: fixture.assignmentId },
            select: { isActive: true },
        });
        const membershipAfter = await prisma.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId: fixture.tenantId, userId: fixture.targetUserId } },
            select: { isActive: true },
        });
        const userAfter = await prisma.user.findUnique({
            where: { id: fixture.targetUserId },
            select: { permissionVersion: true },
        });
        const auditCount = await prisma.urAuditEvent.count({
            where: {
                action: 'ASSIGNMENT_DEACTIVATED',
                targetEntityId: fixture.assignmentId,
            },
        });

        assert.equal(assignmentAfter?.isActive, true, 'assignment must remain active after rollback');
        assert.equal(membershipAfter?.isActive, true, 'membership must remain active after rollback');
        assert.equal(userAfter?.permissionVersion, pvBefore, 'permissionVersion must be unchanged after rollback');
        assert.equal(auditCount, 0, 'no audit row may persist when the transaction rolled back');

        // Restore and prove the happy path still commits exactly one audit row atomically.
        auditLogger.logAssignmentDeactivated = original;
        const ok = await deactivateAssignmentWithMembership(fixture.actorUserId, fixture.assignmentId, {
            actorRoleCode: 'INTEGRATION_TEST',
        });
        assert.equal(ok.isActive, false);
        const auditCountOk = await prisma.urAuditEvent.count({
            where: { action: 'ASSIGNMENT_DEACTIVATED', targetEntityId: fixture.assignmentId },
        });
        assert.equal(auditCountOk, 1, 'successful commit writes exactly one audit row');
    } finally {
        auditLogger.logAssignmentDeactivated = original;
        try {
            if (fixture) {
                await cleanupLifecycleFixture(prisma, { runContext, fixture });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});
