'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { resolvePermissionsForMembership } = require('../src/acc-runtime/resolvePermissions');
const {
  deactivateAssignmentWithMembership,
  reactivateAssignmentWithMembership,
} = require('../src/services/acc-assignment-lifecycle.service');

const prisma = new PrismaClient();

async function main() {
  const actor = await prisma.user.findFirst({
    where: { email: 'superadmin@ose.cloud' },
    select: { id: true },
  });
  const assignment = await prisma.urUserAssignment.findFirst({
    where: {
      isActive: true,
      notes: { startsWith: 'legacy:' },
      properties: { some: {} },
      role: { code: 'STOREKEEPER' },
    },
    include: {
      properties: true,
      role: true,
      user: { select: { email: true } },
    },
  });
  if (!assignment) {
    console.log('No STOREKEEPER assignment for runtime check — skip');
    return;
  }

  const propertyId = assignment.properties[0].propertyId;
  const userId = assignment.userId;
  const pvBefore = (await prisma.user.findUnique({ where: { id: userId }, select: { permissionVersion: true } })).permissionVersion;

  const resolveForUser = async () => {
    const m = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: propertyId, userId } },
      include: { role: true, tenant: { select: { id: true, slug: true } } },
    });
    if (!m?.isActive) return [];
    return resolvePermissionsForMembership({
      userId,
      membership: m,
      roleId: m.roleId,
      roleCode: m.role?.code,
      tenantId: propertyId,
    });
  };

  const beforePerms = await resolveForUser();
  console.log(`Before deactivate (${assignment.user.email}): permissions=${beforePerms.length}`);

  await deactivateAssignmentWithMembership(actor.id, assignment.id, { actorRoleCode: 'SUPER_ADMIN' });
  const memberOff = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId: propertyId, userId } },
    select: { isActive: true },
  });
  const pvOff = (await prisma.user.findUnique({ where: { id: userId }, select: { permissionVersion: true } })).permissionVersion;
  console.log(`After deactivate: memberActive=${memberOff?.isActive} permissionVersion=${pvBefore}→${pvOff}`);

  await reactivateAssignmentWithMembership(actor.id, assignment.id, { actorRoleCode: 'SUPER_ADMIN' });
  const afterPerms = await resolveForUser();
  const memberOn = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId: propertyId, userId } },
    select: { isActive: true },
  });
  const pvOn = (await prisma.user.findUnique({ where: { id: userId }, select: { permissionVersion: true } })).permissionVersion;
  console.log(`After reactivate: permissions=${afterPerms.length} memberActive=${memberOn?.isActive} permissionVersion=${pvOff}→${pvOn}`);

  const ok =
    memberOff?.isActive === false &&
    memberOn?.isActive === true &&
    pvOff > pvBefore &&
    pvOn > pvOff &&
    beforePerms.length > 0 &&
    afterPerms.length > 0;
  console.log(ok ? 'Runtime verification: PASS' : 'Runtime verification: FAIL');
  if (!ok) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
