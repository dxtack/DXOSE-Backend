'use strict';
/* Cosmetic 1366 tightening verification — Preview-only, mocked API, port 4200. No Confirm. */
const path = require('path');
const fs = require('fs');

const HARNESS_DIR = __dirname;
const OUT_ROOT = path.resolve(HARNESS_DIR, '..');
const FRONTEND_ROOT = path.resolve(HARNESS_DIR, '..', '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));

const BASE = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const DUMMY = path.join(HARNESS_DIR, 'dummy-upload.csv');
const SHOT_DIR = path.join(OUT_ROOT, 'screenshots', 'compact-after');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const VIEWPORTS = [{ w: 1366, h: 768 }, { w: 1536, h: 864 }, { w: 1920, h: 1080 }];
const ROWS = 500;

function makePreview(n) {
  const storeColumns = ['Main Store', 'Cold Room'];
  const preview = [];
  let valid = 0, invalid = 0;
  for (let i = 1; i <= n; i++) {
    const issues = []; let status = 'VALID';
    const data = { name: `Item ${i}`, deptName: 'F&B', categoryName: 'Dry Goods', vendorName: 'ACME Supplies', baseUnitName: 'EA', unitPrice: 12.5, storeQuantities: { 'Main Store': 10, 'Cold Room': 5 } };
    if (i % 5 === 0) { status = 'ERROR'; data.unitPrice = 'abc'; issues.push({ field: 'unitPrice', message: 'Unit price must be a valid number' }); }
    if (i % 7 === 0) { status = 'ERROR'; data.name = ''; data.deptName = 'UnknownDept'; issues.push({ field: 'name', message: 'Name is required' }); issues.push({ field: 'deptName', message: 'Department "UnknownDept" not found' }); }
    if (status === 'ERROR') invalid++; else valid++;
    preview.push({ rowNum: i + 1, status, issues, errors: [], data });
  }
  return { preview, filePath: '/tmp/preview-mock.xlsx', total: n, valid, invalid, storeColumns, unknownColumns: [] };
}

const AUTH = { state: { user: {
  id: 'u-audit', email: 'auditor@test.local', firstName: 'Audit', lastName: 'Bot', role: 'ORG_MANAGER', tenantId: 't-audit',
  permissions: ['IMPORT_EXCEL','BASIC_DATA_EDIT','BASIC_DATA_VIEW','INVENTORY_VIEW'],
  tenant: { id: 't-audit', slug: 'audit-hotel', name: 'Audit Hotel', parentId: null },
  memberships: [{ tenantId: 't-audit', tenantSlug: 'audit-hotel', tenantName: 'Audit Hotel', role: 'ORG_MANAGER', parentId: 't-org' }],
}, accessToken: 'a.b.c', refreshToken: 'r.s.t', currentTenant: { id: 't-audit', slug: 'audit-hotel', name: 'Audit Hotel', parentId: 't-org' }, isAuthenticated: true } };

function ok(d){return {status:200,contentType:'application/json',body:JSON.stringify({success:true,data:d})};}

const MEASURE = () => {
  const de = document.documentElement;
  const body = document.querySelector('.preview-nz-table .ant-table-body');
  const footer = document.querySelector('.item-import-page__footer-actions');
  const fr = footer ? footer.getBoundingClientRect() : null;
  const pills = document.querySelectorAll('.preview-nz-table .ant-table-tbody .preview-status');
  const rowH = pills.length ? Math.round(pills[0].closest('tr').getBoundingClientRect().height) : null;
  const bodyBottom = body ? Math.round(body.getBoundingClientRect().bottom) : null;
  return {
    pageScroll: de.scrollHeight > de.clientHeight + 1,
    pageScrollAmount: de.scrollHeight - de.clientHeight,
    hPageOverflow: de.scrollWidth > de.clientWidth + 1,
    bodyClientH: body ? body.clientHeight : null,
    bodyScrollH: body ? body.scrollHeight : null,
    tableVScroll: body ? body.scrollHeight > body.clientHeight + 1 : null,
    tableHScroll: body ? body.scrollWidth > body.clientWidth + 1 : null,
    rowHeight: rowH,
    visibleRows: (body && rowH) ? Math.round((body.clientHeight / rowH) * 10) / 10 : null,
    domRows: pills.length,
    footerVisible: fr ? (fr.top < de.clientHeight && fr.bottom > 0) : null,
    footerOverlapsTable: (fr && bodyBottom != null) ? bodyBottom > fr.top + 1 : null,
    subtitleVisible: !!document.querySelector('.item-import-page__meta') && getComputedStyle(document.querySelector('.item-import-page__meta')).display !== 'none',
  };
};

async function run() {
  const results = { generatedAt: new Date().toISOString(), rows: ROWS, viewports: [] };
  const browser = await chromium.launch({ headless: true });
  for (const vp of VIEWPORTS) {
    const key = `${vp.w}x${vp.h}`;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    await ctx.addInitScript((a) => { window.localStorage.setItem('ose-auth', JSON.stringify(a)); }, AUTH);
    const page = await ctx.newPage();
    const consoleErrors = [], failed = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('requestfailed', r => failed.push(`${r.method()} ${r.url()}`));
    await page.route('**/api/**', (route) => {
      const u = route.request().url();
      if (u.includes('/items/import/preview')) return route.fulfill(ok(makePreview(ROWS)));
      if (u.includes('/items/check-requirements')) return route.fulfill(ok({ canCreateItem: true, requirements: { departments:{count:3}, units:{count:3}, categories:{count:3}, vendors:{count:3}, locations:{count:2} }, isOpeningBalanceAllowed: false, obStatus: 'FINALIZED' }));
      if (u.includes('/settings/ob-eligible')) return route.fulfill(ok({ allowed: false }));
      if (u.includes('/locations')) return route.fulfill(ok([{ id:'loc-main', name:'Main Store', departmentId:null }, { id:'loc-cold', name:'Cold Room', departmentId:null }]));
      return route.fulfill(ok([]));
    });
    await page.goto(`${BASE}/inventory/items/import`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.file-dropzone', { timeout: 60000 });
    await page.waitForTimeout(500);
    await page.setInputFiles('input.hidden-file-input', DUMMY);
    await page.waitForTimeout(150);
    await page.click('.item-import-panel .item-import-page__footer-actions button:last-child');
    await page.waitForSelector('.preview-nz-table .ant-table-tbody', { timeout: 60000 });
    await page.waitForFunction(() => {
      const g = document.querySelector('.import-preview-grid');
      const r = document.querySelectorAll('.preview-nz-table .ant-table-tbody .preview-status').length;
      return g && g.textContent.includes('500') && r >= 1;
    }, null, { timeout: 60000 });
    await page.evaluate(() => { const b = document.querySelector('.preview-nz-table .ant-table-body'); if (b) b.scrollTop = 0; });
    await page.waitForTimeout(300);
    const m = await page.evaluate(MEASURE);
    const shot = path.join(SHOT_DIR, `IM-IMPORT-VALIDATION__${key}__top-500.png`);
    await page.screenshot({ path: shot });
    results.viewports.push({ viewport: key, measure: m, consoleErrors, failedRequests: failed, screenshot: shot });
    console.log(`[${key}] bodyClientH=${m.bodyClientH} rowH=${m.rowHeight} visibleRows=${m.visibleRows} pageScroll=${m.pageScroll}(${m.pageScrollAmount}) hOverflow=${m.hPageOverflow} tableV=${m.tableVScroll} tableH=${m.tableHScroll} footerVisible=${m.footerVisible} footerOverlap=${m.footerOverlapsTable} subtitle=${m.subtitleVisible} domRows=${m.domRows} errs=${consoleErrors.length} failed=${failed.length}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT_ROOT, 'RUNTIME_COMPACT_AFTER.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('written -> RUNTIME_COMPACT_AFTER.json');
}
run().catch(e => { console.error('FATAL', e); process.exit(1); });
