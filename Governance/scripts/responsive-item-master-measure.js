'use strict';

/**
 * Item Master List (/items) — Browser Runtime Measurement (remediation verify).
 *
 * READ-ONLY. Uses the minted read-only session from responsive-pilot-discover.js
 * to open ONLY the Item Master List at 1366x768 / 1536x864 / 1920x1080 and record
 * real getBoundingClientRect() geometry for the shell, sider, header, content,
 * registry canvas, work card, table container, table body, footer/pagination,
 * columns/actions, scroll ownership and blank area.
 *
 * Writes ONLY evidence under Governance/responsive-audit/item-master/.
 * NO production code/CSS/HTML changes. NO business database writes.
 *
 * PHASE env var ("before" | "after", default "after") only labels the output.
 */

const path = require('path');
const fs = require('fs');
const { discoverContext } = require('./responsive-pilot-discover');

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));

const FRONTEND_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const PHASE = (process.env.PHASE || 'after').toLowerCase();
const OUT_DIR = path.resolve(__dirname, '..', 'responsive-audit', 'item-master');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');

const VIEWPORTS = [
  { label: '1366x768', width: 1366, height: 768, dpr: 1 },
  { label: '1536x864', width: 1536, height: 864, dpr: 1 },
  { label: '1920x1080', width: 1920, height: 1080, dpr: 1 },
];

function measureInPage() {
  const px = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
  const q = (sel) => document.querySelector(sel);
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: px(r.x), y: px(r.y), width: px(r.width), height: px(r.height),
      right: px(r.right), bottom: px(r.bottom),
      overflowY: cs.overflowY, overflowX: cs.overflowX, maxHeight: cs.maxHeight,
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    };
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const docEl = document.scrollingElement || document.documentElement;

  const shell = q('.main-shell.ant-layout') || q('.main-shell');
  const sider = q('.main-shell__sider') || q('nz-sider.main-shell__sider') || q('.ant-layout-sider');
  const siderMenu = q('.main-shell__menu');
  const siderFooter = q('.main-shell__sider .sider-footer');
  const header = q('.main-shell__header') || q('.ant-layout-header');
  const content = q('.main-shell__content') || q('.ant-layout-content');
  const inner = q('.main-shell__inner');
  const canvas = q('app-items-list');
  const opsPage = q('app-items-list .registry-ops-page');
  const card = q('app-items-list .registry-work-card');
  const scrollShell = q('app-items-list .registry-work-card__scroll');
  const footer = q('app-items-list .registry-work-card__footer');
  const pagination = q('app-items-list .registry-work-card__footer .ant-pagination, app-items-list .ant-pagination');

  const table = q('app-items-list .ant-table');
  const tContainer = table ? table.querySelector('.ant-table-container') : null;
  const tHeader = table ? table.querySelector('.ant-table-header') : null;
  const tBody = table ? table.querySelector('.ant-table-body') : null;
  const ths = table ? Array.from(table.querySelectorAll('.ant-table-thead th')).map((th) => th.innerText.trim()) : [];
  const columns = ths.map((c) => (c === '' ? '(blank)' : c));
  const dataRows = table ? table.querySelectorAll('.ant-table-tbody tr:not(.ant-table-measure-row)').length : 0;

  // Actions column reachability: last body cell of first data row within viewport.
  let actionsReachable = null;
  let actionsCell = null;
  if (table) {
    const firstRow = table.querySelector('.ant-table-tbody tr:not(.ant-table-measure-row)');
    if (firstRow) {
      const cells = firstRow.querySelectorAll('td');
      const last = cells[cells.length - 1];
      if (last) {
        const r = last.getBoundingClientRect();
        actionsCell = { x: px(r.x), right: px(r.right), y: px(r.y), bottom: px(r.bottom), width: px(r.width) };
        actionsReachable = r.right <= vw + 1 && r.left >= -1 && r.width > 0;
      }
    }
  }

  // Vertical scroll owners (real overflow with scrollable overflow-y).
  const owners = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) continue;
    if (el.scrollHeight - el.clientHeight <= 2) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    let name = el.tagName.toLowerCase();
    if (typeof el.className === 'string' && el.className.trim()) {
      name += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    }
    owners.push({ selector: name, overflowY: cs.overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, delta: el.scrollHeight - el.clientHeight });
  }
  owners.sort((a, b) => b.delta - a.delta);

  // Blank area below the table body / footer inside the card.
  let blankBelowTable = null;
  if (card && (tBody || footer)) {
    const cardBottom = card.getBoundingClientRect().bottom;
    const anchor = footer ? footer.getBoundingClientRect().bottom : tBody.getBoundingClientRect().bottom;
    blankBelowTable = px(cardBottom - anchor);
  }

  const errorOverlay = !!document.querySelector('vite-error-overlay') ||
    /compilation error|failed to compile|overlay/i.test(document.querySelector('vite-error-overlay')?.textContent || '');

  return {
    url: location.pathname + location.search,
    heading: (q('.registry-page-header__title')?.innerText || q('h1')?.innerText || '').trim(),
    errorOverlay,
    viewport: { width: vw, height: vh, dpr: window.devicePixelRatio },
    document: {
      scrollHeight: docEl.scrollHeight, clientHeight: docEl.clientHeight,
      scrollWidth: docEl.scrollWidth, clientWidth: docEl.clientWidth,
      pageVerticalScroll: docEl.scrollHeight > docEl.clientHeight + 2,
      pageHorizontalScroll: docEl.scrollWidth > docEl.clientWidth + 2,
    },
    shell: rect(shell),
    sider: rect(sider),
    siderMenu: siderMenu ? { ...rect(siderMenu), internalScroll: siderMenu.scrollHeight > siderMenu.clientHeight + 2 } : null,
    siderFooter: siderFooter ? { ...rect(siderFooter), reachableInViewport: siderFooter.getBoundingClientRect().bottom <= vh + 1 && siderFooter.getBoundingClientRect().top >= -1 } : null,
    header: rect(header),
    content: rect(content),
    inner: rect(inner),
    canvas: rect(canvas),
    opsPage: rect(opsPage),
    card: rect(card),
    scrollShell: rect(scrollShell),
    table: {
      container: rect(tContainer),
      header: rect(tHeader),
      body: rect(tBody),
      columns,
      columnCount: columns.length,
      dataRows,
      bodyHorizontalScroll: tBody ? tBody.scrollWidth > tBody.clientWidth + 2 : null,
      bodyVerticalScroll: tBody ? tBody.scrollHeight > tBody.clientHeight + 2 : null,
    },
    footer: footer ? { ...rect(footer), visibleInViewport: footer.getBoundingClientRect().bottom <= vh + 1 } : null,
    pagination: pagination ? { ...rect(pagination), visibleInViewport: pagination.getBoundingClientRect().bottom <= vh + 1 } : null,
    actions: { reachable: actionsReachable, cell: actionsCell },
    scroll: {
      verticalOwners: owners.slice(0, 6),
      verticalOwnerCount: owners.length,
      doubleScroll: (docEl.scrollHeight > docEl.clientHeight + 2) && owners.length >= 1,
    },
    blankBelowTable,
  };
}

