'use strict';

/**
 * Restore four UR grants that were legacy-only (hard-lost under UR-primary path).
 * Does NOT touch ASSET_* / ISSUE_* / REQUISITION_* (deferred).
 * Does NOT change fallback logic.
 *
 *   node scripts/restore-legacy-only-ur-grants.js --prove --confirm-db=ose_inventory
 *   node scripts/restore-legacy-only-ur-grants.js --apply --confirm-db=ose_inventory
 *   node scripts/restore-legacy-only-ur-grants.js --inventory --confirm-db=ose_inventory
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL_OVERRIDE ||
  'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory?schema=public';

const REQUIRED_DB = 'ose_inventory';
const confirmation = process.argv.find((a) => a.startsWith('--confirm-db='));
if (confirmation !== `--confirm-db=${REQUIRED_DB}`) {
  throw new Error(`Requires --confirm-db=${REQUIRED_DB}`);
}

const doProve = process.argv.includes('--prove');
const doApply = process.argv.includes('--apply');
const doInventory = process.argv.includes('--inventory');
if ([doProve, doApply, doInventory].filter(Boolean).length !== 1) {
  throw new Error('Specify exactly one of --prove | --apply | --inventory');
}

const { PrismaClient } = require('@prisma/client');
const {
  PERMISSION_MAP,
  RESOURCES,
  ACTIONS,
} = require('../src/acc-authority/catalog.constitution');
const {
  BASE_ROLE_PERMISSIONS,
  mergeAuthorityGrants,
  applyRolePermissionPolicy,
} = require('../src/acc-authority/base-role-permissions');
const { getPermissionsForMembership } = require('../src/services/rbac.service');
const { requirePermission } = require('../src/middleware/authorize');

const prisma = new PrismaClient();
const CANONICAL = mergeAuthorityGrants(BASE_ROLE_PERMISSIONS);
const CANONICAL_CODES = new Set(PERMISSION_MAP.map((p) => p.legacyCode));

/** Scoped restores only — ASSET / ISSUE / REQUISITION prefixes explicitly excluded. */
const RESTORE_GRANTS = Object.freeze([
  { role: 'ORG_MANAGER', permission: 'APPROVE_INVENTORY_COUNT' },
  { role: 'ORG_MANAGER', permission: 'ADJUSTMENT_CREATE' },
  { role: 'GENERAL_MANAGER', permission: 'GET_PASS_CONFIRM_DESTINATION' },
  { role: 'SUPER_ADMIN', permission: 'BREAKAGE_VIEW' },
]);

const DEFERRED_PREFIXES = Object.freeze(['ASSET_', 'ISSUE_', 'REQUISITION_']);

function isDeferred(code) {
  return DEFERRED_PREFIXES.some((p) => code.startsWith(p));
}

function invokeRequirePermission(permission, user) {
  const mw = requirePermission(permission);
  return new Promise((resolve) => {
    const req = { user };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body, allowed: false });
        return this;
      },
    };
    mw(req, res, () => resolve({ statusCode: 200, allowed: true }));
  });
}

async function assertDb() {
  const rows = await prisma.$queryRaw`SELECT current_database() AS n`;
  if (rows[0].n !== REQUIRED_DB) throw new Error(`Connected ${rows[0].n}`);
}

