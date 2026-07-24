'use strict';

/**
 * Responsive Pilot — Item Master + Transfer Browser Runtime Measurement.
 *
 * READ-ONLY. Uses a minted read-only session (see responsive-pilot-discover.js)
 * to open every Item Master + Transfer internal screen at 3 viewports and record
 * real getBoundingClientRect() measurements, scroll ownership, table geometry,
 * footer/modal visibility, and content-consistency signals.
 *
 * Writes ONLY evidence artifacts under Governance/responsive-audit/pilot/.
 * NO production code/CSS/HTML changes. NO business database writes.
 */

const path = require('path');
const fs = require('fs');
const { discoverContext } = require('./responsive-pilot-discover');

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));

const FRONTEND_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const OUT_DIR = path.resolve(__dirname, '..', 'responsive-audit', 'pilot');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');

const PRIMARY_VIEWPORTS = [
  { label: '1366x768', width: 1366, height: 768, dpr: 1, scaling: 'OS100%' },
  { label: '1536x864', width: 1536, height: 864, dpr: 1, scaling: 'OS100%' },
  { label: '1920x1080', width: 1920, height: 1080, dpr: 1, scaling: 'OS100%' },
];
// Windows Display Scaling 125% at 100% browser zoom reduces the CSS viewport to
// physicalPixels / 1.25 while device pixel ratio becomes 1.25.
const SCALING125_VIEWPORTS = [
  { label: '1366x768@win125', width: 1093, height: 614, dpr: 1.25, scaling: 'OS125%' },
  { label: '1536x864@win125', width: 1229, height: 691, dpr: 1.25, scaling: 'OS125%' },
  { label: '1920x1080@win125', width: 1536, height: 864, dpr: 1.25, scaling: 'OS125%' },
];

function buildScreens(ctx) {
  const it = ctx.sample.itemId;
  const trf = ctx.sample.transfersByStatus || {};
  const draftTrf = trf.DRAFT || Object.values(trf)[0];
  const screens = [];

  // ---- Item Master ----
  screens.push({ id: 'IM-LIST', module: 'ItemMaster', name: 'Item Master List', family: 'REGISTRY_LIST', type: 'List', url: '/items', wait: 'table' });
  screens.push({ id: 'IM-ADD', module: 'ItemMaster', name: 'Add Item', family: 'CREATE_FORM', type: 'Create', url: '/items/new', wait: 'form' });
  if (it) screens.push({ id: 'IM-EDIT', module: 'ItemMaster', name: 'Edit Item', family: 'EDIT_FORM', type: 'Edit', url: `/items/${it}/edit`, wait: 'form' });
  screens.push({ id: 'IM-IMPORT', module: 'ItemMaster', name: 'Item Import Upload', family: 'IMPORT_WIZARD', type: 'Import', url: '/inventory/items/import', wait: 'any' });
  // Item view/image modals: opened from the list via row interaction (best-effort).
  screens.push({ id: 'IM-LIST-MODAL', module: 'ItemMaster', name: 'Item Master List (row modal attempt)', family: 'MODAL', type: 'Modal', url: '/items', wait: 'table', modalAttempt: 'itemRow' });

  // ---- Transfer ----
  screens.push({ id: 'TR-LIST', module: 'Transfer', name: 'Transfer List', family: 'REGISTRY_LIST', type: 'List', url: '/transfers', wait: 'table' });
  screens.push({ id: 'TR-NEW', module: 'Transfer', name: 'Create Transfer', family: 'CREATE_FORM', type: 'Create', url: '/transfers/new', wait: 'form' });
  if (draftTrf) screens.push({ id: 'TR-EDIT', module: 'Transfer', name: 'Edit Draft Transfer', family: 'EDIT_FORM', type: 'Edit', url: `/transfers/${draftTrf}/edit`, wait: 'form' });
  for (const [status, id] of Object.entries(trf)) {
    screens.push({ id: `TR-DETAIL-${status}`, module: 'Transfer', name: `Transfer Detail (${status})`, family: 'DETAIL_PAGE', type: 'Detail', url: `/transfers/${id}`, wait: 'detail', status });
  }
  return screens;
}

