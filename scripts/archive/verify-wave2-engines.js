/**
 * Wave 2 — Engine smoke test.
 * Verifies all three engines load and can reach the database.
 * Does NOT modify any data.
 */
'use strict';

const { resolveEffectivePermissions } = require('../src/engines/permission-resolution.engine');
const { grant, deny, reset, listOverrides } = require('../src/engines/user-override.engine');
const { AuditAction, log: auditLog } = require('../src/engines/ur-audit.logger');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Wave 2 — Engine Smoke Test\n');

  // 1. Confirm engine modules loaded
  console.log('[1] Module imports:');
  console.log('  PermissionResolutionEngine → resolveEffectivePermissions:', typeof resolveEffectivePermissions);
  console.log('  UserOverrideEngine         → grant / deny / reset:', typeof grant, typeof deny, typeof reset);
  console.log('  UrAuditLogger              → AuditAction keys:', Object.keys(AuditAction).join(', '));

  // 2. Confirm UrUserAssignment table is reachable (0 rows expected — no data yet)
  const assignmentCount = await prisma.urUserAssignment.count();
  console.log('\n[2] DB reachability:');
  console.log('  ur_user_assignments rows:', assignmentCount);

  const overrideCount = await prisma.urUserOverride.count();
  console.log('  ur_user_overrides rows:  ', overrideCount);

  const auditCount = await prisma.urAuditEvent.count();
  console.log('  ur_audit_events rows:    ', auditCount);

  // 3. Confirm resolution engine handles zero-assignment user gracefully
  console.log('\n[3] Resolution with no assignments:');
  const fakeUserId = '00000000-0000-0000-0000-000000000000';
  const result = await resolveEffectivePermissions(fakeUserId);
  console.log('  assignmentCount:  ', result.assignmentCount);
  console.log('  effectiveCodes:   ', result.effectiveCodes.length, '(expected: 0)');

  console.log('\nWave 2 — All engines loaded and DB reachable. PASS');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error('FAIL:', e.message); prisma.$disconnect(); process.exit(1); });
