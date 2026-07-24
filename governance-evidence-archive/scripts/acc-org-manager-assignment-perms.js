'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { _findSessionAssignment } = require('../../src/acc-runtime/resolvePermissions');
const {
  loadUrPermissionCodesForRoleId,
  loadPermissionCodesForRoleId,
  roleHasUrPermissions,
  applyRolePermissionPolicy,
} = require('../../src/services/rbac.service');

(async () => {
  const m = await prisma.tenantMember.findFirst({
    where: { isActive: true, role: { code: 'ORG_MANAGER' }, user: { email: 'org-mgr@closeout-audit.local' } },
    include: { user: true, tenant: true, role: true },
  });
  if (!m) {
    console.log('no membership');
    await prisma.$disconnect();
    return;
  }
  const roleId = m.roleId ?? m.role?.id;
  const assignment = await _findSessionAssignment(m.userId, m, roleId);
  let codes = [];
  if (assignment?.roleId) {
    const urConfigured = await roleHasUrPermissions(assignment.roleId);
    const raw = urConfigured
      ? await loadUrPermissionCodesForRoleId(assignment.roleId)
      : await loadPermissionCodesForRoleId(assignment.roleId);
    codes = applyRolePermissionPolicy('ORG_MANAGER', raw);
  }
  console.log({
    email: m.user.email,
    assignmentId: assignment?.id,
    assignmentRoleId: assignment?.roleId,
    assignmentPermCount: codes.length,
    sample: codes.slice(0, 15),
  });
  await prisma.$disconnect();
})();
