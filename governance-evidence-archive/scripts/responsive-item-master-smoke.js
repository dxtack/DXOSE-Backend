'use strict';
/**
 * Shared-shell regression smoke — Transfer List + Dashboard (READ-ONLY).
 *
 * The /items remediation edited main-layout.component.scss but gated the new
 * rules to `:host:has(app-items-list)` + min-width:768. This smoke proves other
 * routes are unaffected: their shell must NOT be viewport-capped and must retain
 * their prior scroll behavior, with no error overlay. NOT a fix for those routes.
 */
const path = require('path');
const fs = require('fs');
const { discoverContext } = require('./responsive-pilot-discover');
const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));
const FRONTEND_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const OUT_DIR = path.resolve(__dirname, '..', 'responsive-audit', 'item-master');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');

const ROUTES = [
  { id: 'TR-LIST', url: '/transfers', wait: '.ant-table, .ant-empty' },
  { id: 'DASHBOARD', url: '/dashboard', wait: 'h1, .ant-card, [class*="dashboard"]' },
];
const VP = { width: 1920, height: 1080, dpr: 1 };

function probe() {
  const docEl = document.scrollingElement || document.documentElement;
  const shell = document.querySelector('.main-shell.ant-layout') || document.querySelector('.main-shell');
  const sider = document.querySelector('.main-shell__sider') || document.querySelector('.ant-layout-sider');
  const cs = shell ? getComputedStyle(shell) : null;
  const sr = shell ? shell.getBoundingClientRect() : null;
  const errorOverlay = !!document.querySelector('vite-error-overlay');
  return {
    url: location.pathname,
    errorOverlay,
    hasItemsList: !!document.querySelector('app-items-list'),
    shell: shell ? { height: Math.round(sr.height), overflowY: cs.overflowY, maxHeight: cs.maxHeight, clientHeight: shell.clientHeight, scrollHeight: shell.scrollHeight } : null,
    sider: sider ? { clientHeight: sider.clientHeight, scrollHeight: sider.scrollHeight, overflowY: getComputedStyle(sider).overflowY } : null,
    document: { scrollHeight: docEl.scrollHeight, clientHeight: docEl.clientHeight, pageVerticalScroll: docEl.scrollHeight > docEl.clientHeight + 2 },
  };
}

async function run() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ctx = await discoverContext();
  const authState = { state: {
    user: { id: ctx.user.id, email: ctx.user.email, tenantId: ctx.tenant.id, role: ctx.user.role, permissions: ctx.permissions,
      tenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name, parentId: ctx.tenant.parentId }, memberships: ctx.memberships },
    accessToken: ctx.tokens.accessToken, refreshToken: ctx.tokens.refreshToken,
    currentTenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name, parentId: ctx.tenant.parentId }, isAuthenticated: true } };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: VP.width, height: VP.height }, deviceScaleFactor: VP.dpr, baseURL: FRONTEND_URL });
  await context.addInitScript(([st, slug]) => { localStorage.setItem('ose-auth', st); localStorage.setItem('ose-last-property-slug', slug); }, [JSON.stringify(authState), ctx.tenant.slug]);
  const page = await context.newPage();
  await page.goto(FRONTEND_URL + '/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(700);

  const out = [];
  for (const r of ROUTES) {
    await page.goto(FRONTEND_URL + r.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    await page.waitForSelector(r.wait, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const m = await page.evaluate(probe);
    const shot = path.join(SHOT_DIR, `SMOKE-${r.id}__1920x1080__after.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    out.push({ route: r.id, landedUrl: new URL(page.url()).pathname, probe: m, screenshot: path.relative(OUT_DIR, shot).replace(/\\/g, '/') });
    console.log(`[smoke] ${r.id} landed=${m.url} err=${m.errorOverlay} hasItemsList=${m.hasItemsList} shellOverflowY=${m.shell?.overflowY} shellMaxH=${m.shell?.maxHeight} pageScroll=${m.document.pageVerticalScroll}`);
  }
  await context.close();
  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'ITEM_MASTER_LIST_SHARED_SHELL_SMOKE.json'), JSON.stringify({ runAt: new Date().toISOString(), viewport: VP, note: 'Other routes must not be viewport-capped by the /items-gated shell rules.', results: out }, null, 2));
}

if (require.main === module) run().then(() => process.exit(0)).catch((e) => { console.error('SMOKE_FATAL', e); process.exit(1); });
