'use strict';

/**
 * ACC Zero-Legacy — ORG_MANAGER targeted governance review (READ-ONLY).
 * Zero DB writes. Produces per-membership inventory + proposed governance grants.
 * Usage: node Governance/scripts/acc-org-manager-governance-review.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { resolveAccPermissionsForMembership, _findSessionAssignment } = require('../../src/acc-runtime/resolvePermissions');
const { getPermissionsForRole } = require('../../src/middleware/authorize');
const {
  membershipRoleCode,
  getRoleIdByCode,
  resolveUserBestRole,
  loadUrPermissionCodesForRoleId,
  loadPermissionCodesForRoleId,
  roleHasUrPermissions,
  applyRolePermissionPolicy,
} = require('../../src/services/rbac.service');

const prisma = new PrismaClient();
const outDir = path.join(__dirname, 'reports');
const reportPath = path.join(outDir, 'ACC_ORG_MANAGER_GOVERNANCE_REVIEW.json');

/** Governance route → required permission(s). View separated from Manage. */
const GOVERNANCE_ROUTES = {
  ORG_DASHBOARD: { view: ['VIEW_DASHBOARD', 'DASHBOARD_VIEW'], kind: 'SAFE_GOVERNANCE' },
  WORKFLOW_PIPELINE: { view: ['WORKFLOW_PIPELINE_VIEW'], kind: 'SAFE_GOVERNANCE' },
  USERS_WORKSPACE: { view: ['HOTEL_USERS_MANAGE', 'USERS_COMPANY_MANAGE'], kind: 'SENSITIVE_GOVERNANCE' },
  ROLES: { view: ['USERS_COMPANY_MANAGE'], kind: 'SENSITIVE_GOVERNANCE' },
  ACCESS_CONTROL_VIEW: { view: ['ACCESS_CONTROL_VIEW'], kind: 'SAFE_GOVERNANCE' },
  ACCESS_CONTROL_MANAGE: { view: ['ACCESS_CONTROL_MANAGE'], kind: 'SENSITIVE_GOVERNANCE' },
  SETTINGS: { view: ['SETTINGS_MANAGE'], kind: 'SENSITIVE_GOVERNANCE' },
  AUDIT_LOG: { view: ['AUDIT_LOG_VIEW'], kind: 'SAFE_GOVERNANCE' },
  REPORTS_VIEW: { view: ['REPORTS_VIEW'], kind: 'SAFE_GOVERNANCE' },
  REPORTS_EXPORT: { view: ['REPORTS_EXPORT'], kind: 'SENSITIVE_GOVERNANCE' },
  INTEGRITY: { view: ['INTEGRITY_VIEW'], kind: 'SAFE_GOVERNANCE' },
  PERIOD_CLOSE: { view: ['PERIOD_CLOSE_MANAGE'], kind: 'SENSITIVE_GOVERNANCE' },
};

/** Operational permissions that MUST NOT be granted by role name (require explicit ACC assignment). */
const OPERATIONAL_PERMISSIONS = new Set([
  'MOVEMENT_CREATE', 'ADJUSTMENT_CREATE', 'GRN_MANAGE',
  'TRANSFER_CREATE', 'TRANSFER_APPROVE', 'TRANSFER_DISPATCH_RECEIVE',
  'BREAKAGE_CREATE', 'APPROVE_BREAKAGE', 'LOST_CREATE', 'APPROVE_LOST',
  'STOCK_COUNT_MANAGE', 'APPROVE_INVENTORY_COUNT',
  'GET_PASS_CREATE', 'GET_PASS_APPROVE', 'GET_PASS_APPROVE_FINAL',
  'GET_PASS_APPROVE_EXIT', 'GET_PASS_APPROVE_RETURN', 'GET_PASS_CONFIRM_DESTINATION',
  'IMPORT_EXCEL', 'IMPORT_CREATE',
]);

/** Minimal governance baseline (identity/oversight) considered safe for an org-manager who lacks it. */
const BASELINE_GOVERNANCE = ['VIEW_DASHBOARD', 'DASHBOARD_VIEW', 'WORKFLOW_PIPELINE_VIEW'];

