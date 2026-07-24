'use strict';

/**
 * ACC Zero-Legacy — runtime authorization matrix (Phase 11).
 * Usage: node Governance/scripts/acc-zero-legacy-runtime-matrix.js
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { hasPermission, _wouldStaticMatrixAllow } = require('../../src/middleware/authorize');
const { resolvePermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
const { getPermissionsForMembership, membershipRoleCode, getRoleIdByCode, resolveUserBestRole } = require('../../src/services/rbac.service');
const { userHasPermission } = require('../../src/acc-authority/step-permission-enforcement');

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function main() {
  console.log('ACC Zero-Legacy Runtime Matrix\n');

  // 1. Empty permissions fail closed
  const fmUser = { role: 'FINANCE_MANAGER', permissions: [] };
  assert('empty permissions → hasPermission false', !hasPermission(fmUser, 'GRN_MANAGE'));
  assert('static matrix would have allowed FM GRN (telemetry only)', _wouldStaticMatrixAllow(fmUser, 'GRN_MANAGE'));

  // 2. Explicit permission grant
  const granted = { role: 'STOREKEEPER', permissions: ['INVENTORY_VIEW', 'MOVEMENT_CREATE'] };
  assert('explicit grant → allow', hasPermission(granted, 'INVENTORY_VIEW'));
  assert('explicit grant → deny missing', !hasPermission(granted, 'GRN_MANAGE'));

  // 3. Workflow bypass removed
  const omBypass = { role: 'ORG_MANAGER', permissions: [] };
  assert('ORG_MANAGER no bypass without permission', !userHasPermission(omBypass, 'APPROVE_BREAKAGE'));
  const omWithPerm = { role: 'ORG_MANAGER', permissions: ['APPROVE_BREAKAGE'] };
  assert('ORG_MANAGER with permission → allow', userHasPermission(omWithPerm, 'APPROVE_BREAKAGE'));

  // 4. Live membership resolution sample
  const sample = await prisma.tenantMember.findFirst({
    where: { isActive: true, role: { code: { not: 'SUPER_ADMIN' } } },
    include: { user: true, tenant: true, role: true },
  });
  if (sample) {
    const roleCode = (await resolveUserBestRole(sample.userId, membershipRoleCode(sample))) ?? membershipRoleCode(sample);
    const roleId = sample.roleId ?? sample.role?.id;
    const acc = await resolvePermissionsForMembership({
      userId: sample.userId,
      membership: sample,
      roleId,
      roleCode,
      tenantId: sample.tenantId,
      tenantSlug: sample.tenant?.slug,
    });
    const legacy = await getPermissionsForMembership({ roleId, roleCode });
    assert('resolve returns array', Array.isArray(acc));
    assert('no auto ORG_MANAGER all-codes', roleCode !== 'ORG_MANAGER' || acc.length < 50);
    if (acc.length > 0) {
      const probe = acc[0];
      const userCtx = { role: roleCode, permissions: acc };
      assert(`resolved permission ${probe} honored`, hasPermission(userCtx, probe));
    }
    console.log(`  sample ${sample.user?.email} role=${roleCode} acc=${acc.length} legacy=${legacy.length}`);
  }

  // 5. ORG_MANAGER assignment-only check
  const om = await prisma.tenantMember.findFirst({
    where: { isActive: true, role: { code: 'ORG_MANAGER' } },
    include: { user: true, tenant: true, role: true },
  });
  if (om) {
    const roleId = om.roleId ?? om.role?.id;
    const acc = await resolvePermissionsForMembership({
      userId: om.userId,
      membership: om,
      roleId,
      roleCode: 'ORG_MANAGER',
      tenantId: om.tenantId,
      tenantSlug: om.tenant?.slug,
    });
    assert('ORG_MANAGER not granted all operational codes', acc.length < 40);
    console.log(`  ORG_MANAGER ${om.user?.email} accCount=${acc.length}`);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
