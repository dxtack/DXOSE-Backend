/**
 * ACC Big Bang Stage S14 — Permission enforcement pilot validation.
 *
 * Usage:
 *   node scripts/verify-acc-s14-permission-enforcement-pilot.js
 *
 * Optional env for live API checks (backend must be running on PORT or 4000):
 *   API_BASE=http://localhost:4000
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const accRuntime = require('../src/acc-runtime');
const {
  getPermissionsForMembership,
  getRoleIdByCode,
  resolveUserBestRole,
  membershipRoleCode,
} = require('../src/services/rbac.service');
const {
  evaluatePermissionResolution,
  getPermissionEnforcementStatus,
} = require('../src/services/acc-enforcement-pilot.service');
const { _setsEqual } = require('../src/acc-runtime/resolvePermissions');

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 4000}`;

let passed = 0;
let failed = 0;
const drifts = [];

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

async function main() {
  console.log('\nACC Big Bang S14 — Permission Enforcement Pilot Validation\n');

  console.log('[1] Safe defaults (production posture):');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  process.env.ACC_ENFORCE_PERMISSIONS_PILOT = 'false';
  process.env.ACC_PERMISSION_DRIFT_SAFE_FALLBACK = 'true';

  assert('ACC_ENFORCE_PERMISSIONS default false', accRuntime.isAccEnforcePermissionsEnabled() === false);
  assert('ACC_ENFORCE_PERMISSIONS_PILOT default false', accRuntime.isAccEnforcePermissionsPilotEnabled() === false);
  assert('ACC_PERMISSION_DRIFT_SAFE_FALLBACK default true', accRuntime.isAccPermissionDriftSafeFallbackEnabled() === true);

  const pilot = await prisma.user.findFirst({
    where: { email: 'admin@grandhorizon.com' },
    select: {
      id: true,
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
    bestRole = await resolveUserBestRole(pilot.id, membershipRoleCode(membership));
    roleIdForPerm = membership.roleId ?? membership.role?.id;
    if (bestRole) {
      const bestRoleId = await getRoleIdByCode(bestRole);
      if (bestRoleId) roleIdForPerm = bestRoleId;
    }
    legacyBaseline = await getPermissionsForMembership({ roleId: roleIdForPerm, roleCode: bestRole });
    assert(`legacy permission count = ${legacyBaseline.length}`, legacyBaseline.length > 0);

    const offPerms = await accRuntime.resolvePermissionsForMembership({
      userId: pilot.id,
      membership,
      roleId: roleIdForPerm,
      roleCode: bestRole,
    });
    assert('default posture matches legacy count', offPerms.length === legacyBaseline.length);
    assert('default posture matches legacy set', _setsEqual(offPerms, legacyBaseline));
  }

  console.log('\n[2] Tenant-scoped pilot activation:');
  process.env.ACC_ENFORCE_PERMISSIONS_PILOT = 'true';
  process.env.ACC_ENFORCE_PERMISSIONS_PILOT_TENANTS = 'grand-horizon';

  assert(
    'pilot active for grand-horizon',
    accRuntime.isAccEnforcePermissionsActiveForTenant({ tenantSlug: 'grand-horizon' }) === true,
  );
  assert(
    'pilot inactive for other tenant',
    accRuntime.isAccEnforcePermissionsActiveForTenant({ tenantSlug: 'other-hotel' }) === false,
  );

  if (pilot?.id && membership) {
    const pilotEval = await evaluatePermissionResolution({
      userId: pilot.id,
      membership,
      roleId: roleIdForPerm,
      roleCode: bestRole,
    });
    assert('pilot tenant enforcement mode = pilot', pilotEval.enforcement.mode === 'pilot');
    assert('pilot enforced count matches legacy', pilotEval.enforcedCount === legacyBaseline.length);
    assert('pilot enforced set identical to legacy', pilotEval.setsEqual === true);
    if (pilotEval.drift) {
      drifts.push({ tenant: 'grand-horizon', source: pilotEval.source });
    }
    assert('pilot resolution source is acc or legacy fallback', ['acc', 'legacy-drift-fallback', 'legacy-fallback'].includes(pilotEval.source));
  }

  console.log('\n[3] Automatic fallback paths retained:');
  const adminRoleId = await getRoleIdByCode('ADMIN');
  const missFallback = await accRuntime.resolvePermissionsForMembership({
    userId: pilot?.id ?? '00000000-0000-0000-0000-000000000099',
    membership: { id: 'nonexistent-membership-id', tenant: { slug: 'grand-horizon' } },
    roleId: adminRoleId,
    roleCode: 'ADMIN',
    tenantSlug: 'grand-horizon',
  });
  assert('ACC miss falls back to legacy permissions', Array.isArray(missFallback) && missFallback.length > 0);

  process.env.ACC_ENFORCE_PERMISSIONS_PILOT = 'false';
  process.env.ACC_ENFORCE_PERMISSIONS_PILOT_TENANTS = '';
  assert(
    'non-pilot tenant stays legacy-only',
    accRuntime.isAccEnforcePermissionsActiveForTenant({ tenantSlug: 'grand-horizon' }) === false,
  );

  console.log('\n[4] Global enforce + drift-safe fallback:');
  process.env.ACC_ENFORCE_PERMISSIONS = 'true';
  if (pilot?.id && membership) {
    const globalEnforced = await accRuntime.resolvePermissionsForMembership({
      userId: pilot.id,
      membership,
      roleId: roleIdForPerm,
      roleCode: bestRole,
    });
    assert('global enforce preserves legacy count', globalEnforced.length === legacyBaseline.length);
    assert('global enforce preserves legacy set', _setsEqual(globalEnforced, legacyBaseline));
  }

  console.log('\n[5] Enforcement status payload:');
  const status = getPermissionEnforcementStatus({ tenantSlug: 'grand-horizon' });
  assert('status includes rollback instructions', !!status.rollback?.disablePilot);
  assert('status includes pilotTenantSlugs array', Array.isArray(status.pilotTenantSlugs));

  console.log('\n[6] Live API checks (if backend running, default posture):');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  process.env.ACC_ENFORCE_PERMISSIONS_PILOT = 'false';
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

      const enforcementStatus = await fetchJson(`${API_BASE}/api/access-control/enforcement/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('GET /api/access-control/enforcement/status PASS', enforcementStatus.status === 200);
      assert(
        'status reports legacy mode by default',
        enforcementStatus.data?.enforcement?.mode === 'legacy',
      );

      const sessionEval = await fetchJson(`${API_BASE}/api/access-control/enforcement/session-evaluation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('GET /api/access-control/enforcement/session-evaluation PASS', sessionEval.status === 200);
      assert(
        'session evaluation setsEqual true',
        sessionEval.data?.setsEqual === true,
      );
    } else {
      console.log('  ⚠ Skipping live API checks (backend not running or login failed)');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log('\n[7] Resetting flags to safe defaults:');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  process.env.ACC_ENFORCE_PERMISSIONS_PILOT = 'false';
  process.env.ACC_ENFORCE_PERMISSIONS_PILOT_TENANTS = '';
  process.env.ACC_PERMISSION_DRIFT_SAFE_FALLBACK = 'true';
  assert('flags reset to safe defaults', accRuntime.isAccEnforcePermissionsEnabled() === false);

  console.log(`\n${'─'.repeat(50)}`);
  console.log('Permission counts (pilot admin):');
  console.log(`  legacy baseline: ${legacyBaseline.length}`);
  if (drifts.length > 0) {
    console.log('Drift observed:', JSON.stringify(drifts, null, 2));
  } else {
    console.log('Drift observed: none');
  }
  console.log(`S14 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S14 validation PASS\n');
}

main()
  .catch((e) => {
    process.env.ACC_ENFORCE_PERMISSIONS = 'false';
    process.env.ACC_ENFORCE_PERMISSIONS_PILOT = 'false';
    process.env.ACC_ENFORCE_PERMISSIONS_PILOT_TENANTS = '';
    process.env.ACC_PERMISSION_DRIFT_SAFE_FALLBACK = 'true';
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
