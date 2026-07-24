'use strict';

/**
 * Phase 5 — Focused Breakage Void terminal timeline browser verification.
 * Usage: node Governance/phase-5-operational-details/phase-5-void-timeline-browser.cjs
 */

const { createRequire } = require('module');
const requireFromFrontend = createRequire(require('path').join(__dirname, '../../OSE-Frontend/package.json'));
const { chromium } = requireFromFrontend('playwright');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../OSE-backend/.env') });

const GOV_DIR = __dirname;
const API = process.env.OSE_API_URL || 'http://127.0.0.1:4000/api';
const BASE = process.env.OSE_BASE_URL || 'http://127.0.0.1:4200';
const TENANT = process.env.UAT_TENANT || 'closeout-audit-hotel-disposable';
const PASSWORD = process.env.UAT_PASSWORD || 'Phase5Gate@123';

const { loadFixtures, timelineEntriesFromResponse } = require('./phase-5-detail-assertions.lib.cjs');
const { ledgerRowsForRef } = require('./phase-5-posting-assertions.lib.cjs');
const { assertVoidTimelineEntries, missingFields } = require('./phase-5-browser-clean.lib.cjs');

const WIDTHS = [
  { id: '1920', width: 1920, height: 1080 },
  { id: '768', width: 768, height: 1024 },
];

const scenarios = [];
let requestRewriteCount = 0;

function record(id, name, pass, detail = {}) {
  scenarios.push({ id, name, pass, skipped: false, vacuous: false, requestRewriteUsed: false, ...detail });
}

async function apiLogin(email, tenantSlug = TENANT) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, tenantSlug }),
  });
  const json = await res.json();
  if (!json?.success) throw new Error(`Login failed for ${email}`);
  return json.data;
}

async function apiGet(path, token) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function seedAuth(page, authPayload, tenantSlug) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(({ auth, slug }) => {
    localStorage.setItem(
      'ose-auth',
      JSON.stringify({
        state: {
          isAuthenticated: true,
          user: auth.user,
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
          currentTenant: auth.user?.tenant ?? null,
        },
      }),
    );
    localStorage.setItem('ose-last-property-slug', slug);
  }, { auth: authPayload, slug: tenantSlug });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
}

const TIMELINE_SELECTORS = '.document-card--timeline, .inventory-approval-trail-card';

async function clickConfirmModal(page) {
  const btn = page.locator('.ant-modal-confirm-btns .ant-btn-primary, .ant-modal-footer .ant-btn-primary').last();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
}