// ── In-browser measurement (serialized into page.evaluate) ──────────────────
function measureInPage() {
  const px = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
  const firstVisible = (selectors) => {
    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { el, sel };
      }
    }
    return null;
  };
  const rectOf = (hit) => {
    if (!hit) return null;
    const r = hit.el.getBoundingClientRect();
    const cs = getComputedStyle(hit.el);
    return {
      selector: hit.sel,
      x: px(r.x), y: px(r.y), width: px(r.width), height: px(r.height),
      right: px(r.right), bottom: px(r.bottom),
      paddingTop: px(parseFloat(cs.paddingTop)), paddingRight: px(parseFloat(cs.paddingRight)),
      paddingBottom: px(parseFloat(cs.paddingBottom)), paddingLeft: px(parseFloat(cs.paddingLeft)),
      maxWidth: cs.maxWidth, overflowY: cs.overflowY, overflowX: cs.overflowX,
      scrollWidth: hit.el.scrollWidth, clientWidth: hit.el.clientWidth,
      scrollHeight: hit.el.scrollHeight, clientHeight: hit.el.clientHeight,
    };
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const sider = firstVisible(['nz-sider', '.ant-layout-sider', 'aside', '[class*="sidebar"]', '[class*="sider"]']);
  const header = firstVisible(['nz-header', '.ant-layout-header', 'header', '[class*="app-header"]', '[class*="topbar"]', '[class*="page-header"]']);
  // Routed content = element after <router-outlet>, else main/content container.
  let content = null;
  const ro = document.querySelector('router-outlet');
  if (ro && ro.nextElementSibling) {
    const r = ro.nextElementSibling.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) content = { el: ro.nextElementSibling, sel: 'router-outlet + *' };
  }
  if (!content) content = firstVisible(['.ant-layout-content', 'main', '[class*="page-content"]', '[class*="content-area"]']);

  const siderR = rectOf(sider);
  const headerR = rectOf(header);
  const contentR = rectOf(content);

  // Outer card / main container inside content.
  const card = firstVisible(['.ant-card', '[class*="registry-canvas"]', '[class*="page-canvas"]', '[class*="card"]', '[class*="panel"]']);
  const cardR = rectOf(card);

  // Tables
  const tables = Array.from(document.querySelectorAll('.ant-table')).map((tbl) => {
    const containerEl = tbl.querySelector('.ant-table-container') || tbl;
    const bodyEl = tbl.querySelector('.ant-table-body') || tbl.querySelector('.ant-table-tbody');
    const cont = containerEl.getBoundingClientRect();
    const body = bodyEl ? bodyEl.getBoundingClientRect() : null;
    const ths = Array.from(tbl.querySelectorAll('.ant-table-thead th')).map((th) => th.innerText.trim()).filter(Boolean);
    const rows = tbl.querySelectorAll('.ant-table-tbody tr').length;
    const bcs = bodyEl ? getComputedStyle(bodyEl) : null;
    return {
      containerWidth: px(cont.width), containerHeight: px(cont.height),
      bodyWidth: body ? px(body.width) : null, bodyHeight: body ? px(body.height) : null,
      bodyScrollWidth: bodyEl ? bodyEl.scrollWidth : null, bodyClientWidth: bodyEl ? bodyEl.clientWidth : null,
      bodyScrollHeight: bodyEl ? bodyEl.scrollHeight : null, bodyClientHeight: bodyEl ? bodyEl.clientHeight : null,
      bodyMaxHeight: bcs ? bcs.maxHeight : null, bodyOverflowY: bcs ? bcs.overflowY : null,
      columns: ths, columnCount: ths.length, visibleRows: rows,
      horizontalScrollInside: bodyEl ? bodyEl.scrollWidth > bodyEl.clientWidth + 2 : false,
      verticalScrollInside: bodyEl ? bodyEl.scrollHeight > bodyEl.clientHeight + 2 : false,
    };
  });

  // Pagination / footer
  const pag = firstVisible(['.ant-pagination', '[class*="pagination"]']);
  const pagR = rectOf(pag);
  const footer = firstVisible(['[class*="footer"]', '.ant-card-actions', '[class*="actions-bar"]', '[class*="sticky"]']);
  const footerR = rectOf(footer);

  // Modal
  const modal = firstVisible(['.ant-modal', '.ant-drawer-content']);
  let modalInfo = null;
  if (modal) {
    const mr = modal.el.getBoundingClientRect();
    const bodyEl = modal.el.querySelector('.ant-modal-body, .ant-drawer-body');
    const footEl = modal.el.querySelector('.ant-modal-footer, .ant-drawer-footer');
    const b = bodyEl ? bodyEl.getBoundingClientRect() : null;
    const f = footEl ? footEl.getBoundingClientRect() : null;
    modalInfo = {
      width: px(mr.width), height: px(mr.height), top: px(mr.top), bottom: px(mr.bottom),
      bodyHeight: b ? px(b.height) : null,
      bodyScrolls: bodyEl ? bodyEl.scrollHeight > bodyEl.clientHeight + 2 : false,
      footerHeight: f ? px(f.height) : null,
      footerVisibleInViewport: f ? (f.bottom <= vh + 1 && f.top >= -1) : null,
      overflowsViewport: mr.bottom > vh + 1 || mr.top < -1 || mr.right > vw + 1 || mr.left < -1,
    };
  }

  // Scroll owners (elements that actually overflow vertically with scrollable overflow).
  const scrollOwners = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) continue;
    if (el.scrollHeight - el.clientHeight <= 2) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    let name = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') name += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    scrollOwners.push({ selector: name, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: cs.overflowY });
  }
  scrollOwners.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));

  const docEl = document.scrollingElement || document.documentElement;
  const pageVerticalScroll = docEl.scrollHeight > docEl.clientHeight + 2;
  const pageHorizontalScroll = docEl.scrollWidth > docEl.clientWidth + 2;

  // Error overlays / redirect signals.
  const errorOverlay = !!document.querySelector('vite-error-overlay') ||
    /compilation error|failed to compile/i.test(document.body?.innerText || '');
  const h1 = (document.querySelector('h1, .ant-page-header-heading-title, [class*="page-title"]')?.innerText || '').trim();

  // Content offsets relative to viewport.
  const offsets = contentR ? {
    left: contentR.x, top: contentR.y, right: px(vw - contentR.right), bottom: px(vh - contentR.bottom),
  } : null;

  // Blank area below last table within content.
  let blankBelowTable = null;
  const lastTable = document.querySelectorAll('.ant-table');
  if (lastTable.length && contentR) {
    const tb = lastTable[lastTable.length - 1].getBoundingClientRect();
    const pagBottom = pagR ? pagR.bottom : tb.bottom;
    blankBelowTable = px(contentR.bottom - Math.max(tb.bottom, pagBottom));
  }

  return {
    url: location.pathname + location.search,
    viewport: { width: vw, height: vh, dpr: window.devicePixelRatio },
    heading: h1,
    errorOverlay,
    appShell: {
      sider: siderR ? { width: siderR.width, height: siderR.height, x: siderR.x } : null,
      header: headerR ? { height: headerR.height, width: headerR.width, y: headerR.y } : null,
      content: contentR,
      contentAvailable: contentR ? { width: contentR.width, height: contentR.height } : null,
      contentOffsets: offsets,
    },
    outerCard: cardR,
    tables,
    pagination: pagR ? { width: pagR.width, height: pagR.height, y: pagR.y, bottom: pagR.bottom, visibleInViewport: pagR.bottom <= vh + 1 } : null,
    footer: footerR ? { width: footerR.width, height: footerR.height, y: footerR.y, bottom: footerR.bottom, visibleInViewport: footerR.bottom <= vh + 1 } : null,
    modal: modalInfo,
    scroll: {
      pageVerticalScroll, pageHorizontalScroll,
      owners: scrollOwners.slice(0, 6),
      doubleVerticalScroll: pageVerticalScroll && scrollOwners.some((o) => o.overflowY !== 'visible'),
    },
    blankBelowTable,
  };
}

