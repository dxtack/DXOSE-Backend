'use strict';

/**
 * ACC Authority Catalog Seed
 * Upserts ur_* catalog from catalog.constitution.js
 * Syncs legacy permissions + role_permissions for new authority codes.
 * Run: node scripts/seed-acc-authority-catalog.js
 */

const { PrismaClient } = require('@prisma/client');
const {
  ACC_AUTHORITY_VERSION,
  RESOURCES,
  ACTIONS,
  PERMISSION_MAP,
} = require('../src/acc-authority/catalog.constitution');
const {
  BASE_ROLE_PERMISSIONS,
  mergeAuthorityGrants,
} = require('../src/acc-authority/base-role-permissions');

const prisma = new PrismaClient();

async function syncLegacyPermissions(permissionMap) {
  let count = 0;
  for (const p of PERMISSION_MAP) {
    await prisma.permission.upsert({
      where: { code: p.legacyCode },
      update: { name: p.name },
      create: { code: p.legacyCode, name: p.name },
    });
    count++;
  }
  return count;
}

async function syncLegacyRolePermissions(roleIdByCode, rolePermissions) {
  let count = 0;
  for (const [roleCode, legacyCodes] of Object.entries(rolePermissions)) {
    const roleId = roleIdByCode[roleCode];
    if (!roleId) continue;
    for (const code of legacyCodes) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: perm.id } },
        update: {},
        create: { roleId, permissionId: perm.id },
      });
      count++;
    }
  }
  return count;
}

async function revokeStaleRolePermissions(roleIdByCode, rolePermissions, permissionMap) {
  let revoked = 0;
  for (const [roleCode, allowedCodes] of Object.entries(rolePermissions)) {
    const roleId = roleIdByCode[roleCode];
    if (!roleId) continue;
    const allowed = new Set(allowedCodes);
    const periodPerms = await prisma.permission.findMany({
      where: { code: { startsWith: 'PERIOD_' } },
      select: { id: true, code: true },
    });
    for (const perm of periodPerms) {
      if (allowed.has(perm.code)) continue;
      const del = await prisma.rolePermission.deleteMany({
        where: { roleId, permissionId: perm.id },
      });
      revoked += del.count;
      const urPermId = permissionMap[perm.code];
      if (urPermId) {
        const delUr = await prisma.urRolePermission.deleteMany({
          where: { roleId, permissionId: urPermId },
        });
        revoked += delUr.count;
      }
    }
  }
  return revoked;
}

async function seed() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` ACC Authority Catalog Seed v${ACC_AUTHORITY_VERSION}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const resourceMap = {};
  for (const r of RESOURCES) {
    const record = await prisma.urResource.upsert({
      where: { code: r.code },
      update: { name: r.name, category: r.category, displayOrder: r.displayOrder },
      create: r,
    });
    resourceMap[r.code] = record.id;
  }
  console.log(`✓ ${RESOURCES.length} resources`);

  const actionMap = {};
  for (const a of ACTIONS) {
    const record = await prisma.urAction.upsert({
      where: { code: a.code },
      update: { name: a.name, displayOrder: a.displayOrder },
      create: a,
    });
    actionMap[a.code] = record.id;
  }
  console.log(`✓ ${ACTIONS.length} actions`);

  const permissionMap = {};
  for (const p of PERMISSION_MAP) {
    const resourceId = resourceMap[p.resource];
    const actionId = actionMap[p.action];
    if (!resourceId || !actionId) {
      console.warn(`⚠ Skip ${p.legacyCode}: missing resource/action`);
      continue;
    }
    const record = await prisma.urPermission.upsert({
      where: { legacyCode: p.legacyCode },
      update: { resourceId, actionId, name: p.name },
      create: { resourceId, actionId, legacyCode: p.legacyCode, name: p.name },
    });
    permissionMap[p.legacyCode] = record.id;
  }
  console.log(`✓ ${Object.keys(permissionMap).length} ur_permissions`);

  const legacyPermCount = await syncLegacyPermissions(permissionMap);
  console.log(`✓ ${legacyPermCount} legacy permissions synced`);

  const dbRoles = await prisma.role.findMany({ select: { id: true, code: true } });
  const roleIdByCode = Object.fromEntries(dbRoles.map((r) => [r.code, r.id]));

  const rolePermissions = mergeAuthorityGrants(BASE_ROLE_PERMISSIONS);
  let urRpCount = 0;
  for (const [roleCode, legacyCodes] of Object.entries(rolePermissions)) {
    const roleId = roleIdByCode[roleCode];
    if (!roleId) continue;
    for (const legacyCode of legacyCodes) {
      const permissionId = permissionMap[legacyCode];
      if (!permissionId) continue;
      await prisma.urRolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
      urRpCount++;
    }
  }
  console.log(`✓ ${urRpCount} ur_role_permissions`);

  const legacyRpCount = await syncLegacyRolePermissions(roleIdByCode, rolePermissions);
  console.log(`✓ ${legacyRpCount} legacy role_permissions synced`);

  const revoked = await revokeStaleRolePermissions(roleIdByCode, rolePermissions, permissionMap);
  if (revoked > 0) {
    console.log(`✓ ${revoked} stale PERIOD_* role grants revoked`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Authority catalog seed complete.');
  console.log('═══════════════════════════════════════════════════════════\n');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