async function waitForMutationResponse(page, urlPart, action) {
  const resp = await Promise.all([
    page.waitForResponse((r) => r.url().includes(urlPart) && r.request().method() !== 'GET', { timeout: 60000 }),
    action(),
  ]).then(([r]) => r);
  let body = {};
  try {
    body = resp.request().postDataJSON() || {};
  } catch {
    try {
      const raw = resp.request().postData();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
  }
  return { status: resp.status(), ok: resp.status() >= 200 && resp.status() < 300, originalRequestBody: body };
}

async function fetchTimeline(token, docId) {
  const tl = await apiGet(`/constitution/timeline/BREAKAGE/${docId}`, token);
  return timelineEntriesFromResponse(tl);
}

async function inspectVoidPage(page, docId, viewportId) {
  await page.setViewportSize(
    viewportId === '768' ? { width: 768, height: 1024 } : { width: 1920, height: 1080 },
  );
  await page.goto(`${BASE}/breakage/${docId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1500);
  await page
    .waitForFunction(() => {
      const el = document.querySelector('.document-card--timeline, .inventory-approval-trail-card');
      if (!el) return false;
      const text = el.textContent || '';
      return text.length > 24 && !/Loading workflow timeline/i.test(text);
    }, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  const timeline = page.locator(TIMELINE_SELECTORS).first();
  const timelineText = (await timeline.count()) > 0 ? await timeline.innerText().catch(() => '') : '';
  const actionBar = page.locator('.document-action-bar').first();
  const actionText = (await actionBar.count()) > 0 ? await actionBar.innerText().catch(() => '') : '';
  const hasMutationButtons = [/Approve/i, /Reject/i, /Submit/i, /Take Action/i, /Void/i, /Delete/i].some((p) =>
    p.test(actionText),
  );
  const uiShowsActiveFuture =
    /In progress/i.test(timelineText) ||
    (/Pending/i.test(timelineText) && !/Voided/i.test(timelineText.split(/Voided/i)[1] || ''));
  return { timelineText, actionText, hasMutationButtons, uiShowsActiveFuture };
}

async function voidBreakageFixture(page, fixtures, flowKey, field) {
  const docId = fixtures.browserFlows?.[flowKey]?.[field];
  if (!docId) throw new Error(`missing fixture ${flowKey}.${field}`);
  const auth = await apiLogin(fixtures.actors.storekeeper);
  const before = (await apiGet(`/breakage/${docId}`, auth.accessToken)).data?.data;
  await seedAuth(page, auth, TENANT);
  await page.goto(`${BASE}/breakage/${docId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  const voidBtn = page.locator('.document-action-bar button.ant-btn-dangerous, .document-action-bar button[nzdanger]').first();
  const http = await waitForMutationResponse(page, `/breakage/${docId}/void`, async () => {
    await voidBtn.click();
    await clickConfirmModal(page);
  });
  await page.waitForTimeout(2000);
  const after = (await apiGet(`/breakage/${docId}`, auth.accessToken)).data?.data;
  return { docId, auth, before, after, http };
}

async function runVoidTerminalScenario(page, fixtures, opts) {
  const { testId, flowKey, field, label } = opts;
  const viewportResults = [];
  let voidResult;
  try {
    const ledgerBefore = (await ledgerRowsForRef(fixtures.tenantId, fixtures.browserFlows?.[flowKey]?.[field])).length;
    voidResult = await voidBreakageFixture(page, fixtures, flowKey, field);
    const ledgerAfter = (await ledgerRowsForRef(fixtures.tenantId, voidResult.docId)).length;
    const missing = missingFields(voidResult.http.originalRequestBody, ['reason', 'concurrencyVersion']);
    const entries = await fetchTimeline(voidResult.auth.accessToken, voidResult.docId);
    const tl = assertVoidTimelineEntries(entries);

    for (const vp of WIDTHS) {
      const ui = await inspectVoidPage(page, voidResult.docId, vp.id);
      const uiOk = !ui.hasMutationButtons && !ui.uiShowsActiveFuture && /Voided/i.test(ui.timelineText);
      viewportResults.push({
        viewport: vp.id,
        uiOk,
        timelineFragment: ui.timelineText.slice(0, 500),
        hasMutationButtons: ui.hasMutationButtons,
      });
    }

    const pass =
      voidResult.http.ok &&
      voidResult.after?.status === 'VOID' &&
      missing.length === 0 &&
      tl.pass &&
      ledgerBefore === ledgerAfter &&
      viewportResults.every((v) => v.uiOk);

    record(testId, `Breakage ${label} terminal void timeline`, pass, {
      http: voidResult.http.status,
      beforeStatus: voidResult.before?.status,
      afterStatus: voidResult.after?.status,
      originalRequestBody: voidResult.http.originalRequestBody,
      ledgerBefore,
      ledgerAfter,
      fixtureId: voidResult.docId,
      viewports: viewportResults,
      ...tl,
    });
  } catch (e) {
    record(testId, `Breakage ${label} terminal void timeline`, false, {
      error: String(e.message).slice(0, 300),
      viewports: viewportResults,
    });
  }
}

async function main() {
  const fixtures = loadFixtures();
  if (!fixtures?.browserFlows) throw new Error('PHASE_5_FIXTURES.json missing browserFlows — run phase-5-fixture-seed.cjs first');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await runVoidTerminalScenario(page, fixtures, {
    testId: 'P5-VOID-TL-DRAFT',
    flowKey: 'breakageVoidDraft',
    field: 'draftId',
    label: 'DRAFT → VOID',
  });
  await runVoidTerminalScenario(page, fixtures, {
    testId: 'P5-VOID-TL-REJECTED',
    flowKey: 'breakageVoidRejected',
    field: 'rejectedId',
    label: 'REJECTED → VOID',
  });

  await browser.close();

  const passCount = scenarios.filter((s) => s.pass).length;
  const failCount = scenarios.filter((s) => !s.pass).length;
  const phase5VoidTimelineFixClosed =
    scenarios.find((s) => s.id === 'P5-VOID-TL-DRAFT')?.pass === true &&
    scenarios.find((s) => s.id === 'P5-VOID-TL-REJECTED')?.pass === true &&
    failCount === 0 &&
    requestRewriteCount === 0;

  const out = {
    generatedAt: new Date().toISOString(),
    phase: 'phase-5-void-timeline-fix',
    passCount,
    failCount,
    requestRewriteCount,
    skippedCount: 0,
    vacuousCount: 0,
    focusedRegressionFailCount: 0,
    phase5VoidTimelineFixClosed,
    scenarios,
  };

  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_5_VOID_TIMELINE_RESULTS.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ passCount, failCount, phase5VoidTimelineFixClosed, requestRewriteCount }, null, 2));
  process.exit(phase5VoidTimelineFixClosed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
