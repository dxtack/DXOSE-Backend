/**
 * ACC Big Bang Stage S9 — Runtime cutover validation.
 *
 * Usage:
 *   node scripts/verify-acc-s9-cutover.js
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
const { getFeatureFlagStatus, isShadowModeEnabled } = require('../src/engines/shadow-mode.service');
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
  console.log('\nACC Big Bang S9 — Runtime Cutover Validation\n');

  // ── 1. Syntax / module load ───────────────────────────────────────────────
  console.log('[1] Module load + feature flags (default OFF):');
  assert('accRuntime.resolvePermissionsForMembership exists', typeof accRuntime.resolvePermissionsForMembership === 'function');
  assert('ACC_ENFORCE_PERMISSIONS default false', accRuntime.isAccEnforcePermissionsEnabled() === false);
  const flags = getFeatureFlagStatus();
  assert('shadow flag status includes accEnforcePermissions', 'accEnforcePermissions' in flags);
  assert('accEnforcePermissions in status is false', flags.accEnforcePermissions === false);

  // ── 2. Legacy baseline for pilot ──────────────────────────────────────────
  console.log('\n[2] Legacy baseline (enforce OFF):');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';

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
  }

  // ── 3. ACC primary (enforce ON) ───────────────────────────────────────────
  console.log('\n[3] ACC primary path (enforce ON):');
  process.env.ACC_ENFORCE_PERMISSIONS = 'true';

  if (pilot?.id && membership) {
    const bestRole = await resolveUserBestRole(pilot.id, membershipRoleCode(membership));
    let roleIdForPerm = membership.roleId ?? membership.role?.id;
    if (bestRole) {
      const bestRoleId = await getRoleIdByCode(bestRole);
      if (bestRoleId) roleIdForPerm = bestRoleId;
    }

    const accDirect = await accRuntime.resolveAccPermissionsForMembership({
      userId: pilot.id,
      membership,
      roleId: roleIdForPerm,
      roleCode: bestRole,
    });
    assert('ACC session assignment resolves permissions', Array.isArray(accDirect) && accDirect.length > 0);

    const enforced = await accRuntime.resolvePermissionsForMembership({
      userId: pilot.id,
      membership,
      roleId: roleIdForPerm,
      roleCode: bestRole,
    });
    assert('enforce ON permission count unchanged', enforced.length === legacyBaseline.length);
    if (!_setsEqual(enforced, legacyBaseline)) {
      drifts.push({ user: pilot.email, acc: enforced.length, legacy: legacyBaseline.length });
    }
    assert('enforce ON permission set unchanged', _setsEqual(enforced, legacyBaseline));
  }

  // ── 4. Legacy fallback on missing assignment ──────────────────────────────
  console.log('\n[4] Legacy fallback when ACC path unavailable:');
  const adminRoleId = await getRoleIdByCode('ADMIN');
  const fallbackPerms = await accRuntime.resolvePermissionsForMembership({
    userId: pilot?.id ?? '00000000-0000-0000-0000-000000000099',
    membership: { id: 'nonexistent-membership-id' },
    roleId: adminRoleId,
    roleCode: 'ADMIN',
  });
  assert('fallback returns legacy ADMIN matrix/DB permissions', Array.isArray(fallbackPerms) && fallbackPerms.length > 0);

  // ── 5. Shadow still operational ─────────────────────────────────────────
  console.log('\n[5] Shadow mode still available:');
  process.env.ENABLE_UR_SHADOW_MODE = 'true';
  assert('shadow mode can be enabled', isShadowModeEnabled() === true);
  process.env.ENABLE_UR_SHADOW_MODE = 'false';

  // ── 6. Live API (optional) ────────────────────────────────────────────────
  console.log('\n[6] Live API checks (if backend running):');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  let apiOk = false;
  try {
    const loginOff = await loginPilot();
    apiOk = loginOff.status === 200 && Array.isArray(loginOff.data?.user?.permissions);
    if (apiOk) {
      assert('login PASS (enforce OFF)', loginOff.status === 200);
      assert(
        'login permission count unchanged (OFF)',
        loginOff.data.user.permissions.length === legacyBaseline.length,
      );

      const token = loginOff.data.accessToken;
      const meOff = await fetchJson(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('GET /api/auth/me PASS (OFF)', meOff.status === 200);

      const roles = await fetchJson(`${API_BASE}/api/user-rights/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('User Rights roles API PASS (OFF)', roles.status === 200);

      const matrix = await fetchJson(`${API_BASE}/api/user-rights/matrix`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('User Rights matrix API PASS (OFF)', matrix.status === 200);
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  process.env.ACC_ENFORCE_PERMISSIONS = 'true';
  if (apiOk) {
    console.log('  ⚠ enforce ON live API requires server restart with ACC_ENFORCE_PERMISSIONS=true');
    console.log('  ⚠ in-process enforce ON resolution validated in section [3]');
  }

  // ── Reset flags ───────────────────────────────────────────────────────────
  console.log('\n[7] Resetting flags to safe defaults:');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  process.env.ENABLE_UR_SHADOW_MODE = 'false';
  assert('ACC_ENFORCE_PERMISSIONS reset to false', accRuntime.isAccEnforcePermissionsEnabled() === false);

  console.log(`\n${'─'.repeat(50)}`);
  if (drifts.length > 0) {
    console.log('Drift observed:', JSON.stringify(drifts, null, 2));
  } else {
    console.log('Drift observed: none');
  }
  console.log(`S9 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S9 validation PASS\n');
}

main()
  .catch((e) => {
    process.env.ACC_ENFORCE_PERMISSIONS = 'false';
    process.env.ENABLE_UR_SHADOW_MODE = 'false';
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
