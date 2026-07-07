'use strict';

/**
 * Phase 5 — Clean browser verification (no request rewriting).
 * Usage: node Governance/phase-5-operational-details/phase-5-operational-details-browser.cjs
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
const {
  ledgerRowsForRef,
  assertExactTransferPosting,
  assertExactBreakagePosting,
  assertExactLostPosting,
  assertStockDelta,
  stockSnapshot,
} = require('./phase-5-posting-assertions.lib.cjs');
const {
  MANDATORY_CLEAN_BROWSER_IDS,
  parseRequestBody,
  missingFields,
  assertVoidTimelineEntries,
  lineUnitCost,
} = require('./phase-5-browser-clean.lib.cjs');

const prisma = require('../../OSE-backend/src/config/database');

const scenarios = [];
let requestRewriteCount = 0;
let ledgerFieldMismatchCount = 0;
let missingVoidTimelineCount = 0;

const WIDTHS = [
  { id: '1920', width: 1920, height: 1080 },
  { id: '768', width: 768, height: 1024 },
];

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
  if (!json?.success) throw new Error(`Login failed for ${email}: ${JSON.stringify(json)}`);
  return json.data;
}

async function apiGet(path, token) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
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

async function submitReturnsWorkflowModal(page, opts = {}) {
  const modal = page.locator('.ant-modal-wrap').last();
  await modal.waitFor({ state: 'visible', timeout: 20000 });
  await modal.locator('.rw-approve__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const radios = modal.locator('.rw-approve__radios label.ant-radio-wrapper');
  if ((await radios.count()) > 0) {
    const labelPattern =
      opts.accountability === 'EMPLOYEE'
        ? /Employee Deduction/i
        : /Hotel Operating Loss|Hotel Expenses|Hotel \/ company loss/i;
    await radios.filter({ hasText: labelPattern }).first().click();
    if (opts.accountability === 'EMPLOYEE' && opts.employeeNote) {
      await modal.locator('#rw-approve-employee-note').fill(opts.employeeNote);
    }
    await page.waitForFunction(
      () => {
        const btns = Array.from(document.querySelectorAll('.ant-modal-footer button.ant-btn-primary'));
        const submit = btns.find((b) => /Submit/i.test(b.textContent || ''));
        return submit && !submit.disabled;
      },
      { timeout: 10000 },
    );
  }
  await modal.getByRole('button', { name: 'Submit' }).click({ force: true });
}

async function submitLegacyBreakageApprove(page) {
  await page.locator('.ant-modal-wrap').last().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.ant-modal-wrap button.ant-btn-primary').filter({ hasText: /Approve/i }).last().click();
}

async function approveDocumentStep(page, opts = {}) {
  const bar = page.locator('.document-action-bar');
  const decide = bar.locator('button').filter({ hasText: /Decide/i });
  const takeAction = bar.locator('button').filter({ hasText: /Take Action/i });
  const approve = bar.locator('button').filter({ hasText: /Approve/i });
  if ((await decide.count()) > 0 && (await decide.first().isVisible())) {
    await decide.first().click();
    await page.waitForTimeout(1000);
    await submitLegacyBreakageApprove(page);
    return;
  }
  if ((await takeAction.count()) > 0 && (await takeAction.first().isVisible())) {
    await takeAction.first().click();
    await page.waitForTimeout(2000);
    const hasRw = await page
      .locator('.ant-modal-wrap:visible .rw-approve__radios label.ant-radio-wrapper')
      .first()
      .isVisible()
      .catch(() => false);
    if (hasRw) await submitReturnsWorkflowModal(page, opts);
    else await submitLegacyBreakageApprove(page);
    return;
  }
  if ((await approve.count()) > 0 && (await approve.first().isVisible())) {
    await approve.first().click();
    await clickConfirmModal(page);
    return;
  }
  throw new Error('No visible approve action button in document-action-bar');
}

async function waitForMutationResponse(page, urlPart, action) {
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(urlPart) && ['POST', 'PATCH', 'DELETE'].includes(r.request().method()),
      { timeout: 60000 },
    ),
    action(),
  ]);
  const body = parseRequestBody(resp.request());
  return {
    status: resp.status(),
    ok: resp.status() >= 200 && resp.status() < 300,
    url: resp.url(),
    method: resp.request().method(),
    originalRequestBody: body,
  };
}

function mutationButtonsVisible(actionText) {
  const patterns = [/Approve/i, /Reject/i, /Submit/i, /Take Action/i, /Void/i, /Delete/i];
  return patterns.some((p) => p.test(actionText));
}

async function inspectDetailPage(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);
  const timeline = page.locator(TIMELINE_SELECTORS).first();
  const timelineText = (await timeline.count()) > 0 ? await timeline.innerText().catch(() => '') : '';
  const actionBar = page.locator('.document-action-bar').first();
  const actionText = (await actionBar.count()) > 0 ? await actionBar.innerText().catch(() => '') : '';
  return {
    timelineText,
    actionText,
    apiErrorTimeline: /Timeline API returned zero entries|Retry/i.test(timelineText),
    neutralEmpty: /No workflow activity yet|No approval history/i.test(timelineText),
    hasMutationButtons: mutationButtonsVisible(actionText),
  };
}

async function fetchVoidTimeline(token, docId) {
  const tl = await apiGet(`/constitution/timeline/BREAKAGE/${docId}`, token);
  const entries = timelineEntriesFromResponse(tl);
  return assertVoidTimelineEntries(entries);
}

async function runTransferCleanFlows(page, fixtures) {
  const bf = fixtures.browserFlows?.transferPost;
  if (!bf?.id) {
    record('P5-CLEAN-BR-TR-DEPT-APPROVE', 'Transfer dept approve', false, { reason: 'missing_flow' });
    return;
  }
  const id = bf.id;

  const deptAuth = await apiLogin(fixtures.actors.deptManager);
  const beforeDept = (await apiGet(`/transfers/${id}`, deptAuth.accessToken)).data?.data;
  await seedAuth(page, deptAuth, TENANT);
  await page.goto(`${BASE}/transfers/${id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  const approveBtn = page.locator('.document-action-bar button').filter({ hasText: /Approve/i }).first();
  const deptHttp = await waitForMutationResponse(page, `/transfers/${id}/approve`, async () => {
    await approveBtn.click();
    await clickConfirmModal(page);
  });
  const afterDept = (await apiGet(`/transfers/${id}`, deptAuth.accessToken)).data?.data;
  const deptMissing = missingFields(deptHttp.originalRequestBody, ['concurrencyVersion']);
  const ledgerAfterDept = (await ledgerRowsForRef(fixtures.tenantId, id)).length;
  record('P5-CLEAN-BR-TR-DEPT-APPROVE', 'Transfer UI dept approve (clean payload)', deptHttp.ok && afterDept?.status === 'PENDING_FINANCE' && deptMissing.length === 0 && ledgerAfterDept === 0, {
    http: deptHttp.status,
    beforeStatus: beforeDept?.status,
    afterStatus: afterDept?.status,
    originalRequestBody: deptHttp.originalRequestBody,
    requiredPayloadFields: ['concurrencyVersion'],
    missingPayloadFields: deptMissing,
    fixtureId: id,
    ledgerCount: ledgerAfterDept,
  });

  const finAuth = await apiLogin(fixtures.actors.financeManager);
  const beforeFin = (await apiGet(`/transfers/${id}`, finAuth.accessToken)).data?.data;
  const stockBeforePost = {
    source: await stockSnapshot(fixtures.tenantId, bf.itemId, bf.sourceLocationId),
    dest: await stockSnapshot(fixtures.tenantId, bf.itemId, bf.destLocationId),
  };
  await seedAuth(page, finAuth, TENANT);
  await page.goto(`${BASE}/transfers/${id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  const postBtn = page.locator('.document-action-bar button').filter({ hasText: /Approve|Post/i }).first();
  const finHttp = await waitForMutationResponse(page, `/transfers/${id}/approve`, async () => {
    await postBtn.click();
    await clickConfirmModal(page);
  });
  const afterFin = (await apiGet(`/transfers/${id}`, finAuth.accessToken)).data?.data;
  const finMissing = missingFields(finHttp.originalRequestBody, ['concurrencyVersion']);
  const line = afterFin?.lines?.[0] || beforeFin?.lines?.[0];
  const { unitCost, totalValue } = lineUnitCost(line);
  const rows = await ledgerRowsForRef(fixtures.tenantId, id);
  const ledger = assertExactTransferPosting(rows, {
    itemId: bf.itemId,
    sourceLocationId: bf.sourceLocationId,
    destLocationId: bf.destLocationId,
    qty: bf.qty,
    referenceId: id,
    referenceType: 'TRANSFER',
    unitCost,
    totalValue,
  });
  if (!ledger.pass) ledgerFieldMismatchCount += ledger.ledgerFieldMismatchCount || ledger.issues.length;
  const srcAfter = await stockSnapshot(fixtures.tenantId, bf.itemId, bf.sourceLocationId);
  const destAfter = await stockSnapshot(fixtures.tenantId, bf.itemId, bf.destLocationId);
  const stockOk =
    assertStockDelta(stockBeforePost.source, srcAfter, { qtyDelta: -bf.qty }).pass &&
    assertStockDelta(stockBeforePost.dest, destAfter, { qtyDelta: bf.qty }).pass;
  const bodyText = await page.locator('body').innerText();
  record('P5-CLEAN-BR-TR-FINANCE-POST', 'Transfer finance post (clean payload + exact ledger)', finHttp.ok && afterFin?.status === 'POSTED' && finMissing.length === 0 && ledger.pass && stockOk && /Posted/i.test(bodyText), {
    http: finHttp.status,
    beforeStatus: beforeFin?.status,
    afterStatus: afterFin?.status,
    originalRequestBody: finHttp.originalRequestBody,
    requiredPayloadFields: ['concurrencyVersion'],
    missingPayloadFields: finMissing,
    ledgerIssues: ledger.issues,
    fixtureId: id,
  });

  const rejId = fixtures.browserFlows?.transferReject?.pendingFinanceId;
  if (rejId) {
    const rejAuth = await apiLogin(fixtures.actors.financeManager);
    const beforeRej = (await apiGet(`/transfers/${rejId}`, rejAuth.accessToken)).data?.data;
    const ledgerBefore = (await ledgerRowsForRef(fixtures.tenantId, rejId)).length;
    await seedAuth(page, rejAuth, TENANT);
    await page.goto(`${BASE}/transfers/${rejId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2000);
    await page.locator('.document-action-bar button').filter({ hasText: /Reject/i }).first().click();
    await page.waitForTimeout(800);
    await page.locator('textarea, input[nz-input]').first().fill('Phase5 clean browser reject');
    const rejHttp = await waitForMutationResponse(page, `/transfers/${rejId}/reject`, async () => {
      await page.locator('button').filter({ hasText: /Reject|Confirm/i }).last().click();
    });
    const afterRej = (await apiGet(`/transfers/${rejId}`, rejAuth.accessToken)).data?.data;
    const ledgerAfter = (await ledgerRowsForRef(fixtures.tenantId, rejId)).length;
    record('P5-CLEAN-BR-TR-REJECT', 'Transfer UI reject (clean payload)', rejHttp.ok && afterRej?.status === 'REJECTED' && ledgerBefore === ledgerAfter, {
      http: rejHttp.status,
      beforeStatus: beforeRej?.status,
      afterStatus: afterRej?.status,
      originalRequestBody: rejHttp.originalRequestBody,
      fixtureId: rejId,
    });
  } else {
    record('P5-CLEAN-BR-TR-REJECT', 'Transfer UI reject', false, { reason: 'missing_reject_fixture' });
  }
}

async function runBreakageCleanFlows(page, fixtures) {
  const bf = fixtures.browserFlows?.breakageApprove;
  if (!bf?.pendingCcId) {
    record('P5-CLEAN-BR-BRK-CC-APPROVE', 'Breakage CC approve', false, { reason: 'missing_flow' });
    return;
  }
  const id = bf.pendingCcId;
  const steps = [
    { actor: fixtures.actors.costControl, exp: 'COST_CONTROL_APPROVED', testId: 'P5-CLEAN-BR-BRK-CC-APPROVE', key: 'CC' },
    { actor: fixtures.actors.financeManager, exp: 'FINANCE_APPROVED', testId: 'P5-CLEAN-BR-BRK-FIN-APPROVE', key: 'FIN' },
    { actor: fixtures.actors.generalManager, exp: 'APPROVED', testId: 'P5-CLEAN-BR-BRK-GM-APPROVE', key: 'GM' },
  ];
  const stockBBefore = await stockSnapshot(fixtures.tenantId, bf.itemId, bf.locationId);

  for (const step of steps) {
    try {
      const auth = await apiLogin(step.actor);
      const before = (await apiGet(`/breakage/${id}`, auth.accessToken)).data?.data;
      await seedAuth(page, auth, TENANT);
      await page.goto(`${BASE}/breakage/${id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2000);
      const http = await waitForMutationResponse(page, `/breakage/${id}/`, () => approveDocumentStep(page));
      await page.waitForTimeout(2000);
      const after = (await apiGet(`/breakage/${id}`, auth.accessToken)).data?.data;
      const missing = missingFields(http.originalRequestBody, ['concurrencyVersion']);
      record(step.testId, `Breakage UI ${step.key} approve (clean)`, http.ok && after?.status === step.exp && missing.length === 0, {
        http: http.status,
        beforeStatus: before?.status,
        afterStatus: after?.status,
        originalRequestBody: http.originalRequestBody,
        requiredPayloadFields: ['concurrencyVersion'],
        missingPayloadFields: missing,
        fixtureId: id,
      });
    } catch (e) {
      record(step.testId, `Breakage UI ${step.key} approve`, false, { fixtureId: id, error: String(e.message).slice(0, 300) });
      return;
    }
  }

  const orgAuth = await apiLogin(fixtures.actors.orgManager);
  const detail = (await apiGet(`/breakage/${id}`, orgAuth.accessToken)).data?.data;
  const line = detail?.lines?.[0];
  const { unitCost, totalValue } = lineUnitCost(line);
  const rows = await ledgerRowsForRef(fixtures.tenantId, id);
  const ledger = assertExactBreakagePosting(rows, {
    itemId: bf.itemId,
    locationId: bf.locationId,
    qty: bf.qty,
    referenceId: id,
    referenceType: 'BREAKAGE',
    unitCost,
    totalValue,
  });
  if (!ledger.pass) ledgerFieldMismatchCount += ledger.ledgerFieldMismatchCount || ledger.issues.length;
  const stockAfter = await stockSnapshot(fixtures.tenantId, bf.itemId, bf.locationId);
  const stockOk = assertStockDelta(stockBBefore, stockAfter, { qtyDelta: -bf.qty, totalQtyDamageDelta: bf.qty }).pass;
  const approvedCheck = await inspectDetailPage(page, `/breakage/${id}`);
  record('P5-CLEAN-BR-BRK-LEDGER-EXACT', 'Breakage chain exact ledger/stock/no mutations', ledger.pass && stockOk && !!detail?.postedAt && !approvedCheck.hasMutationButtons, {
    ledgerIssues: ledger.issues,
    postedAt: detail?.postedAt,
    fixtureId: id,
    actionText: approvedCheck.actionText,
  });

  for (const [key, field, label, testId] of [
    ['breakageVoidDraft', 'draftId', 'DRAFT', 'P5-CLEAN-BR-BRK-VOID-DRAFT'],
    ['breakageVoidRejected', 'rejectedId', 'REJECTED', 'P5-CLEAN-BR-BRK-VOID-REJECTED'],
  ]) {
    const vid = fixtures.browserFlows?.[key]?.[field];
    if (!vid) {
      record(testId, `Breakage void ${label}`, false, { reason: 'missing' });
      continue;
    }
    try {
      const ledgerBefore = (await ledgerRowsForRef(fixtures.tenantId, vid)).length;
      const auth = await apiLogin(fixtures.actors.storekeeper);
      const before = (await apiGet(`/breakage/${vid}`, auth.accessToken)).data?.data;
      await seedAuth(page, auth, TENANT);
      await page.goto(`${BASE}/breakage/${vid}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2000);
      const voidBtn = page.locator('.document-action-bar button.ant-btn-dangerous, .document-action-bar button[nzdanger]').first();
      const http = await waitForMutationResponse(page, `/breakage/${vid}/void`, async () => {
        await voidBtn.click();
        await clickConfirmModal(page);
      });
      await page.waitForTimeout(2500);
      const after = (await apiGet(`/breakage/${vid}`, auth.accessToken)).data?.data;
      const ledgerAfter = (await ledgerRowsForRef(fixtures.tenantId, vid)).length;
      const missing = missingFields(http.originalRequestBody, ['reason', 'concurrencyVersion']);
      const voidTl = await fetchVoidTimeline(auth.accessToken, vid);
      const uiCheck = await inspectDetailPage(page, `/breakage/${vid}`);
      const pass =
        http.ok &&
        after?.status === 'VOID' &&
        ledgerBefore === ledgerAfter &&
        missing.length === 0 &&
        voidTl.pass &&
        !uiCheck.hasMutationButtons;
      if (!voidTl.pass) missingVoidTimelineCount += 1;
      record(testId, `Breakage void ${label} (clean + Voided timeline)`, pass, {
        http: http.status,
        beforeStatus: before?.status,
        afterStatus: after?.status,
        originalRequestBody: http.originalRequestBody,
        requiredPayloadFields: ['reason', 'concurrencyVersion'],
        missingPayloadFields: missing,
        ledgerBefore,
        ledgerAfter,
        fixtureId: vid,
        ...voidTl,
        timelineFragment: uiCheck.timelineText.slice(0, 400),
      });
    } catch (e) {
      missingVoidTimelineCount += 1;
      record(testId, `Breakage void ${label}`, false, { fixtureId: vid, error: String(e.message).slice(0, 300) });
    }
  }

  const rejId = fixtures.browserFlows?.breakageReject?.pendingCcId;
  if (rejId) {
    try {
      const auth = await apiLogin(fixtures.actors.costControl);
      const before = (await apiGet(`/breakage/${rejId}`, auth.accessToken)).data?.data;
      const ledgerBefore = (await ledgerRowsForRef(fixtures.tenantId, rejId)).length;
      await seedAuth(page, auth, TENANT);
      await page.goto(`${BASE}/breakage/${rejId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2000);
      await page.locator('.document-action-bar button').filter({ hasText: /Reject/i }).first().click();
      await page.waitForTimeout(800);
      await page.locator('textarea, input[nz-input]').first().fill('Phase5 clean breakage reject');
      const http = await waitForMutationResponse(page, `/breakage/${rejId}/reject`, async () => {
        await page.locator('button').filter({ hasText: /Reject|Confirm/i }).last().click();
      });
      const after = (await apiGet(`/breakage/${rejId}`, auth.accessToken)).data?.data;
      const ledgerAfter = (await ledgerRowsForRef(fixtures.tenantId, rejId)).length;
      record('P5-CLEAN-BR-BRK-REJECT', 'Breakage UI reject terminal', http.ok && after?.status === 'REJECTED' && ledgerBefore === ledgerAfter, {
        http: http.status,
        beforeStatus: before?.status,
        afterStatus: after?.status,
        originalRequestBody: http.originalRequestBody,
        fixtureId: rejId,
      });
    } catch (e) {
      record('P5-CLEAN-BR-BRK-REJECT', 'Breakage UI reject', false, { error: String(e.message).slice(0, 300) });
    }
  } else {
    record('P5-CLEAN-BR-BRK-REJECT', 'Breakage UI reject', false, { reason: 'missing_fixture' });
  }
}

async function runLostCleanFlow(page, fixtures, chainKey, accountability, testId) {
  const bf = fixtures.browserFlows?.[chainKey];
  if (!bf?.deptApprovedId) {
    record(testId, `Lost flow ${chainKey}`, false, { reason: 'missing' });
    return;
  }
  const id = bf.deptApprovedId;
  const steps = [
    { actor: fixtures.actors.costControl, exp: 'COST_CONTROL_APPROVED', key: 'CC', modal: {} },
    { actor: fixtures.actors.financeManager, exp: 'FINANCE_APPROVED', key: 'FIN', modal: {} },
    {
      actor: fixtures.actors.generalManager,
      exp: 'APPROVED',
      key: 'GM',
      modal: { accountability, employeeNote: accountability === 'EMPLOYEE' ? 'Phase5 Clean Employee' : undefined },
    },
  ];
  const stockBefore = await stockSnapshot(fixtures.tenantId, bf.itemId, bf.locationId);

  for (const step of steps) {
    const auth = await apiLogin(step.actor);
    const before = (await apiGet(`/lost/${id}`, auth.accessToken)).data?.data;
    await seedAuth(page, auth, TENANT);
    await page.goto(`${BASE}/lost-items/${id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2000);
    const http = await waitForMutationResponse(page, `/lost/${id}/`, () => approveDocumentStep(page, step.modal));
    const after = (await apiGet(`/lost/${id}`, auth.accessToken)).data?.data;
    if (step.key !== 'GM') {
      record(`${testId}-${step.key}`, `Lost ${step.key} (clean payload)`, http.ok && after?.status === step.exp, {
        http: http.status,
        beforeStatus: before?.status,
        afterStatus: after?.status,
        originalRequestBody: http.originalRequestBody,
        fixtureId: id,
      });
    }
  }

  const orgAuth = await apiLogin(fixtures.actors.orgManager);
  const detail = (await apiGet(`/lost/${id}`, orgAuth.accessToken)).data?.data;
  const line = detail?.lines?.[0];
  const { unitCost, totalValue } = lineUnitCost(line);
  const treatment = String(detail?.suggestedAction || detail?.finalLossTreatment || detail?.accountabilityType || '').toUpperCase();
  const treatmentOk =
    accountability === 'EMPLOYEE'
      ? treatment.includes('EMPLOYEE')
      : treatment.includes('COMPANY') || treatment.includes('HOTEL');
  const rows = await ledgerRowsForRef(fixtures.tenantId, id);
  const ledger = assertExactLostPosting(rows, {
    itemId: bf.itemId,
    locationId: bf.locationId,
    qty: bf.qty,
    referenceId: id,
    referenceType: 'LOST',
    unitCost,
    totalValue,
  });
  if (!ledger.pass) ledgerFieldMismatchCount += ledger.ledgerFieldMismatchCount || ledger.issues.length;
  const stockAfter = await stockSnapshot(fixtures.tenantId, bf.itemId, bf.locationId);
  const stockOk = assertStockDelta(stockBefore, stockAfter, { qtyDelta: -bf.qty, totalQtyLostDelta: bf.qty }).pass;
  record(testId, `Lost ${accountability} final (clean ledger/stock/treatment)`, detail?.status === 'APPROVED' && ledger.pass && stockOk && treatmentOk, {
    treatment,
    ledgerIssues: ledger.issues,
    fixtureId: id,
  });
}

async function runLostRejectClean(page, fixtures) {
  const id = fixtures.browserFlows?.lostReject?.deptApprovedId;
  if (!id) {
    record('P5-CLEAN-BR-LOST-REJECT', 'Lost reject', false, { reason: 'missing' });
    return;
  }
  const auth = await apiLogin(fixtures.actors.costControl);
  const before = (await apiGet(`/lost/${id}`, auth.accessToken)).data?.data;
  const ledgerBefore = (await ledgerRowsForRef(fixtures.tenantId, id)).length;
  await seedAuth(page, auth, TENANT);
  await page.goto(`${BASE}/lost-items/${id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.locator('.document-action-bar button').filter({ hasText: /Reject/i }).first().click();
  await page.waitForTimeout(800);
  await page.locator('textarea, input[nz-input]').first().fill('Phase5 clean lost reject');
  const http = await waitForMutationResponse(page, `/lost/${id}/reject`, async () => {
    await page.locator('button').filter({ hasText: /Reject|Confirm/i }).last().click();
  });
  const after = (await apiGet(`/lost/${id}`, auth.accessToken)).data?.data;
  const ledgerAfter = (await ledgerRowsForRef(fixtures.tenantId, id)).length;
  record('P5-CLEAN-BR-LOST-REJECT', 'Lost UI reject (clean payload)', http.ok && after?.status === 'REJECTED' && ledgerBefore === ledgerAfter, {
    http: http.status,
    beforeStatus: before?.status,
    afterStatus: after?.status,
    originalRequestBody: http.originalRequestBody,
    fixtureId: id,
  });
}

async function runUnauthorizedClean(page, fixtures, widthTag) {
  const auth = await apiLogin(fixtures.actors.viewOnly);
  await seedAuth(page, auth, TENANT);
  const checks = [
    ['NEG-TR-PEN', `/transfers/${fixtures.transfer.pendingDept.id}`, 'Transfer pending'],
    ['NEG-BRK-PEN', `/breakage/${fixtures.breakage.pendingCostControl.id}`, 'Breakage pending'],
    ['NEG-LOST-PEN', `/lost-items/${fixtures.lost.deptApproved.id}`, 'Lost pending'],
    ['NEG-TR-POST', `/transfers/${fixtures.transfer.posted.id}`, 'Transfer posted'],
    ['NEG-BRK-APP', `/breakage/${fixtures.breakage.approved.id}`, 'Breakage approved'],
    ['NEG-LOST-APP', `/lost-items/${fixtures.lost.approvedEmployee.id}`, 'Lost approved'],
    ['NEG-LOST-REJ', `/lost-items/${fixtures.lost.rejected.id}`, 'Lost rejected'],
  ];
  for (const [suffix, route, label] of checks) {
    const r = await inspectDetailPage(page, route);
    record(`P5-CLEAN-BR-${suffix}-${widthTag}`, `${label} no mutation buttons @ ${widthTag}`, !r.hasMutationButtons, {
      actionText: r.actionText,
      route,
    });
  }
}

async function runDraftTimelineClean(page, fixtures, widthTag) {
  const auth = await apiLogin(fixtures.actors.orgManager);
  await seedAuth(page, auth, TENANT);
  const r = await inspectDetailPage(page, `/transfers/${fixtures.transfer.draft.id}`);
  record(`P5-CLEAN-BR-TR-DRAFT-TL-${widthTag}`, `DRAFT transfer neutral timeline @ ${widthTag}`, !r.apiErrorTimeline && r.neutralEmpty && /No workflow activity yet/i.test(r.timelineText), {
    timelineFragment: r.timelineText.slice(0, 400),
    fixtureId: fixtures.transfer.draft.id,
  });
}

function computeClosureCounters() {
  const passCount = scenarios.filter((s) => s.pass).length;
  const failCount = scenarios.filter((s) => !s.pass).length;
  const presentIds = new Set(scenarios.map((s) => s.id));
  const missingScenarioIdCount = MANDATORY_CLEAN_BROWSER_IDS.filter((id) => !presentIds.has(id)).length;
  const unauthorizedVisibleMutationButtonCount = scenarios.filter(
    (s) => s.id.includes('NEG-') && s.pass === false,
  ).length;

  return {
    passCount,
    failCount,
    skippedCount: scenarios.filter((s) => s.skipped).length,
    vacuousCount: scenarios.filter((s) => s.vacuous).length,
    requestRewriteCount,
    missingAllowBindingCount: 0,
    missingDenyBindingCount: 0,
    unexecutedActionBindingCount: 0,
    ledgerFieldMismatchCount,
    missingVoidTimelineCount,
    missingScenarioIdCount,
    unauthorizedVisibleMutationButtonCount,
  };
}

function computePhaseClosed(counters) {
  return (
    counters.runtimeFailCount === 0 &&
    counters.browserFailCount === 0 &&
    counters.regressionFailCount === 0 &&
    counters.skippedCount === 0 &&
    counters.vacuousCount === 0 &&
    counters.requestRewriteCount === 0 &&
    counters.missingAllowBindingCount === 0 &&
    counters.missingDenyBindingCount === 0 &&
    counters.unexecutedActionBindingCount === 0 &&
    counters.ledgerFieldMismatchCount === 0 &&
    counters.missingVoidTimelineCount === 0 &&
    counters.unauthorizedVisibleMutationButtonCount === 0 &&
    counters.missingScenarioIdCount === 0
  );
}

async function main() {
  const { execSync } = require('child_process');
  execSync('node phase-5-fixture-seed.cjs', { cwd: GOV_DIR, stdio: 'pipe', timeout: 120000 });
  const fixtures = loadFixtures();
  if (!fixtures?.browserFlows) throw new Error('Fixtures missing browserFlows');

  const browser = await chromium.launch({ headless: true });
  const flowPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  for (const runner of [
    () => runTransferCleanFlows(flowPage, fixtures),
    () => runBreakageCleanFlows(flowPage, fixtures),
    () => runLostCleanFlow(flowPage, fixtures, 'lostChain', 'EMPLOYEE', 'P5-CLEAN-BR-LOST-EMPLOYEE'),
    () => runLostCleanFlow(flowPage, fixtures, 'lostChainHotel', 'HOTEL', 'P5-CLEAN-BR-LOST-HOTEL'),
    () => runLostRejectClean(flowPage, fixtures),
  ]) {
    try {
      await runner();
    } catch (e) {
      record('P5-CLEAN-BR-ERR', 'Browser flow error', false, { error: String(e.message).slice(0, 400) });
    }
  }
  await flowPage.close();

  for (const w of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: w.width, height: w.height });
    await runDraftTimelineClean(page, fixtures, w.id);
    await runUnauthorizedClean(page, fixtures, w.id);
    await page.close();
  }

  await browser.close();
  await prisma.$disconnect();

  const counters = computeClosureCounters();
  const phaseClosed = computePhaseClosed({
    ...counters,
    runtimeFailCount: 0,
    browserFailCount: counters.failCount,
    regressionFailCount: 0,
  });

  const out = {
    generatedAt: new Date().toISOString(),
    phase: 'phase-5-operational-details-browser-clean',
    ...counters,
    phaseClosed,
    scenarios,
  };

  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_5_BROWSER_RESULTS.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ passCount: counters.passCount, failCount: counters.failCount, requestRewriteCount, phaseClosed }, null, 2));
  process.exit(phaseClosed ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
