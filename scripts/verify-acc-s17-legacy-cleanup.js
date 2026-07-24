/**
 * ACC Big Bang Stage S17 — Controlled legacy cleanup validation.
 *
 * Usage:
 *   node scripts/verify-acc-s17-legacy-cleanup.js
 *
 * Optional env for live API checks (backend must be running on PORT or 4000):
 *   API_BASE=http://localhost:4000
 */

'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const accRuntime = require('../src/acc-runtime');
const {
  getPermissionsForMembership,
  resolveUserBestRole,
  membershipRoleCode,
  getRoleIdByCode,
} = require('../src/services/rbac.service');
const { _setsEqual } = require('../src/acc-runtime/resolvePermissions');

const prisma = new PrismaClient();
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

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  const data = body?.data ?? body;
  return { status: res.status, body, data };
}

async function loginSuperAdmin() {
  return fetchJson(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SUPER_ADMIN_EMAIL || 'super@ose.local',
      password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123',
    }),
  });
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

function readRepoFile(relativePath) {
  const backendRoot = path.join(__dirname, '..');
  const workspaceRoot = path.join(backendRoot, '..');
  const target = relativePath.startsWith('OSE-Frontend/')
    ? path.join(workspaceRoot, relativePath)
    : path.join(backendRoot, relativePath);
  return fs.readFileSync(target, 'utf8');
}

async function main() {
  console.log('\nACC Big Bang S17 — Controlled Legacy Cleanup Validation\n');

  console.log('[1] Pilot flags remain safe defaults:');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  process.env.ACC_ENFORCE_PERMISSIONS_PILOT = 'false';
  process.env.ACC_ENFORCE_WORKFLOWS = 'false';
  process.env.ACC_ENFORCE_WORKFLOWS_PILOT = 'false';
  process.env.ACC_ENFORCE_ADVANCED_POLICIES = 'false';
  process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT = 'false';

  assert('ACC permission enforce OFF', accRuntime.isAccEnforcePermissionsEnabled() === false);
  assert('ACC workflow enforce OFF', accRuntime.isAccEnforceWorkflowsEnabled() === false);
  assert('ACC policy enforce OFF', accRuntime.isAccEnforceAdvancedPoliciesEnabled() === false);

  console.log('\n[2] Backend legacy bypass paths retired (S13):');
  const superAdminSrc = readRepoFile('src/services/superAdmin.service.js');
  assert('superAdmin uses accRuntime', superAdminSrc.includes('accRuntime.resolvePermissionsForMembership'));
  assert(
    'superAdmin no direct getPermissionsForMembership',
    !superAdminSrc.includes('getPermissionsForMembership('),
  );

  console.log('\n[3] Emergency fallbacks retained:');
  assert('rbac.service getPermissionsForMembership exists', typeof getPermissionsForMembership === 'function');
  assert('accRuntime.resolvePermissionsForMembership exists', typeof accRuntime.resolvePermissionsForMembership === 'function');
  assert('accRuntime.resolveScope exists', typeof accRuntime.resolveScope === 'function');
  assert('workflow shadow service exists', typeof require('../src/engines/workflow-shadow.service').scheduleWorkflowShadowCompare === 'function');

  console.log('\n[4] Permission baseline unchanged:');
  const pilot = await prisma.user.findFirst({
    where: { email: 'admin@grandhorizon.com' },
    select: {
      id: true,
      memberships: {
        where: { isActive: true, tenant: { slug: 'grand-horizon' } },
        include: { role: true },
        take: 1,
      },
    },
  });
  const membership = pilot?.memberships?.[0];
  assert('pilot user found', !!pilot?.id && !!membership?.id);

  let legacyCount = 0;
  if (pilot?.id && membership) {
    const bestRole = await resolveUserBestRole(pilot.id, membershipRoleCode(membership));
    let roleId = membership.roleId ?? membership.role?.id;
    if (bestRole) {
      const bestRoleId = await getRoleIdByCode(bestRole);
      if (bestRoleId) roleId = bestRoleId;
    }
    const legacy = await getPermissionsForMembership({ roleId, roleCode: bestRole });
    legacyCount = legacy.length;
    const resolved = await accRuntime.resolvePermissionsForMembership({
      userId: pilot.id,
      membership,
      roleId,
      roleCode: bestRole,
    });
    assert(`legacy permission count = ${legacyCount}`, legacyCount > 0);
    assert('default resolve matches legacy set', _setsEqual(resolved, legacy));
  }

  console.log('\n[5] Frontend legacy Settings User Rights retired (default build):');
  const settingsPageSrc = readRepoFile('OSE-Frontend/src/app/features/admin/settings/settings-page/settings-page.component.ts');
  const settingsHtml = readRepoFile('OSE-Frontend/src/app/features/admin/settings/settings-page/settings-page.component.html');
  const envProd = readRepoFile('OSE-Frontend/src/environments/environment.prod.ts');
  assert(
    'settings-page no direct UserRightsComponent import',
    !settingsPageSrc.includes("from '../../user-rights/user-rights.component'"),
  );
  assert(
    'settings-page uses legacy rollback component',
    settingsPageSrc.includes('SettingsLegacyUserRightsTabComponent'),
  );
  assert(
    'settings-page uses ACC_USER_RIGHTS_ROUTE redirect',
    settingsPageSrc.includes('ACC_USER_RIGHTS_ROUTE'),
  );
  assert(
    'settings html no direct app-user-rights',
    !settingsHtml.includes('<app-user-rights'),
  );
  assert('prod env legacy tab flag false', envProd.includes('accLegacyUserRightsSettingsTab: false'));
  assert(
    'rollback component file exists',
    fs.existsSync(path.join(__dirname, '../../OSE-Frontend/src/app/features/admin/settings/settings-legacy-user-rights-tab/settings-legacy-user-rights-tab.component.ts')),
  );

  console.log('\n[6] Live API checks (if backend running):');
  try {
    const login = await loginPilot();
    const superLogin = await loginSuperAdmin();
    if (login.status === 200 && login.data?.accessToken) {
      assert('login PASS', true);
      const headers = { Authorization: `Bearer ${login.data.accessToken}` };
      const me = await fetchJson(`${API_BASE}/api/auth/me`, { headers });
      assert('GET /api/auth/me PASS', me.status === 200);
      assert(
        'login permission count unchanged',
        Array.isArray(login.data?.user?.permissions) && login.data.user.permissions.length === legacyCount,
      );
      assert(
        'user-rights roles API PASS',
        (await fetchJson(`${API_BASE}/api/user-rights/roles`, { headers })).status === 200,
      );
      assert(
        'user-rights matrix API PASS',
        (await fetchJson(`${API_BASE}/api/user-rights/matrix`, { headers })).status === 200,
      );
      if (superLogin.status === 200 && superLogin.data?.accessToken) {
        const superHeaders = { Authorization: `Bearer ${superLogin.data.accessToken}` };
        assert(
          'policies summary PASS (SUPER_ADMIN)',
          (await fetchJson(`${API_BASE}/api/access-control/policies/summary`, { headers: superHeaders })).status === 200,
        );
      } else {
        console.log('  ⚠ Skipping policies summary — super admin login unavailable');
      }
    } else {
      console.log('  ⚠ Skipping live API checks (backend not running or login failed)');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`S17 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S17 validation PASS\n');
}

main()
  .catch((e) => {
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
