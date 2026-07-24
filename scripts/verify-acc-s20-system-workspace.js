/**
 * ACC Big Bang Stage S20 — System workspace validation.
 *
 * Usage:
 *   node scripts/verify-acc-s20-system-workspace.js
 *
 * Optional env for live API checks (backend must be running on PORT or 4000):
 *   API_BASE=http://localhost:4000
 */

'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const accRuntime = require('../src/acc-runtime');
const {
  getAccSystemDiagnostics,
  getProtectedRolesPolicyReadOnly,
} = require('../src/services/acc-system-diagnostics.service');
const { PROTECTED_ROLE_CODES } = require('../src/constants/role-codes.constants');

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

async function main() {
  console.log('\nACC Big Bang S20 — System Workspace Validation\n');

  console.log('[1] Backend read-only system module:');
  assert('getAccSystemDiagnostics exists', typeof getAccSystemDiagnostics === 'function');
  assert('getProtectedRolesPolicyReadOnly exists', typeof getProtectedRolesPolicyReadOnly === 'function');
  assert('accSystem routes file exists', fs.existsSync(path.join(__dirname, '../src/routes/accSystem.routes.js')));

  console.log('\n[2] Frontend System tab wired:');
  const shell = readRepoFile('OSE-Frontend/src/app/features/access-control/access-control-center-shell/access-control-center-shell.component.ts');
  const routes = readRepoFile('OSE-Frontend/src/app/app.routes.ts');
  assert('ACC shell includes system tab', shell.includes("key: 'system'"));
  assert('app.routes includes /access-control/system', routes.includes("path: 'system'"));
  assert(
    'system component file exists',
    fs.existsSync(path.join(__dirname, '../../OSE-Frontend/src/app/features/access-control/acc-system/acc-system-diagnostics.component.ts')),
  );

  console.log('\n[3] In-process diagnostics (pilot tenant):');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const pilot = await prisma.user.findFirst({
      where: { email: 'admin@grandhorizon.com' },
      select: { id: true },
    });
    const tenant = await prisma.tenant.findFirst({
      where: { slug: 'grand-horizon' },
      select: { id: true, slug: true },
    });
    assert('pilot user found', !!pilot?.id);
    assert('pilot tenant found', !!tenant?.id);

    const diagnostics = await getAccSystemDiagnostics({
      userId: pilot.id,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    });
    assert('diagnostics overall status present', ['healthy', 'actionable'].includes(diagnostics.overall.status));
    assert('diagnostics findings array', Array.isArray(diagnostics.findings) && diagnostics.findings.length > 0);
    assert('permission session evaluation present', !!diagnostics.permission);
    assert('permission counts aligned', diagnostics.permission.setsEqual === true);
    assert('transfer workflow chain present', diagnostics.workflows.transfer.enforcedCount === 2);
    assert('breakage workflow chain present', diagnostics.workflows.breakage.enforcedCount === 4);
    assert('assignments metrics present', typeof diagnostics.assignments.activeAssignments === 'number');
    assert('shadow stats present', typeof diagnostics.shadow.totalMismatches === 'number');
    assert('rollback instructions present', !!diagnostics.rollback?.disableHardCutover);

    const protectedPolicy = await getProtectedRolesPolicyReadOnly();
    assert('protected roles readOnly flag', protectedPolicy.readOnly === true);
    assert(
      'protected roles include SUPER_ADMIN and ORG_MANAGER',
      protectedPolicy.roles.some((r) => r.roleCode === 'SUPER_ADMIN')
        && protectedPolicy.roles.some((r) => r.roleCode === 'ORG_MANAGER'),
    );
    assert(
      'protected role codes match constants',
      protectedPolicy.roles.length === PROTECTED_ROLE_CODES.length,
    );
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n[4] S18 hard cutover retained:');
  assert('ACC hard cutover ON', accRuntime.isAccHardCutoverEnabled() === true);

  console.log('\n[5] Live API checks (if backend running):');
  let loginPermCount = 0;
  try {
    const login = await loginSuperAdmin();
    if (login.status === 200 && login.data?.accessToken) {
      loginPermCount = login.data.user?.permissions?.length ?? 0;
      const headers = { Authorization: `Bearer ${login.data.accessToken}` };
      assert('super admin login PASS', true);
      assert('login permission count > 0', loginPermCount > 0);
      assert('GET /api/auth/me PASS', (await fetchJson(`${API_BASE}/api/auth/me`, { headers })).status === 200);

      const diagnosticsApi = await fetchJson(`${API_BASE}/api/access-control/system/diagnostics`, { headers });
      assert('GET /api/access-control/system/diagnostics PASS', diagnosticsApi.status === 200);
      assert('diagnostics API overall status', !!diagnosticsApi.data?.overall?.status);
      assert(
        'diagnostics API permission aligned',
        diagnosticsApi.data?.permission?.setsEqual === true,
      );

      const protectedApi = await fetchJson(`${API_BASE}/api/access-control/system/protected-roles-policy`, { headers });
      assert('GET /api/access-control/system/protected-roles-policy PASS', protectedApi.status === 200);
      assert('protected roles API readOnly', protectedApi.data?.readOnly === true);

      assert(
        'User Rights matrix API PASS',
        (await fetchJson(`${API_BASE}/api/user-rights/matrix`, { headers })).status === 200,
      );
    } else {
      console.log('  ⚠ Skipping live API checks (backend not running or login failed)');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Permission baseline (login): ${loginPermCount || 'n/a (API skipped)'}`);
  console.log(`S20 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S20 validation PASS\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