async function classify(m, screen) {
  const flags = [];
  if (!m || m.errorOverlay) return { result: 'BLOCKED', flags: ['error-overlay-or-no-measure'] };
  // Redirect detection: expected route not reached.
  if (screen.url && !m.url.startsWith(screen.url.split('?')[0].replace(/\/$/, '')) && !(screen.url === '/items' && m.url.startsWith('/items'))) {
    // allow detail/edit param routes
  }
  const t = m.tables && m.tables[0];
  if (t && t.horizontalScrollInside) flags.push('table-horizontal-scroll');
  if (m.scroll && m.scroll.pageHorizontalScroll) flags.push('page-horizontal-scroll');
  if (m.scroll && m.scroll.owners && m.scroll.owners.length > 1 && m.scroll.pageVerticalScroll) flags.push('multiple-vertical-scroll-owners');
  if (typeof m.blankBelowTable === 'number' && m.blankBelowTable > 120) flags.push('blank-area-below-table');
  if (m.pagination && m.pagination.visibleInViewport === false) flags.push('pagination-below-fold');
  if (m.modal && m.modal.overflowsViewport) flags.push('modal-overflow');
  if (m.modal && m.modal.footerVisibleInViewport === false) flags.push('modal-footer-clipped');

  let result = 'PASS';
  if (flags.includes('page-horizontal-scroll') || flags.includes('modal-overflow') || flags.includes('modal-footer-clipped')) result = 'FAIL';
  else if (flags.length) result = 'PARTIAL';
  return { result, flags };
}

