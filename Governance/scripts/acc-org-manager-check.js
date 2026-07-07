'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { resolveAccPermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
const { loadAllPermissionCodes } = require('../../src/services/rbac.service');

(async () => {
  const allCodes = await loadAllPermissionCodes();
  const rows = await prisma.tenantMember.findMany({
    where: { isActive: true, role: { code: 'ORG_MANAGER' } },
    include: { user: { select: { email: true } }, tenant: { select: { slug: true } }, role: true },
  });
  let viaAllCodes = 0;
  let viaAssignment = 0;
  for (const m of rows) {
    const roleId = m.roleId ?? m.role?.id;
    const acc = await resolveAccPermissionsForMembership({
      userId: m.userId,
      membership: m,
      roleId,
      roleCode: 'ORG_MANAGER',
    });
    const assign = await prisma.urUserAssignment.findFirst({
      where: { userId: m.userId, isActive: true },
      select: { id: true },
    });
    if (acc && acc.length === allCodes.length) viaAllCodes++;
    else if (assign) viaAssignment++;
    console.log(
      m.user.email,
      m.tenant?.slug,
      'acc',
      acc?.length ?? 0,
      'allCodes',
      allCodes.length,
      'assignment',
      !!assign,
    );
  }
  console.log('summary', { total: rows.length, viaAllCodes, viaAssignment, allCodesLen: allCodes.length });
  await prisma.$disconnect();
})();
