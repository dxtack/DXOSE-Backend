/**
 * ACC Big Bang Stage S18 — Controlled hard cutover validation.
 *
 * Usage:
 *   node scripts/verify-acc-s18-hard-cutover.js
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
const { TRANSFER_APPROVAL_ROLE_CODES } = require('../src/services/approvalChain.service');
const { listModules } = require('../src/services/acc-workflow-config.service');
const {
  evaluatePermissionResolution,
  getPermissionEnforcementStatus,
} = require('../src/services/acc-enforcement-pilot.service');
const {
  resolveWorkflowChainForDocument,
  getWorkflowEnforcementStatus,
} = require('../src/services/workflow-enforcement-pilot.service');
const {
  resolveAdvancedPolicyEvaluation,
  getPolicyEnforcementStatus,
} = require('../src/services/policy-enforcement-pilot.service');
const { buildLegacyPolicyBaseline } = require('../src/engines/policy-evaluation.engine');
const { _setsEqual } = require('../src/acc-runtime/resolvePermissions');

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 4000}`;

const LEGACY_BREAKAGE_CHAIN = [
  { stepOrder: 1, roleCode: 'DEPT_MANAGER' },
  { stepOrder: 2, roleCode: 'COST_CONTROL' },
  { stepOrder: 3, roleCode: 'FINANCE_MANAGER' },
  { stepOrder: 4, roleCode: 'GENERAL_MANAGER' },
];

let passed = 0;
let failed = 0;
const drifts = [];
const seeded = { definitionIds: [] };

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function applyS18Defaults() {
  delete process.env.ACC_HARD_CUTOVER;
  delete process.env.ACC_ENFORCE_PERMISSIONS;
  delete process.env.ACC_ENFORCE_PERMISSIONS_PILOT;
  delete process.env.ACC_ENFORCE_PERMISSIONS_PILOT_TENANTS;
  delete process.env.ACC_ENFORCE_WORKFLOWS;
  delete process.env.ACC_ENFORCE_WORKFLOWS_PILOT;
  delete process.env.ACC_ENFORCE_WORKFLOWS_PILOT_TENANTS;
  delete process.env.ACC_ENFORCE_ADVANCED_POLICIES;
  delete process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT;
  delete process.env.ACC_ENFORCE_ADVANCED_POLICIES_PILOT_TENANTS;
  process.env.ACC_PERMISSION_DRIFT_SAFE_FALLBACK = 'true';
  process.env.ACC_WORKFLOW_DRIFT_SAFE_FALLBACK = 'true';
  process.env.ACC_POLICY_DRIFT_SAFE_FALLBACK = 'true';
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

async function getRoleId(code) {
  const row = await prisma.role.findUnique({ where: { code }, select: { id: true } });
  return row?.id ?? null;
}

async function seedPublishedWorkflow(moduleKey, roleCodes, tag) {
  await listModules();
  const module = await prisma.accModule.findUnique({ where: { key: moduleKey } });
  if (!module) throw new Error(`Module ${moduleKey} missing`);

  const definition = await prisma.accWorkflowDefinition.create({
    data: {
      moduleId: module.id,
      key: tag,
      name: `S18 ${tag}`,
      description: 'Temporary S18 validation definition',
    },
  });
  seeded.definitionIds.push(definition.id);

  const version = await prisma.accWorkflowVersion.create({
    data: {
      definitionId: definition.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      steps: {
        create: roleCodes.map((code, index) => ({
          stepOrder: index + 1,
          approverRoleId: null,
          label: `Step ${index + 1}`,
        })),
      },
    },
    include: { steps: true },
  });

  for (let i = 0; i < roleCodes.length; i += 1) {
    const roleId = await getRoleId(roleCodes[i]);
    if (roleId) {
      await prisma.accWorkflowStepDefinition.update({
        where: { id: version.steps[i].id },
        data: { approverRoleId: roleId },
      });
    }
  }

  return definition.id;
}

async function cleanupSeeded() {
  if (seeded.definitionIds.length === 0) return;
  await prisma.accWorkflowDefinition.deleteMany({
    where: { id: { in: seeded.definitionIds } },
  });
  seeded.definitionIds = [];
}

async function main() {
  console.log('\nACC Big Bang S18 — Controlled Hard Cutover Validation\n');

  applyS18Defaults();

  console.log('[1] S18 hard cutover defaults (ACC source of truth):');
  assert('ACC_HARD_CUTOVER default true', accRuntime.isAccHardCutoverEnabled() === true);
  assert('ACC permission enforce ON via hard cutover', accRuntime.isAccEnforcePermissionsEnabled() === true);
  assert('ACC workflow enforce ON via hard cutover', accRuntime.isAccEnforceWorkflowsEnabled() === true);
  assert('ACC policy enforce ON via hard cutover', accRuntime.isAccEnforceAdvancedPoliciesEnabled() === true);
  assert('ACC_PERMISSION_DRIFT_SAFE_FALLBACK default true', accRuntime.isAccPermissionDriftSafeFallbackEnabled() === true);
  assert('ACC_WORKFLOW_DRIFT_SAFE_FALLBACK default true', accRuntime.isAccWorkflowDriftSafeFallbackEnabled() === true);
  assert('ACC_POLICY_DRIFT_SAFE_FALLBACK default true', accRuntime.isAccPolicyDriftSafeFallbackEnabled() === true);

  console.log('\n[2] Emergency rollback — ACC_HARD_CUTOVER=false:');
  process.env.ACC_HARD_CUTOVER = 'false';
  assert('hard cutover disabled', accRuntime.isAccHardCutoverEnabled() === false);
  assert('permissions revert to legacy-only', accRuntime.isAccEnforcePermissionsEnabled() === false);
  assert('workflows revert to legacy-only', accRuntime.isAccEnforceWorkflowsEnabled() === false);
  assert('policies revert to legacy-only', accRuntime.isAccEnforceAdvancedPoliciesEnabled() === false);
  applyS18Defaults();
  assert('S18 defaults restored after rollback test', accRuntime.isAccHardCutoverEnabled() === true);

  console.log('\n[3] Per-domain emergency rollback:');
  process.env.ACC_ENFORCE_PERMISSIONS = 'false';
  assert('ACC_ENFORCE_PERMISSIONS=false disables permission cutover only', accRuntime.isAccEnforcePermissionsEnabled() === false);
  assert('workflows remain ON when permission rollback set', accRuntime.isAccEnforceWorkflowsEnabled() === true);
  applyS18Defaults();

  console.log('\n[4] Emergency fallback mechanisms retained:');
  const rbac = require('../src/services/rbac.service');
  assert('rbac.service getPermissionsForMembership exists', typeof rbac.getPermissionsForMembership === 'function');
  assert('accRuntime.resolvePermissionsForMembership exists', typeof accRuntime.resolvePermissionsForMembership === 'function');
  assert('accRuntime.resolveScope exists', typeof accRuntime.resolveScope === 'function');
  assert('workflow shadow service exists', typeof require('../src/engines/workflow-shadow.service').compareWorkflowChains === 'function');

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
  const membership = pilot?.memberships?.[0];
  const pilotTenant = membership?.tenant;
  assert('pilot user found', !!pilot?.id);
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
  }

  console.log('\n[5] Permission count comparison (hard cutover ON):');
  const permEval = await evaluatePermissionResolution({
    userId: pilot.id,
    membership,
    roleId: roleIdForPerm,
    roleCode: bestRole,
    tenantSlug: pilotTenant?.slug,
  });
  assert('permission enforcement mode = hard-cutover', permEval.enforcement.mode === 'hard-cutover');
  assert('enforced permission count = legacy count', permEval.enforcedCount === permEval.legacyCount);
  assert('enforced permission set equals legacy', permEval.setsEqual === true);
  assert(
    'permission source is acc or legacy fallback',
    ['acc', 'legacy-drift-fallback', 'legacy-fallback'].includes(permEval.source),
  );
  if (permEval.drift) {
    drifts.push({ domain: 'permissions', source: permEval.source });
  }

  const tag = `s18-verify-${Date.now()}`;
  await seedPublishedWorkflow(
    'BREAKAGE',
    LEGACY_BREAKAGE_CHAIN.map((s) => s.roleCode),
    `${tag}-breakage`,
  );
  await seedPublishedWorkflow('TRANSFER', TRANSFER_APPROVAL_ROLE_CODES, `${tag}-transfer`);

  const legacyTransferSteps = TRANSFER_APPROVAL_ROLE_CODES.map((roleCode, index) => ({
    stepOrder: index + 1,
    roleCode,
  }));

  console.log('\n[6] Workflow chain comparison (hard cutover ON):');
  const transferChain = await resolveWorkflowChainForDocument({
    moduleKey: 'TRANSFER',
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    legacySteps: legacyTransferSteps,
  });
  assert('TRANSFER enforcement mode = hard-cutover', transferChain.enforcement.mode === 'hard-cutover');
  assert('TRANSFER enforced count = 2', transferChain.enforcedCount === TRANSFER_APPROVAL_ROLE_CODES.length);
  assert('TRANSFER chainsEqual true', transferChain.chainsEqual === true);
  assert(
    'TRANSFER roles match legacy',
    JSON.stringify(transferChain.roleCodes) === JSON.stringify(TRANSFER_APPROVAL_ROLE_CODES),
  );

  const breakageChain = await resolveWorkflowChainForDocument({
    moduleKey: 'BREAKAGE',
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    legacySteps: LEGACY_BREAKAGE_CHAIN,
  });
  assert('BREAKAGE enforced count = 4', breakageChain.enforcedCount === 4);
  assert('BREAKAGE chainsEqual true', breakageChain.chainsEqual === true);
  if (breakageChain.drift) {
    drifts.push({ domain: 'workflows', moduleKey: 'BREAKAGE', source: breakageChain.source });
  }

  console.log('\n[7] Workflow drift-safe fallback:');
  await seedPublishedWorkflow('TRANSFER', ['DEPT_MANAGER'], `${tag}-drift-transfer`);
  const driftChain = await resolveWorkflowChainForDocument({
    moduleKey: 'TRANSFER',
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    legacySteps: legacyTransferSteps,
  });
  assert('workflow drift returns legacy-drift-fallback', driftChain.source === 'legacy-drift-fallback');
  assert('workflow drift preserves legacy chain', driftChain.enforcedCount === 2);
  if (driftChain.drift) {
    drifts.push({ domain: 'workflows', moduleKey: 'TRANSFER', type: driftChain.mismatchType });
  }

  console.log('\n[8] Policy comparison (hard cutover ON, no configured policies):');
  const adminRole = await prisma.role.findFirst({ where: { code: 'ADMIN' }, select: { id: true } });
  const evalAt = new Date('2026-06-16T12:00:00.000Z');
  const legacyPolicy = buildLegacyPolicyBaseline();
  const noPolicyEval = await resolveAdvancedPolicyEvaluation({
    userId: pilot.id,
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    roleId: adminRole?.id,
    resourceCode: 'INVENTORY_COUNT',
    fieldKey: 'unitCost',
    at: evalAt,
  });
  assert('policy enforcement mode = hard-cutover', noPolicyEval.enforcement.mode === 'hard-cutover');
  assert(
    'no policies → legacy equivalent outcome',
    noPolicyEval.accessAllowed === legacyPolicy.accessAllowed
      && noPolicyEval.defaultFieldAccess === 'FULL',
  );
  assert(
    'policy outcome legacy-equivalent or legacy source',
    noPolicyEval.legacyEquivalent !== false
      || ['legacy', 'legacy-no-policies', 'legacy-drift-fallback', 'legacy-fallback'].includes(noPolicyEval.source),
  );

  console.log('\n[9] Enforcement status payloads include hard-cutover rollback:');
  const permStatus = getPermissionEnforcementStatus({ tenantSlug: 'grand-horizon' });
  assert('permission status accHardCutover true', permStatus.accHardCutover === true);
  assert('permission rollback includes disableHardCutover', !!permStatus.rollback?.disableHardCutover);

  const workflowStatus = getWorkflowEnforcementStatus({ tenantSlug: 'grand-horizon' });
  assert('workflow status enforcement mode = hard-cutover', workflowStatus.enforcement.mode === 'hard-cutover');

  const policyStatus = getPolicyEnforcementStatus({ tenantSlug: 'grand-horizon' });
  assert('policy status enforcement mode = hard-cutover', policyStatus.enforcement.mode === 'hard-cutover');

  console.log('\n[10] Live API checks (if backend running with S18 code):');
  try {
    const login = await loginPilot();
    const superLogin = await loginSuperAdmin();
    if (login.status === 200 && login.data?.accessToken) {
      const headers = { Authorization: `Bearer ${login.data.accessToken}` };
      assert('login PASS', true);
      assert(
        'login permission count unchanged',
        login.data.user.permissions.length === legacyBaseline.length,
      );

      const me = await fetchJson(`${API_BASE}/api/auth/me`, { headers });
      assert('GET /api/auth/me PASS', me.status === 200);

      assert(
        'User Rights roles API PASS',
        (await fetchJson(`${API_BASE}/api/user-rights/roles`, { headers })).status === 200,
      );
      assert(
        'User Rights matrix API PASS',
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

      const livePermStatus = await fetchJson(`${API_BASE}/api/access-control/enforcement/status`, { headers });
      if (livePermStatus.data?.accHardCutover === true) {
        assert('live permission status hard-cutover mode', livePermStatus.data?.enforcement?.mode === 'hard-cutover');
      } else {
        console.log('  ⚠ Live server not on S18 defaults — in-process hard cutover validated above');
      }
    } else {
      console.log('  ⚠ Skipping live API checks (backend not running or login failed)');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log('\n[11] Restoring S18 default posture:');
  applyS18Defaults();
  assert('S18 hard cutover remains ON after validation', accRuntime.isAccHardCutoverEnabled() === true);

  await cleanupSeeded();

  console.log(`\n${'─'.repeat(50)}`);
  console.log('Hard cutover flow: ACC primary (permissions, workflows, policies) → legacy on drift/miss/error');
  console.log(`Permission count: legacy=${legacyBaseline.length} | enforced=${permEval.enforcedCount} | equal=${permEval.setsEqual}`);
  console.log(`Workflow chains: TRANSFER=${transferChain.enforcedCount} steps | BREAKAGE=${breakageChain.enforcedCount} steps`);
  console.log(`Policy (no rules): accessAllowed=${noPolicyEval.accessAllowed} defaultFieldAccess=${noPolicyEval.defaultFieldAccess}`);
  if (drifts.length > 0) {
    console.log('Drift observed (fallback applied):', JSON.stringify(drifts, null, 2));
  } else {
    console.log('Drift observed: none (aligned paths)');
  }
  console.log(`S18 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S18 validation PASS\n');
}

main()
  .catch(async (e) => {
    applyS18Defaults();
    await cleanupSeeded().catch(() => {});
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
