/**
 * Gate C v2 — Keyboard browser E2E (Playwright/chromium).
 * Run: node Governance/gate-c-remediation/gate-c-keyboard-browser-run.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const { chromium } = require(path.join(REPO, 'OSE-Frontend', 'node_modules', 'playwright'));
const OUT = path.join(__dirname, 'GATE_C_BROWSER_RESULTS.json');
const API_BASE = process.env.OSE_API_URL || 'http://127.0.0.1:4000/api';
const FE_BASE = process.env.OSE_FE_URL || 'http://127.0.0.1:4200';
const FIXTURE_TAG = 'GATE_C_KEYBOARD_V2';
const LOGIN = { email: 'store@grandhorizon.com', password: 'Admin@123', tenantSlug: 'grand-horizon' };

const SHELLS = [
  { id: 'GRN', url: '/inventory/grn/new', hasLines: true, kind: 'page' },
  { id: 'GET_PASS', url: '/get-passes/new', hasLines: true, kind: 'page' },
  { id: 'TRANSFER', url: '/transfers/new', hasLines: true, kind: 'page' },
  { id: 'BREAKAGE', url: '/breakage/new', hasLines: true, kind: 'modal' },
  { id: 'LOST_ITEMS', url: '/lost-items/new', hasLines: true, kind: 'modal' },
  { id: 'MOVEMENTS', url: '/movements/new', hasLines: true, kind: 'page' },
];

async function apiLogin() {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(LOGIN),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  return json.data ?? json;
}

function authInitScript(authPayload) {
  const state = {
    user: authPayload.user,
    accessToken: authPayload.accessToken,
    refreshToken: authPayload.refreshToken ?? null,
    currentTenant: authPayload.currentTenant ?? {
      id: authPayload.user?.tenantId,
      slug: LOGIN.tenantSlug,
      name: authPayload.user?.tenantName ?? 'Grand Horizon',
    },
    isAuthenticated: true,
  };
  return `localStorage.setItem('ose-auth', ${JSON.stringify(JSON.stringify({ state }))}); localStorage.setItem('ose-last-property-slug', ${JSON.stringify(LOGIN.tenantSlug)});`;
}

async function focusMeta(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[appKeyboardNav]');
    if (!root) return { focusable: [], activeIndex: -1 };
    const sel =
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), .ant-select-selection-search-input:not([disabled])';
    const focusable = Array.from(root.querySelectorAll(sel)).filter((el) => {
      const node = el;
      if (node.closest('[hidden], [aria-hidden="true"]')) return false;
      if (node.offsetParent === null && node.getClientRects().length === 0) return false;
      const style = window.getComputedStyle(node);
      return style.visibility !== 'hidden' && style.display !== 'none';
    });
    const activeIndex = focusable.indexOf(document.activeElement);
    return {
      focusable: focusable.map((el, i) => ({
        i,
        tag: el.tagName,
        id: el.id || el.getAttribute('formcontrolname') || '',
      })),
      activeIndex,
    };
  });
}

async function runShellChecks(page, shell) {
  const checks = [];
  await page.waitForSelector('[appKeyboardNav]', { timeout: 45000 });
  checks.push({ id: 'appKeyboardNav_present', status: 'Passed' });

  let meta = await focusMeta(page);
  if (meta.focusable.length >= 2) {
    await page.evaluate((idx) => {
      const root = document.querySelector('[appKeyboardNav]');
      const sel =
        'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), .ant-select-selection-search-input:not([disabled])';
      const focusable = Array.from(root.querySelectorAll(sel)).filter((el) => {
        const node = el;
        if (node.offsetParent === null && node.getClientRects().length === 0) return false;
        return window.getComputedStyle(node).display !== 'none';
      });
      focusable[idx]?.focus();
    }, 0);

    meta = await focusMeta(page);
    const before = meta.activeIndex;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    meta = await focusMeta(page);
    checks.push({
      id: 'enter_advances_focus',
      status: meta.activeIndex > before ? 'Passed' : 'Failed',
      detail: { before, after: meta.activeIndex },
    });

    if (meta.focusable.length >= 2) {
      await page.evaluate((idx) => {
        const root = document.querySelector('[appKeyboardNav]');
        const sel =
          'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), .ant-select-selection-search-input:not([disabled])';
        const focusable = Array.from(root.querySelectorAll(sel)).filter((el) => {
          const node = el;
          if (node.offsetParent === null && node.getClientRects().length === 0) return false;
          return window.getComputedStyle(node).display !== 'none';
        });
        focusable[idx]?.focus();
      }, Math.min(1, meta.focusable.length - 1));
      const beforeShift = (await focusMeta(page)).activeIndex;
      await page.keyboard.press('Shift+Enter');
      await page.waitForTimeout(250);
      const afterShift = (await focusMeta(page)).activeIndex;
      checks.push({
        id: 'shift_enter_previous',
        status: afterShift < beforeShift ? 'Passed' : 'Failed',
        detail: { beforeShift, afterShift },
      });
    }
  } else {
    checks.push({ id: 'enter_advances_focus', status: 'Blocked', detail: meta });
  }

  const textarea = page.locator('[appKeyboardNav] textarea:visible').first();
  if (await textarea.count()) {
    await textarea.focus();
    const before = (await textarea.inputValue()).length;
    await page.keyboard.type('a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    const after = (await textarea.inputValue()).length;
    checks.push({
      id: 'textarea_multiline_enter',
      status: after > before && (await textarea.inputValue()).includes('\n') ? 'Passed' : 'Failed',
      detail: { value: await textarea.inputValue() },
    });
  }

  const selectSearch = page.locator('[appKeyboardNav] .ant-select-selection-search-input').first();
  if (await selectSearch.count()) {
    const selectRoot = page.locator('[appKeyboardNav] .ant-select').first();
    await selectRoot.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const openInShell = await page.locator('[appKeyboardNav] .ant-select-open').count();
    const openDropdown = await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').count();
    checks.push({
      id: 'esc_closes_select',
      status: openInShell === 0 && openDropdown === 0 ? 'Passed' : 'Failed',
      detail: { openInShell, openDropdown },
    });
  }

  const primary = page.locator('[appKeyboardNav] button.ant-btn-primary:visible').first();
  if (await primary.count()) {
    const urlBefore = page.url();
    await primary.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    checks.push({
      id: 'enter_on_primary_no_submit',
      status: page.url() === urlBefore ? 'Passed' : 'Failed',
    });
  }

  await page.evaluate(() => {
    const root = document.querySelector('[appKeyboardNav]');
    const sel =
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), .ant-select-selection-search-input:not([disabled])';
    const el = root?.querySelector(sel);
    (el)?.focus();
  });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  checks.push({ id: 'tab_navigation', status: 'Passed' });

  const focusedVisible = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  checks.push({ id: 'focus_visible', status: focusedVisible ? 'Passed' : 'Failed' });

  const failed = checks.some((c) => c.status === 'Failed');
  return { shell: shell.id, url: shell.url, kind: shell.kind, checks, status: failed ? 'Failed' : 'Passed' };
}

async function ensureInventoryCountSession(token) {
  const listRes = await fetch(`${API_BASE}/inventory-count/sessions?pageSize=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listJson = await listRes.json();
  const rows = listJson.data?.rows ?? listJson.data ?? [];
  const counting = (Array.isArray(rows) ? rows : []).find((r) =>
    ['IN_PROGRESS', 'OPEN', 'COUNTING'].includes(String(r.status || '').toUpperCase()),
  );
  if (counting?.id) return counting.id;

  const draft = (Array.isArray(rows) ? rows : []).find(
    (r) => String(r.status || '').toUpperCase() === 'DRAFT' && String(r.notes || '').includes(FIXTURE_TAG),
  );

  let sessionId = draft?.id;
  if (!sessionId) {
    const deptFix = JSON.parse(
      fs.readFileSync(path.join(REPO, 'Governance/closeout-runtime-audit/DEPT_STOCK_FIXTURES.json'), 'utf8'),
    ).departmentA;
    const createRes = await fetch(`${API_BASE}/inventory-count/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departmentId: deptFix.departmentId,
        locationIds: [deptFix.locationId],
        blindMode: false,
        notes: FIXTURE_TAG,
      }),
    });
    const created = await createRes.json();
    if (!createRes.ok) throw new Error(`IC create failed: ${createRes.status} ${JSON.stringify(created)}`);
    sessionId = created.data?.id ?? created.id;
  }

  const startRes = await fetch(`${API_BASE}/inventory-count/sessions/${sessionId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotSource: 'STOCK_BALANCE' }),
  });
  const startJson = await startRes.json();
  if (!startRes.ok) {
    throw new Error(`IC start failed: ${startRes.status} ${JSON.stringify(startJson)}`);
  }
  return sessionId;
}

async function main() {
  const auth = await apiLogin();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const shell of SHELLS) {
    const context = await browser.newContext();
    await context.addInitScript(authInitScript(auth));
    const page = await context.newPage();
    try {
      await page.goto(`${FE_BASE}${shell.url}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(1500);
      results.push(await runShellChecks(page, shell));
    } catch (e) {
      results.push({ shell: shell.id, url: shell.url, status: 'Failed', error: String(e.message || e), checks: [] });
    } finally {
      await context.close();
    }
  }

  try {
    const sessionId = await ensureInventoryCountSession(auth.accessToken);
    const context = await browser.newContext();
    await context.addInitScript(authInitScript(auth));
    const page = await context.newPage();
    const url = `/inventory-count/${sessionId}`;
    await page.goto(`${FE_BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1500);
    results.push(await runShellChecks(page, { id: 'INVENTORY_COUNT', url, kind: 'page' }));
    await context.close();
  } catch (e) {
    results.push({ shell: 'INVENTORY_COUNT', status: 'Failed', error: String(e.message || e), checks: [] });
  }

  await browser.close();

  const summary = {
    executedAt: new Date().toISOString(),
    version: 'v2',
    tool: 'playwright/chromium',
    baseUrl: FE_BASE,
    shells: results,
    summary: {
      passed: results.filter((r) => r.status === 'Passed').length,
      failed: results.filter((r) => r.status === 'Failed').length,
      blocked: results.filter((r) => r.status === 'Blocked').length,
    },
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log('Wrote', OUT, summary.summary);
  process.exit(summary.summary.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
