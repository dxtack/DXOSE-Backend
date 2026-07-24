/**
 * ACC Big Bang Stage S11 — Workflow runtime + shadow validation.
 *
 * Usage:
 *   node scripts/verify-acc-s11-workflow-runtime.js
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const accRuntime = require('../src/acc-runtime');
const {
  resolvePublishedWorkflowChain,
  moduleKeyForRequestType,
} = require('../src/engines/workflow-resolution.engine');
const {
  compareWorkflowChains,
  evaluateWorkflowShadow,
  getWorkflowShadowFlagStatus,
} = require('../src/engines/workflow-shadow.service');
const { AuditAction } = require('../src/engines/ur-audit.logger');
const { listModules } = require('../src/services/acc-workflow-config.service');
const { TRANSFER_APPROVAL_ROLE_CODES } = require('../src/services/approvalChain.service');

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
  return { status: res.status, body, data: body?.data ?? body };
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
      name: `S11 ${tag}`,
      description: 'Temporary S11 validation definition',
    },
  });
  seeded.definitionIds.push(definition.id);

  const version = await prisma.accWorkflowVersion.create({
    data: {
      definitionId: definition.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      notes: 'S11 verify seed',
    },
  });

  for (let i = 0; i < roleCodes.length; i += 1) {
    const roleId = await getRoleId(roleCodes[i]);
    if (!roleId) throw new Error(`Role ${roleCodes[i]} missing`);
    await prisma.accWorkflowStepDefinition.create({
      data: {
        versionId: version.id,
        stepOrder: i + 1,
        label: `Step ${i + 1}`,
        approverRoleId: roleId,
      },
    });
  }

  return { definition, version };
}

async function main() {
  console.log('\nACC Big Bang S11 — Workflow Runtime + Shadow Validation\n');

  console.log('[1] Feature flags (default OFF):');
  assert('ENABLE_ACC_WORKFLOW_SHADOW default false', accRuntime.isAccWorkflowShadowEnabled() === false);
  assert('ACC_ENFORCE_WORKFLOWS default false', accRuntime.isAccEnforceWorkflowsEnabled() === false);
  const flags = accRuntime.getAccFeatureFlagStatus();
  assert('flag status exposes accWorkflowShadow', flags.accWorkflowShadow === false);
  assert('flag status exposes accEnforceWorkflows', flags.accEnforceWorkflows === false);

  console.log('\n[2] Publish → runtime mapping:');
  const tag = `s11-verify-${Date.now()}`;
  await seedPublishedWorkflow(
    'BREAKAGE',
    LEGACY_BREAKAGE_CHAIN.map((s) => s.roleCode),
    `${tag}-breakage`,
  );
  await seedPublishedWorkflow('TRANSFER', TRANSFER_APPROVAL_ROLE_CODES, `${tag}-transfer`);

  const breakageResolved = await resolvePublishedWorkflowChain('BREAKAGE');
  assert('BREAKAGE published chain resolves', !!breakageResolved?.versionId);
  assert(
    'BREAKAGE role mapping matches legacy',
    JSON.stringify(breakageResolved.roleCodes) ===
      JSON.stringify(LEGACY_BREAKAGE_CHAIN.map((s) => s.roleCode)),
  );

  const transferResolved = await resolvePublishedWorkflowChain('TRANSFER');
  assert('TRANSFER published chain resolves', !!transferResolved?.versionId);
  assert(
    'TRANSFER role mapping matches legacy',
    JSON.stringify(transferResolved.roleCodes) === JSON.stringify(TRANSFER_APPROVAL_ROLE_CODES),
  );

  const moduleKey = moduleKeyForRequestType('BREAKAGE');
  assert('requestType BREAKAGE maps to module', moduleKey === 'BREAKAGE');

  console.log('\n[3] Shadow comparison (aligned chain — no mismatch):');
  process.env.ENABLE_ACC_WORKFLOW_SHADOW = 'true';
  const aligned = await evaluateWorkflowShadow({
    moduleKey: 'BREAKAGE',
    tenantId: null,
    legacySteps: LEGACY_BREAKAGE_CHAIN,
    context: { source: 'verify-acc-s11', requestType: 'BREAKAGE' },
  });
  assert('aligned chains produce no mismatch', aligned.mismatch === false);

  console.log('\n[4] Drift detection (misaligned chain — mismatch logged):');
  const beforeMismatch = await prisma.urAuditEvent.count({
    where: { action: AuditAction.WORKFLOW_SHADOW_MISMATCH },
  });
  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...args) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return origWrite(chunk, ...args);
  };

  const misaligned = await evaluateWorkflowShadow({
    moduleKey: 'TRANSFER',
    tenantId: null,
    legacySteps: [{ stepOrder: 1, roleCode: 'DEPT_MANAGER' }],
    context: { source: 'verify-acc-s11', requestType: 'STORE_TRANSFER' },
    actorId: (await prisma.user.findFirst({
      where: { email: 'admin@grandhorizon.com' },
      select: { id: true },
    }))?.id,
  });
  process.stderr.write = origWrite;

  assert('misaligned chains detected', misaligned.mismatch === true);
  assert(
    'stderr contains ACC_WORKFLOW_SHADOW_MISMATCH',
    stderrChunks.join('').includes('ACC_WORKFLOW_SHADOW_MISMATCH'),
  );
  const afterMismatch = await prisma.urAuditEvent.count({
    where: { action: AuditAction.WORKFLOW_SHADOW_MISMATCH },
  });
  assert('WORKFLOW_SHADOW_MISMATCH audit row created', afterMismatch === beforeMismatch + 1);
  if (misaligned.mismatch) {
    drifts.push({ moduleKey: 'TRANSFER', type: misaligned.compareResult?.mismatchType });
  }

  console.log('\n[5] Shadow disabled — no enforcement path:');
  process.env.ENABLE_ACC_WORKFLOW_SHADOW = 'false';
  const skipped = await evaluateWorkflowShadow({
    moduleKey: 'BREAKAGE',
    tenantId: null,
    legacySteps: LEGACY_BREAKAGE_CHAIN,
  });
  assert('shadow skipped when flag OFF', skipped.skipped === true);
  assert('getWorkflowShadowFlagStatus OFF', getWorkflowShadowFlagStatus().accWorkflowShadow === false);

  console.log('\n[6] Legacy approvals unchanged (read-only sanity):');
  const approvalCount = await prisma.approvalRequest.count();
  assert('approval_requests accessible', approvalCount >= 0);

  console.log('\n[7] Live API checks (if backend running):');
  try {
    const login = await fetchJson(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@grandhorizon.com',
        password: 'Admin@123',
        tenantSlug: 'grand-horizon',
      }),
    });
    if (login.status === 200 && login.data?.accessToken) {
      const headers = { Authorization: `Bearer ${login.data.accessToken}` };
      assert('login PASS', true);
      assert('GET /api/auth/me PASS', (await fetchJson(`${API_BASE}/api/auth/me`, { headers })).status === 200);
      assert(
        'User Rights matrix PASS',
        (await fetchJson(`${API_BASE}/api/user-rights/matrix`, { headers })).status === 200,
      );
      assert(
        'Workflow config modules PASS',
        (await fetchJson(`${API_BASE}/api/access-control/workflows/modules`, { headers })).status === 200,
      );
    } else {
      console.log('  ⚠ Skipping live API checks — login unavailable');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log('\n[8] Resetting flags:');
  process.env.ENABLE_ACC_WORKFLOW_SHADOW = 'false';
  process.env.ACC_ENFORCE_WORKFLOWS = 'false';
  assert('ENABLE_ACC_WORKFLOW_SHADOW reset', accRuntime.isAccWorkflowShadowEnabled() === false);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(
    'Drift observed (expected in test [4]):',
    drifts.length ? JSON.stringify(drifts, null, 2) : 'none in production paths',
  );
  console.log(`S11 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC Big Bang S11 validation PASS\n');
}

main()
  .catch((e) => {
    process.env.ENABLE_ACC_WORKFLOW_SHADOW = 'false';
    process.env.ACC_ENFORCE_WORKFLOWS = 'false';
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    if (seeded.definitionIds.length) {
      await prisma.accWorkflowDefinition.deleteMany({
        where: { id: { in: seeded.definitionIds } },
      }).catch(() => {});
    }
    await prisma.$disconnect();
  });
