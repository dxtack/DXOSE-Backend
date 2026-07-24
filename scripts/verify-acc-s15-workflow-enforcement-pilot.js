/**
 * ACC Big Bang Stage S15 — Workflow enforcement pilot validation.
 *
 * Usage:
 *   node scripts/verify-acc-s15-workflow-enforcement-pilot.js
 *
 * Optional env for live API checks (backend must be running on PORT or 4000):
 *   API_BASE=http://localhost:4000
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const accRuntime = require('../src/acc-runtime');
const { listModules } = require('../src/services/acc-workflow-config.service');
const { TRANSFER_APPROVAL_ROLE_CODES } = require('../src/services/approvalChain.service');
const {
  resolveWorkflowChainForDocument,
  evaluateWorkflowEnforcement,
  getWorkflowEnforcementStatus,
} = require('../src/services/workflow-enforcement-pilot.service');

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
      name: `S15 ${tag}`,
      description: 'Temporary S15 validation definition',
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
  console.log('\nACC Big Bang S15 — Workflow Enforcement Pilot Validation\n');

  console.log('[1] Safe defaults (production posture):');
  process.env.ACC_ENFORCE_WORKFLOWS = 'false';
  process.env.ACC_ENFORCE_WORKFLOWS_PILOT = 'false';
  process.env.ACC_WORKFLOW_DRIFT_SAFE_FALLBACK = 'true';

  assert('ACC_ENFORCE_WORKFLOWS default false', accRuntime.isAccEnforceWorkflowsEnabled() === false);
  assert('ACC_ENFORCE_WORKFLOWS_PILOT default false', accRuntime.isAccEnforceWorkflowsPilotEnabled() === false);
  assert('ACC_WORKFLOW_DRIFT_SAFE_FALLBACK default true', accRuntime.isAccWorkflowDriftSafeFallbackEnabled() === true);

  const pilotTenant = await prisma.tenant.findFirst({
    where: { slug: 'grand-horizon' },
    select: { id: true, slug: true },
  });
  assert('pilot tenant found', !!pilotTenant?.id);

  const tag = `s15-verify-${Date.now()}`;
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

  console.log('\n[2] Default posture — legacy chains unchanged:');
  const transferOff = await resolveWorkflowChainForDocument({
    moduleKey: 'TRANSFER',
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    legacySteps: legacyTransferSteps,
  });
  assert('TRANSFER default source = legacy', transferOff.source === 'legacy');
  assert(
    'TRANSFER default step count = 2',
    transferOff.enforcedCount === TRANSFER_APPROVAL_ROLE_CODES.length,
  );
  assert(
    'TRANSFER default roles match legacy',
    JSON.stringify(transferOff.roleCodes) === JSON.stringify(TRANSFER_APPROVAL_ROLE_CODES),
  );

  const breakageOff = await resolveWorkflowChainForDocument({
    moduleKey: 'BREAKAGE',
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    legacySteps: LEGACY_BREAKAGE_CHAIN,
  });
  assert('BREAKAGE default source = legacy', breakageOff.source === 'legacy');
  assert('BREAKAGE default step count = 4', breakageOff.enforcedCount === 4);

  console.log('\n[3] Tenant-scoped pilot activation:');
  process.env.ACC_ENFORCE_WORKFLOWS_PILOT = 'true';
  process.env.ACC_ENFORCE_WORKFLOWS_PILOT_TENANTS = 'grand-horizon';

  assert(
    'pilot active for grand-horizon',
    accRuntime.isAccEnforceWorkflowsActiveForTenant({ tenantSlug: 'grand-horizon' }) === true,
  );
  assert(
    'pilot inactive for other tenant',
    accRuntime.isAccEnforceWorkflowsActiveForTenant({ tenantSlug: 'other-hotel' }) === false,
  );

  const transferPilot = await evaluateWorkflowEnforcement({
    moduleKey: 'TRANSFER',
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    legacySteps: legacyTransferSteps,
  });
  assert('pilot TRANSFER mode = pilot', transferPilot.enforcement.mode === 'pilot');
  assert(
    'pilot TRANSFER chain count matches legacy',
    transferPilot.enforcedCount === TRANSFER_APPROVAL_ROLE_CODES.length,
  );
  assert('pilot TRANSFER chainsEqual true', transferPilot.chainsEqual === true);
  assert(
    'pilot TRANSFER source is acc or legacy fallback',
    ['acc', 'legacy-fallback', 'legacy-drift-fallback'].includes(transferPilot.source),
  );

  const breakagePilot = await evaluateWorkflowEnforcement({
    moduleKey: 'BREAKAGE',
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    legacySteps: LEGACY_BREAKAGE_CHAIN,
  });
  assert('pilot BREAKAGE chain count = 4', breakagePilot.enforcedCount === 4);
  assert('pilot BREAKAGE chainsEqual true', breakagePilot.chainsEqual === true);
  if (breakagePilot.drift) {
    drifts.push({ moduleKey: 'BREAKAGE', source: breakagePilot.source });
  }

  console.log('\n[4] Drift-safe fallback (misaligned ACC chain):');
  const driftTag = `${tag}-drift-transfer`;
  await seedPublishedWorkflow('TRANSFER', ['DEPT_MANAGER'], `${driftTag}`);
  const driftChain = await resolveWorkflowChainForDocument({
    moduleKey: 'TRANSFER',
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    legacySteps: legacyTransferSteps,
  });
  assert('drift returns legacy-drift-fallback', driftChain.source === 'legacy-drift-fallback');
  assert('drift preserves legacy step count', driftChain.enforcedCount === 2);
  assert(
    'drift preserves legacy roles',
    JSON.stringify(driftChain.roleCodes) === JSON.stringify(TRANSFER_APPROVAL_ROLE_CODES),
  );
  if (driftChain.drift) {
    drifts.push({ moduleKey: 'TRANSFER', type: driftChain.mismatchType });
  }

  console.log('\n[5] Automatic fallback on ACC miss:');
  const missChain = await resolveWorkflowChainForDocument({
    moduleKey: 'UNKNOWN_MODULE',
    tenantId: pilotTenant?.id,
    tenantSlug: pilotTenant?.slug,
    legacySteps: legacyTransferSteps,
  });
  assert('unknown module falls back to legacy', missChain.source === 'legacy-fallback');

  process.env.ACC_ENFORCE_WORKFLOWS_PILOT = 'false';
  process.env.ACC_ENFORCE_WORKFLOWS_PILOT_TENANTS = '';

  console.log('\n[6] Enforcement status payload:');
  const status = getWorkflowEnforcementStatus({ tenantSlug: 'grand-horizon' });
  assert('status includes rollback instructions', !!status.rollback?.disablePilot);
  assert('status includes pilotTenantSlugs array', Array.isArray(status.pilotTenantSlugs));

  console.log('\n[7] Live API checks (if backend running, default posture):');
  try {
    const loginOff = await loginPilot();
    if (loginOff.status === 200 && loginOff.data?.accessToken) {
      assert('login PASS', loginOff.status === 200);
      const token = loginOff.data.accessToken;

      const meOff = await fetchJson(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('GET /api/auth/me PASS', meOff.status === 200);

      const roles = await fetchJson(`${API_BASE}/api/user-rights/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('User Rights roles API PASS', roles.status === 200);

      const workflowStatus = await fetchJson(`${API_BASE}/api/access-control/enforcement/workflow-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert('GET /api/access-control/enforcement/workflow-status PASS', workflowStatus.status === 200);
      assert(
        'workflow status reports legacy mode by default',
        workflowStatus.data?.enforcement?.mode === 'legacy',
      );

      const workflowEval = await fetchJson(
        `${API_BASE}/api/access-control/enforcement/workflow-evaluation?moduleKey=TRANSFER`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert('GET workflow-evaluation PASS', workflowEval.status === 200);
      assert(
        'workflow evaluation chain count = 2',
        workflowEval.data?.enforcedCount === TRANSFER_APPROVAL_ROLE_CODES.length,
      );
    } else {
      console.log('  ⚠ Skipping live API checks (backend not running or login failed)');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log('\n[8] Resetting flags to safe defaults:');
  process.env.ACC_ENFORCE_WORKFLOWS = 'false';
  process.env.ACC_ENFORCE_WORKFLOWS_PILOT = 'false';
  process.env.ACC_ENFORCE_WORKFLOWS_PILOT_TENANTS = '';
  process.env.ACC_WORKFLOW_DRIFT_SAFE_FALLBACK = 'true';
  assert('flags reset to safe defaults', accRuntime.isAccEnforceWorkflowsEnabled() === false);

  await cleanupSeeded();

  console.log(`\n${'─'.repeat(50)}`);
  console.log('Workflow chain counts:');
  console.log(`  TRANSFER legacy: ${TRANSFER_APPROVAL_ROLE_CODES.length} steps`);
  console.log(`  BREAKAGE legacy: ${LEGACY_BREAKAGE_CHAIN.length} steps`);
  if (drifts.length > 0) {
    console.log('Drift observed (expected in drift test):', JSON.stringify(drifts, null, 2));
  } else {
    console.log('Drift observed: none (aligned chains)');
  }
  console.log(`S15 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S15 validation PASS\n');
}

main()
  .catch(async (e) => {
    process.env.ACC_ENFORCE_WORKFLOWS = 'false';
    process.env.ACC_ENFORCE_WORKFLOWS_PILOT = 'false';
    process.env.ACC_ENFORCE_WORKFLOWS_PILOT_TENANTS = '';
    process.env.ACC_WORKFLOW_DRIFT_SAFE_FALLBACK = 'true';
    await cleanupSeeded().catch(() => {});
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
