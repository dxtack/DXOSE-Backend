'use strict';

/**
 * Item Master vs Workflow Pipeline — side-by-side runtime comparison.
 * Writes to Governance/responsive-audit/workflow-pipeline/
 */

const path = require('path');
const fs = require('fs');
const { discoverWfpContext } = require('./run-measure');

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));

const FRONTEND_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const OUT_DIR = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots', 'compare');
const VIEWPORTS = [
  { label: '1366x768', width: 1366, height: 768 },
  { label: '1536x864', width: 1536, height: 864 },
  { label: '1920x1080', width: 1920, height: 1080 },
];

function measureScreen(selectors) {
  const px = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      top: px(r.top),
      bottom: px(r.bottom),
      height: px(r.height),
      width: px(r.width),
      overflowY: cs.overflowY,
      maxHeight: cs.maxHeight,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    };
  };

  const docEl = document.scrollingElement || document.documentElement;
  const root = document.querySelector(selectors.root);
  const pageHeader = document.querySelector(selectors.pageHeader);
  const kpis = document.querySelector(selectors.kpis);
  const filters = document.querySelector(selectors.filters);
  const card = document.querySelector(selectors.card);
  const scrollShell = document.querySelector(selectors.scrollShell);
  const footer = document.querySelector(selectors.footer);
  const table = document.querySelector(`${selectors.root} .ant-table`);
  const tHeader = table?.querySelector('.ant-table-header');
  const tBody = table?.querySelector('.ant-table-body');
  const siderMenu = document.querySelector('.main-shell__menu');

  const rowEls = tBody
    ? Array.from(tBody.querySelectorAll('tr:not(.ant-table-measure-row)'))
    : [];
  const rowHeights = rowEls.map((tr) => px(tr.getBoundingClientRect().height));
  const avgRowHeight =
    rowHeights.length > 0 ? px(rowHeights.reduce((a, b) => a + b, 0) / rowHeights.length) : null;

  let fullyVisibleRows = 0;
  if (tBody) {
    const bodyTop = tBody.getBoundingClientRect().top;
    const bodyBottom = tBody.getBoundingClientRect().bottom;
    for (const tr of rowEls) {
      const r = tr.getBoundingClientRect();
      if (r.top >= bodyTop - 0.5 && r.bottom <= bodyBottom + 0.5 && r.height > 0) {
        fullyVisibleRows += 1;
      }
    }
  }

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
    owners.push({
      selector: name,
      overflowY: cs.overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      delta: el.scrollHeight - el.clientHeight,
    });
  }
  owners.sort((a, b) => b.delta - a.delta);

  let menuScrollbarVisible = false;
  if (siderMenu) {
    const cs = getComputedStyle(siderMenu);
    menuScrollbarVisible =
      siderMenu.scrollHeight > siderMenu.clientHeight + 2 &&
      cs.overflowY !== 'visible' &&
      cs.scrollbarWidth !== 'none';
    try {
      const sw = siderMenu.offsetWidth - siderMenu.clientWidth;
      if (sw > 2) menuScrollbarVisible = true;
    } catch {
      /* ignore */
    }
  }

  const contentTop = root?.getBoundingClientRect().top ?? null;
  const tableTop = card?.getBoundingClientRect().top ?? tHeader?.getBoundingClientRect().top ?? null;

  return {
    document: {
      scrollHeight: docEl.scrollHeight,
      clientHeight: docEl.clientHeight,
      pageVerticalScroll: docEl.scrollHeight > docEl.clientHeight + 2,
    },
    chrome: {
      contentTop,
      distanceToTable: contentTop != null && tableTop != null ? px(tableTop - contentTop) : null,
      pageHeader: rect(pageHeader),
      kpis: rect(kpis),
      filters: rect(filters),
      gaps: {
        headerToKpis:
          pageHeader && kpis ? px(kpis.getBoundingClientRect().top - pageHeader.getBoundingClientRect().bottom) : null,
        kpisToFilters:
          kpis && filters ? px(filters.getBoundingClientRect().top - kpis.getBoundingClientRect().bottom) : null,
        filtersToCard: filters && card ? px(card.getBoundingClientRect().top - filters.getBoundingClientRect().bottom) : null,
      },
    },
    table: {
      card: rect(card),
      scrollShell: rect(scrollShell),
      header: rect(tHeader),
      body: rect(tBody),
      footer: footer ? { ...rect(footer), visibleInViewport: footer.getBoundingClientRect().bottom <= window.innerHeight + 1 } : null,
      rowHeights,
      avgRowHeight,
      dataRowCount: rowEls.length,
      fullyVisibleRows,
      bodyVerticalScroll: tBody ? tBody.scrollHeight > tBody.clientHeight + 2 : null,
    },
    sidebar: {
      menu: rect(siderMenu),
      menuInternalScroll: siderMenu ? siderMenu.scrollHeight > siderMenu.clientHeight + 2 : null,
      menuScrollbarVisible,
    },
    scroll: {
      verticalOwners: owners.slice(0, 6),
      doubleScroll:
        docEl.scrollHeight > docEl.clientHeight + 2 &&
        owners.some((o) => o.selector.includes('ant-table-body')),
    },
    blankBelowCard:
      root && card ? px(root.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom) : null,
  };
}

