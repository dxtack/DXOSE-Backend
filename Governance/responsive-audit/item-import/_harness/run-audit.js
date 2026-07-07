'use strict';

/*
 * TEMPORARY EVIDENCE HARNESS — Item Import Validation screen (Preview-only).
 * NOT product source. Lives under Governance/responsive-audit (evidence area).
 *
 * - Injects a fake authenticated session into localStorage (guard bypass).
 * - Mocks ALL /api/ calls (no backend, no DB writes, Confirm never invoked).
 * - Renders /inventory/items/import, drives Upload -> Preview, measures DOM, screenshots.
 *
 * Usage: node run-audit.js --phase before|after
 */

const path = require('path');
const fs = require('fs');

const HARNESS_DIR = __dirname;
const OUT_ROOT = path.resolve(HARNESS_DIR, '..');
const FRONTEND_ROOT = path.resolve(HARNESS_DIR, '..', '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));

const BASE = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4300';
const DUMMY = path.join(HARNESS_DIR, 'dummy-upload.csv');

const phaseArgIdx = process.argv.indexOf('--phase');
const PHASE = phaseArgIdx >= 0 ? process.argv[phaseArgIdx + 1] : 'before';

const VIEWPORTS = [
  { w: 1366, h: 768 },
  { w: 1536, h: 864 },
  { w: 1920, h: 1080 },
];
const ROW_COUNTS = [50, 200, 500];

const SHOT_DIR = path.join(OUT_ROOT, 'screenshots', PHASE);
fs.mkdirSync(SHOT_DIR, { recursive: true });

// ---- Mock preview generator (mixed valid/invalid/dup/multi-error/invalid price/store) ----
function makePreview(n) {
  const storeColumns = ['Main Store', 'Cold Room'];
  const preview = [];
  let valid = 0;
  let invalid = 0;
  for (let i = 1; i <= n; i++) {
    const issues = [];
    let status = 'VALID';
    const data = {
      name: `Item ${i}`,
      deptName: 'F&B',
      categoryName: 'Dry Goods',
      vendorName: 'ACME Supplies',
      baseUnitName: 'EA',
      unitPrice: 12.5,
      storeQuantities: { 'Main Store': 10, 'Cold Room': 5 },
    };
    if (i % 5 === 0) {
      status = 'ERROR';
      data.unitPrice = 'abc';
      issues.push({ field: 'unitPrice', message: 'Unit price must be a valid number' });
    }
    if (i % 7 === 0) {
      status = 'ERROR';
      data.name = '';
      data.deptName = 'UnknownDept';
      data.baseUnitName = 'XX';
      issues.push({ field: 'name', message: 'Name is required' });
      issues.push({ field: 'deptName', message: 'Department "UnknownDept" not found' });
      issues.push({ field: 'baseUnitName', message: 'Base unit "XX" is invalid' });
    }
    if (i % 11 === 0) {
      status = 'ERROR';
      data.storeQuantities = { 'Main Store': -3, 'Cold Room': 5 };
      issues.push({ field: 'storeQuantities.Main Store', message: 'Quantity cannot be negative' });
    }
    if (i % 13 === 0) {
      status = 'ERROR';
      data.name = 'Item DUP';
      issues.push({ field: 'name', message: 'Duplicate item name in file' });
    }
    if (status === 'ERROR') invalid++;
    else valid++;
    preview.push({ rowNum: i + 1, status, issues, errors: [], data });
  }
  return { preview, filePath: '/tmp/preview-mock.xlsx', total: n, valid, invalid, storeColumns, unknownColumns: [] };
}

const AUTH_STATE = {
  state: {
    user: {
      id: 'u-audit',
      email: 'auditor@test.local',
      firstName: 'Audit',
      lastName: 'Bot',
      role: 'ORG_MANAGER',
      tenantId: 't-audit',
      permissions: ['IMPORT_EXCEL', 'BASIC_DATA_EDIT', 'BASIC_DATA_VIEW', 'INVENTORY_VIEW'],
      tenant: { id: 't-audit', slug: 'audit-hotel', name: 'Audit Hotel', parentId: null },
      memberships: [
        { tenantId: 't-audit', tenantSlug: 'audit-hotel', tenantName: 'Audit Hotel', role: 'ORG_MANAGER', parentId: 't-org' },
      ],
    },
    accessToken: 'aaa.bbb.ccc',
    refreshToken: 'rrr.sss.ttt',
    currentTenant: { id: 't-audit', slug: 'audit-hotel', name: 'Audit Hotel', parentId: 't-org' },
    isAuthenticated: true,
  },
};

function jsonOk(data) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) };
}

