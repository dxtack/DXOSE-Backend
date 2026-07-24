'use strict';
// READ-ONLY targeted shell probe: what drives layout height + is there an inner scroll container?
const path = require('path');
const { discoverContext } = require('./responsive-pilot-discover');
const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));
const FRONTEND_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';

async function main() {
  const ctx = await discoverContext();
  const authState = { state: {
    user: { id: ctx.user.id, email: ctx.user.email, tenantId: ctx.tenant.id, role: ctx.user.role, permissions: ctx.permissions,
      tenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name, parentId: ctx.tenant.parentId }, memberships: ctx.memberships },
    accessToken: ctx.tokens.accessToken, refreshToken: ctx.tokens.refreshToken,
    currentTenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name, parentId: ctx.tenant.parentId }, isAuthenticated: true } };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, baseURL: FRONTEND_URL });
  await context.addInitScript(([st, slug]) => { localStorage.setItem('ose-auth', st); localStorage.setItem('ose-last-property-slug', slug); }, [JSON.stringify(authState), ctx.tenant.slug]);
  const page = await context.newPage();
  await page.goto(FRONTEND_URL + '/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(600);

  for (const url of ['/items', '/transfers']) {
    await page.goto(FRONTEND_URL + url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForSelector('.ant-table, .ant-empty', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => {
      const vh = window.innerHeight, vw = window.innerWidth;
      const de = document.scrollingElement || document.documentElement;
      const tall = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.height >= vh && r.width >= 100) {
          const cs = getComputedStyle(el);
          let name = el.tagName.toLowerCase();
          if (el.className && typeof el.className === 'string') name += '.' + el.className.trim().split(/\s+/).slice(0,3).join('.');
          tall.push({ name, h: Math.round(r.height), w: Math.round(r.width), overflowY: cs.overflowY, position: cs.position, minH: cs.minHeight, scrollH: el.scrollHeight, clientH: el.clientHeight });
        }
      }
      // sidebar + its scroll behaviour
      const sider = document.querySelector('nz-sider, .ant-layout-sider, aside, [class*="sider"]');
      const sc = sider ? getComputedStyle(sider) : null;
      const nav = sider ? sider.querySelector('ul, nz-menu, .ant-menu') : null;
      const contentC = document.querySelector('.ant-layout-content, main, [class*="page-content"], [class*="content-area"]');
      const cc = contentC ? getComputedStyle(contentC) : null;
      const ccr = contentC ? contentC.getBoundingClientRect() : null;
      return {
        viewport: { vw, vh }, doc: { scrollH: de.scrollHeight, clientH: de.clientHeight, scrolls: de.scrollHeight > de.clientHeight + 2 },
        tallestElements: tall.sort((a,b)=>b.h-a.h).slice(0,10),
        sider: sider ? { h: Math.round(sider.getBoundingClientRect().height), overflowY: sc.overflowY, position: sc.position, scrollH: sider.scrollHeight, clientH: sider.clientHeight, navItems: nav ? nav.querySelectorAll('li, .ant-menu-item, .ant-menu-submenu').length : null } : null,
        contentContainer: contentC ? { selector: contentC.className, h: Math.round(ccr.height), overflowY: cc.overflowY, position: cc.position, minHeight: cc.minHeight, scrolls: contentC.scrollHeight > contentC.clientHeight + 2 } : null,
      };
    });
    console.log('\n===== ' + url + ' =====');
    console.log(JSON.stringify(info, null, 2));
  }
  await browser.close();
}
main().catch((e) => { console.error('PROBE_FATAL', e); process.exit(1); });
