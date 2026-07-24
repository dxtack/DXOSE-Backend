/**
 * ACC Big Bang Stage S13 — Controlled legacy retirement validation.
 *
 * Usage:
 *   node scripts/verify-acc-s13-legacy-retirement.js
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
  getRoleIdByCode,
  resolveUserBestRole,
  membershipRoleCode,
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

async function resolveLegacyForMembership(userId, membership) {
  const rc = membershipRoleCode(membership);
  const bestRole = await resolveUserBestRole(userId, rc);
  let roleId = membership.roleId ?? membership.role?.id;
  if (bestRole) {
    const bestRoleId = await getRoleIdByCode(bestRole);
    if (bestRoleId) roleId = bestRoleId;
  } else if (!roleId && rc) {
    roleId = await getRoleIdByCode(rc);
  }
  return getPermissionsForMembership({ roleId, roleCode: bestRole });
}

async function main() {
  console.log('\nACC Big Bang S13 — Controlled Legacy Retirement Validation\n');

  console.log('[1] Module load + S13 flags (safe defaults):');
  assert('accRuntime.resolvePermissionsForMembership exists', typeof accRuntime.resolvePermissionsForMembership === 'function');
  assert('ACC_ENFORCE_PERMISSIONS default false', accRuntime.isAccEnforcePermissionsEnabled() === false);
  assert(
    'ACC_PERMISSION_DRIFT_SAFE_FALLBACK default true',
    accRuntime.isAccPermissionDriftSafeFallbackEnabled() === true,
  );
  const flags = accRuntime.getAccFeatureFlagStatus();
  assert('status includes accPermissionDriftSafeFallback', flags.accPermissionDriftSafeFallback === true);

  console.log('\n[2] superAdmin impersonation wired through accRuntime:');
  const superAdminSrc = fs.readFileSync(
    path.join(__dirname, '../src/services/superAdmin.service.js'),
    'utf8',
  );
  assert('superAdmin requires acc-runtime', superAdminSrc.includes("require('../acc-runtime')"));
  assert(
    'superAdmin uses accRuntime.resolvePermissionsForMembership',
    superAdminSrc.includes('accRuntime.resolvePermissionsForMembership'),
  );
  assert(
    'superAdmin no longer calls getPermissionsForMembership directly',
    !superAdminSrc.includes('getPermissionsForMembership('),
  );

  console.log('\n[3] Legacy baseline unchanged (enforce OFF):');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  process.env.ACC_PERMISSION_DRIFT_SAFE_FALLBACK = 'true';

  const pilot = await prisma.user.findFirst({
    where: { email: 'admin@grandhorizon.com' },
    select: {
      id: true,
      email: true,
      memberships: {
        where: { isActive: true, tenant: { slug: 'grand-horizon' } },
        include: { role: true, tenant: true },
        take: 1,
      },
    },
  });
  assert('pilot user found', !!pilot?.id);
  const membership = pilot?.memberships?.[0];
  assert('pilot membership found', !!membership?.id);

  let legacyBaseline = [];
  let roleIdForPerm = null;
  let bestRole = null;
  if (pilot?.id && membership) {
    legacyBaseline = await resolveLegacyForMembership(pilot.id, membership);
    assert(`legacy permission count = ${legacyBaseline.length}`, legacyBaseline.length > 0);

    const offPerms = await accRuntime.resolvePermissionsForMembership({
      userId: pilot.id,
      membership,
      roleId: membership.roleId,
      roleCode: membershipRoleCode(membership),
    });
    assert('enforce OFF matches legacy count', offPerms.length === legacyBaseline.length);
    assert('enforce OFF matches legacy set', _setsEqual(offPerms, legacyBaseline));

    bestRole = await resolveUserBestRole(pilot.id, membershipRoleCode(membership));
    roleIdForPerm = membership.roleId ?? membership.role?.id;
    if (bestRole) {
      const bestRoleId = await getRoleIdByCode(bestRole);
      if (bestRoleId) roleIdForPerm = bestRoleId;
    }
  }

  console.log('\n[4] ACC primary + drift-safe fallback (enforce ON):');
  process.env.ACC_ENFORCE_PERMISSIONS = 'true';

  if (pilot?.id && membership) {
    const enforced = await accRuntime.resolvePermissionsForMembership({
      userId: pilot.id,
      membership,
      roleId: roleIdForPerm,
      roleCode: bestRole,
    });
    assert('enforce ON preserves legacy permission count', enforced.length === legacyBaseline.length);
    assert('enforce ON preserves legacy permission set', _setsEqual(enforced, legacyBaseline));
  }

  console.log('\n[5] Drift-safe fallback rollback flag:');
  process.env.ACC_PERMISSION_DRIFT_SAFE_FALLBACK = 'false';
  assert('drift-safe fallback can be disabled', accRuntime.isAccPermissionDriftSafeFallbackEnabled() === false);
  process.env.ACC_PERMISSION_DRIFT_SAFE_FALLBACK = 'true';

  console.log('\n[6] Legacy fallback on ACC miss/error retained:');
  const adminRoleId = await getRoleIdByCode('ADMIN');
  const fallbackPerms = await accRuntime.resolvePermissionsForMembership({
    userId: pilot?.id ?? '00000000-0000-0000-0000-000000000099',
    membership: { id: 'nonexistent-membership-id' },
    roleId: adminRoleId,
    roleCode: 'ADMIN',
  });
  assert('fallback returns legacy ADMIN permissions', Array.isArray(fallbackPerms) && fallbackPerms.length > 0);

  console.log('\n[7] Live API checks (if backend running, enforce OFF):');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  try {
    const loginOff = await loginPilot();
    if (loginOff.status === 200 && Array.isArray(loginOff.data?.user?.permissions)) {
      assert('login PASS', loginOff.status === 200);
      assert(
        'login permission count unchanged',
        loginOff.data.user.permissions.length === legacyBaseline.length,
      );

      const token = loginOff.data.accessToken;
      const meOff = await fetchJson(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('GET /api/auth/me PASS', meOff.status === 200);

      const roles = await fetchJson(`${API_BASE}/api/user-rights/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('User Rights roles API PASS', roles.status === 200);

      const matrix = await fetchJson(`${API_BASE}/api/user-rights/matrix`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('User Rights matrix API PASS', matrix.status === 200);
    } else {
      console.log('  ⚠ Skipping live API checks (backend not running or login failed)');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log('\n[8] Resetting flags to safe defaults:');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  process.env.ACC_PERMISSION_DRIFT_SAFE_FALLBACK = 'true';
  assert('ACC_ENFORCE_PERMISSIONS reset to false', accRuntime.isAccEnforcePermissionsEnabled() === false);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`S13 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S13 validation PASS\n');
}

main()
  .catch((e) => {
    process.env.ACC_ENFORCE_PERMISSIONS = 'false';
    process.env.ACC_PERMISSION_DRIFT_SAFE_FALLBACK = 'true';
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