async function installRoutes(page, getRowCount) {
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/items/import/preview')) {
      return route.fulfill(jsonOk(makePreview(getRowCount())));
    }
    if (url.includes('/items/check-requirements')) {
      return route.fulfill(
        jsonOk({
          canCreateItem: true,
          requirements: {
            departments: { count: 3 },
            units: { count: 3 },
            categories: { count: 3 },
            vendors: { count: 3 },
            locations: { count: 2 },
          },
          blockReason: null,
          isOpeningBalanceAllowed: false,
          obStatus: 'FINALIZED',
        }),
      );
    }
    if (url.includes('/settings/ob-eligible')) {
      return route.fulfill(jsonOk({ allowed: false, reason: 'OB finalized' }));
    }
    if (url.includes('/locations')) {
      return route.fulfill(
        jsonOk([
          { id: 'loc-main', name: 'Main Store', departmentId: null },
          { id: 'loc-cold', name: 'Cold Room', departmentId: null },
        ]),
      );
    }
    // Catch-all: safe empty success for shell widgets (notifications, nav, etc.)
    return route.fulfill(jsonOk([]));
  });
}

const MEASURE = () => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
  };
  const de = document.documentElement;
  const body = document.querySelector('.preview-nz-table .ant-table-body');
  // Count real data rows by their status pill (one per row) — avoids ng-zorro measure/placeholder rows.
  const dataRowCount = document.querySelectorAll('.preview-nz-table .ant-table-tbody .preview-status').length;
  const rowsEls = document.querySelectorAll('.preview-nz-table .ant-table-tbody > tr');
  const footer = document.querySelector('.item-import-page__footer-actions');
  const footerRect = footer ? footer.getBoundingClientRect() : null;
  const footerStyle = footer ? getComputedStyle(footer) : null;
  const bodyBottom = body ? Math.round(body.getBoundingClientRect().bottom) : null;
  let lastRowBottom = null;
  const statusPills = document.querySelectorAll('.preview-nz-table .ant-table-tbody .preview-status');
  if (statusPills.length) {
    const lastRow = statusPills[statusPills.length - 1].closest('tr') || rowsEls[rowsEls.length - 1];
    if (lastRow) lastRowBottom = Math.round(lastRow.getBoundingClientRect().bottom);
  }
  const bodyMetrics = body
    ? {
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        clientWidth: body.clientWidth,
        scrollWidth: body.scrollWidth,
        vScroll: body.scrollHeight > body.clientHeight + 1,
        hScroll: body.scrollWidth > body.clientWidth + 1,
      }
    : null;
  return {
    document: {
      clientWidth: de.clientWidth,
      scrollWidth: de.scrollWidth,
      clientHeight: de.clientHeight,
      scrollHeight: de.scrollHeight,
      pageScroll: de.scrollHeight > de.clientHeight + 1,
      pageScrollAmount: de.scrollHeight - de.clientHeight,
      hPageOverflow: de.scrollWidth > de.clientWidth + 1,
    },
    rects: {
      page: rect('.item-import-page'),
      panel: rect('.item-import-panel--grow'),
      header: rect('.item-import-page__header'),
      steps: rect('.item-import-page__steps'),
      summary: rect('.import-preview-grid'),
      filters: rect('.preview-filters'),
      warning: rect('.preview-warning'),
      tablePanel: rect('.preview-table-panel'),
      tableOuter: rect('.preview-table-outer'),
      tableHeader: rect('.preview-nz-table .ant-table-header'),
      footer: footerRect ? { top: Math.round(footerRect.top), bottom: Math.round(footerRect.bottom), h: Math.round(footerRect.height) } : null,
    },
    footer: footerRect
      ? {
          position: footerStyle.position,
          visibleInViewport: footerRect.top < de.clientHeight && footerRect.bottom > 0,
          height: Math.round(footerRect.height),
        }
      : null,
    tableBody: bodyMetrics,
    domRows: dataRowCount,
    lastRowBottom,
    // Footer overlaps the results area only if the scroll body's bottom edge sits below the footer top.
    footerOverlapsTable: footerRect && bodyBottom != null ? bodyBottom > footerRect.top + 1 : null,
  };
};