const SCREEN_CONFIG = {
  IM: {
    route: '/items',
    wait: 'app-items-list .ant-table, app-items-list .ant-empty',
    selectors: {
      root: 'app-items-list',
      pageHeader: 'app-items-list .registry-page-header, app-items-list .items-page__header',
      kpis: null,
      filters: 'app-items-list .registry-query-band',
      card: 'app-items-list .registry-work-card',
      scrollShell: 'app-items-list .registry-work-card__scroll',
      footer: 'app-items-list .registry-work-card__footer',
    },
  },
  WFP: {
    route: '/workflow-pipeline',
    wait: 'app-workflow-pipeline .ant-table, app-workflow-pipeline .wfp-board--empty',
    selectors: {
      root: 'app-workflow-pipeline',
      pageHeader: 'app-workflow-pipeline .wfp-page__header',
      kpis: 'app-workflow-pipeline .wfp-kpis',
      filters: 'app-workflow-pipeline .wfp-query-band',
      card: 'app-workflow-pipeline .workbench-work-card',
      scrollShell: 'app-workflow-pipeline .workbench-work-card__scroll',
      footer: 'app-workflow-pipeline .workbench-work-card__footer',
    },
  },
};

async function captureScreen(page, cfg, vpLabel, screenId) {
  await page.goto(FRONTEND_URL + cfg.route, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForSelector(cfg.wait, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const measurement = await page.evaluate(measureScreen, cfg.selectors);
  const shot = path.join(SHOT_DIR, `${screenId}__${vpLabel}__viewport.png`);
  await page.screenshot({ path: shot, fullPage: false });
  return { screenId, viewport: vpLabel, measurement, screenshot: path.relative(OUT_DIR, shot).replace(/\\/g, '/') };
}

async function run() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ctx = await discoverWfpContext();
  const authState = {
    state: {
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        tenantId: ctx.tenant.id,
        role: ctx.user.role,
        permissions: ctx.permissions,
        tenant: ctx.tenant,
        memberships: ctx.memberships,
      },
      accessToken: ctx.tokens.accessToken,
      refreshToken: ctx.tokens.refreshToken,
      currentTenant: ctx.tenant,
      isAuthenticated: true,
    },
  };

  const results = [];
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const bctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    await bctx.addInitScript(
      ([st, slug]) => {
        localStorage.setItem('ose-auth', st);
        localStorage.setItem('ose-last-property-slug', slug);
      },
      [JSON.stringify(authState), ctx.tenant.slug],
    );
    const page = await bctx.newPage();
    await page.goto(FRONTEND_URL + '/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(400);

    const im = await captureScreen(page, SCREEN_CONFIG.IM, vp.label, 'IM-LIST');
    const wfp = await captureScreen(page, SCREEN_CONFIG.WFP, vp.label, 'WFP');
    results.push({ viewport: vp.label, im, wfp });

    console.log(
      `[compare] ${vp.label} IM rows=${im.measurement.table.fullyVisibleRows} bodyH=${im.measurement.table.body?.clientHeight} | WFP rows=${wfp.measurement.table.fullyVisibleRows} bodyH=${wfp.measurement.table.body?.clientHeight} menuScrollVis=${wfp.measurement.sidebar.menuScrollbarVisible} pageScroll=${wfp.measurement.document.pageVerticalScroll}`,
    );
    await bctx.close();
  }

  await browser.close();

  const outFile = path.join(OUT_DIR, 'WORKFLOW_PIPELINE_COMPARE_RUNTIME.json');
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        tenant: ctx.tenant,
        account: ctx.user,
        viewports: VIEWPORTS.map((v) => v.label),
        results,
      },
      null,
      2,
    ),
  );
  console.log(`[compare] wrote ${outFile}`);
}

if (require.main === module) {
  run().catch((e) => {
    console.error('COMPARE_FATAL', e);
    process.exit(1);
  });
}

module.exports = { run };
