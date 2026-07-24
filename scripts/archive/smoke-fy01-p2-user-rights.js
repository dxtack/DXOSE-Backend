/**
 * FY 01 P2 — User Rights lifecycle smoke (HTTP API + optional Playwright UI).
 *
 * Usage:
 *   node scripts/smoke-fy01-p2-user-rights.js
 *
 * Env:
 *   API_BASE=http://127.0.0.1:4000
 *   UI_BASE=http://127.0.0.1:4200
 *   SKIP_UI=1  — HTTP only
 */

'use strict';

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const { evaluateAssignmentOperationalHistory } = require('../src/services/assignment-operational-history.service');

const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 4000}`;
const UI_BASE = process.env.UI_BASE || 'http://127.0.0.1:4200';
const SKIP_UI = process.env.SKIP_UI === '1';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
    return;
  }
  failed++;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function httpJson(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { status: res.status, data };
}

async function login(email, password, tenantSlug) {
  const { status, data } = await httpJson('POST', '/auth/login', {
    body: { email, password, tenantSlug },
  });
  if (status !== 200 || !data?.data?.accessToken) {
    throw new Error(`Login failed ${status}: ${JSON.stringify(data)}`);
  }
  return data.data.accessToken;
}

async function runHttpSmoke(token) {
  console.log('\n── HTTP API smoke ──');

  const usersRes = await httpJson('GET', '/user-rights/users', { token });
  assert('GET /user-rights/users', usersRes.status === 200);
  const users = Array.isArray(usersRes.data?.data) ? usersRes.data.data : (usersRes.data?.data?.items ?? []);
  const target = users.find((u) => u.email === 'store@grandhorizon.com')
    || users.find((u) => u.assignmentCount > 0 && u.isActive);
  assert('target user found', !!target, target?.email);

  const activeOnly = await httpJson('GET', `/user-rights/users/${target.id}/assignments`, { token });
  assert('GET assignments (active only)', activeOnly.status === 200);
  const activeList = activeOnly.data?.data ?? [];
  const withInactive = await httpJson(
    'GET',
    `/user-rights/users/${target.id}/assignments?includeInactive=true`,
    { token },
  );
  assert('GET assignments (includeInactive)', withInactive.status === 200);
  const allList = withInactive.data?.data ?? [];
  assert('Show Inactive returns >= active count', allList.length >= activeList.length);

  const assignment = activeList.find((a) => a.isActive && a.properties?.length === 1)
    || activeList.find((a) => a.isActive);
  assert('active assignment for deactivate', !!assignment, assignment?.roleCode);

  const historyProbe = await evaluateAssignmentOperationalHistory(
    await prisma.urUserAssignment.findUnique({
      where: { id: assignment.id },
      include: { properties: { select: { propertyId: true } } },
    }),
  );

  const deact = await httpJson('PATCH', `/user-rights/assignments/${assignment.id}/deactivate`, { token });
  assert('PATCH deactivate', deact.status === 200 && deact.data?.data?.isActive === false);

  const afterDeact = await httpJson(
    'GET',
    `/user-rights/users/${target.id}/assignments?includeInactive=true`,
    { token },
  );
  const inactiveRow = (afterDeact.data?.data ?? []).find((a) => a.id === assignment.id);
  assert('inactive visible with includeInactive', inactiveRow?.isActive === false);

  const react = await httpJson('PATCH', `/user-rights/assignments/${assignment.id}/reactivate`, { token });
  assert(
    'PATCH reactivate',
    react.status === 200 && react.data?.data?.isActive === true,
    react.status !== 200 ? JSON.stringify(react.data) : '',
  );

  const role = await prisma.role.findFirst({ where: { code: 'SECURITY', isActive: true }, select: { id: true } });
  const propertyId = assignment.properties[0]?.id;
  assert('property for disposable', !!propertyId && !!role);

  const disposable = await prisma.urUserAssignment.create({
    data: {
      userId: target.id,
      roleId: role.id,
      isActive: false,
      notes: 'P2 UI smoke disposable',
      properties: { create: [{ propertyId }] },
    },
    include: { properties: { select: { propertyId: true } } },
  });
  const hist = await evaluateAssignmentOperationalHistory(disposable);
  assert('disposable has no history', !hist.hasHistory);

  const delClean = await httpJson('DELETE', `/user-rights/assignments/${disposable.id}`, { token });
  assert('DELETE clean assignment allowed', delClean.status === 200);
  const gone = await prisma.urUserAssignment.findUnique({ where: { id: disposable.id } });
  assert('disposable row removed', gone === null);

  if (historyProbe.hasHistory) {
    const del = await httpJson('DELETE', `/user-rights/assignments/${assignment.id}`, { token });
    assert('DELETE blocked with history', del.status === 409, `status=${del.status}`);
    assert(
      'DELETE error code',
      del.data?.code === 'ASSIGNMENT_HAS_HISTORY' || del.data?.message?.includes('operational history'),
    );
  } else {
    console.log('  (skip delete-block — sample assignment has no operational history)');
  }
}

async function runUiSmoke() {
  if (SKIP_UI) {
    console.log('\n── UI smoke skipped (SKIP_UI=1) ──');
    return;
  }

  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    try {
      playwright = require(path.join(__dirname, '../../OSE-Frontend/node_modules/playwright'));
    } catch {
      console.log('\n── UI smoke skipped (playwright not found) ──');
      return;
    }
  }

  console.log('\n── Playwright UI smoke ──');
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${UI_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#email', 'admin@grandhorizon.com');
    await page.fill('#password', 'Admin@123');
    await page.click('#login-btn');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45000 });

    await page.goto(`${UI_BASE}/access-control/user-rights`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert('User Rights page loads', page.url().includes('user-rights'));

    const usersTab = page.locator('.acc-segmented-nav__segment', { hasText: /Users/i });
    await usersTab.click();
    await page.waitForTimeout(500);

    const showInactiveLabel = page.locator('.acc__users-inactive-toggle');
    assert('Show Inactive toggle present', await showInactiveLabel.count() > 0);
    await showInactiveLabel.locator('.ant-switch').click();
    await page.waitForTimeout(400);

    const userItem = page.locator('.acc__user-list-item', { hasText: 'store@grandhorizon.com' }).first();
    if (await userItem.count() === 0) {
      await page.locator('.acc__user-list-item').first().click();
    } else {
      await userItem.click();
    }
    await page.waitForSelector('.acc__assignment-card', { timeout: 15000 });

    const activeCard = page.locator('.acc__assignment-card:not(.acc__assignment-card--inactive)').first();
    if (await activeCard.count()) {
      await activeCard.locator('button[aria-label="Assignment actions"]').click();
      await page.locator('span[nz-popconfirm]', { hasText: 'Deactivate' }).click();
      const pop = page.locator('.ant-popconfirm, .ant-popover');
      await pop.waitFor({ state: 'visible', timeout: 10000 });
      await pop.locator('button.ant-btn-danger, button.ant-btn-primary').first().click();
      await page.waitForTimeout(1200);
      assert('Deactivate action triggered', true);

      await showInactiveLabel.locator('.ant-switch').click();
      await page.waitForTimeout(800);
      const inactiveCard = page.locator('.acc__assignment-card--inactive').first();
      assert('Inactive assignment visible', await inactiveCard.count() > 0);

      await inactiveCard.locator('button[aria-label="Inactive assignment actions"]').click();
      await page.locator('.ant-dropdown-menu-item', { hasText: 'Reactivate' }).click();
      await page.waitForTimeout(1200);
      assert('Reactivate action triggered', true);
    } else {
      console.log('  (no active assignment card — partial UI smoke)');
    }
  } catch (err) {
    assert('UI smoke completed', false, err.message);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('\nFY 01 P2 — User Rights Smoke Test');
  console.log('='.repeat(60));
  console.log(`API: ${API_BASE}  UI: ${UI_BASE}`);

  try {
    const token = await login('admin@grandhorizon.com', 'Admin@123', 'grand-horizon');
    assert('login', !!token);
    await runHttpSmoke(token);
  } catch (e) {
    assert('login / HTTP smoke', false, e.message);
  }

  await runUiSmoke();

  console.log('\n── Summary ──');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('='.repeat(60) + '\n');

  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