async function gotoItems(page) {
  await page.goto(FRONTEND_URL + '/items', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
  await page.waitForSelector('app-items-list .ant-table, app-items-list .ant-empty', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function run() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  console.log(`[im-measure] PHASE=${PHASE} discovering read-only context…`);
  const ctx = await discoverContext();
  console.log(`[im-measure] tenant=${ctx.tenant.slug} user=${ctx.user.email} role=${ctx.user.role} authProbe=${ctx.authProbe.status}`);
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

  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, baseURL: FRONTEND_URL });
    await context.addInitScript(([st, slug]) => {
      localStorage.setItem('ose-auth', st);
      localStorage.setItem('ose-last-property-slug', slug);
    }, [JSON.stringify(authState), ctx.tenant.slug]);
    const page = await context.newPage();
    await page.goto(FRONTEND_URL + '/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(700);

    await gotoItems(page);
    const m = await page.evaluate(measureInPage);

    // Viewport-clipped screenshot (what the user actually sees) + full-page (scroll evidence).
    const shotView = path.join(SHOT_DIR, `IM-LIST__${vp.label}__${PHASE}__viewport.png`);
    const shotFull = path.join(SHOT_DIR, `IM-LIST__${vp.label}__${PHASE}__fullpage.png`);
    await page.screenshot({ path: shotView, fullPage: false }).catch(() => {});
    await page.screenshot({ path: shotFull, fullPage: true }).catch(() => {});

    results.push({
      screenId: 'IM-LIST', phase: PHASE, viewport: vp.label, viewportSize: vp,
      landedUrl: new URL(page.url()).pathname,
      measurement: m,
      screenshots: {
        viewport: path.relative(OUT_DIR, shotView).replace(/\\/g, '/'),
        fullPage: path.relative(OUT_DIR, shotFull).replace(/\\/g, '/'),
      },
    });
    console.log(`[im-measure] ${vp.label} pageScroll=${m.document.pageVerticalScroll} bodyH=${m.table.body?.clientHeight} pagVisible=${m.pagination?.visibleInViewport} blank=${m.blankBelowTable} owners=${m.scroll.verticalOwnerCount} err=${m.errorOverlay}`);
    await context.close();
  }
  await browser.close();

  const payload = {
    runInfo: {
      runAt: new Date().toISOString(), phase: PHASE, frontendUrl: FRONTEND_URL,
      screen: { id: 'IM-LIST', name: 'Item Master List', route: '/items', component: 'ItemsListComponent' },
      tenant: ctx.tenant, account: { email: ctx.user.email, role: ctx.user.role, permissionCount: ctx.permissions.length },
      viewports: VIEWPORTS, zeroWrites: true,
    },
    results,
  };
  const suffix = PHASE === 'before' ? '_BEFORE' : PHASE === 'after' ? '' : `_${PHASE.toUpperCase()}`;
  const outFile = path.join(OUT_DIR, `ITEM_MASTER_LIST_RUNTIME_RESULTS${suffix}.json`);
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(`[im-measure] wrote ${outFile}`);
  return payload;
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((e) => { console.error('IM_MEASURE_FATAL', e); process.exit(1); });
}

module.exports = { run };