async function gotoAndSettle(page, url) {
  const resp = await page.goto(FRONTEND_URL + url, { waitUntil: 'domcontentloaded' }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(900);
  return resp;
}

async function waitForContent(page, wait) {
  const sels = {
    table: '.ant-table, .ant-empty, nz-empty',
    form: 'form, .ant-form, [class*="form"], input, nz-select',
    detail: '[class*="detail"], .ant-descriptions, [class*="timeline"], h1',
    any: 'h1, .ant-card, form, .ant-table, .ant-empty',
  };
  const sel = sels[wait] || sels.any;
  await page.waitForSelector(sel, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function run() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  console.log('[pilot] discovering read-only context…');
  const ctx = await discoverContext();
  console.log(`[pilot] tenant=${ctx.tenant.slug} user=${ctx.user.email} role=${ctx.user.role} authProbe=${ctx.authProbe.status}`);
  if (ctx.authProbe.status !== 200) throw new Error(`Auth probe failed: ${ctx.authProbe.status}`);

  const authState = {
    state: {
      user: {
        id: ctx.user.id, email: ctx.user.email, tenantId: ctx.tenant.id, role: ctx.user.role,
        permissions: ctx.permissions,
        tenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name, parentId: ctx.tenant.parentId },
        memberships: ctx.memberships,
      },
      accessToken: ctx.tokens.accessToken,
      refreshToken: ctx.tokens.refreshToken,
      currentTenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name, parentId: ctx.tenant.parentId },
      isAuthenticated: true,
    },
  };

  const screens = buildScreens(ctx);
  const browser = await chromium.launch({ headless: true });
  const results = [];

  const measureViewportSet = async (viewports, screenList, matrixName) => {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, baseURL: FRONTEND_URL });
      await context.addInitScript(([st, slug]) => {
        localStorage.setItem('ose-auth', st);
        localStorage.setItem('ose-last-property-slug', slug);
      }, [JSON.stringify(authState), ctx.tenant.slug]);
      const page = await context.newPage();
      // Prime storage on first load.
      await page.goto(FRONTEND_URL + '/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(600);

      for (const screen of screenList) {
        try {
          await gotoAndSettle(page, screen.url);
          await waitForContent(page, screen.wait);
          const landedUrl = new URL(page.url()).pathname;
          const expectedBase = screen.url.split('?')[0];
          let redirected = false;
          if (screen.type !== 'Modal') {
            // For param routes, compare prefix loosely.
            const base = expectedBase.replace(/\/(new|edit)$/, '');
            redirected = !landedUrl.includes(expectedBase.split('/')[1]);
          }

          if (screen.modalAttempt === 'itemRow') {
            const row = page.locator('.ant-table-tbody tr').first();
            if (await row.count()) { await row.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(700); }
          }

          const m = await page.evaluate(measureInPage);
          const cls = await classify(m, screen);
          if (redirected && screen.type !== 'Modal' && !landedUrl.startsWith(expectedBase.replace(/\/(new|edit)$/, ''))) {
            cls.result = 'BLOCKED'; cls.flags.push(`redirected-to:${landedUrl}`);
          }

          const record = { matrix: matrixName, screenId: screen.id, module: screen.module, name: screen.name, family: screen.family, type: screen.type, status: screen.status || null, requestedUrl: screen.url, landedUrl, viewport: vp.label, viewportSize: { w: vp.width, h: vp.height, dpr: vp.dpr, scaling: vp.scaling }, result: cls.result, flags: cls.flags, measurement: m };
          results.push(record);

          const needShot = cls.result !== 'PASS' || cls.flags.length > 0 || (screen.modalAttempt && m.modal);
          if (needShot) {
            const file = path.join(SHOT_DIR, `${screen.id}__${vp.label}.png`);
            await page.screenshot({ path: file, fullPage: true }).catch(() => {});
            record.screenshot = path.relative(OUT_DIR, file).replace(/\\/g, '/');
          }
          console.log(`[pilot] ${vp.label} ${screen.id} -> ${cls.result} ${cls.flags.join(',')}`);
        } catch (e) {
          results.push({ matrix: matrixName, screenId: screen.id, name: screen.name, viewport: vp.label, result: 'BLOCKED', flags: [`exception:${e.message}`], measurement: null });
          console.log(`[pilot] ${vp.label} ${screen.id} -> BLOCKED ${e.message}`);
        }
      }
      await context.close();
    }
  };

  await measureViewportSet(PRIMARY_VIEWPORTS, screens, 'primary');
  // Compact 125% matrix on a representative subset.
  const subset = screens.filter((s) => ['IM-LIST', 'IM-ADD', 'TR-LIST', 'TR-NEW', 'TR-DETAIL-POSTED', 'TR-DETAIL-DRAFT'].includes(s.id));
  await measureViewportSet(SCALING125_VIEWPORTS, subset, 'scaling125');

  await browser.close();

  const runInfo = {
    runAt: new Date().toISOString(),
    frontendUrl: FRONTEND_URL,
    api: ctx.api,
    tenant: ctx.tenant,
    account: { email: ctx.user.email, role: ctx.user.role, permissionCount: ctx.permissions.length },
    permissionFlags: ctx.permissionFlags,
    transferStatusCounts: ctx.transferStatusCounts,
    sample: ctx.sample,
    viewportsPrimary: PRIMARY_VIEWPORTS,
    viewportsScaling125: SCALING125_VIEWPORTS,
    scalingMethodology: 'Windows 125% is represented by shrinking the CSS viewport to physical/1.25 with deviceScaleFactor=1.25 at 100% browser zoom. Primary matrix uses OS=100% (CSS px == physical).',
    screensPlanned: screens.map((s) => ({ id: s.id, name: s.name, family: s.family, url: s.url })),
    zeroWrites: true,
    notes: [
      'Session token minted in-memory (read-only navigation); no login/refresh row persisted.',
      'Item import Preview/Validation/Failed-Rows/Confirm require an upload+parse round-trip and were NOT exercised to honor ZERO DATABASE WRITES; only the Import Upload screen was measured.',
    ],
  };

  fs.writeFileSync(path.join(OUT_DIR, 'ITEM_MASTER_TRANSFER_RUNTIME_RESULTS.json'), JSON.stringify({ runInfo, results }, null, 2));
  console.log(`[pilot] wrote ${results.length} measurements`);
  return { runInfo, results };
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((e) => { console.error('MEASURE_FATAL', e); process.exit(1); });
}

module.exports = { run };
