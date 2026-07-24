/**
 * ACC Big Bang Stage S19 — Settings User Rights removal validation.
 *
 * Usage:
 *   node scripts/verify-acc-s19-settings-user-rights-removal.js
 *
 * Optional env for live API checks (backend must be running on PORT or 4000):
 *   API_BASE=http://localhost:4000
 */

'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const accRuntime = require('../src/acc-runtime');

const API_BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 4000}`;

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function readRepoFile(relativePath) {
  const backendRoot = path.join(__dirname, '..');
  const workspaceRoot = path.join(backendRoot, '..');
  const target = relativePath.startsWith('OSE-Frontend/')
    ? path.join(workspaceRoot, relativePath)
    : path.join(backendRoot, relativePath);
  return fs.readFileSync(target, 'utf8');
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  const data = body?.data ?? body;
  return { status: res.status, body, data };
}

async function loginPilot() {
  return fetchJson(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@grandhorizon.com',
      password: 'Admin@123',
      tenantSlug: 'grand-horizon',
    }),
  });
}

async function main() {
  console.log('\nACC Big Bang S19 — Settings User Rights Removal Validation\n');

  console.log('[1] S18 hard cutover posture retained (backend):');
  assert('ACC hard cutover default ON', accRuntime.isAccHardCutoverEnabled() === true);
  assert('ACC permission enforce ON', accRuntime.isAccEnforcePermissionsEnabled() === true);
  assert('drift-safe fallback ON', accRuntime.isAccPermissionDriftSafeFallbackEnabled() === true);

  console.log('\n[2] Settings User Rights tab removed (frontend):');
  const settingsTs = readRepoFile('OSE-Frontend/src/app/features/admin/settings/settings-page/settings-page.component.ts');
  const settingsHtml = readRepoFile('OSE-Frontend/src/app/features/admin/settings/settings-page/settings-page.component.html');
  const routes = readRepoFile('OSE-Frontend/src/app/app.routes.ts');
  const envTs = readRepoFile('OSE-Frontend/src/environments/environment.ts');
  const envProd = readRepoFile('OSE-Frontend/src/environments/environment.prod.ts');
  const routingUtil = readRepoFile('OSE-Frontend/src/app/features/admin/settings/acc-legacy-routing.util.ts');

  assert('settings-page no legacy tab component import', !settingsTs.includes('SettingsLegacyUserRightsTabComponent'));
  assert('settings-page SettingsTabKey excludes user-rights', settingsTs.includes("type SettingsTabKey = 'profile' | 'security' | 'users' | 'inventory'"));
  assert('settings html no app-settings-legacy-user-rights-tab', !settingsHtml.includes('app-settings-legacy-user-rights-tab'));
  assert('settings html no USER_RIGHTS tab label block', !settingsHtml.includes('tabLabelUserRights'));
  assert('legacy rollback component file removed', !fs.existsSync(
    path.join(__dirname, '../../OSE-Frontend/src/app/features/admin/settings/settings-legacy-user-rights-tab/settings-legacy-user-rights-tab.component.ts'),
  ));
  assert('env no accLegacyUserRightsSettingsTab', !envTs.includes('accLegacyUserRightsSettingsTab'));
  assert('prod env no accLegacyUserRightsSettingsTab', !envProd.includes('accLegacyUserRightsSettingsTab'));

  console.log('\n[3] ACC redirect paths for legacy deep links:');
  assert('ACC_USER_RIGHTS_ROUTE constant present', routingUtil.includes("'/access-control', 'user-rights'"));
  assert('settings redirects via ACC_USER_RIGHTS_ROUTE', settingsTs.includes('ACC_USER_RIGHTS_ROUTE'));
  assert('settings handles ?tab=user-rights redirect', settingsTs.includes("tab === 'user-rights'"));
  assert('app.routes roles alias → user-rights', routes.includes("path: 'roles'") && routes.includes("redirectTo: 'user-rights'"));

  console.log('\n[4] Emergency backend fallbacks retained:');
  assert('rbac.service still available', typeof require('../src/services/rbac.service').getPermissionsForMembership === 'function');
  assert('accRuntime.resolveScope exists', typeof accRuntime.resolveScope === 'function');

  console.log('\n[5] Live API checks (if backend running):');
  let legacyBaseline = 0;
  try {
    const login = await loginPilot();
    if (login.status === 200 && login.data?.accessToken) {
      legacyBaseline = login.data.user?.permissions?.length ?? 0;
      assert('login PASS', true);
      assert('login permission count > 0', legacyBaseline > 0);

      const headers = { Authorization: `Bearer ${login.data.accessToken}` };
      const me = await fetchJson(`${API_BASE}/api/auth/me`, { headers });
      assert('GET /api/auth/me PASS', me.status === 200);
      assert(
        '/auth/me permission count matches login',
        (me.data?.permissions?.length ?? 0) === legacyBaseline,
      );

      assert(
        'User Rights roles API PASS',
        (await fetchJson(`${API_BASE}/api/user-rights/roles`, { headers })).status === 200,
      );
      assert(
        'User Rights matrix API PASS',
        (await fetchJson(`${API_BASE}/api/user-rights/matrix`, { headers })).status === 200,
      );

      const permStatus = await fetchJson(`${API_BASE}/api/access-control/enforcement/status`, { headers });
      assert('GET enforcement/status PASS', permStatus.status === 200);
    } else {
      console.log('  ⚠ Skipping live API checks (backend not running or login failed)');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Permission baseline (login): ${legacyBaseline || 'n/a (API skipped)'}`);
  console.log(`S19 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S19 validation PASS\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
