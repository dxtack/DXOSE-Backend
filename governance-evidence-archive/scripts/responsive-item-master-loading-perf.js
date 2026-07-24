'use strict';
/**
 * Item Master List — network + timing trace (READ-ONLY).
 * Measures waterfall for /items first load and optional second refresh.
 */
const path = require('path');
const fs = require('fs');
const { discoverContext } = require('./responsive-pilot-discover');

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));
const FRONTEND_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const API_BASE = process.env.PILOT_API_URL || 'http://127.0.0.1:4000/api';
const OUT_DIR = path.resolve(__dirname, '..', 'responsive-audit', 'item-master');

async function findLargeItemTenant() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const counts = await prisma.item.groupBy({ by: ['tenantId'], _count: { id: true } });
    counts.sort((a, b) => b._count.id - a._count.id);
    const top = counts.slice(0, 15);
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: top.map((g) => g.tenantId) } },
      select: { id: true, slug: true, name: true },
    });
    const byId = Object.fromEntries(tenants.map((t) => [t.id, t]));
    return top.map((g) => ({ tenant: byId[g.tenantId], itemCount: g._count.id })).filter((r) => r.tenant);
  } finally {
    await prisma.$disconnect();
  }
}

async function mintAuthForTenant(prisma, tenantId) {
  const { generateAccessToken, generateRefreshToken } = require('../../src/utils/jwt');
  const { resolveAccPermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
  const { membershipRoleCode, getRoleIdByCode } = require('../../src/services/rbac.service');

  const members = await prisma.tenantMember.findMany({
    where: { tenantId, isActive: true },
    include: { user: { select: { id: true, email: true, permissionVersion: true, isActive: true } }, role: true },
  });
  for (const m of members) {
    if (!m.user?.isActive) continue;
    const roleCode = membershipRoleCode(m) || m.role || null;
    let roleId = m.roleId || null;
    if (!roleId && roleCode) {
      try { roleId = await getRoleIdByCode(roleCode); } catch { /* ignore */ }
    }
    const perms = await resolveAccPermissionsForMembership({ userId: m.userId, membership: m, roleId, roleCode });
    if (!perms.includes('VIEW_MASTER_DATA') && !perms.includes('INVENTORY_VIEW')) continue;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const accessToken = generateAccessToken({ userId: m.userId, tenantId, role: roleCode });
    const refreshToken = generateRefreshToken({ userId: m.userId });
    return { tenant, user: m.user, role: roleCode, permissions: perms, tokens: { accessToken, refreshToken } };
  }
  return null;
}

async function apiTiming(label, url, token) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  const ms = Math.round(performance.now() - t0);
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  const itemCount = Array.isArray(json?.data) ? json.data.length : null;
  const total = json?.meta?.total ?? null;
  const withImages = Array.isArray(json?.data) ? json.data.filter((i) => i?.imageUrl || i?.imageDisplayUrl).length : null;
  return { label, url, status: res.status, ms, itemCount, total, withImages, sizeBytes: text.length };
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const largeTenants = await findLargeItemTenant();
  console.log('[perf] top item tenants:', largeTenants.slice(0, 5).map((t) => `${t.tenant.slug} (${t.itemCount})`).join(', '));

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  let ctx = null;
  try {
    const pick = largeTenants.find((t) => t.itemCount >= 50) || largeTenants[0];
    if (pick) {
      const auth = await mintAuthForTenant(prisma, pick.tenant.id);
      if (auth) {
        ctx = {
          tenant: pick.tenant,
          itemCount: pick.itemCount,
          user: auth.user,
          role: auth.role,
          permissions: auth.permissions,
          tokens: auth.tokens,
        };
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  if (!ctx) {
    ctx = await discoverContext();
    ctx.itemCount = null;
  }

  console.log(`[perf] using tenant=${ctx.tenant.slug} items≈${ctx.itemCount ?? '?'}`);

  const apiTimings = [];
  const token = ctx.tokens.accessToken;
  const q = 'skip=0&take=20&isActive=true';
  apiTimings.push(await apiTiming('GET /items/check-requirements', `${API_BASE}/items/check-requirements`, token));
  apiTimings.push(await apiTiming('GET /items (page 1)', `${API_BASE}/items?${q}`, token));
  apiTimings.push(await apiTiming('GET /categories', `${API_BASE}/categories?masterData=true&isActive=true`, token));
  apiTimings.push(await apiTiming('GET /departments', `${API_BASE}/departments?masterData=true&isActive=true`, token));
  apiTimings.push(await apiTiming('GET /locations', `${API_BASE}/locations?masterData=true&isActive=true`, token));

  const authState = {
    state: {
      user: {
        id: ctx.user.id, email: ctx.user.email, tenantId: ctx.tenant.id, role: ctx.role,
        permissions: ctx.permissions,
        tenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name },
        memberships: [],
      },
      accessToken: token,
      refreshToken: ctx.tokens.refreshToken,
      currentTenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name },
      isAuthenticated: true,
    },
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, baseURL: FRONTEND_URL });
  await context.addInitScript(([st, slug]) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ose-auth', st);
    localStorage.setItem('ose-last-property-slug', slug);
  }, [JSON.stringify(authState), ctx.tenant.slug]);

  const page = await context.newPage();
  const requests = [];
  const responses = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/') || u.includes('/files/')) {
      requests.push({ url: u, method: req.method(), ts: Date.now() });
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (!u.includes('/api/') && !u.includes('/files/')) return;
    const timing = res.request().timing();
    responses.push({
      url: u.split('?')[0].replace(API_BASE.replace('/api', ''), '').replace(/^https?:\/\/[^/]+/, ''),
      status: res.status(),
      method: res.request().method(),
      durationMs: timing ? Math.round(timing.responseEnd) : null,
    });
  });

  const marks = { navStart: Date.now() };
  await page.goto(`${FRONTEND_URL}/items`, { waitUntil: 'commit' });
  marks.domContentLoaded = Date.now();

  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('app-items-list .ant-table-tbody tr:not(.ant-table-measure-row)');
    const spin = document.querySelector('app-items-list .ant-spin-spinning');
    return rows.length > 0 && !spin;
  }, { timeout: 120000 }).catch(() => {});
  marks.rowsVisible = Date.now();

  await page.waitForFunction(() => {
    const pag = document.querySelector('app-items-list .registry-work-card__footer .ant-pagination, app-items-list .registry-work-card__footer');
    const spin = document.querySelector('app-items-list .ant-spin-spinning');
    return pag && !spin;
  }, { timeout: 30000 }).catch(() => {});
  marks.paginationVisible = Date.now();
  marks.interactive = Date.now();

  const browserMetrics = await page.evaluate(() => {
    const rows = document.querySelectorAll('app-items-list .ant-table-tbody tr:not(.ant-table-measure-row)').length;
    const spin = !!document.querySelector('app-items-list .ant-spin-spinning');
    const total = document.querySelector('app-items-list .registry-page-header__meta')?.textContent?.trim();
    return { rowCount: rows, spinnerVisible: spin, totalText: total };
  });

  const shot = path.join(OUT_DIR, 'screenshots', 'IM-LIST__1920x1080__loading-perf-loaded.png');
  await page.screenshot({ path: shot, fullPage: false });

  // Second load (refresh)
  const refreshStart = Date.now();
  await page.click('app-items-list button:has-text("Refresh"), app-items-list button >> text=Refresh').catch(() => {});
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !document.querySelector('app-items-list .ant-spin-spinning'), { timeout: 60000 }).catch(() => {});
  const refreshMs = Date.now() - refreshStart;

  await context.close();
  await browser.close();

  const trace = {
    runAt: new Date().toISOString(),
    tenant: ctx.tenant,
    approximateItemCount: ctx.itemCount,
    apiTimings,
    browserTimings: {
      navigationToRowsMs: marks.rowsVisible - marks.navStart,
      navigationToPaginationMs: marks.paginationVisible - marks.navStart,
      navigationToInteractiveMs: marks.interactive - marks.navStart,
      refreshClickToIdleMs: refreshMs,
    },
    browserMetrics,
    networkResponses: responses,
    networkRequestCount: requests.length,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'ITEM_MASTER_LOADING_NETWORK_TRACE.json'), JSON.stringify(trace, null, 2));
  console.log(JSON.stringify(trace, null, 2));
}

if (require.main === module) run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
