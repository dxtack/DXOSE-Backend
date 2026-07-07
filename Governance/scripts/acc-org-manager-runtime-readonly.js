'use strict';

/**
 * ACC Zero-Legacy — ORG_MANAGER read-only runtime verification.
 * Zero DB writes, no server needed. Resolves real ACC permissions per representative
 * account and asserts governance vs operational authorization decisions via hasPermission.
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { hasPermission, _wouldStaticMatrixAllow } = require('../../src/middleware/authorize');
const { resolveAccPermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
const { getRoleIdByCode } = require('../../src/services/rbac.service');

const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function assert(label, cond) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.error(`  ✗ ${label}`); fail++; }
}

const OPERATIONAL = ['GRN_MANAGE', 'TRANSFER_APPROVE', 'APPROVE_BREAKAGE', 'MOVEMENT_CREATE', 'ADJUSTMENT_CREATE'];
const GOVERNANCE = ['VIEW_DASHBOARD', 'USERS_COMPANY_MANAGE', 'SETTINGS_MANAGE', 'AUDIT_LOG_VIEW'];

async function forMembership(email, tenantSlug) {
  const m = await prisma.tenantMember.findFirst({
    where: { user: { email }, tenant: { slug: tenantSlug }, isActive: true },
    include: { user: true, tenant: true, role: true },
  });
  if (!m) { console.log(`  (skip ${email}@${tenantSlug} — not found)`); return; }
  const roleId = (await getRoleIdByCode('ORG_MANAGER')) ?? m.roleId;
  const acc = (await resolveAccPermissionsForMembership({ userId: m.userId, membership: m, roleId, roleCode: 'ORG_MANAGER' })) || [];
  const user = { id: m.userId, role: 'ORG_MANAGER', tenantId: m.tenantId, permissions: acc };

  console.log(`\n[${email} @ ${tenantSlug}] resolved ACC permissions = ${acc.length}`);

  // Operational routes: allowed ONLY when the permission is explicitly in ACC set.
  for (const p of OPERATIONAL) {
    const expected = acc.includes(p);
    assert(`operational ${p} → ${expected ? 'allow (explicit ACC)' : 'deny'}`, hasPermission(user, p) === expected);
  }
  // Governance routes: same rule — decision follows ACC set, never role name.
  for (const p of GOVERNANCE) {
    const expected = acc.includes(p);
    assert(`governance ${p} → ${expected ? 'allow (explicit ACC)' : 'deny'}`, hasPermission(user, p) === expected);
  }
  // Empty-permission variant of same identity → fail closed for everything.
  if (acc.length === 0) {
    assert('zero-ACC account → GRN_MANAGE denied', !hasPermission(user, 'GRN_MANAGE'));
    assert('zero-ACC account → VIEW_DASHBOARD denied', !hasPermission(user, 'VIEW_DASHBOARD'));
  }
}

async function main() {
  console.log('ORG_MANAGER Read-Only Runtime Verification');
  console.log('==========================================');

  // No static role fallback — confirm empty ORG_MANAGER denied but would-have-been-allowed flagged
  const emptyOm = { role: 'ORG_MANAGER', permissions: [] };
  assert('empty ORG_MANAGER → GRN_MANAGE denied (no static fallback)', !hasPermission(emptyOm, 'GRN_MANAGE'));

  // Representatives from each classification
  await forMembership('amr@ga.com', 'test-org');           // GOVERNANCE_DASHBOARD_ONLY
  await forMembership('amr@ga.com', 'voco');               // OPERATIONAL_ASSIGNMENT_REQUIRED (explicit ACC)
  await forMembership('p1-reg-org@phase1-gate.local', 'closeout-audit-org-disposable'); // zero ACC
  await forMembership('daniel.carter@dxuat.com', 'dx-hospitality-group');               // org root, 2 perms

  // Cross-tenant: same user in a tenant where they have 43 vs 2 must differ (no carryover)
  const a = await prisma.tenantMember.findFirst({ where: { user: { email: 'daniel.carter@dxuat.com' }, tenant: { slug: 'dx-marina-hotel' }, isActive: true }, include: { role: true, tenant: true } });
  const b = await prisma.tenantMember.findFirst({ where: { user: { email: 'daniel.carter@dxuat.com' }, tenant: { slug: 'dx-hospitality-group' }, isActive: true }, include: { role: true, tenant: true } });
  if (a && b) {
    const roleId = await getRoleIdByCode('ORG_MANAGER');
    const pa = (await resolveAccPermissionsForMembership({ userId: a.userId, membership: a, roleId, roleCode: 'ORG_MANAGER' })) || [];
    const pb = (await resolveAccPermissionsForMembership({ userId: b.userId, membership: b, roleId, roleCode: 'ORG_MANAGER' })) || [];
    console.log(`\n[cross-tenant] dx-marina-hotel=${pa.length} vs dx-hospitality-group=${pb.length}`);
    assert('no permission carryover across tenants', pa.length !== pb.length || pa.join() !== pb.join());
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
