'use strict';

/**
 * ACC Zero-Legacy — read-only DB inventory (Phase 1).
 * Usage: node Governance/scripts/acc-zero-legacy-inventory.js [--json]
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PERMISSIONS } = require('../../src/acc-authority/runtime-permission-matrix');
const { getPermissionsForRole } = require('../../src/middleware/authorize');
const {
  resolveAccPermissionsForMembership,
} = require('../../src/acc-runtime/resolvePermissions');
const {
  getPermissionsForMembership,
  membershipRoleCode,
  getRoleIdByCode,
  resolveUserBestRole,
} = require('../../src/services/rbac.service');

const prisma = new PrismaClient();
const asJson = process.argv.includes('--json');
const outDir = path.join(__dirname, 'reports');
const reportPath = path.join(outDir, 'ACC_ZERO_LEGACY_INVENTORY.json');

function staticMatrixPermissions(roleCode) {
  return getPermissionsForRole(roleCode);
}

function classifyUser({
  accPerms,
  legacyPerms,
  staticPerms,
  isActive,
  roleCode,
}) {
  if (!isActive) return 'INACTIVE';
  if (roleCode === 'SUPER_ADMIN') return 'GOVERNANCE_ONLY';
  if (accPerms.length > 0) {
    if (staticPerms.length > accPerms.length) return 'NEEDS_ACC_REVIEW';
    return 'SAFE';
  }
  if (legacyPerms.length > 0) return 'NEEDS_ACC_REVIEW';
  if (staticPerms.length > 0) return 'FALLBACK_DEPENDENT';
  return 'AMBIGUOUS';
}

async function main() {
  const [
    activeUsers,
    activeAssignments,
    activeRoles,
    urRolePermCount,
    legacyRolePermCount,
    permissionVersionRows,
    orgManagers,
    superAdmins,
    inactiveAssignments,
    archivedRoles,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.urUserAssignment.count({ where: { isActive: true } }),
    prisma.role.count({ where: { isActive: true } }),
    prisma.urRolePermission.count(),
    prisma.rolePermission.count(),
    prisma.user.findMany({
      where: { isActive: true },
      select: { permissionVersion: true },
    }),
    prisma.tenantMember.findMany({
      where: { isActive: true, role: { code: 'ORG_MANAGER' } },
      select: { userId: true, tenantId: true },
      distinct: ['userId'],
    }),
    prisma.tenantMember.findMany({
      where: { isActive: true, role: { code: 'SUPER_ADMIN' } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.urUserAssignment.count({ where: { isActive: false } }),
    prisma.role.count({ where: { isActive: false } }),
  ]);

  const versionDist = {};
  for (const row of permissionVersionRows) {
    const v = row.permissionVersion ?? 0;
    versionDist[v] = (versionDist[v] || 0) + 1;
  }

  const memberships = await prisma.tenantMember.findMany({
    where: { isActive: true },
    include: {
      user: { select: { id: true, email: true, isActive: true, permissionVersion: true } },
      tenant: { select: { id: true, slug: true, name: true, parentId: true } },
      role: { select: { id: true, code: true, isActive: true } },
    },
  });

  const userDetails = [];
  const classificationCounts = {};

  for (const m of memberships) {
    if (!m.user?.isActive) continue;
    const roleCode =
      (await resolveUserBestRole(m.userId, membershipRoleCode(m))) ?? membershipRoleCode(m);
    const roleId = m.roleId ?? m.role?.id ?? (roleCode ? await getRoleIdByCode(roleCode) : null);

    const [accPerms, legacyPerms] = await Promise.all([
      resolveAccPermissionsForMembership({
        userId: m.userId,
        membership: m,
        roleId,
        roleCode,
      }).then((p) => (Array.isArray(p) ? p : [])),
      getPermissionsForMembership({ roleId, roleCode }),
    ]);

    const staticPerms = staticMatrixPermissions(roleCode);
    const effectiveAcc = accPerms.length > 0 ? accPerms : legacyPerms;
    const classification = classifyUser({
      accPerms: effectiveAcc,
      legacyPerms,
      staticPerms,
      isActive: true,
      roleCode,
    });
    classificationCounts[classification] = (classificationCounts[classification] || 0) + 1;

    const wouldFallback =
      effectiveAcc.length === 0 && staticPerms.length > 0;

    if (
      wouldFallback ||
      classification === 'FALLBACK_DEPENDENT' ||
      classification === 'NEEDS_ACC_REVIEW' ||
      classification === 'AMBIGUOUS'
    ) {
      userDetails.push({
        userId: m.userId,
        email: m.user.email,
        tenantId: m.tenantId,
        tenantSlug: m.tenant?.slug ?? null,
        membershipId: m.id,
        role: roleCode,
        roleId,
        permissionVersion: m.user.permissionVersion ?? 0,
        accPermissionCount: accPerms.length,
        legacyPermissionCount: legacyPerms.length,
        staticMatrixCount: staticPerms.length,
        effectivePermissionCount: effectiveAcc.length,
        wouldStaticMatrixFallback: wouldFallback,
        classification,
        operational: roleCode !== 'SUPER_ADMIN',
      });
    }
  }

  const zeroAccOperational = userDetails.filter(
    (u) => u.operational && u.effectivePermissionCount === 0,
  );
  const fallbackDependent = userDetails.filter((u) => u.wouldStaticMatrixFallback);

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      activeUsers,
      activeAssignments,
      activeRoles,
      urRolePermissionRows: urRolePermCount,
      legacyRolePermissionRows: legacyRolePermCount,
      orgManagerUsers: orgManagers.length,
      superAdminUsers: superAdmins.length,
      inactiveAssignments,
      archivedInactiveRoles: archivedRoles,
      activeMembershipsScanned: memberships.length,
      zeroEffectivePermissionsOperational: zeroAccOperational.length,
      wouldStaticMatrixFallback: fallbackDependent.length,
      classificationCounts,
      permissionVersionDistribution: versionDist,
    },
    fallbackDependentUsers: fallbackDependent,
    reviewUsers: userDetails,
    staticMatrixPermissionKeys: Object.keys(PERMISSIONS).length,
  };

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('ACC Zero-Legacy Inventory (read-only)');
    console.log('=====================================');
    console.log(JSON.stringify(report.counts, null, 2));
    console.log(`\nReport: ${reportPath}`);
    console.log(`Fallback-dependent (would use static matrix): ${fallbackDependent.length}`);
    console.log(`Zero effective permissions (operational): ${zeroAccOperational.length}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
