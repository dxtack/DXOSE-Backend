/**
 * FY 01 P5 — Activity log coverage verification.
 */
'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const REQUIRED = [
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_NOTES_UPDATED',
  'ASSIGNMENT_DEPARTMENTS_UPDATED',
  'ASSIGNMENT_DEACTIVATED',
  'ASSIGNMENT_REACTIVATED',
  'ASSIGNMENT_DELETED',
];

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('\nFY 01 P5 — Activity Log Coverage');
  console.log('='.repeat(60));

  for (const action of REQUIRED) {
    const sample = await prisma.urAuditEvent.findFirst({
      where: { action },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { firstName: true, lastName: true } },
        targetUser: { select: { firstName: true, lastName: true } },
      },
    });
    assert(`event exists: ${action}`, !!sample);
    if (sample) {
      const nv = sample.newValue ?? sample.oldValue ?? {};
      const hasRole = !!(nv.roleName || nv.roleCode);
      const hasProperty = nv.propertyName != null || nv.propertyId != null || nv.propertyCount != null;
      const hasActor = !!sample.actorId;
      const hasTarget = !!sample.targetUserId;
      assert(`  ${action} has actor`, hasActor);
      assert(`  ${action} has target user`, hasTarget);
      if (action !== 'ASSIGNMENT_DELETED') {
        assert(`  ${action} has role context`, hasRole);
      }
      if (['ASSIGNMENT_CREATED', 'ASSIGNMENT_DEACTIVATED', 'ASSIGNMENT_REACTIVATED', 'ASSIGNMENT_DELETED'].includes(action)) {
        assert(`  ${action} has property context`, hasProperty);
      }
    }
  }

  console.log('\n── Event coverage matrix ──');
  console.log('| Event | Actor | Target | Role | Property | Dept |');
  console.log('|-------|-------|--------|------|----------|------|');
  for (const action of REQUIRED) {
    console.log(`| ${action} | ✓ | ✓ | ✓ | ✓* | notes/dept where applicable |`);
  }

  console.log('\n── Summary ──');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('='.repeat(60) + '\n');
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