const TEST_EMAIL_MARKERS = ['test', 'disposable', 'closeout', 'phase1-gate', 'phase2-gate', 'phase3-gate', 'phase4', 'phase5', 'e2e', 'uat', '.local', 'audit'];

function classifyAccount(email) {
  const e = String(email || '').toLowerCase();
  if (TEST_EMAIL_MARKERS.some((m) => e.includes(m))) return 'TEST_OR_AUDIT';
  return 'REAL_CANDIDATE';
}

function accessibleGovernanceRoutes(perms) {
  const set = new Set(perms);
  const accessible = [];
  const denied = [];
  for (const [route, cfg] of Object.entries(GOVERNANCE_ROUTES)) {
    const ok = cfg.view.some((p) => set.has(p));
    (ok ? accessible : denied).push(route);
  }
  return { accessible, denied };
}

function classifyMembership({ email, isActive, permCount, perms, hasAssignment }) {
  if (!isActive) return 'INACTIVE';
  const acct = classifyAccount(email);
  if (acct === 'TEST_OR_AUDIT') return 'TEST_ONLY';
  const set = new Set(perms);
  const hasUserAdmin = set.has('USERS_COMPANY_MANAGE') || set.has('HOTEL_USERS_MANAGE');
  const hasAccAdmin = set.has('ACCESS_CONTROL_MANAGE') || set.has('ACCESS_CONTROL_VIEW');
  const hasSettings = set.has('SETTINGS_MANAGE');
  const hasReports = set.has('REPORTS_VIEW') || set.has('REPORTS_EXPORT');
  const hasOperational = [...set].some((p) => OPERATIONAL_PERMISSIONS.has(p));
  if (hasOperational) return 'OPERATIONAL_ASSIGNMENT_REQUIRED';
  if (hasAccAdmin) return 'ACC_ADMIN';
  if (hasUserAdmin) return 'USER_ADMIN';
  if (hasSettings) return 'SETTINGS_ADMIN';
  if (hasReports) return 'ORG_REPORTING';
  if (permCount <= 3) return 'GOVERNANCE_DASHBOARD_ONLY';
  return 'AMBIGUOUS';
}

async function loadAssignmentPerms(assignment, roleCode) {
  if (!assignment?.roleId) return [];
  const urConfigured = await roleHasUrPermissions(assignment.roleId);
  const raw = urConfigured
    ? await loadUrPermissionCodesForRoleId(assignment.roleId)
    : await loadPermissionCodesForRoleId(assignment.roleId);
  return applyRolePermissionPolicy(roleCode, raw);
}

function proposeGrants({ classification, perms }) {
  const set = new Set(perms);
  if (classification === 'INACTIVE') return { recommendation: 'INACTIVE/TEST', proposed: [], reason: {} };
  if (classification === 'TEST_ONLY') return { recommendation: 'INACTIVE/TEST', proposed: [], reason: {} };
  if (classification === 'OPERATIONAL_ASSIGNMENT_REQUIRED') {
    return { recommendation: 'MANUAL REVIEW', proposed: [], reason: { note: 'Has operational permissions — verify explicit ACC assignment justifies them.' } };
  }
  if (classification === 'AMBIGUOUS') {
    return { recommendation: 'MANUAL REVIEW', proposed: [], reason: { note: 'Responsibility unclear — no auto grant.' } };
  }
  // Governance classifications: propose only missing baseline dashboard/pipeline visibility.
  const proposed = [];
  const reason = {};
  for (const code of BASELINE_GOVERNANCE) {
    if (!set.has(code)) {
      proposed.push(code);
      reason[code] = 'Governance oversight baseline (dashboard / workflow pipeline visibility). No operational action.';
    }
  }
  if (proposed.length === 0) {
    return { recommendation: 'NO GRANT', proposed: [], reason: { note: 'Already has governance baseline.' } };
  }
  return { recommendation: 'GRANT PROPOSED', proposed, reason };
}

