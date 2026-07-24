/**
 * ACC Big Bang Stage S10 — Workflow Builder validation.
 *
 * Usage:
 *   node scripts/verify-acc-s10-workflow-builder.js
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const {
  listModules,
  createDefinition,
  createDraftVersion,
  replaceDraftSteps,
  publishVersion,
  archiveVersion,
  restoreVersion,
  deleteDraftVersion,
  cloneVersion,
  listDefinitionAudit,
} = require('../src/services/acc-workflow-config.service');

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 4000}`;

let passed = 0;
let failed = 0;
let cleanup = { definitionId: null, versionId: null };

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
  console.log('\nACC Big Bang S10 — Workflow Builder Validation\n');

  console.log('[1] Service layer — modules seed + CRUD flow:');
  const modules = await listModules();
  assert('default modules seeded', modules.length >= 6);

  const module = modules.find((m) => m.key === 'BREAKAGE') ?? modules[0];
  assert('sample module available', !!module?.id);

  const tag = `s10-verify-${Date.now()}`;
  const definition = await createDefinition(module.id, {
    key: tag,
    name: `S10 Verify ${tag}`,
    description: 'Temporary S10 validation definition',
  });
  cleanup.definitionId = definition.id;
  assert('definition created', !!definition.id);

  const draft = await createDraftVersion(definition.id, { notes: 'S10 draft' });
  cleanup.versionId = draft.id;
  assert('draft version created', draft.status === 'DRAFT');

  const adminRole = await prisma.role.findFirst({ where: { code: 'ADMIN' }, select: { id: true } });
  assert('ADMIN role found for step', !!adminRole?.id);

  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin@grandhorizon.com' },
    select: { id: true },
  });
  const actorId = adminUser?.id ?? null;
  assert('admin user found for audit', !!actorId);

  const withSteps = await replaceDraftSteps(draft.id, [
    {
      stepOrder: 1,
      label: 'Admin approval',
      approverRoleId: adminRole.id,
      capabilityCode: null,
      autoApprove: false,
    },
  ], actorId);
  assert('steps saved on draft', withSteps.steps.length === 1);

  const published = await publishVersion(draft.id, actorId);
  assert('version published', published.status === 'PUBLISHED');

  const archived = await archiveVersion(published.id, actorId);
  assert('version archived', archived.status === 'ARCHIVED');

  const restored = await restoreVersion(archived.id, actorId);
  assert('archived version restored', restored.status === 'PUBLISHED');

  const secondDraft = await createDraftVersion(definition.id, { notes: 'S10 second publish' }, actorId);
  const secondWithSteps = await replaceDraftSteps(secondDraft.id, [
    {
      stepOrder: 1,
      label: 'Admin approval 2',
      approverRoleId: adminRole.id,
      capabilityCode: null,
      autoApprove: false,
    },
  ], actorId);
  assert('second draft steps saved', secondWithSteps.steps.length === 1);

  const secondPublished = await publishVersion(secondDraft.id, actorId);
  assert('second version published', secondPublished.status === 'PUBLISHED');

  const restoredAgain = await restoreVersion(archived.id, actorId);
  assert('restore swaps published version', restoredAgain.status === 'PUBLISHED');

  const cloned = await cloneVersion(archived.id, { notes: 'S10 clone test' }, actorId);
  assert('version cloned to draft', cloned.status === 'DRAFT');
  assert('cloned draft has steps', cloned.steps.length === 1);

  const draftToDelete = await createDraftVersion(definition.id, { notes: 'S10 delete test' }, actorId);
  const deleted = await deleteDraftVersion(draftToDelete.id, actorId);
  assert('draft deleted', deleted.deleted === true);

  let deletePublishedFailed = false;
  try {
    await deleteDraftVersion(archived.id);
  } catch (err) {
    deletePublishedFailed = err.statusCode === 403 || /Only DRAFT/.test(err.message);
  }
  assert('published/archived delete blocked', deletePublishedFailed);

  const auditRows = await listDefinitionAudit(definition.id, { limit: 20 });
  assert('definition audit trail', auditRows.length >= 4);

  console.log('\n[2] Legacy approval tables untouched (read-only sanity):');
  const approvalRequestCount = await prisma.approvalRequest.count();
  assert('approval_requests still accessible', approvalRequestCount >= 0);

  console.log('\n[3] Live API checks (if backend running):');
  let token = null;
  try {
    const login = await loginPilot();
    if (login.status === 200 && login.data?.accessToken) {
      token = login.data.accessToken;
      assert('login PASS', true);

      const headers = { Authorization: `Bearer ${token}` };
      const mods = await fetchJson(`${API_BASE}/api/access-control/workflows/modules`, { headers });
      assert('GET modules PASS', mods.status === 200 && Array.isArray(mods.data));

      const defs = await fetchJson(
        `${API_BASE}/api/access-control/workflows/modules/${module.id}/definitions`,
        { headers },
      );
      assert('GET definitions PASS', defs.status === 200 && Array.isArray(defs.data));

      const me = await fetchJson(`${API_BASE}/api/auth/me`, { headers });
      assert('GET /api/auth/me PASS', me.status === 200);

      const matrix = await fetchJson(`${API_BASE}/api/user-rights/matrix`, { headers });
      assert('User Rights matrix PASS', matrix.status === 200);
    } else {
      console.log('  ⚠ Skipping live API checks — backend login unavailable');
    }
  } catch (e) {
    console.log(`  ⚠ Skipping live API checks: ${e.message}`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`S10 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC Big Bang S10 validation PASS\n');
}

main()
  .catch((e) => {
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    if (cleanup.definitionId) {
      await prisma.accWorkflowDefinition.deleteMany({ where: { id: cleanup.definitionId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });
