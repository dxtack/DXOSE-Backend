/**
 * FY 01 P4 — Assignment creation UX verification.
 */
'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { validateCreateAssignment, ValidationError } = require('../src/engines/assignment.validators');
const { createAssignmentsWithProvisioning } = require('../src/services/acc-assignment-fanout.service');

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('\nFY 01 P4 — Assignment Creation UX Verification');
  console.log('='.repeat(60));

  try {
    validateCreateAssignment({
      userId: '00000000-0000-4000-8000-000000000001',
      roleId: '00000000-0000-4000-8000-000000000002',
      propertyIds: ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004'],
    });
    assert('reject multiple propertyIds', false);
  } catch (e) {
    assert('reject multiple propertyIds', e instanceof ValidationError);
    assert('no fan-out messaging', !String(e.message).includes('fan out'));
  }

  const actor = await prisma.user.findFirst({ where: { email: 'superadmin@ose.cloud' } });
  const role = await prisma.role.findFirst({ where: { code: 'SECURITY', isActive: true } });
  const branchProperty = await prisma.tenant.findFirst({
    where: { isActive: true, parentId: { not: null } },
    select: { id: true, parentId: true, maxUsers: true },
  });
  let target = null;
  if (branchProperty && role) {
    const members = await prisma.tenantMember.count({
      where: { tenantId: branchProperty.id, isActive: true },
    });
    if (members < (branchProperty.maxUsers ?? 999)) {
      target = await prisma.user.findFirst({
        where: {
          isActive: true,
          email: { not: 'superadmin@ose.cloud' },
          urAssignments: {
            none: {
              roleId: role.id,
              isActive: true,
              properties: { some: { propertyId: branchProperty.id } },
            },
          },
        },
        select: { id: true, email: true },
      });
    }
  }
  const orgRoot = branchProperty?.parentId;
  const orgRows = orgRoot
    ? await prisma.tenant.findMany({
        where: { isActive: true, OR: [{ id: orgRoot }, { parentId: orgRoot }] },
        select: { id: true },
      })
    : [];
  const orgGroup = new Set(orgRows.map((r) => r.id));

  if (actor && target && role && branchProperty) {
    const disposable = await prisma.urUserAssignment.create({
      data: {
        userId: target.id,
        roleId: role.id,
        isActive: false,
        notes: 'P4 verify disposable',
        properties: { create: [{ propertyId: branchProperty.id }] },
      },
    });
    await prisma.urUserAssignment.delete({ where: { id: disposable.id } });

    const result = await createAssignmentsWithProvisioning(
      actor.id,
      {
        userId: target.id,
        roleId: role.id,
        propertyIds: [branchProperty.id],
        notes: 'P4 verify single create',
      },
      { orgGroupIds: orgGroup, actorRoleCode: 'SUPER_ADMIN' },
    );
    assert('single assignment returned', !!result.assignment?.id);
    assert('assignment has one property', (result.assignment?.properties?.length ?? 0) === 1);

    const audit = await prisma.urAuditEvent.findFirst({
      where: { action: 'ASSIGNMENT_CREATED', targetEntityId: result.assignment.id },
      orderBy: { createdAt: 'desc' },
    });
    assert('create audit has roleName', !!(audit?.newValue)?.roleName);
    assert('create audit has propertyName', !!(audit?.newValue)?.propertyName);

    await prisma.urUserAssignment.delete({ where: { id: result.assignment.id } }).catch(() => {});
  } else {
    console.log('  (skip live create — no eligible user/property with seat capacity)');
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
