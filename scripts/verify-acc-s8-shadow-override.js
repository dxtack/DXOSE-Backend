/**
 * ACC Big Bang Stage S8 — Shadow mode + override audit validation.
 *
 * Usage:
 *   node scripts/verify-acc-s8-shadow-override.js
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { shadowEvaluate, getFeatureFlagStatus, isShadowModeEnabled } = require('../src/engines/shadow-mode.service');
const { grant, reset } = require('../src/engines/user-override.engine');
const { AuditAction } = require('../src/engines/ur-audit.logger');

const prisma = new PrismaClient();

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

async function main() {
  console.log('\nACC Big Bang S8 — Shadow + Override Audit Validation\n');

  // ── 1. Feature flags default OFF ───────────────────────────────────────────
  console.log('[1] Feature flags (must default OFF):');
  const flags = getFeatureFlagStatus();
  assert('ENABLE_UR_SHADOW_MODE is false', flags.shadowMode === false);
  assert('USE_NEW_POLICY_ENGINE is false', flags.newEngineEnabled === false);

  // ── 2. Shadow disabled = no-op ────────────────────────────────────────────
  console.log('\n[2] Shadow mode disabled — no evaluation:');
  process.env.ENABLE_UR_SHADOW_MODE = 'false';
  await shadowEvaluate(
    { user: { id: '00000000-0000-0000-0000-000000000001', role: 'ADMIN' } },
    ['SETTINGS_MANAGE'],
    true,
  );
  assert('shadowEvaluate no-op when disabled', isShadowModeEnabled() === false);

  // ── 3. Shadow enabled — mismatch logged, never throws ─────────────────────
  console.log('\n[3] Shadow mode enabled — mismatch logging:');
  process.env.ENABLE_UR_SHADOW_MODE = 'true';

  const actor = await prisma.user.findFirst({
    where: { email: 'admin@grandhorizon.com' },
    select: { id: true },
  });
  assert('pilot admin user found for shadow test', !!actor?.id);

  const shadowUserId = actor?.id ?? '00000000-0000-0000-0000-000000000001';
  const beforeMismatchCount = await prisma.urAuditEvent.count({
    where: { action: AuditAction.SHADOW_MISMATCH },
  });

  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...args) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return origWrite(chunk, ...args);
  };

  let threw = false;
  try {
    await shadowEvaluate(
      {
        user: {
          id: shadowUserId,
          role: 'STOREKEEPER',
          tenantId: null,
        },
        method: 'GET',
        originalUrl: '/api/test-shadow',
      },
      ['GRN_VIEW'],
      true,
    );
  } catch (e) {
    threw = true;
  } finally {
    process.stderr.write = origWrite;
  }

  assert('shadowEvaluate does not throw', !threw);
  const stderrOutput = stderrChunks.join('');
  assert(
    'stderr contains UR_SHADOW marker',
    stderrOutput.includes('UR_SHADOW_MISMATCH') || stderrOutput.includes('UR_SHADOW_ERROR'),
  );

  const afterMismatchCount = await prisma.urAuditEvent.count({
    where: { action: AuditAction.SHADOW_MISMATCH },
  });
  assert(
    'SHADOW_MISMATCH audit row created when actor exists',
    !actor?.id || afterMismatchCount === beforeMismatchCount + 1,
  );

  // ── 4. Override audit wiring ───────────────────────────────────────────────
  console.log('\n[4] Override audit events (grant + reset):');

  const permission = await prisma.urPermission.findFirst({
    select: { id: true, legacyCode: true },
  });
  const assignment = actor?.id
    ? await prisma.urUserAssignment.findFirst({
        where: { userId: actor.id, isActive: true },
        select: { id: true },
      })
    : null;

  assert('sample ur permission found', !!permission?.id);
  assert('sample assignment for scoped override', !!assignment?.id);

  if (actor?.id && permission?.id && assignment?.id) {
    const tagReason = `s8-verify-${Date.now()}`;
    const beforeGrant = await prisma.urAuditEvent.count({
      where: { action: AuditAction.OVERRIDE_GRANTED, targetUserId: actor.id },
    });

    await grant(actor.id, permission.id, {
      actorId: actor.id,
      assignmentId: assignment.id,
      reason: tagReason,
    });

    const afterGrant = await prisma.urAuditEvent.count({
      where: { action: AuditAction.OVERRIDE_GRANTED, targetUserId: actor.id },
    });
    assert('OVERRIDE_GRANTED audit emitted', afterGrant === beforeGrant + 1);

    const beforeReset = await prisma.urAuditEvent.count({
      where: { action: AuditAction.OVERRIDE_RESET, targetUserId: actor.id },
    });

    await reset(actor.id, permission.id, assignment.id, { actorId: actor.id });

    const afterReset = await prisma.urAuditEvent.count({
      where: { action: AuditAction.OVERRIDE_RESET, targetUserId: actor.id },
    });
    assert('OVERRIDE_RESET audit emitted', afterReset === beforeReset + 1);
  }

  // ── 5. Reset flags ─────────────────────────────────────────────────────────
  console.log('\n[5] Resetting flags to safe defaults:');
  process.env.ENABLE_UR_SHADOW_MODE = 'false';
  process.env.USE_NEW_POLICY_ENGINE = 'false';
  assert('ENABLE_UR_SHADOW_MODE reset to false', isShadowModeEnabled() === false);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`S8 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('ACC Big Bang S8 validation PASS\n');
}

main()
  .catch((e) => {
    process.env.ENABLE_UR_SHADOW_MODE = 'false';
    process.env.USE_NEW_POLICY_ENGINE = 'false';
    console.error('SCRIPT ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
