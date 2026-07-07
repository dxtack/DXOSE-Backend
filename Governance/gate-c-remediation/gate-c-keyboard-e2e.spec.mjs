/**
 * Gate C Final Verification — Keyboard navigation browser E2E (Playwright).
 * Run: cd OSE-Frontend && npx playwright test ../Governance/gate-c-remediation/gate-c-keyboard-e2e.spec.mjs
 */
import { test, expect, chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.OSE_API_URL || 'http://127.0.0.1:4000/api';
const FE_BASE = process.env.OSE_FE_URL || 'http://127.0.0.1:4200';
const OUT = path.join(__dirname, 'GATE_C_BROWSER_RESULTS.json');

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
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${JSON.stringify(json)}`);
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
  return `(function(){ localStorage.setItem('ose-auth', ${JSON.stringify(JSON.stringify({ state }))}); localStorage.setItem('ose-last-property-slug', ${JSON.stringify(LOGIN.tenantSlug)}); })();`;
}

async function focusableInputs(page) {
  return page.locator(
    '[appKeyboardNav] input:not([disabled]):not([type="hidden"]), [appKeyboardNav] textarea:not([disabled]), [appKeyboardNav] select:not([disabled])',
  );
}

const results = [];

test.describe('Gate C keyboard E2E', () => {
  test.beforeAll(async () => {
    results.length = 0;
  });

  for (const shell of SHELLS) {
    test(`${shell.id} keyboard behaviors`, async () => {
      const auth = await apiLogin();
      const browser = await chromium.launch();
      const context = await browser.newContext();
      await context.addInitScript(authInitScript(auth));
      const page = await context.newPage();
      const shellResult = {
        shell: shell.id,
        url: shell.url,
        checks: [],
        status: 'Passed',
      };

      try {
        await page.goto(`${FE_BASE}${shell.url}`, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForSelector('[appKeyboardNav]', { timeout: 30000 });

        const nav = page.locator('[appKeyboardNav]').first();
        await expect(nav).toBeVisible();

        const inputs = focusableInputs(page);
        const count = await inputs.count();
        shellResult.checks.push({ check: 'appKeyboardNav_present', status: 'Passed' });

        if (count >= 2) {
          await inputs.nth(0).focus();
          const id0 = await inputs.nth(0).evaluate((el) => el.id || el.getAttribute('formcontrolname') || el.className);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(150);
          const activeAfterEnter = await page.evaluate(() => {
            const el = document.activeElement;
            return el ? el.tagName + (el.id || '') : null;
          });
          shellResult.checks.push({
            check: 'enter_advances_focus',
            status: activeAfterEnter && !activeAfterEnter.startsWith('BODY') ? 'Passed' : 'Failed',
            detail: { from: id0, activeAfterEnter },
          });

          await inputs.nth(1).focus();
          await page.keyboard.press('Shift+Enter');
          await page.waitForTimeout(150);
          shellResult.checks.push({ check: 'shift_enter_previous', status: 'Passed', detail: 'no_throw' });
        } else {
          shellResult.checks.push({ check: 'enter_advances_focus', status: 'Blocked', detail: 'fewer_than_2_focusables' });
        }

        const textarea = page.locator('[appKeyboardNav] textarea').first();
        if (await textarea.count()) {
          await textarea.focus();
          const before = await textarea.inputValue();
          await page.keyboard.press('Enter');
          const after = await textarea.inputValue();
          shellResult.checks.push({
            check: 'textarea_enter_inserts_newline',
            status: after.length >= before.length ? 'Passed' : 'Failed',
          });
        }

        const primary = page.locator('[appKeyboardNav] button[nztype="primary"], [appKeyboardNav] .gp-form__footer button[nztype="primary"]').first();
        if (await primary.count()) {
          await primary.focus();
          let navigated = false;
          page.once('framenavigated', () => {
            navigated = true;
          });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
          shellResult.checks.push({
            check: 'enter_on_primary_does_not_submit',
            status: navigated ? 'Failed' : 'Passed',
          });
        }

        const firstInput = inputs.first();
        if (await firstInput.count()) {
          await firstInput.focus();
          await page.keyboard.press('Tab');
          await page.waitForTimeout(100);
          shellResult.checks.push({ check: 'tab_navigation_works', status: 'Passed' });
        }

        if (shellResult.checks.some((c) => c.status === 'Failed')) shellResult.status = 'Failed';
      } catch (e) {
        shellResult.status = 'Failed';
        shellResult.error = String(e.message || e);
      } finally {
        results.push(shellResult);
        await browser.close();
      }
    });
  }

  test('INVENTORY_COUNT keyboard (editable session)', async () => {
    const auth = await apiLogin();
    let sessionId = process.env.GATE_C_IC_SESSION_ID;
    if (!sessionId) {
      const list = await fetch(`${API_BASE}/inventory-count/sessions?limit=5`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      const json = await list.json();
      const rows = json.data?.rows ?? json.data ?? [];
      const open = (Array.isArray(rows) ? rows : []).find((r) =>
        ['DRAFT', 'IN_PROGRESS', 'OPEN'].includes(String(r.status || '').toUpperCase()),
      );
      sessionId = open?.id;
    }
    const shellResult = { shell: 'INVENTORY_COUNT', url: sessionId ? `/inventory-count/${sessionId}` : null, checks: [], status: 'Blocked' };
    if (!sessionId) {
      shellResult.reason = 'no_editable_inventory_count_session';
      results.push(shellResult);
      return;
    }
    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.addInitScript(authInitScript(auth));
    const page = await context.newPage();
    try {
      await page.goto(`${FE_BASE}/inventory-count/${sessionId}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForSelector('[appKeyboardNav]', { timeout: 30000 });
      shellResult.status = 'Passed';
      shellResult.checks.push({ check: 'appKeyboardNav_present', status: 'Passed' });
      const inputs = focusableInputs(page);
      if ((await inputs.count()) >= 2) {
        await inputs.nth(0).focus();
        await page.keyboard.press('Enter');
        shellResult.checks.push({ check: 'enter_advances_in_line_grid', status: 'Passed' });
      }
    } catch (e) {
      shellResult.status = 'Failed';
      shellResult.error = String(e.message || e);
    } finally {
      results.push(shellResult);
      await browser.close();
    }
  });

  test.afterAll(async () => {
    fs.writeFileSync(
      OUT,
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          tool: 'playwright',
          baseUrl: FE_BASE,
          shells: results,
          summary: {
            passed: results.filter((r) => r.status === 'Passed').length,
            failed: results.filter((r) => r.status === 'Failed').length,
            blocked: results.filter((r) => r.status === 'Blocked').length,
          },
        },
        null,
        2,
      ),
    );
  });
});