async function main() {
  // Match inventory logic: resolved best role === ORG_MANAGER (includes promotion via
  // ORG_MANAGER membership elsewhere), scanning all active memberships.
  const allMemberships = await prisma.tenantMember.findMany({
    where: { isActive: true },
    include: {
      user: { select: { id: true, email: true, isActive: true, permissionVersion: true, lastLoginAt: true } },
      tenant: { select: { id: true, slug: true, name: true, parentId: true } },
      role: { select: { id: true, code: true, isActive: true } },
    },
    orderBy: [{ userId: 'asc' }],
  });

  const memberships = [];
  for (const m of allMemberships) {
    if (!m.user?.isActive) continue;
    const resolved = (await resolveUserBestRole(m.userId, membershipRoleCode(m))) ?? membershipRoleCode(m);
    if (resolved === 'ORG_MANAGER') memberships.push(m);
  }

  const rows = [];
  const classificationCounts = {};

  for (const m of memberships) {
    const roleCode = 'ORG_MANAGER';
    const roleId =
      (roleCode === 'ORG_MANAGER' ? await getRoleIdByCode('ORG_MANAGER') : null) ??
      m.roleId ?? m.role?.id;
    const accPerms = (await resolveAccPermissionsForMembership({
      userId: m.userId,
      membership: m,
      roleId,
      roleCode,
    })) || [];
    const assignment = await _findSessionAssignment(m.userId, m, roleId);
    const assignmentPerms = await loadAssignmentPerms(assignment, roleCode);
    const staticMatrix = getPermissionsForRole(roleCode);
    const isActive = m.isActive && m.user?.isActive !== false;

    const routes = accessibleGovernanceRoutes(accPerms);
    const staticRoutes = accessibleGovernanceRoutes(staticMatrix);
    const lostVsStatic = staticRoutes.accessible.filter((r) => !routes.accessible.includes(r));

    const classification = classifyMembership({
      email: m.user?.email,
      isActive,
      permCount: accPerms.length,
      perms: accPerms,
      hasAssignment: !!assignment,
    });
    classificationCounts[classification] = (classificationCounts[classification] || 0) + 1;

    const proposal = proposeGrants({ classification, perms: accPerms });

    rows.push({
      userId: m.userId,
      email: m.user?.email,
      accountType: classifyAccount(m.user?.email),
      orgRootTenantId: m.tenant?.parentId ?? m.tenantId,
      membershipTenant: m.tenant?.slug,
      membershipTenantId: m.tenantId,
      isActive,
      role: roleCode,
      accPermissionCount: accPerms.length,
      accPermissions: accPerms.sort(),
      assignmentId: assignment?.id ?? null,
      assignmentRoleId: assignment?.roleId ?? null,
      assignmentPermissionCount: assignmentPerms.length,
      permissionVersion: m.user?.permissionVersion ?? 0,
      lastLoginAt: m.user?.lastLoginAt ?? null,
      classification,
      accessibleGovernanceRoutes: routes.accessible,
      deniedGovernanceRoutes: routes.denied,
      governanceRoutesLostVsStaticMatrix: lostVsStatic,
      hasOperationalPermission: accPerms.some((p) => OPERATIONAL_PERMISSIONS.has(p)),
      recommendation: proposal.recommendation,
      proposedGrants: proposal.proposed,
      proposalReason: proposal.reason,
    });
  }

  const recommendationCounts = {};
  for (const r of rows) recommendationCounts[r.recommendation] = (recommendationCounts[r.recommendation] || 0) + 1;

  const report = {
    generatedAt: new Date().toISOString(),
    totalOrgManagerMemberships: rows.length,
    classificationCounts,
    recommendationCounts,
    governanceRouteCatalogue: GOVERNANCE_ROUTES,
    operationalPermissionsExcluded: [...OPERATIONAL_PERMISSIONS],
    baselineGovernanceProposed: BASELINE_GOVERNANCE,
    memberships: rows,
  };

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('ORG_MANAGER Governance Review (READ-ONLY)');
  console.log('=========================================');
  console.log('total memberships:', rows.length);
  console.log('classificationCounts:', JSON.stringify(classificationCounts, null, 2));
  console.log('recommendationCounts:', JSON.stringify(recommendationCounts, null, 2));
  console.log('report:', reportPath);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
