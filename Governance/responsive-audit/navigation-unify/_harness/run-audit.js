'use strict';

/**
 * TEMPORARY EVIDENCE HARNESS — Navigation unify (Back/Cancel) runtime verification.
 * NOT product source. Mocks API; no backend writes.
 *
 * Usage: node run-audit.js
 * Env: PILOT_FRONTEND_URL (default http://127.0.0.1:4300)
 */

const path = require('path');
const fs = require('fs');

const HARNESS_DIR = __dirname;
const OUT_ROOT = path.resolve(HARNESS_DIR, '..');
const FRONTEND_ROOT = path.resolve(HARNESS_DIR, '..', '..', '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));

const BASE = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4300';
const SHOT_DIR = path.join(OUT_ROOT, 'screenshots', 'after');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const AUTH_STATE = {
  state: {
    user: {
      id: 'u-nav-audit',
      email: 'nav-audit@test.local',
      firstName: 'Nav',
      lastName: 'Audit',
      role: 'ORG_MANAGER',
      tenantId: 't-audit',
      permissions: [
        'BASIC_DATA_EDIT',
        'BASIC_DATA_VIEW',
        'INVENTORY_VIEW',
        'MOVEMENTS_VIEW',
        'ADJUSTMENT_CREATE',
        'TRANSFER_VIEW',
        'TRANSFER_CREATE',
        'GET_PASS_CREATE',
        'GET_PASS_VIEW',
        'IMPORT_EXCEL',
      ],
      tenant: { id: 't-audit', slug: 'audit-hotel', name: 'Audit Hotel', parentId: null },
      memberships: [
        {
          tenantId: 't-audit',
          tenantSlug: 'audit-hotel',
          tenantName: 'Audit Hotel',
          role: 'ORG_MANAGER',
          parentId: 't-org',
        },
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

const LOCATIONS = [
  { id: 'loc-a', name: 'Main Store', departmentId: 'dept-1' },
  { id: 'loc-b', name: 'Kitchen', departmentId: 'dept-1' },
];
const DEPARTMENTS = [{ id: 'dept-1', name: 'F&B' }];
const UNITS = [{ id: 'u-ea', name: 'Each', abbreviation: 'EA' }];
const CATEGORIES = [{ id: 'cat-1', name: 'Dry Goods' }];
const SUPPLIERS = [{ id: 'sup-1', name: 'ACME' }];
const ITEMS = [
  {
    id: 'item-1',
    name: 'Test Item',
    barcode: 'T001',
    isActive: true,
    itemUnits: [{ unitType: 'BASE', unit: { id: 'u-ea', name: 'Each' } }],
  },
];

const POSTED_MOVEMENT = {
  id: 'mov-posted-1',
  documentNo: 'ADJ-9001',
  movementType: 'ADJUSTMENT',
  status: 'POSTED',
  postedAt: '2026-01-01T00:00:00.000Z',
  documentDate: '2026-01-01',
  adjustmentDirection: 'INCREASE',
  sourceLocationId: 'loc-a',
  destLocationId: null,
  supplierId: null,
  reason: 'Audit',
  department: null,
  notes: 'Posted doc',
  lines: [
    {
      id: 'line-1',
      itemId: 'item-1',
      locationId: 'loc-a',
      qtyRequested: 2,
      qtyInBaseUnit: 2,
      unitCost: 5,
      totalValue: 10,
      notes: '',
      item: { id: 'item-1', name: 'Test Item' },
      location: { id: 'loc-a', name: 'Main Store' },
    },
  ],
};

async function installRoutes(page) {
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/items/import/preview')) {
      return route.fulfill(
        jsonOk({
          preview: [{ rowNum: 2, status: 'VALID', issues: [], errors: [], data: { name: 'Item 1' } }],
          filePath: '/tmp/x.xlsx',
          total: 1,
          valid: 1,
          invalid: 0,
          storeColumns: ['Main Store'],
          unknownColumns: [],
        }),
      );
    }
    if (url.includes('/items/check-requirements')) {
      return route.fulfill(
        jsonOk({
          canCreateItem: true,
          requirements: {
            departments: { count: 1 },
            units: { count: 1 },
            categories: { count: 1 },
            vendors: { count: 1 },
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
    if (url.includes('/departments')) {
      return route.fulfill(jsonOk(DEPARTMENTS));
    }
    if (url.includes('/units')) {
      return route.fulfill(jsonOk(UNITS));
    }
    if (url.includes('/categories')) {
      return route.fulfill(jsonOk(CATEGORIES));
    }
    if (url.includes('/suppliers')) {
      return route.fulfill(jsonOk(SUPPLIERS));
    }
    if (url.includes('/locations')) {
      return route.fulfill(jsonOk(LOCATIONS));
    }
    if (url.includes('/movements/mov-posted-1')) {
      return route.fulfill(jsonOk(POSTED_MOVEMENT));
    }
    if (url.includes('/movements')) {
      return route.fulfill(jsonOk([]));
    }
    if (url.includes('/ledger/by-document')) {
      return route.fulfill(jsonOk([]));
    }
    if (url.includes('/ledger')) {
      return route.fulfill(jsonOk([]));
    }
    if (url.match(/\/items\/[^/?]+$/) && route.request().method() === 'GET') {
      return route.fulfill(
        jsonOk({ ...ITEMS[0], departmentId: 'dept-1', defaultStoreId: 'loc-a', unitPrice: 10 }),
      );
    }
    if (url.includes('/items')) {
      return route.fulfill(jsonOk(ITEMS));
    }
    if (url.includes('/stock-balances') || url.includes('/stock')) {
      return route.fulfill(jsonOk({ items: [], total: 0 }));
    }
    if (url.includes('/organization/sister-hotels')) {
      return route.fulfill(jsonOk([]));
    }
    if (url.includes('/get-passes')) {
      return route.fulfill(jsonOk([]));
    }
    if (url.includes('/transfers')) {
      return route.fulfill(jsonOk({}));
    }
    return route.fulfill(jsonOk([]));
  });
}

async function countVisible(page, selector) {
  return page.locator(selector).filter({ visible: true }).count();
}

async function auditScreen(page, spec) {
  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  page.on('console', onConsole);

  await page.goto(`${BASE}${spec.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(spec.waitFor, { timeout: 60000 });
  await page.waitForTimeout(600);

  const checks = {};
  for (const [key, selector] of Object.entries(spec.selectors || {})) {
    checks[key] = await countVisible(page, selector);
  }

  let cancelDest = null;
  if (spec.testCancel) {
    await page.locator(spec.cancelSelector).first().click();
    await page.waitForTimeout(500);
    cancelDest = page.url();
    checks.cancelNavigated = cancelDest.includes(spec.cancelDestContains);
  }

  const shotPath = path.join(SHOT_DIR, `${spec.id}__1920x1080.png`);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: shotPath, fullPage: false });

  page.off('console', onConsole);

  const pass =
    consoleErrors.length === 0 &&
    Object.entries(spec.must).every(([k, v]) => checks[k] === v) &&
    (!spec.testCancel || checks.cancelNavigated === true);

  return {
    id: spec.id,
    path: spec.path,
    checks,
    cancelDest,
    consoleErrors,
    screenshot: path.relative(OUT_ROOT, shotPath).replace(/\\/g, '/'),
    pass,
  };
}

const SPECS = [
  {
    id: 'IM-ADD',
    path: '/items/new',
    waitFor: '.item-form-page',
    selectors: {
      topBack: '.document-page__back',
      footerCancel: 'button:has-text("Cancel")',
    },
    must: { topBack: 0, footerCancel: 1 },
    testCancel: true,
    cancelSelector: '.item-form-page__actions button:has-text("Cancel")',
    cancelDestContains: '/items',
  },
  {
    id: 'IM-IMPORT',
    path: '/inventory/items/import',
    waitFor: '.item-import-page',
    selectors: {
      headerBack: '.item-import-page__back',
      footerCancel: '.item-import-page__footer-actions button:has-text("Cancel")',
    },
    must: { headerBack: 0, footerCancel: 1 },
    testCancel: true,
    cancelSelector: '.item-import-page__footer-actions button:has-text("Cancel")',
    cancelDestContains: '/items',
  },
  {
    id: 'GP-ADD',
    path: '/get-passes/new',
    waitFor: '.gp-form-shell',
    selectors: {
      topBack: '.gp-form__back',
      footerCancel: '.gp-form__footer button:has-text("Cancel")',
    },
    must: { topBack: 0, footerCancel: 1 },
    testCancel: true,
    cancelSelector: '.gp-form__footer button:has-text("Cancel")',
    cancelDestContains: '/get-passes',
  },
  {
    id: 'TR-ADD',
    path: '/transfers/new',
    waitFor: '.transfer-form-shell',
    selectors: {
      topBack: '.transfer-form__back',
      footerCancel: '.transfer-form__footer button:has-text("Cancel")',
    },
    must: { topBack: 0, footerCancel: 1 },
    testCancel: true,
    cancelSelector: '.transfer-form__footer button:has-text("Cancel")',
    cancelDestContains: '/transfers',
  },
  {
    id: 'MOV-ADD',
    path: '/movements/new',
    waitFor: '.movement-form',
    selectors: {
      topBack: '.movement-form__back',
      actionCancel: '.movement-form__actions button:has-text("Cancel")',
    },
    must: { topBack: 0, actionCancel: 1 },
    testCancel: true,
    cancelSelector: '.movement-form__actions button:has-text("Cancel")',
    cancelDestContains: '/movements',
  },
  {
    id: 'MOV-POSTED',
    path: '/movements/mov-posted-1',
    waitFor: '.movement-form--readonly',
    selectors: {
      topBack: '.movement-form__back',
      actionCancel: '.movement-form__actions button:has-text("Cancel")',
    },
    must: { topBack: 1, actionCancel: 0 },
  },
];

async function testImportWizardBack(page) {
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  const dummy = path.join(HARNESS_DIR, 'dummy-upload.csv');
  if (!fs.existsSync(dummy)) {
    fs.writeFileSync(
      dummy,
      'name,dept,category,vendor,baseUnit,unitPrice,Main Store\nItem 1,F&B,Dry,ACME,EA,10,5\n',
    );
  }

  await page.goto(`${BASE}/inventory/items/import`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.file-dropzone', { timeout: 60000 });
  await page.setInputFiles('input.hidden-file-input', dummy);
  await page.click('.item-import-page__footer-actions button:last-child');
  await page.waitForSelector('.preview-nz-table', { timeout: 60000 });
  await page.waitForTimeout(400);

  const wizardBack = await countVisible(
    page,
    '.item-import-page__footer-actions button:has-text("Back")',
  );
  const shotPath = path.join(SHOT_DIR, 'IM-IMPORT-WIZARD-BACK__1920x1080.png');
  await page.screenshot({ path: shotPath, fullPage: false });

  return {
    id: 'IM-IMPORT-WIZARD-BACK',
    path: '/inventory/items/import (step 1)',
    checks: { wizardBack },
    consoleErrors,
    screenshot: path.relative(OUT_ROOT, shotPath).replace(/\\/g, '/'),
    pass: wizardBack === 1 && consoleErrors.length === 0,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript((auth) => {
    window.localStorage.setItem('ose-auth', JSON.stringify(auth));
    window.localStorage.setItem('theme', 'light');
  }, AUTH_STATE);
  const page = await context.newPage();
  await installRoutes(page);

  const results = [];
  for (const spec of SPECS) {
    try {
      results.push(await auditScreen(page, spec));
    } catch (err) {
      results.push({
        id: spec.id,
        path: spec.path,
        pass: false,
        error: String(err?.message || err),
        checks: {},
        consoleErrors: [],
      });
    }
  }
  try {
    results.push(await testImportWizardBack(page));
  } catch (err) {
    results.push({
      id: 'IM-IMPORT-WIZARD-BACK',
      pass: false,
      error: String(err?.message || err),
    });
  }

  await browser.close();

  const out = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    phase: 'after',
    buildPass: true,
    allPass: results.every((r) => r.pass),
    results,
  };
  const outPath = path.join(OUT_ROOT, 'RUNTIME_AFTER.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