async function gotoImport(page) {
  await page.goto(`${BASE}/inventory/items/import`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.file-dropzone', { timeout: 60000 });
  // allow init API (mocked) + render to settle
  await page.waitForTimeout(600);
}

const PAGE_SIZE = 50; // front pagination size after fix; before-fix renders all rows so both satisfy this floor

async function runPreview(page, expectedTotal) {
  await page.setInputFiles('input.hidden-file-input', DUMMY);
  await page.waitForTimeout(150);
  const t0 = Date.now();
  await page.click('.item-import-panel .item-import-page__footer-actions button:last-child');
  await page.waitForSelector('.preview-nz-table .ant-table-tbody', { timeout: 60000 });
  // Preview arrives when summary shows the total AND the (paged) rows are painted.
  const expectedDomRows = Math.min(expectedTotal, PAGE_SIZE);
  await page.waitForFunction(
    ([total, minRows]) => {
      const grid = document.querySelector('.import-preview-grid');
      const rows = document.querySelectorAll('.preview-nz-table .ant-table-tbody .preview-status').length;
      return !!grid && grid.textContent.includes(String(total)) && rows >= minRows;
    },
    [expectedTotal, expectedDomRows],
    { timeout: 60000 },
  );
  const renderMs = Date.now() - t0;
  await page.waitForTimeout(200);
  return renderMs;
}

async function main() {
  const results = { phase: PHASE, generatedAt: new Date().toISOString(), viewports: [] };
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const vpKey = `${vp.w}x${vp.h}`;
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    await context.addInitScript((auth) => {
      window.localStorage.setItem('ose-auth', JSON.stringify(auth));
      window.localStorage.setItem('theme', 'light');
    }, AUTH_STATE);

    let rowCountForRoute = 50;
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('requestfailed', (r) => { failedRequests.push(`${r.method()} ${r.url()} ${r.failure() && r.failure().errorText}`); });
    await installRoutes(page, () => rowCountForRoute);

    const vpResult = { viewport: vpKey, files: [], consoleErrors, failedRequests, screenshots: [] };

    // 1) before-upload screenshot + measure
    await gotoImport(page);
    const beforeShot = path.join(SHOT_DIR, `IM-IMPORT-VALIDATION__${vpKey}__before-upload.png`);
    await page.screenshot({ path: beforeShot });
    vpResult.screenshots.push(beforeShot);

    for (const rc of ROW_COUNTS) {
      rowCountForRoute = rc;
      await gotoImport(page);
      const renderMs = await runPreview(page, rc);
      const m = await page.evaluate(MEASURE);

      // filter timing (measure on 500 only, but capture for all)
      const tf0 = Date.now();
      await page.click('.preview-filters button:nth-child(2)'); // Errors
      await page.waitForTimeout(120);
      const filterErrorsMs = Date.now() - tf0;
      const errorRowsDom = await page.evaluate(
        () => document.querySelectorAll('.preview-nz-table .ant-table-tbody .preview-status').length,
      );
      await page.click('.preview-filters button:first-child'); // back to All
      await page.waitForTimeout(100);

      const fileEntry = { rows: rc, renderMs, filterErrorsMs, errorRowsDom, measure: m };
      vpResult.files.push(fileEntry);

      if (rc === 500) {
        // top
        await page.evaluate(() => { const b = document.querySelector('.preview-nz-table .ant-table-body'); if (b) b.scrollTop = 0; });
        await page.waitForTimeout(150);
        let s = path.join(SHOT_DIR, `IM-IMPORT-VALIDATION__${vpKey}__top-500.png`);
        await page.screenshot({ path: s }); vpResult.screenshots.push(s);
        // middle
        await page.evaluate(() => { const b = document.querySelector('.preview-nz-table .ant-table-body'); if (b) b.scrollTop = Math.floor((b.scrollHeight - b.clientHeight) / 2); });
        await page.waitForTimeout(150);
        s = path.join(SHOT_DIR, `IM-IMPORT-VALIDATION__${vpKey}__mid-500.png`);
        await page.screenshot({ path: s }); vpResult.screenshots.push(s);
        // bottom
        await page.evaluate(() => { const b = document.querySelector('.preview-nz-table .ant-table-body'); if (b) b.scrollTop = b.scrollHeight; });
        await page.waitForTimeout(150);
        s = path.join(SHOT_DIR, `IM-IMPORT-VALIDATION__${vpKey}__bottom-500.png`);
        await page.screenshot({ path: s }); vpResult.screenshots.push(s);
        // horizontal scroll evidence (scroll body right if hScroll)
        await page.evaluate(() => { const b = document.querySelector('.preview-nz-table .ant-table-body'); if (b) b.scrollLeft = b.scrollWidth; });
        await page.waitForTimeout(150);
        s = path.join(SHOT_DIR, `IM-IMPORT-VALIDATION__${vpKey}__hscroll-500.png`);
        await page.screenshot({ path: s }); vpResult.screenshots.push(s);
      }
    }

    results.viewports.push(vpResult);
    await context.close();
  }

  await browser.close();
  const outJson = path.join(OUT_ROOT, `RUNTIME_${PHASE.toUpperCase()}.json`);
  fs.writeFileSync(outJson, JSON.stringify(results, null, 2), 'utf8');
  console.log(`[audit] phase=${PHASE} written -> ${outJson}`);
  // brief console summary
  for (const v of results.viewports) {
    for (const f of v.files) {
      const d = f.measure.document;
      const tb = f.measure.tableBody;
      console.log(
        `[${v.viewport}] rows=${f.rows} pageScroll=${d.pageScroll}(${d.pageScrollAmount}px) hOverflow=${d.hPageOverflow} tableV=${tb && tb.vScroll} tableH=${tb && tb.hScroll} bodyClientH=${tb && tb.clientHeight} bodyScrollH=${tb && tb.scrollHeight} domRows=${f.measure.domRows} render=${f.renderMs}ms footerOverlap=${f.measure.footerOverlapsTable} filterMs=${f.filterErrorsMs} consoleErrs=${v.consoleErrors.length}`,
      );
    }
  }
}

main().catch((e) => { console.error('[audit] FATAL', e); process.exit(1); });
