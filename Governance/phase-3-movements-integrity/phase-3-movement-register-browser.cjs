'use strict';

/**
 * Phase 3 — Movement Register principal browser path (strict).
 * Usage: node Governance/phase-3-movements-integrity/phase-3-movement-register-browser.cjs
 *
 * FAIL unless every required step passes (DRAFT before post AND POSTED after post AND ledger exact match).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createRequire } = require('module');

const GOV_DIR = __dirname;
const BACKEND = path.join(__dirname, '../../OSE-backend');
const FE_ROOT = path.join(__dirname, '../../OSE-Frontend');
const requireFromFe = createRequire(path.join(FE_ROOT, 'package.json'));
const { chromium } = requireFromFe('playwright');

const prisma = require(path.join(BACKEND, 'src/config/database'));
const { getSession } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/http'));

const FE_BASE = process.env.OSE_FE_URL || 'http://127.0.0.1:4200';
const API_BASE = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const OUT = path.join(GOV_DIR, 'PHASE_3_BROWSER_RESULTS.json');

const FIXTURE_TAG = 'PHASE3_BROWSER_ADJ';
const PASSWORD = 'Phase3Gate@123';
const EMAIL = process.env.P3_BROWSER_EMAIL || 'p3-browser-fm@phase3-gate.local';
const TENANT_SLUG = process.env.P3_BROWSER_TENANT || 'closeout-audit-hotel-disposable';
const ADJ_QTY = 3;
const ADJ_UNIT_COST = 5;
const EXPECTED_TOTAL = ADJ_QTY * ADJ_UNIT_COST;

const REQUIRED_STEPS = [
  'loginAuthorizedFinanceManager',
  'movementRegisterOpened',
  'adjustmentCreatedViaUi',
  'draftStatusOnDetail',
  'openedDocumentByExactId',
  'postConfirmationCompleted',
  'postHttp2xx',
  'postedStatusOnDetail',
  'postedOnListAfterRefresh',
  'ledgerHistoryVisible',
  'ledgerExactMatch',
  'unauthorizedActionsHiddenAfterPost',
];

async function ensureBrowserActor(tenantId, stock) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const role = await prisma.role.findUnique({ where: { code: 'FINANCE_MANAGER' } });
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: hash, isActive: true },
    create: { email: EMAIL, passwordHash: hash, isActive: true, firstName: 'Phase3', lastName: 'BrowserFM' },
  });
  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    update: { roleId: role.id, isActive: true, departmentId: stock.departmentId },
    create: { tenantId, userId: user.id, roleId: role.id, isActive: true, departmentId: stock.departmentId },
  });
  await prisma.urUserAssignment.deleteMany({ where: { userId: user.id, notes: { startsWith: 'PHASE3_BROWSER' } } });
  const a = await prisma.urUserAssignment.create({
    data: { userId: user.id, roleId: role.id, isActive: true, notes: 'PHASE3_BROWSER FM' },
  });
  await prisma.urAssignmentProperty.create({ data: { assignmentId: a.id, propertyId: tenantId } });
  await prisma.urAssignmentDepartment.create({ data: { assignmentId: a.id, departmentId: stock.departmentId } });
  return user;
}

async function ensureStock(tenantId) {
  let dept = await prisma.department.findFirst({ where: { tenantId, code: 'FB' } });
  if (!dept) {
    dept = await prisma.department.create({
      data: { tenantId, code: 'FB', name: `${FIXTURE_TAG} FB`, isActive: true },
    });
  }
  let loc = await prisma.location.findFirst({ where: { tenantId, departmentId: dept.id, isActive: true } });
  if (!loc) {
    loc = await prisma.location.create({
      data: {
        tenantId,
        departmentId: dept.id,
        name: `${FIXTURE_TAG} Store`,
        type: 'MAIN_STORE',
        isActive: true,
      },
    });
  }
  let item = await prisma.item.findFirst({
    where: { tenantId, departmentId: dept.id, isActive: true, name: { contains: FIXTURE_TAG } },
  });
  if (!item) {
    item = await prisma.item.create({
      data: {
        tenantId,
        name: `${FIXTURE_TAG} Item`,
        code: `P3BR-${Date.now()}`,
        isActive: true,
        unitPrice: ADJ_UNIT_COST,
        defaultStoreId: loc.id,
        departmentId: dept.id,
      },
    });
  }
  await prisma.stockBalance.upsert({
    where: { tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: loc.id } },
    update: { qtyOnHand: 200, wacUnitCost: ADJ_UNIT_COST },
    create: { tenantId, itemId: item.id, locationId: loc.id, qtyOnHand: 200, wacUnitCost: ADJ_UNIT_COST },
  });
  const locFull = await prisma.location.findUnique({ where: { id: loc.id }, select: { id: true, name: true } });
  const itemFull = await prisma.item.findUnique({
    where: { id: item.id },
    select: { id: true, name: true, barcode: true },
  });
  return {
    departmentId: dept.id,
    locationId: locFull.id,
    locationName: locFull.name,
    itemId: itemFull.id,
    itemName: itemFull.name,
    itemSearch: itemFull.barcode || itemFull.name.split(' ')[0],
    tenantId,
  };
}

async function ensureObFinalized(tenantId) {
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
    update: { value: 'LOCKED' },
    create: { tenantId, key: 'allowOpeningBalance', value: 'LOCKED' },
  });
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: 'obFinalizeSnapshot' } },
    update: { value: JSON.stringify({ finalizedAt: new Date().toISOString(), gate: FIXTURE_TAG }) },
    create: {
      tenantId,
      key: 'obFinalizeSnapshot',
      value: JSON.stringify({ finalizedAt: new Date().toISOString(), gate: FIXTURE_TAG }),
    },
  });
}

async function selectNzOption(page, trigger, searchText) {
  await trigger.click();
  await page.waitForTimeout(400);
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await dropdown.waitFor({ state: 'visible', timeout: 10000 });
  const search = dropdown.locator('input').first();
  if (await search.count()) {
    await search.fill(String(searchText).slice(0, 24));
    await page.waitForTimeout(600);
  }
  const option = dropdown.locator('.ant-select-item-option-content').filter({ hasText: new RegExp(searchText.slice(0, 12), 'i') }).first();
  if (await option.count()) {
    await option.click();
  } else {
    await dropdown.locator('.ant-select-item-option').first().click();
  }
  await page.waitForTimeout(300);
}

async function loginUi(page) {
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  const tenant = page.locator('input[formcontrolname="tenantSlug"], input[name="tenantSlug"]');
  if ((await tenant.count()) > 0) await tenant.fill(TENANT_SLUG);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(3000);
}

function statusBadgeState(page) {
  return page.locator('.document-page-header .status-badge, .movement-form .status-badge').first();
}

async function readLedgerFromDetail(page) {
  const card = page.locator('.movement-form__ledger-card');
  if (!(await card.count())) return [];
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.movement-form__table--ledger tbody tr'));
    return rows.map((tr) => {
      const cells = tr.querySelectorAll('td');
      return {
        item: cells[0]?.textContent?.trim() ?? '',
        location: cells[1]?.textContent?.trim() ?? '',
        type: cells[2]?.textContent?.trim() ?? '',
        qtyIn: cells[3]?.textContent?.trim() ?? '',
        qtyOut: cells[4]?.textContent?.trim() ?? '',
        unitCost: cells[5]?.textContent?.trim() ?? '',
        totalValue: cells[6]?.textContent?.trim() ?? '',
      };
    });
  });
}

async function fetchLedgerApi(token, docId) {
  const res = await fetch(`${API_BASE}/ledger/by-document/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return { status: res.status, rows: json?.data ?? [] };
}

async function main() {
  const steps = {};
  const evidence = { docId: null, documentNo: null, postHttp: null, ledgerRows: [], listRowStatus: null };

  const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`Missing tenant ${TENANT_SLUG}`);

  await ensureObFinalized(tenant.id);
  const stock = await ensureStock(tenant.id);
  await ensureBrowserActor(tenant.id, stock);

  const sess = await getSession(API_BASE, { email: EMAIL, password: PASSWORD }, TENANT_SLUG);
  if (!sess?.token) {
    steps.loginAuthorizedFinanceManager = false;
  } else {
    steps.loginAuthorizedFinanceManager = true;
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    await loginUi(page);
    steps.loginAuthorizedFinanceManager = steps.loginAuthorizedFinanceManager && !page.url().includes('/login');

    await page.goto(`${FE_BASE}/movements`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.movements-page, .registry-ops-page', { timeout: 20000 });
    steps.movementRegisterOpened = page.url().includes('/movements');

    await page.locator('.movements-page__new-btn').click();
    await page.waitForURL(/\/movements\/new/, { timeout: 15000 });
    await page.waitForSelector('.movement-form', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const sourceSelect = page.locator('.movement-form__grid nz-select').nth(1);
    await selectNzOption(page, sourceSelect, stock.locationName);

    await page.locator('.movement-form__lines-header button').filter({ hasText: /add line|add/i }).click();
    await page.waitForTimeout(800);

    await page.waitForSelector('.movement-form__item-select', { timeout: 15000 });
    const itemSelect = page.locator('.movement-form__item-select').first();
    await selectNzOption(page, itemSelect, stock.itemName.slice(0, 16));

    const qtyInput = page.locator('.movement-form__qty input').first();
    await qtyInput.click({ clickCount: 3 });
    await qtyInput.fill(String(ADJ_QTY));
    await qtyInput.press('Tab');

    const costInput = page.locator('.movement-form__qty--cost input').first();
    await costInput.click({ clickCount: 3 });
    await costInput.fill(String(ADJ_UNIT_COST));
    await costInput.press('Tab');

    const notesInput = page.locator('.movement-form__field--full input.movement-form__input');
    if (await notesInput.count()) await notesInput.fill(FIXTURE_TAG);

    const createResponsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/movements') && r.request().method() === 'POST' && !r.url().includes('/post'),
      { timeout: 45000 },
    );

    await page.locator('.movement-form__actions button').filter({ hasText: /save draft/i }).first().click();
    const createRes = await createResponsePromise;
    const createJson = await createRes.json().catch(() => ({}));
    evidence.createHttp = createRes.status();
    evidence.createMessage = createJson?.message ?? createJson?.error ?? null;
    evidence.createBody = createJson;
    evidence.docId = createJson?.data?.id ?? null;
    evidence.documentNo = createJson?.data?.documentNo ?? null;

    steps.adjustmentCreatedViaUi = createRes.status() >= 200 && createRes.status() < 300 && !!evidence.docId;

    if (!steps.adjustmentCreatedViaUi) {
      throw new Error(`Create failed HTTP ${evidence.createHttp}: ${evidence.createMessage || 'unknown'}`);
    }

    await page.waitForURL(new RegExp(`/movements/${evidence.docId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
      timeout: 20000,
    });

    await page.waitForTimeout(1500);
    const draftBadge = statusBadgeState(page);
    steps.draftStatusOnDetail =
      (await draftBadge.count()) > 0 && (await draftBadge.evaluate((el) => el.classList.contains('status-draft')));

    await page.goto(`${FE_BASE}/movements/${evidence.docId}`, { waitUntil: 'domcontentloaded' });
    steps.openedDocumentByExactId = page.url().includes(evidence.docId);
    await page.waitForSelector('.movement-form__post-btn', { timeout: 15000 });

    const postResponsePromise = page.waitForResponse(
      (r) => r.url().includes(`/movements/${evidence.docId}/post`) && r.request().method() === 'POST',
      { timeout: 30000 },
    );

    await page.locator('.movement-form__post-btn').click();
    await page.waitForSelector('.ant-modal-confirm', { timeout: 10000 });
    await page.locator('.ant-modal-confirm-btns .ant-btn-primary').click();
    steps.postConfirmationCompleted = true;

    const postRes = await postResponsePromise;
    evidence.postHttp = postRes.status();
    steps.postHttp2xx = postRes.status() >= 200 && postRes.status() < 300;

    await page.waitForTimeout(2500);
    const postedBadge = statusBadgeState(page);
    steps.postedStatusOnDetail =
      steps.postHttp2xx &&
      (await postedBadge.count()) > 0 &&
      (await postedBadge.evaluate((el) => el.classList.contains('status-posted')));

    await page.goto(`${FE_BASE}/movements`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.movements-page', { timeout: 20000 });
    const searchInput = page.locator('.movements-page__search-input input');
    if (evidence.documentNo && (await searchInput.count())) {
      const searchWait = page.waitForResponse(
        (r) => r.url().includes('/api/movements') && r.request().method() === 'GET',
        { timeout: 20000 },
      );
      await searchInput.fill(evidence.documentNo);
      await searchWait.catch(() => null);
      await page.waitForTimeout(1000);
    } else {
      await page.waitForResponse(
        (r) => r.url().includes('/api/movements') && r.request().method() === 'GET',
        { timeout: 20000 },
      ).catch(() => null);
    }

    const row = page.locator('.movements-page__row').filter({ hasText: evidence.documentNo });
    await row.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);
    const rowStatus = row.locator('.status-badge').first();
    evidence.listRowStatus = (await rowStatus.count())
      ? await rowStatus.evaluate((el) => el.className)
      : null;
    steps.postedOnListAfterRefresh =
      (await row.count()) > 0 && (evidence.listRowStatus || '').includes('status-posted');

    await page.goto(`${FE_BASE}/ledger`, { waitUntil: 'domcontentloaded' });
    steps.ledgerScreenReachable = page.url().includes('/ledger');

    await page.goto(`${FE_BASE}/movements/${evidence.docId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const ledgerCard = page.locator('.movement-form__ledger-card');
    steps.ledgerHistoryVisible = (await ledgerCard.count()) > 0;
    evidence.ledgerUiRows = await readLedgerFromDetail(page);

    const apiLedger = await fetchLedgerApi(sess.token, evidence.docId);
    evidence.ledgerApiRows = apiLedger.rows;
    evidence.ledgerApiHttp = apiLedger.status;

    const apiRow = (apiLedger.rows || [])[0];
    const qtyIn = Number(apiRow?.qtyIn ?? 0);
    const qtyOut = Number(apiRow?.qtyOut ?? 0);
    const unitCost = Number(apiRow?.unitCost ?? 0);
    const totalValue = Number(apiRow?.totalValue ?? 0);

    steps.ledgerExactMatch =
      apiLedger.status === 200 &&
      apiLedger.rows.length === 1 &&
      apiRow.referenceId === evidence.docId &&
      String(apiRow.movementType).toUpperCase() === 'ADJUSTMENT' &&
      apiRow.itemId === stock.itemId &&
      apiRow.locationId === stock.locationId &&
      qtyIn === ADJ_QTY &&
      qtyOut === 0 &&
      Math.abs(unitCost - ADJ_UNIT_COST) < 0.01 &&
      Math.abs(totalValue - EXPECTED_TOTAL) < 0.01 &&
      steps.ledgerHistoryVisible;

    const postBtnAfter = await page.locator('.movement-form__post-btn').count();
    const saveDraftAfter = await page.locator('.movement-form__actions button').filter({ hasText: /save|draft|update/i }).count();
    const voidBtnAfter = await page.locator('button').filter({ hasText: /^void$|delete document|cancel document/i }).count();
    steps.unauthorizedActionsHiddenAfterPost = postBtnAfter === 0 && saveDraftAfter === 0 && voidBtnAfter === 0;

    evidence.unauthorized = { postBtnAfter, saveDraftAfter, voidBtnAfter };
    evidence.expected = {
      qty: ADJ_QTY,
      unitCost: ADJ_UNIT_COST,
      totalValue: EXPECTED_TOTAL,
      itemId: stock.itemId,
      locationId: stock.locationId,
    };

    await browser.close();
    browser = null;
  } catch (e) {
    evidence.error = String(e.message || e).slice(0, 800);
    if (browser) await browser.close().catch(() => null);
    for (const k of REQUIRED_STEPS) {
      if (steps[k] === undefined) steps[k] = false;
    }
  }

  await prisma.$disconnect().catch(() => null);

  const failedSteps = REQUIRED_STEPS.filter((k) => !steps[k]);
  const result = {
    executedAt: new Date().toISOString(),
    gateVersion: 'phase3-browser-strict-v1',
    feBase: FE_BASE,
    apiBase: API_BASE,
    tenantSlug: TENANT_SLUG,
    actor: EMAIL,
    pass: failedSteps.length === 0,
    steps,
    failedSteps,
    evidence,
  };

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ pass: result.pass, failedSteps, evidence: { docId: evidence.docId, documentNo: evidence.documentNo, postHttp: evidence.postHttp } }, null, 2));
  process.exit(result.pass ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => null);
  process.exit(99);
});
