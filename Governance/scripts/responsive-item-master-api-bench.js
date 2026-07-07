'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const { generateAccessToken } = require('../../src/utils/jwt');
const { resolveAccPermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
const { membershipRoleCode, getRoleIdByCode } = require('../../src/services/rbac.service');

const API = process.env.PILOT_API_URL || 'http://127.0.0.1:4000/api';

async function mintForTenant(slug) {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) throw new Error(`tenant not found: ${slug}`);
    const itemCount = await prisma.item.count({ where: { tenantId: tenant.id } });
    const members = await prisma.tenantMember.findMany({
      where: { tenantId: tenant.id, isActive: true },
      include: { user: true, role: true },
    });
    for (const m of members) {
      if (!m.user?.isActive) continue;
      const roleCode = membershipRoleCode(m) || m.role;
      let roleId = m.roleId;
      if (!roleId && roleCode) {
        try { roleId = await getRoleIdByCode(roleCode); } catch { /* ignore */ }
      }
      const perms = await resolveAccPermissionsForMembership({ userId: m.userId, membership: m, roleId, roleCode });
      const canList = perms.includes('VIEW_MASTER_DATA') || perms.includes('INVENTORY_VIEW') || perms.includes('BASIC_DATA_VIEW');
      if (!canList) continue;
      const token = generateAccessToken({
        userId: m.user.id,
        tenantId: tenant.id,
        email: m.user.email,
        role: roleCode,
        roleId,
        permissions: perms,
        permissionVersion: m.user.permissionVersion,
      });
      return {
        tenant,
        itemCount,
        token,
        email: m.user.email,
        userId: m.user.id,
        roleCode,
        permissions: perms,
        refreshToken: require('../../src/utils/jwt').generateRefreshToken({ userId: m.user.id, tenantId: tenant.id }),
      };
    }
    throw new Error(`no VIEW_MASTER_DATA user for ${slug}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function timeGet(label, url, token) {
  const t0 = Date.now();
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.text();
  const ms = Date.now() - t0;
  let meta = {};
  try {
    const j = JSON.parse(body);
    meta.items = Array.isArray(j.data) ? j.data.length : null;
    meta.total = j.meta?.total ?? null;
    meta.withDisplayUrl = Array.isArray(j.data) ? j.data.filter((x) => x?.imageDisplayUrl).length : null;
    meta.withImageKey = Array.isArray(j.data) ? j.data.filter((x) => x?.imageUrl).length : null;
    meta.bytes = body.length;
  } catch {
    meta.parseError = true;
  }
  return { label, status: r.status, ms, ...meta };
}

async function bench(slug) {
  const { tenant, itemCount, token, email } = await mintForTenant(slug);
  const rows = [];
  rows.push(await timeGet('check-requirements', `${API}/items/check-requirements`, token));
  rows.push(await timeGet('items-page1', `${API}/items?skip=0&take=20&isActive=true`, token));
  rows.push(await timeGet('categories', `${API}/categories?masterData=true&isActive=true`, token));
  rows.push(await timeGet('departments', `${API}/departments?masterData=true&isActive=true`, token));
  rows.push(await timeGet('locations', `${API}/locations?masterData=true&isActive=true`, token));
  return { slug, tenant: tenant.name, itemCount, email, rows };
}

async function main() {
  const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ['dx-airport-hotel', 'closeout-audit-hotel-disposable'];
  const out = [];
  for (const slug of slugs) {
    const r = await bench(slug);
    out.push(r);
    console.log(JSON.stringify(r, null, 2));
  }
}

module.exports = { mintForTenant, bench };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
