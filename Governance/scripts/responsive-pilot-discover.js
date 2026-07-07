'use strict';

/**
 * Responsive Pilot — READ-ONLY discovery + auth probe (reusable module + CLI).
 *
 * Picks a real tenant + member that can view Item Master + Transfer (preferring
 * a member that also has BASIC_DATA_EDIT / TRANSFER_CREATE / TRANSFER_APPROVE),
 * resolves ACC permissions with the same resolver the API uses, mints a
 * short-lived READ-ONLY access token in memory, and samples item/transfer ids.
 *
 * ZERO database writes. Token is signed in memory only (never persisted server-side).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { generateAccessToken, generateRefreshToken } = require('../../src/utils/jwt');
const { resolveAccPermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
const { membershipRoleCode, getRoleIdByCode } = require('../../src/services/rbac.service');

const API_BASE = process.env.PILOT_API_URL || 'http://127.0.0.1:4000/api';
const REQUIRED = ['INVENTORY_VIEW', 'TRANSFER_VIEW'];
const NICE_TO_HAVE = ['BASIC_DATA_EDIT', 'TRANSFER_CREATE', 'TRANSFER_APPROVE', 'IMPORT_EXCEL'];

async function resolvePerms(prisma, m) {
  const roleCode = membershipRoleCode(m) || m.role || null;
  let roleId = m.roleId || null;
  if (!roleId && roleCode) {
    try { roleId = await getRoleIdByCode(roleCode); } catch { /* ignore */ }
  }
  try {
    const perms = await resolveAccPermissionsForMembership({ userId: m.userId, membership: m, roleId, roleCode });
    return { roleCode, roleId, perms: Array.isArray(perms) ? perms : [] };
  } catch (e) {
    return { roleCode, roleId, perms: [], error: e.message };
  }
}

async function discoverContext() {
  const prisma = new PrismaClient();
  try {
    const itemTenants = new Set(
      (await prisma.item.findMany({ select: { tenantId: true }, distinct: ['tenantId'] })).map((r) => r.tenantId),
    );
    const trfGroups = await prisma.storeTransfer.groupBy({ by: ['tenantId', 'status'], _count: { _all: true } });
    const trfTenantStatus = new Map();
    for (const g of trfGroups) {
      if (!trfTenantStatus.has(g.tenantId)) trfTenantStatus.set(g.tenantId, {});
      trfTenantStatus.get(g.tenantId)[g.status] = g._count._all;
    }

    const candidateTenantIds = [...trfTenantStatus.keys()].filter((tid) => itemTenants.has(tid));
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: candidateTenantIds } },
      select: { id: true, slug: true, name: true, parentId: true, isActive: true, adminStatus: true, subStatus: true },
    });
    tenants.sort((a, b) => {
      const aLeaf = a.parentId ? 1 : 0;
      const bLeaf = b.parentId ? 1 : 0;
      if (aLeaf !== bLeaf) return bLeaf - aLeaf;
      return Object.keys(trfTenantStatus.get(b.id) || {}).length - Object.keys(trfTenantStatus.get(a.id) || {}).length;
    });

    let chosen = null;
    let chosenScore = -1;
    for (const t of tenants) {
      if (t.isActive === false || t.adminStatus === 'SUSPENDED') continue;
      const members = await prisma.tenantMember.findMany({
        where: { tenantId: t.id, isActive: true },
        include: { user: { select: { id: true, email: true, permissionVersion: true, isActive: true } }, role: true },
      });
      for (const m of members) {
        if (!m.user || m.user.isActive === false) continue;
        const { roleCode, roleId, perms, error } = await resolvePerms(prisma, m);
        if (error) continue;
        if (!REQUIRED.every((p) => perms.includes(p))) continue;
        const niceCount = NICE_TO_HAVE.filter((p) => perms.includes(p)).length;
        const score = niceCount * 1000 + perms.length;
        if (score > chosenScore) {
          chosenScore = score;
          chosen = { tenant: t, member: m, roleCode, roleId, perms };
        }
      }
    }

    if (!chosen) throw new Error('NO_SUITABLE_USER');

    const t = chosen.tenant;
    const u = chosen.member.user;
    const tokenPayload = {
      userId: u.id, tenantId: t.id, email: u.email, role: chosen.roleCode,
      roleId: chosen.roleId, permissions: chosen.perms, permissionVersion: u.permissionVersion,
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ userId: u.id, tenantId: t.id });

    // Live read-only probe.
    let meStatus = 'n/a';
    let mePerms = null;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: { authorization: `Bearer ${accessToken}` } });
      meStatus = res.status;
      if (res.ok) { const b = await res.json(); mePerms = (b?.data?.permissions || b?.permissions || []).length; }
    } catch (e) { meStatus = `ERR ${e.message}`; }

    const item = await prisma.item.findFirst({ where: { tenantId: t.id }, select: { id: true, name: true } });
    const draftItem = await prisma.item.findFirst({ where: { tenantId: t.id }, select: { id: true } });
    const statusIds = {};
    for (const s of Object.keys(trfTenantStatus.get(t.id) || {})) {
      const row = await prisma.storeTransfer.findFirst({ where: { tenantId: t.id, status: s }, select: { id: true }, orderBy: { createdAt: 'desc' } });
      if (row) statusIds[s] = row.id;
    }

    // Memberships for the injected auth state (mirrors login envelope shape).
    const memberships = (await prisma.tenantMember.findMany({
      where: { userId: u.id, isActive: true },
      include: { tenant: { select: { id: true, slug: true, name: true, parentId: true } }, role: true },
    })).map((m) => ({
      tenantId: m.tenantId,
      tenantSlug: m.tenant?.slug || null,
      tenantName: m.tenant?.name || null,
      parentId: m.tenant?.parentId || null,
      roleCode: membershipRoleCode(m) || null,
    }));

    return {
      api: API_BASE,
      tenant: { id: t.id, slug: t.slug, name: t.name, parentId: t.parentId },
      user: { id: u.id, email: u.email, role: chosen.roleCode, permissionVersion: u.permissionVersion },
      permissions: chosen.perms.slice().sort(),
      permissionFlags: {
        INVENTORY_VIEW: chosen.perms.includes('INVENTORY_VIEW'),
        TRANSFER_VIEW: chosen.perms.includes('TRANSFER_VIEW'),
        BASIC_DATA_EDIT: chosen.perms.includes('BASIC_DATA_EDIT'),
        TRANSFER_CREATE: chosen.perms.includes('TRANSFER_CREATE'),
        TRANSFER_APPROVE: chosen.perms.includes('TRANSFER_APPROVE'),
        IMPORT_EXCEL: chosen.perms.includes('IMPORT_EXCEL'),
      },
      memberships,
      tokens: { accessToken, refreshToken },
      sample: { itemId: item?.id || null, itemName: item?.name || null, draftItemId: draftItem?.id || null, transfersByStatus: statusIds },
      transferStatusCounts: trfTenantStatus.get(t.id),
      authProbe: { endpoint: `${API_BASE}/auth/me`, status: meStatus, permissionsReturned: mePerms },
    };
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { discoverContext };

if (require.main === module) {
  discoverContext()
    .then((ctx) => {
      const redacted = { ...ctx, tokens: { accessToken: `${ctx.tokens.accessToken.slice(0, 16)}…`, refreshToken: '…' } };
      console.log('\n=== PILOT_CONTEXT_JSON_START ===');
      console.log(JSON.stringify(redacted, null, 2));
      console.log('=== PILOT_CONTEXT_JSON_END ===');
    })
    .catch((e) => { console.error('DISCOVER_FATAL', e); process.exit(1); });
}
