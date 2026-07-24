'use strict';

/**
 * P1 #22 — Disable RECEIVER + E2E fixture roles and delete their single memberships/assignments.
 * Target: local ose_inventory only.
 *
 *   node scripts/retire-receiver-e2e-roles-p1-22.js --confirm-db=ose_inventory
 */

process.env.DATABASE_URL = 'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory?schema=public';

const REQUIRED_DB = 'ose_inventory';
const confirmation = process.argv.find((a) => a.startsWith('--confirm-db='));
if (confirmation !== `--confirm-db=${REQUIRED_DB}`) {
  throw new Error(`Requires --confirm-db=${REQUIRED_DB}`);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const db = (await prisma.$queryRaw`SELECT current_database() AS n`)[0].n;
  if (db !== REQUIRED_DB) throw new Error(`Connected ${db}`);

  const roles = await prisma.role.findMany({
    where: {
      OR: [
        { code: 'RECEIVER' },
        { code: { startsWith: 'E2E_ROLE_A_' } },
        { code: { startsWith: 'E2E_ROLE_B_' } },
        { code: { startsWith: 'E2E_VIEW_ONLY_' } },
      ],
    },
  });
  if (roles.length !== 4) {
    throw new Error(`Expected exactly 4 target roles; found ${roles.length}: ${roles.map((r) => r.code).join(', ')}`);
  }

  const roleIds = roles.map((r) => r.id);

  const workflowSteps = await prisma.accWorkflowStepDefinition.count({
    where: { approverRoleId: { in: roleIds } },
  });
  const approvalSteps = await prisma.approvalStep.count({
    where: { requiredRoleId: { in: roleIds } },
  });
  if (workflowSteps || approvalSteps) {
    throw new Error(
      `Abort: production workflow dependency found (workflowSteps=${workflowSteps}, approvalSteps=${approvalSteps})`,
    );
  }

  const report = await prisma.$transaction(async (tx) => {
    const members = await tx.tenantMember.findMany({
      where: { roleId: { in: roleIds } },
      include: {
        user: { select: { email: true } },
        tenant: { select: { slug: true } },
        role: { select: { code: true } },
      },
    });
    const assignments = await tx.urUserAssignment.findMany({
      where: { roleId: { in: roleIds } },
      include: {
        user: { select: { email: true } },
        role: { select: { code: true } },
      },
    });

    if (members.length !== 4 || assignments.length !== 4) {
      throw new Error(
        `Expected 1 membership + 1 UR assignment per role (4/4). Found members=${members.length}, assignments=${assignments.length}`,
      );
    }

    const assignmentIds = assignments.map((a) => a.id);
    await tx.urAssignmentDepartment.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await tx.urAssignmentProperty.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    // Clear overrides/exceptions tied to these assignments if any
    await tx.urUserOverride.deleteMany({ where: { assignmentId: { in: assignmentIds } } }).catch(() => {});
    await tx.urUserPermissionOverride.deleteMany({ where: { assignmentId: { in: assignmentIds } } }).catch(() => {});

    const deletedAssignments = await tx.urUserAssignment.deleteMany({ where: { id: { in: assignmentIds } } });
    const deletedMembers = await tx.tenantMember.deleteMany({
      where: { id: { in: members.map((m) => m.id) } },
    });

    const disabledRoles = [];
    for (const role of roles) {
      await tx.role.update({
        where: { id: role.id },
        data: { isActive: false },
      });
      disabledRoles.push(role.code);
    }

    // Bump permissionVersion for affected users
    const userIds = [...new Set([...members.map((m) => m.userId), ...assignments.map((a) => a.userId)])];
    if (userIds.length) {
      await tx.user.updateMany({
        where: { id: { in: userIds } },
        data: { permissionVersion: { increment: 1 } },
      });
    }

    return {
      deletedMembers: members.map((m) => ({
        email: m.user.email,
        tenant: m.tenant.slug,
        role: m.role.code,
        memberId: m.id,
      })),
      deletedAssignments: assignments.map((a) => ({
        email: a.user.email,
        role: a.role.code,
        assignmentId: a.id,
      })),
      deletedMemberCount: deletedMembers.count,
      deletedAssignmentCount: deletedAssignments.count,
      disabledRoles,
      affectedUsers: userIds.length,
    };
  });

  // Post-check
  const remainingMembers = await prisma.tenantMember.count({ where: { roleId: { in: roleIds } } });
  const remainingAssignments = await prisma.urUserAssignment.count({
    where: { roleId: { in: roleIds }, isActive: true },
  });
  const stillActiveRoles = await prisma.role.count({ where: { id: { in: roleIds }, isActive: true } });

  if (remainingMembers || remainingAssignments || stillActiveRoles) {
    throw new Error(
      `Post-check failed: members=${remainingMembers} activeAssignments=${remainingAssignments} activeRoles=${stillActiveRoles}`,
    );
  }

  console.log(JSON.stringify({ mode: 'RETIRE', ok: true, database: REQUIRED_DB, ...report }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
