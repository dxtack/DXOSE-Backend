'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const {
  deactivateAssignmentWithMembership,
  reactivateAssignmentWithMembership,
} = require('../src/services/acc-assignment-lifecycle.service');
const prisma = new PrismaClient();

async function repairAssignment(assignmentId) {
  const actor = await prisma.user.findFirst({ where: { email: 'superadmin@ose.cloud' } });
  const a = await prisma.urUserAssignment.findUnique({
    where: { id: assignmentId },
    include: { user: { select: { email: true } } },
  });
  if (!a) return;
  if (a.isActive) {
    await deactivateAssignmentWithMembership(actor.id, a.id, { actorRoleCode: 'SUPER_ADMIN' });
    await reactivateAssignmentWithMembership(actor.id, a.id, { actorRoleCode: 'SUPER_ADMIN' });
    console.log(a.user.email, a.id.slice(0, 8), 'repaired');
    return;
  }
  await reactivateAssignmentWithMembership(actor.id, a.id, { actorRoleCode: 'SUPER_ADMIN' });
  console.log(a.user.email, a.id.slice(0, 8), 'reactivated');
}

async function repair(email) {
  const actor = await prisma.user.findFirst({ where: { email: 'superadmin@ose.cloud' } });
  const a = await prisma.urUserAssignment.findFirst({
    where: { user: { email }, isActive: true, properties: { some: {} } },
    include: { properties: true, user: true },
  });
  if (!a) {
    const inactive = await prisma.urUserAssignment.findFirst({
      where: { user: { email }, isActive: false, properties: { some: {} } },
    });
    if (inactive) {
      await reactivateAssignmentWithMembership(actor.id, inactive.id, { actorRoleCode: 'SUPER_ADMIN' });
      console.log(email, 'reactivated inactive assignment');
    }
    return;
  }
  const propertyId = a.properties[0].propertyId;
  const m = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId: propertyId, userId: a.userId } },
    select: { isActive: true },
  });
  if (m?.isActive) {
    console.log(email, 'OK');
    return;
  }
  await repairAssignment(a.id);
}

async function main() {
  const active = await prisma.urUserAssignment.findMany({
    where: { isActive: true, properties: { some: {} } },
    include: {
      user: { select: { email: true } },
      role: { select: { code: true } },
      properties: { include: { property: { select: { name: true, id: true } } } },
    },
  });
  for (const a of active) {
    const propertyId = a.properties[0]?.propertyId;
    if (!propertyId) continue;
    const m = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: propertyId, userId: a.userId } },
      select: { isActive: true },
    });
    if (!m?.isActive) {
      await repairAssignment(a.id);
    }
  }
}

main().finally(() => prisma.$disconnect());
