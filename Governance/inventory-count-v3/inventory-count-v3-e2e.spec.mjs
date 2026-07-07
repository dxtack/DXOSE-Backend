/**
 * Inventory Count v3 — browser E2E (Playwright).
 * Run: cd OSE-Frontend && npx playwright test ../OSE-backend/Governance/inventory-count-v3/inventory-count-v3-e2e.spec.mjs
 */
import { test, expect, chromium } from '@playwright/test';

const API_BASE = process.env.OSE_API_URL || 'http://127.0.0.1:4000/api';
const FE_BASE = process.env.OSE_FE_URL || 'http://127.0.0.1:4200';
const TENANT_SLUG = 'grand-horizon';

const USERS = {
  storekeeper: { email: 'store@grandhorizon.com', password: 'Admin@123' },
  costControl: { email: 'cost@grandhorizon.com', password: 'Admin@123' },
  deptManager: { email: 'fb.manager@grandhorizon.com', password: 'Admin@123' },
};

async function apiLogin(creds) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, tenantSlug: TENANT_SLUG }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Login failed ${creds.email}: ${res.status}`);
  return json.data ?? json;
}

function authInitScript(authPayload, email) {
  const state = {
    user: authPayload.user,
    accessToken: authPayload.accessToken,
    refreshToken: authPayload.refreshToken ?? null,
    currentTenant: authPayload.currentTenant ?? {
      id: authPayload.user?.tenantId,
      slug: TENANT_SLUG,
      name: 'Grand Horizon',
    },
    isAuthenticated: true,
  };
  return `(function(){ localStorage.setItem('ose-auth', ${JSON.stringify(JSON.stringify({ state }))}); localStorage.setItem('ose-last-property-slug', ${JSON.stringify(TENANT_SLUG)}); })();`;
}

test.describe('Inventory Count v3 UI', () => {
  test('detail page shows role-gated actions and timeline for pending session', async () => {
    const listRes = await fetch(`${API_BASE}/inventory-count/sessions?status=PENDING_DEPT&pageSize=1`, {
      headers: {
        Authorization: `Bearer ${(await apiLogin(USERS.deptManager)).accessToken}`,
        'X-Tenant-Slug': TENANT_SLUG,
      },
    });
    const listJson = await listRes.json();
    const sessionId = listJson?.data?.[0]?.id;
    test.skip(!sessionId, 'No PENDING_DEPT session available for E2E');

    const auth = await apiLogin(USERS.deptManager);
    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.addInitScript(authInitScript(auth, USERS.deptManager.email));
    const page = await context.newPage();

    await page.goto(`${FE_BASE}/inventory-count/${sessionId}`, { waitUntil: 'networkidle', timeout: 60000 });
    await expect(page.locator('.inventory-status-pill')).toBeVisible();
    await expect(page.getByRole('button', { name: /Approve|اعتماد/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Send back|إعادة/i })).toBeVisible();
    await expect(page.locator('app-returns-workflow-timeline')).toBeVisible();

    await browser.close();
  });

  test('storekeeper does not see submit-for-approval on counting session', async () => {
    const listRes = await fetch(`${API_BASE}/inventory-count/sessions?status=COUNTING&pageSize=1`, {
      headers: {
        Authorization: `Bearer ${(await apiLogin(USERS.storekeeper)).accessToken}`,
        'X-Tenant-Slug': TENANT_SLUG,
      },
    });
    const sessionId = (await listRes.json())?.data?.[0]?.id;
    test.skip(!sessionId, 'No COUNTING session for E2E');

    const auth = await apiLogin(USERS.storekeeper);
    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.addInitScript(authInitScript(auth, USERS.storekeeper.email));
    const page = await context.newPage();
    await page.goto(`${FE_BASE}/inventory-count/${sessionId}`, { waitUntil: 'networkidle', timeout: 60000 });

    await expect(page.getByRole('button', { name: /Submit for approval|Resubmit/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Approve/i })).toHaveCount(0);

    await browser.close();
  });
});
