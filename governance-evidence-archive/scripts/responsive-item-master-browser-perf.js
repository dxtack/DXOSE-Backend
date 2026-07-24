'use strict';
/** Browser waterfall for Item Master List first load + refresh (dx-airport-hotel). */
const path = require('path');
const fs = require('fs');
const { mintForTenant } = require('./responsive-item-master-api-bench');

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));
const FRONTEND_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const OUT_DIR = path.resolve(__dirname, '..', 'responsive-audit', 'item-master');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const VIEWPORTS = [
  { w: 1366, h: 768, tag: '1366x768' },
  { w: 1536, h: 864, tag: '1536x864' },
  { w: 1920, h: 1080, tag: '1920x1080' },
];

async function measureViewport(browser, auth, authState, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    baseURL: FRONTEND_URL,
  });
  await context.addInitScript(([st, slug]) => {
    localStorage.clear();
    localStorage.setItem('ose-auth', st);
    localStorage.setItem('ose-last-property-slug', slug);
  }, [JSON.stringify(authState), auth.tenant.slug]);

  const page = await context.newPage();
  const events = [];
  const t0 = Date.now();
  const mark = (name) => events.push({ name, ms: Date.now() - t0 });

  page.on('response', async (res) => {
    const u = res.url();
    if (!u.includes('/api/')) return;
    const pathOnly = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    let bodyLen = 0;
    try {
      bodyLen = (await res.body()).length;
    } catch {
      /* ignore */
    }
    events.push({ type: 'response', path: pathOnly, status: res.status(), ms: Date.now() - t0, bytes: bodyLen });
  });

  mark('nav-start');
  const nav = page.goto(`${FRONTEND_URL}/items`, { waitUntil: 'domcontentloaded' });
  mark('domcontentloaded-fired');

  await page.waitForSelector('app-items-list', { timeout: 120000 });
  mark('app-items-list-mounted');

  let loadingShotTaken = false;
  const loadingPoll = setInterval(async () => {
    if (loadingShotTaken) return;
    const hasInitial = await page
      .locator('app-items-list .items-table-initial-loading, app-items-list .ant-spin-spinning')
      .count()
      .catch(() => 0);
    if (hasInitial > 0) {
      loadingShotTaken = true;
      await page
        .screenshot({
          path: path.join(SHOT_DIR, `IM-LIST__${viewport.tag}__loading-after.png`),
        })
        .catch(() => {});
      mark('loading-screenshot');
    }
  }, 150);

  await nav;
  mark('navigation-settled');

  await page.waitForFunction(
    () => {
      const rows = document.querySelectorAll('app-items-list .ant-table-tbody tr:not(.ant-table-measure-row)');
      const initial = document.querySelector('app-items-list .items-table-initial-loading');
      const spin = document.querySelector('app-items-list .ant-spin-spinning');
      return rows.length > 0 && !initial && !spin;
    },
    { timeout: 120000 },
  );
  clearInterval(loadingPoll);
  mark('rows-visible-idle');

  await page.screenshot({
    path: path.join(SHOT_DIR, `IM-LIST__${viewport.tag}__loaded-after.png`),
  });

  const metrics = await page.evaluate(() => ({
    rows: document.querySelectorAll('app-items-list .ant-table-tbody tr:not(.ant-table-measure-row)').length,
    spinner: !!document.querySelector('app-items-list .ant-spin-spinning'),
    initialLoading: !!document.querySelector('app-items-list .items-table-initial-loading'),
    totalText: document.querySelector('app-items-list .registry-page-header__meta')?.textContent?.trim(),
    pagVisible: !!document.querySelector('app-items-list .registry-work-card__footer'),
  }));

  const refreshStart = Date.now();
  await page.locator('app-items-list .items-query-rail__btn').nth(1).click();
  await page.waitForFunction(
    () => !document.querySelector('app-items-list .items-table-initial-loading'),
    { timeout: 60000 },
  );
  await page
    .waitForFunction(() => !document.querySelector('app-items-list .ant-spin-spinning'), { timeout: 60000 })
    .catch(() => {});
  const refreshMs = Date.now() - refreshStart;
  mark('refresh-idle');

  await page.screenshot({
    path: path.join(SHOT_DIR, `IM-LIST__${viewport.tag}__refresh-after.png`),
  });

  await context.close();

  const responses = events.filter((e) => e.type === 'response');
  return {
    viewport: viewport.tag,
    marks: events.filter((e) => e.name),
    responses,
    metrics,
    refreshMs,
    duplicatePaths: responses.reduce((acc, r) => {
      acc[r.path] = (acc[r.path] || 0) + 1;
      return acc;
    }, {}),
    itemsApiMs: responses.find((r) => r.path === '/api/items' || r.path.endsWith('/items'))?.ms ?? null,
  };
}

async function run() {
  const slug = process.env.TENANT_SLUG || 'dx-airport-hotel';
  const auth = await mintForTenant(slug);
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const authState = {
    state: {
      user: {
        id: auth.userId,
        email: auth.email,
        tenantId: auth.tenant.id,
        role: auth.roleCode,
        permissions: auth.permissions,
        tenant: { id: auth.tenant.id, slug: auth.tenant.slug, name: auth.tenant.name },
        memberships: [{ tenantId: auth.tenant.id, tenantSlug: auth.tenant.slug, tenantName: auth.tenant.name }],
      },
      accessToken: auth.token,
      refreshToken: auth.refreshToken,
      currentTenant: { id: auth.tenant.id, slug: auth.tenant.slug, name: auth.tenant.name },
      isAuthenticated: true,
    },
  };

  const browser = await chromium.launch({ headless: true });
  const viewportRuns = [];
  let error = null;
  try {
    for (const vp of VIEWPORTS) {
      viewportRuns.push(await measureViewport(browser, auth, authState, vp));
    }
  } catch (e) {
    error = String(e?.message || e);
    throw e;
  } finally {
    await browser.close().catch(() => {});
    const trace = {
      runAt: new Date().toISOString(),
      tenant: { slug, name: auth.tenant.name, itemCount: auth.itemCount, email: auth.email },
      viewports: viewportRuns,
      error,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'ITEM_MASTER_LOADING_NETWORK_TRACE.json'), JSON.stringify(trace, null, 2));
    if (!error) console.log(JSON.stringify(trace, null, 2));
  }
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { run };
