'use strict';

/**
 * P1 #24 — Unbundle STOCK_COUNT_MANAGE into granular UR permissions on ose_inventory.
 *
 *   node scripts/p1-24-unbundle-stock-count-manage.js --apply --confirm-db=ose_inventory
 *   node scripts/p1-24-unbundle-stock-count-manage.js --verify --confirm-db=ose_inventory
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL_OVERRIDE ||
  'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory?schema=public';

const REQUIRED_DB = 'ose_inventory';
const confirmation = process.argv.find((a) => a.startsWith('--confirm-db='));
if (confirmation !== `--confirm-db=${REQUIRED_DB}`) {
  throw new Error(`Requires --confirm-db=${REQUIRED_DB}`);
}

const doApply = process.argv.includes('--apply');
const doVerify = process.argv.includes('--verify');
if ([doApply, doVerify].filter(Boolean).length !== 1) {
  throw new Error('Specify exactly one of --apply | --verify');
}

const { PrismaClient } = require('@prisma/client');
const {
  PERMISSION_MAP,
  RESOURCES,
  ACTIONS,
} = require('../src/acc-authority/catalog.constitution');
const {
  STOCK_COUNT_MANAGE,
  STOCK_COUNT_MANAGE_EQUIVALENT,
} = require('../src/acc-authority/stock-count-permissions');
const {
  BASE_ROLE_PERMISSIONS,
  mergeAuthorityGrants,
  applyRolePermissionPolicy,
} = require('../src/acc-authority/base-role-permissions');

const prisma = new PrismaClient();
const CANONICAL = mergeAuthorityGrants(BASE_ROLE_PERMISSIONS);

async function assertDb() {
  const rows = await prisma.$queryRaw`SELECT current_database() AS n`;
  if (rows[0].n !== REQUIRED_DB) throw new Error(`Connected ${rows[0].n}`);
}

async function ensureUrPermission(legacyCode) {
  const entry = PERMISSION_MAP.find((p) => p.legacyCode === legacyCode);
  if (!entry) throw new Error(`Unknown constitution code: ${legacyCode}`);
  const existing = await prisma.urPermission.findUnique({ where: { legacyCode } });
  if (existing) {
    if (entry.name && existing.name !== entry.name) {
      return prisma.urPermission.update({
        where: { id: existing.id },
        data: { name: entry.name },
      });
    }
    return existing;
  }

  const resDef = RESOURCES.find((r) => r.code === entry.resource);
  const actDef = ACTIONS.find((a) => a.code === entry.action);
  if (!resDef || !actDef) {
    throw new Error(`Missing resource/action for ${legacyCode}`);
  }

  const resource = await prisma.urResource.upsert({
    where: { code: resDef.code },
    update: { name: resDef.name, category: resDef.category, displayOrder: resDef.displayOrder },
    create: resDef,
  });
  const action = await prisma.urAction.upsert({
    where: { code: actDef.code },
    update: { name: actDef.name, displayOrder: actDef.displayOrder },
    create: actDef,
  });

  return prisma.urPermission.create({
    data: {
      legacyCode: entry.legacyCode,
      name: entry.name,
      resourceId: resource.id,
      actionId: action.id,
    },
  });
}

async function ensureLegacyPermission(code, name) {
  return prisma.permission.upsert({
    where: { code },
    update: name ? { name } : {},
    create: { code, name: name || code },
  });
}

async function grantRoleCodes(roleId, codes, urByCode, legacyByCode) {
  let urAdded = 0;
  let legacyAdded = 0;
  for (const code of codes) {
    const ur = urByCode.get(code);
    const legacy = legacyByCode.get(code);
    if (!ur || !legacy) throw new Error(`Missing permission row for ${code}`);

    const beforeUr = await prisma.urRolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId: ur.id } },
    });
    await prisma.urRolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: ur.id } },
      update: {},
      create: { roleId, permissionId: ur.id },
    });
    if (!beforeUr) urAdded += 1;

    const beforeLegacy = await prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId: legacy.id } },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: legacy.id } },
      update: {},
      create: { roleId, permissionId: legacy.id },
    });
    if (!beforeLegacy) legacyAdded += 1;
  }
  return { urAdded, legacyAdded };
}

async function apply() {
  await assertDb();

  const urRows = [];
  const legacyRows = [];
  for (const code of [...STOCK_COUNT_MANAGE_EQUIVALENT, STOCK_COUNT_MANAGE]) {
    const entry = PERMISSION_MAP.find((p) => p.legacyCode === code);
    urRows.push(await ensureUrPermission(code));
    legacyRows.push(await ensureLegacyPermission(code, entry?.name));
  }
  const urByCode = new Map(urRows.map((r) => [r.legacyCode, r]));
  const legacyByCode = new Map(legacyRows.map((r) => [r.code, r]));

  const roles = await prisma.role.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  });

  const report = [];
  for (const role of roles) {
    const [urGrants, legacyGrants] = await Promise.all([
      prisma.urRolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { legacyCode: true } } },
      }),
      prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { code: true } } },
      }),
    ]);
    const urSet = new Set(urGrants.map((g) => g.permission.legacyCode));
    const legacySet = new Set(legacyGrants.map((g) => g.permission.code));
    const hadManage = urSet.has(STOCK_COUNT_MANAGE) || legacySet.has(STOCK_COUNT_MANAGE);
    const canonical = new Set(applyRolePermissionPolicy(role.code, CANONICAL[role.code] || []));
    const needsEquivalent =
      hadManage || STOCK_COUNT_MANAGE_EQUIVALENT.some((c) => canonical.has(c));

    if (!needsEquivalent) {
      report.push({ role: role.code, skipped: true, reason: 'no prior manage / no canonical stock-count ops' });
      continue;
    }

    const { urAdded, legacyAdded } = await grantRoleCodes(
      role.id,
      STOCK_COUNT_MANAGE_EQUIVALENT,
      urByCode,
      legacyByCode,
    );

    // Keep legacy STOCK_COUNT_MANAGE grant if present (compat); do not strip — no capability loss.
    report.push({
      role: role.code,
      hadManage,
      urAdded,
      legacyAdded,
      granted: STOCK_COUNT_MANAGE_EQUIVALENT,
    });
  }

  console.log(JSON.stringify({ ok: true, mode: 'apply', report }, null, 2));
}

async function verify() {
  await assertDb();

  const roles = await prisma.role.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  });

  const failures = [];
  const ok = [];
  for (const role of roles) {
    const urGrants = await prisma.urRolePermission.findMany({
      where: { roleId: role.id },
      select: { permission: { select: { legacyCode: true } } },
    });
    const urSet = new Set(urGrants.map((g) => g.permission.legacyCode));
    const hadManageHistorically =
      urSet.has(STOCK_COUNT_MANAGE) ||
      STOCK_COUNT_MANAGE_EQUIVALENT.some((c) =>
        (CANONICAL[role.code] || []).includes(c),
      );

    if (!hadManageHistorically && !urSet.has(STOCK_COUNT_MANAGE)) {
      const anyGranular = STOCK_COUNT_MANAGE_EQUIVALENT.some((c) => urSet.has(c));
      if (!anyGranular) continue;
    }

    const missing = STOCK_COUNT_MANAGE_EQUIVALENT.filter((c) => !urSet.has(c));
    if (missing.length) {
      failures.push({ role: role.code, missing });
    } else {
      ok.push(role.code);
    }
  }

  if (failures.length) {
    console.error(JSON.stringify({ ok: false, failures, okRoles: ok }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ ok: true, mode: 'verify', rolesWithFullEquivalent: ok }, null, 2));
}

(async () => {
  try {
    if (doApply) await apply();
    if (doVerify) await verify();
  } finally {
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
