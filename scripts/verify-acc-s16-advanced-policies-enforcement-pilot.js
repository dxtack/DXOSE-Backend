/**
 * ACC Big Bang Stage S16 — Advanced policy enforcement pilot validation.
 *
 * Usage:
 *   node scripts/verify-acc-s16-advanced-policies-enforcement-pilot.js
 *
 * Optional env for live API checks (backend must be running on PORT or 4000):
 *   API_BASE=http://localhost:4000
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const accRuntime = require('../src/acc-runtime');
const {
  createFieldSecurityRule,
  createUserException,
  createScheduledAccess,
  deleteFieldSecurityRule,
  deleteUserException,
  deleteScheduledAccess,
} = require('../src/services/acc-advanced-policy.service');
const {
  resolveAdvancedPolicyEvaluation,
  getPolicyEnforcementStatus,
} = require('../src/services/policy-enforcement-pilot.service');
const { observeAdvancedPolicies } = require('../src/engines/policy-evaluation.engine');
const { buildLegacyPolicyBaseline } = require('../src/engines/policy-evaluation.engine');

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 4000}`;

let passed = 0;
let failed = 0;
const drifts = [];
const cleanup = { fieldIds: [], exceptionIds: [], scheduleIds: [] };

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

async function main() {
  console.log('\nACC Big Bang S16 — Advanced Policy Enforcement Pilot Validation\n');

  console.log('[1] Safe defaults (production posture):');
  process.env.ACC_ENFORCE_ADVANCED_POLICIES = 'false';
  process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT = 'false';
  process.env.ACC_POLICY_DRIFT_SAFE_FALLBACK = 'true';
  process.env.ENABLE_ACC_POLICY_OBSERVE = 'false';

  assert('ACC_ENFORCE_ADVANCED_POLICIES default false', accRuntime.isAccEnforceAdvancedPoliciesEnabled() === false);
  assert('ACC_ENFORCE_ADVANCED_POLICIES_PILOT default false', accRuntime.isAccEnforceAdvancedPoliciesPilotEnabled() === false);
  assert('ACC_POLICY_DRIFT_SAFE_FALLBACK default true', accRuntime.isAccPolicyDriftSafeFallbackEnabled() === true);

  const admin = await prisma.user.findFirst({
    where: { email: 'admin@grandhorizon.com' },
    select: { id: true },
  });
  const adminRole = await prisma.role.findFirst({ where: { code: 'ADMIN' }, select: { id: true } });
  const pilotTenant = await prisma.tenant.findFirst({
    where: { slug: 'grand-horizon' },
    select: { id: true, slug: true },
  });
  assert('pilot admin found', !!admin?.id);
  assert('ADMIN role found', !!adminRole?.id);
  assert('pilot tenant found', !!pilotTenant?.id);

  const field = await createFieldSecurityRule(
    {
      tenantId: pilotTenant.id,
      roleId: adminRole.id,
      resourceCode: 'BREAKAGE',
      fieldKey: 'unitCost',
      accessLevel: 'READ_ONLY',
      reason: 'S16 verify',
    },
    admin.id,
  );
  cleanup.fieldIds.push(field.id);

  const exception = await createUserException(
    {
      userId: admin.id,
      exceptionType: 'FIELD_ACCESS',
      resourceCode: 'BREAKAGE',
      fieldKey: 'unitCost',
      reason: 'S16 verify',
    },
    admin.id,
  );
  cleanup.exceptionIds.push(exception.id);

  const schedule = await createScheduledAccess(
    {
      tenantId: pilotTenant.id,
      roleId: adminRole.id,
      label: 'S16 verify window',
      startMinutes: 0,
      endMinutes: 1439,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    },
    admin.id,
  );
  cleanup.scheduleIds.push(schedule.id);

  const evalAt = new Date('2026-06-16T12:00:00.000Z');
  const legacyBaseline = buildLegacyPolicyBaseline();

  console.log('\n[2] Default posture — legacy policy behavior unchanged:');
  const defaultEval = await resolveAdvancedPolicyEvaluation({
    userId: admin.id,
    tenantId: pilotTenant.id,
    tenantSlug: pilotTenant.slug,
    roleId: adminRole.id,
    resourceCode: 'BREAKAGE',
    fieldKey: 'unitCost',
    at: evalAt,
  });
  assert('default source = legacy', defaultEval.source === 'legacy');
  assert('default legacyAuthoritative', defaultEval.legacyAuthoritative === true);
  assert('default accessAllowed', defaultEval.accessAllowed === legacyBaseline.accessAllowed);
  assert('default defaultFieldAccess FULL', defaultEval.defaultFieldAccess === 'FULL');

  console.log('\n[3] Field Security comparison:');
  process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT = 'true';
  process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT_TENANTS = 'grand-horizon';

  const fieldEval = await resolveAdvancedPolicyEvaluation({
    userId: admin.id,
    tenantId: pilotTenant.id,
    tenantSlug: pilotTenant.slug,
    roleId: adminRole.id,
    resourceCode: 'BREAKAGE',
    fieldKey: 'unitCost',
    at: evalAt,
  });
  assert('pilot field enforcement mode = pilot', fieldEval.enforcement.mode === 'pilot');
  assert('pilot applies READ_ONLY on unitCost', fieldEval.defaultFieldAccess === 'READ_ONLY');
  assert('pilot fieldRuleCount >= 1', fieldEval.fieldRuleCount >= 1);
  assert('legacy baseline was FULL, pilot is READ_ONLY', legacyBaseline.defaultFieldAccess === 'FULL');

  console.log('\n[4] User Exceptions comparison:');
  assert('pilot activeExceptionCount >= 1', fieldEval.activeExceptionCount >= 1);
  assert('pilot exceptions array populated', Array.isArray(fieldEval.exceptions) && fieldEval.exceptions.length >= 1);

  console.log('\n[5] Scheduled Access comparison:');
  assert('pilot scheduleCount >= 1', fieldEval.scheduleCount >= 1);
  assert('pilot withinSchedule true (wide window)', fieldEval.withinSchedule === true);
  assert('pilot accessAllowed true', fieldEval.accessAllowed === true);

  console.log('\n[6] Drift-safe fallback (conflicting field rules):');
  const conflict = await createFieldSecurityRule(
    {
      tenantId: pilotTenant.id,
      roleId: adminRole.id,
      resourceCode: 'BREAKAGE',
      fieldKey: 'unitCost',
      accessLevel: 'HIDDEN',
      reason: 'S16 conflict verify',
    },
    admin.id,
  );
  cleanup.fieldIds.push(conflict.id);

  const driftEval = await resolveAdvancedPolicyEvaluation({
    userId: admin.id,
    tenantId: pilotTenant.id,
    tenantSlug: pilotTenant.slug,
    roleId: adminRole.id,
    resourceCode: 'BREAKAGE',
    fieldKey: 'unitCost',
    at: evalAt,
  });
  assert('conflict returns legacy-drift-fallback', driftEval.source === 'legacy-drift-fallback');
  assert('conflict restores FULL access', driftEval.defaultFieldAccess === 'FULL');
  assert('conflict legacyAuthoritative', driftEval.legacyAuthoritative === true);
  if (driftEval.drift) {
    drifts.push({ reason: driftEval.driftReason ?? 'FIELD_RULE_CONFLICT' });
  }

  await deleteFieldSecurityRule(conflict.id, admin.id);
  cleanup.fieldIds = cleanup.fieldIds.filter((id) => id !== conflict.id);

  console.log('\n[7] Automatic fallback + non-pilot tenant:');
  assert(
    'non-pilot tenant stays legacy',
    accRuntime.isAccEnforceAdvancedPoliciesActiveForTenant({ tenantSlug: 'other-hotel' }) === false,
  );

  process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT = 'false';
  process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT_TENANTS = '';

  console.log('\n[8] Observe mode still independent (S12):');
  process.env.ENABLE_ACC_POLICY_OBSERVE = 'true';
  const observe = await observeAdvancedPolicies({
    userId: admin.id,
    roleId: adminRole.id,
    resourceCode: 'BREAKAGE',
    fieldKey: 'unitCost',
    actorId: admin.id,
  });
  assert('observe runs when flag ON', observe.observed === true);
  assert('observe does not enforce', observe.enforcementEnabled === false);
  process.env.ENABLE_ACC_POLICY_OBSERVE = 'false';

  console.log('\n[9] Enforcement status payload:');
  const status = getPolicyEnforcementStatus({ tenantSlug: 'grand-horizon' });
  assert('status includes rollback instructions', !!status.rollback?.disablePilot);
  assert('status includes pilotTenantSlugs array', Array.isArray(status.pilotTenantSlugs));

  console.log('\n[10] Live API checks (if backend running, default posture):');
  try {
    const login = await loginPilot();
    const superLogin = await loginSuperAdmin();
    if (login.status === 200 && login.data?.accessToken) {
      const headers = { Authorization: `Bearer ${login.data.accessToken}` };
      assert('login PASS', true);
      assert('GET /api/auth/me PASS', (await fetchJson(`${API_BASE}/api/auth/me`, { headers })).status === 200);
      assert(
        'user-rights matrix PASS',
        (await fetchJson(`${API_BASE}/api/user-rights/matrix`, { headers })).status === 200,
      );
      if (superLogin.status === 200 && superLogin.data?.accessToken) {
        const superHeaders = { Authorization: `Bearer ${superLogin.data.accessToken}` };
        assert(
          'policies summary PASS (SUPER_ADMIN)',
          (await fetchJson(`${API_BASE}/api/access-control/policies/summary`, { headers: superHeaders })).status === 200,
        );

        const policyStatus = await fetchJson(`${API_BASE}/api/access-control/enforcement/policy-status`, { headers: superHeaders });
        assert('GET policy-status PASS (SUPER_ADMIN)', policyStatus.status === 200);
        assert('policy status legacy mode by default', policyStatus.data?.enforcement?.mode === 'legacy');

        const policyEval = await fetchJson(
          `${API_BASE}/api/access-control/enforcement/policy-evaluation?resourceCode=BREAKAGE&fieldKey=unitCost`,
          { headers: superHeaders },
        );
        assert('GET policy-evaluation PASS (SUPER_ADMIN)', policyEval.status === 200);
        assert('policy evaluation legacy by default', policyEval.data?.source === 'legacy');
      } else {
        console.log('  ⚠ Skipping policy API checks — super admin login unavailable');
      }
    } else {
      console.log('  ⚠ Skipping live API checks (backend not running or login failed)');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log('\n[11] Resetting flags to safe defaults:');
  process.env.ACC_ENFORCE_ADVANCED_POLICIES = 'false';
  process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT = 'false';
  process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT_TENANTS = '';
  process.env.ACC_POLICY_DRIFT_SAFE_FALLBACK = 'true';
  process.env.ENABLE_ACC_POLICY_OBSERVE = 'false';
  assert('flags reset to safe defaults', accRuntime.isAccEnforceAdvancedPoliciesEnabled() === false);

  console.log(`\n${'─'.repeat(50)}`);
  console.log('Policy comparisons (pilot tenant, unitCost/BREAKAGE):');
  console.log(`  Field Security legacy: FULL | pilot (aligned): READ_ONLY`);
  console.log(`  User Exceptions legacy: 0 active | pilot: ${fieldEval.activeExceptionCount} active`);
  console.log(`  Scheduled Access legacy: always allowed | pilot: withinSchedule=${fieldEval.withinSchedule}`);
  if (drifts.length > 0) {
    console.log('Drift observed (expected in conflict test):', JSON.stringify(drifts, null, 2));
  } else {
    console.log('Drift observed: none outside conflict test');
  }
  console.log(`S16 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S16 validation PASS\n');
}

main()
  .catch(async (e) => {
    process.env.ACC_ENFORCE_ADVANCED_POLICIES = 'false';
    process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT = 'false';
    process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT_TENANTS = '';
    process.env.ACC_POLICY_DRIFT_SAFE_FALLBACK = 'true';
    process.env.ENABLE_ACC_POLICY_OBSERVE = 'false';
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    for (const id of cleanup.fieldIds) {
      await deleteFieldSecurityRule(id, null).catch(() => {});
    }
    for (const id of cleanup.exceptionIds) {
      await deleteUserException(id, null).catch(() => {});
    }
    for (const id of cleanup.scheduleIds) {
      await deleteScheduledAccess(id, null).catch(() => {});
    }
    await prisma.$disconnect();
  });
