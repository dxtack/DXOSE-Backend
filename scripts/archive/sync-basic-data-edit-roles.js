'use strict';

/**
 * Sync BASIC_DATA_EDIT onto ORG_MANAGER, FINANCE_MANAGER, COST_CONTROL, STOREKEEPER
 * in both legacy role_permissions and ACC ur_role_permissions.
 * Ensures GENERAL_MANAGER does not have BASIC_DATA_EDIT.
 */
require('dotenv').config();
const prisma = require('../src/config/database');

const TARGET_ROLES = ['ORG_MANAGER', 'FINANCE_MANAGER', 'COST_CONTROL', 'STOREKEEPER'];
const CODE = 'BASIC_DATA_EDIT';

async function main() {
  const perm = await prisma.permission.findFirst({ where: { code: CODE } });
  if (!perm) throw new Error(`${CODE} permission missing`);

  let urPerm = await prisma.urPermission.findFirst({ where: { legacyCode: CODE } });
  if (!urPerm) {
    urPerm = await prisma.urPermission.create({
      data: {
        legacyCode: CODE,
        resource: 'MASTER_DATA',
        action: 'EDIT',
        name: 'Edit Master Data',
      },
    });
  }

  for (const code of TARGET_ROLES) {
    const role = await prisma.role.findUnique({ where: { code } });
    if (!role) {
      console.warn('skip missing role', code);
      continue;
    }
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      create: { roleId: role.id, permissionId: perm.id },
      update: {},
    });
    const existing = await prisma.urRolePermission.findFirst({
      where: { roleId: role.id, permissionId: urPerm.id },
    });
    if (!existing) {
      await prisma.urRolePermission.create({
        data: { roleId: role.id, permissionId: urPerm.id },
      });
    }
    console.log('OK', code);
  }

  const gm = await prisma.role.findUnique({ where: { code: 'GENERAL_MANAGER' } });
  if (gm) {
    const removedLegacy = await prisma.rolePermission.deleteMany({
      where: { roleId: gm.id, permissionId: perm.id },
    });
    const removedUr = await prisma.urRolePermission.deleteMany({
      where: { roleId: gm.id, permissionId: urPerm.id },
    });
    console.log('GM scrub BASIC_DATA_EDIT', { removedLegacy: removedLegacy.count, removedUr: removedUr.count });
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