async function ensureUrPermission(legacyCode) {
  const entry = PERMISSION_MAP.find((p) => p.legacyCode === legacyCode);
  if (!entry) {
    throw new Error(`Cannot create UR permission for non-constitution code: ${legacyCode}`);
  }
  const existing = await prisma.urPermission.findUnique({ where: { legacyCode } });
  if (existing) return existing;

  const resDef = RESOURCES.find((r) => r.code === entry.resource);
  const actDef = ACTIONS.find((a) => a.code === entry.action);
  if (!resDef || !actDef) {
    throw new Error(`Missing resource/action defs for ${legacyCode}`);
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

async function effectiveUserForRole(roleCode) {
  const role = await prisma.role.findUnique({
    where: { code: roleCode },
    select: { id: true, code: true, isActive: true },
  });
  if (!role) throw new Error(`Role missing: ${roleCode}`);
  const permissions = await getPermissionsForMembership({
    roleId: role.id,
    roleCode: role.code,
  });
  return { role: role.code, permissions, roleId: role.id, isActive: role.isActive };
}

async function proveCases({ expectAllow }) {
  const results = [];
  for (const { role, permission } of RESTORE_GRANTS) {
    const user = await effectiveUserForRole(role);
    const outcome = await invokeRequirePermission(permission, user);
    const ok = expectAllow ? outcome.allowed === true : outcome.statusCode === 403 && !outcome.allowed;
    results.push({
      role,
      permission,
      urEffectiveCount: user.permissions.length,
      hasInEffective: user.permissions.includes(permission),
      statusCode: outcome.statusCode,
      allowed: outcome.allowed,
      ok,
    });
  }
  return results;
}

async function applyGrants() {
  const sealed = [];
  for (const { role: roleCode, permission } of RESTORE_GRANTS) {
    if (isDeferred(permission)) {
      throw new Error(`Refusing deferred permission: ${permission}`);
    }
    if (!CANONICAL_CODES.has(permission)) {
      throw new Error(`Not in constitution catalog: ${permission}`);
    }
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role || !role.isActive) {
      throw new Error(`Active role required: ${roleCode}`);
    }
    const entry = PERMISSION_MAP.find((p) => p.legacyCode === permission);
    const urPerm = await ensureUrPermission(permission);
    await ensureLegacyPermission(permission, entry?.name);
    await prisma.urRolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: urPerm.id } },
      update: {},
      create: { roleId: role.id, permissionId: urPerm.id },
    });
    // Keep legacy row for matrix parity (same as #23 GET_PASS_VIEW_CLAIMS path).
    const legacyPerm = await prisma.permission.findUnique({ where: { code: permission } });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: legacyPerm.id },
      },
      update: {},
      create: { roleId: role.id, permissionId: legacyPerm.id },
    });
    sealed.push({ role: roleCode, permission });
  }
  return sealed;
}

/**
 * Comprehensive hard-loss inventory for active roles:
 * constitution (or any non-deferred) codes present in legacy but missing from effective UR path.
 */
async function inventoryHardLossOutsideDeferred() {
  const activeRoles = await prisma.role.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  });

  const gaps = [];
  const p123Style = [];

  for (const role of activeRoles) {
    const [legacyRows, urRows] = await Promise.all([
      prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { code: true } } },
      }),
      prisma.urRolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { legacyCode: true } } },
      }),
    ]);
    const legacy = new Set(legacyRows.map((r) => r.permission.code).filter(Boolean));
    const ur = new Set(urRows.map((r) => r.permission.legacyCode).filter(Boolean));
    const canonical = new Set(applyRolePermissionPolicy(role.code, CANONICAL[role.code] || []));
    const missingFromUr = [...canonical].filter((c) => !ur.has(c)).sort();
    if (missingFromUr.length) {
      p123Style.push({ code: role.code, missingFromUr });
    }

    const legacyOnly = [...legacy].filter((c) => !ur.has(c) && !isDeferred(c)).sort();
    const hardLost = [];
    for (const code of legacyOnly) {
      // Soft alias twin: BREAKAGE_APPROVE covered by APPROVE_BREAKAGE in UR
      if (code === 'BREAKAGE_APPROVE' && ur.has('APPROVE_BREAKAGE')) continue;
      hardLost.push(code);
    }
    if (hardLost.length) {
      gaps.push({
        code: role.code,
        hardLostOutsideDeferred: hardLost,
        constitutionHardLost: hardLost.filter((c) => CANONICAL_CODES.has(c)),
        nonConstitutionHardLost: hardLost.filter((c) => !CANONICAL_CODES.has(c)),
      });
    }
  }

  return { p123MissingCanonicalFromUr: p123Style, hardLossOutsideDeferred: gaps };
}

async function main() {
  await assertDb();

  if (doProve) {
    const expectAllow = process.argv.includes('--expect-allow');
    const results = await proveCases({ expectAllow });
    const failed = results.filter((r) => !r.ok);
    console.log(
      JSON.stringify(
        {
          mode: expectAllow ? 'PROVE_ALLOW' : 'PROVE_DENY',
          results,
          failedCount: failed.length,
        },
        null,
        2,
      ),
    );
    if (failed.length) process.exitCode = 1;
    return;
  }

  if (doApply) {
    const before = await proveCases({ expectAllow: false });
    const sealed = await applyGrants();
    const after = await proveCases({ expectAllow: true });
    const afterFailed = after.filter((r) => !r.ok);
    console.log(
      JSON.stringify(
        {
          mode: 'APPLY',
          sealed,
          beforeDeny: before,
          afterAllow: after,
          afterFailedCount: afterFailed.length,
        },
        null,
        2,
      ),
    );
    if (afterFailed.length) process.exitCode = 1;
    return;
  }

  if (doInventory) {
    const inv = await inventoryHardLossOutsideDeferred();
    console.log(JSON.stringify({ mode: 'INVENTORY', ...inv }, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
