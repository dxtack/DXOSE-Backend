'use strict';

/**
 * P1 #23 cleanup — remove clearly retired/fixture non-constitution UR grants
 * from active roles on ose_inventory.
 *
 *   node scripts/p1-23-cleanup-unused-ur-junk.js --confirm-db=ose_inventory
 */

process.env.DATABASE_URL =
  'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory?schema=public';

const REQUIRED_DB = 'ose_inventory';
if (process.argv.find((a) => a.startsWith('--confirm-db=')) !== `--confirm-db=${REQUIRED_DB}`) {
  throw new Error(`Requires --confirm-db=${REQUIRED_DB}`);
}

const { PrismaClient } = require('@prisma/client');
const { PERMISSION_MAP } = require('../src/acc-authority/catalog.constitution');

const prisma = new PrismaClient();
const CANONICAL = new Set(PERMISSION_MAP.map((p) => p.legacyCode));

// Explicit junk/retired codes safe to strip from UR grants on active roles.
const FORCE_REMOVE = new Set(['PERIOD_CLOSE_MANAGE']);

async function main() {
  const db = (await prisma.$queryRaw`SELECT current_database() AS n`)[0].n;
  if (db !== REQUIRED_DB) throw new Error(`Connected ${db}`);

  const activeRoles = await prisma.role.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  });

  const removed = [];
  for (const role of activeRoles) {
    const grants = await prisma.urRolePermission.findMany({
      where: { roleId: role.id },
      include: { permission: { select: { id: true, legacyCode: true } } },
    });
    for (const g of grants) {
      const code = g.permission.legacyCode;
      const isE2eJunk = /^E2E_OTHER_/i.test(code || '');
      if (!FORCE_REMOVE.has(code) && !isE2eJunk) continue;
      await prisma.urRolePermission.delete({ where: { id: g.id } });
      // Also drop matching legacy RolePermission if present
      const legacyPerm = await prisma.permission.findUnique({ where: { code } });
      if (legacyPerm) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: role.id, permissionId: legacyPerm.id },
        });
      }
      removed.push({ role: role.code, permission: code });
    }
  }

  // Drop orphan UrPermission rows for FORCE_REMOVE if no grants remain
  for (const code of FORCE_REMOVE) {
    const ur = await prisma.urPermission.findUnique({ where: { legacyCode: code } });
    if (!ur) continue;
    const left = await prisma.urRolePermission.count({ where: { permissionId: ur.id } });
    if (left === 0) {
      await prisma.urPermission.delete({ where: { id: ur.id } });
      removed.push({ role: '*catalog*', permission: code, deletedUrPermission: true });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        removedCount: removed.length,
        removed,
        note: 'Route PERMISSION_ALIASES kept — still referenced by live routes. Only retired/fixture UR junk removed.',
        constitutionCodes: CANONICAL.size,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
