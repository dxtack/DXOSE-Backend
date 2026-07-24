'use strict';

/**
 * ACC Big Bang S20 — read-only system diagnostics for ACC workspace.
 */

const prisma = require('../config/database');
const { PROTECTED_ROLE_CODES } = require('../constants/role-codes.constants');
const { computeEffectiveRuntimePermissionCodes } = require('../acc-authority/effective-runtime-permissions.util');
const { getAccFeatureFlagStatus } = require('../acc-runtime/featureFlags');
const { getFeatureFlagStatus: getShadowFeatureFlagStatus } = require('../engines/shadow-mode.service');
const {
  evaluatePermissionResolution,
} = require('../services/acc-enforcement-pilot.service');
const {
  evaluateWorkflowEnforcement,
  getWorkflowEnforcementStatus,
} = require('../services/workflow-enforcement-pilot.service');
const {
  getPolicyEnforcementStatus,
} = require('../services/policy-enforcement-pilot.service');
const { getSummary: getPolicySummary } = require('../services/acc-advanced-policy.service');
const { TRANSFER_APPROVAL_ROLE_CODES } = require('../services/approvalChain.service');
const {
  getRoleIdByCode,
  resolveUserBestRole,
  membershipRoleCode,
} = require('../services/rbac.service');
const { getAccScopeRuntimeStatus } = require('./acc-scope-runtime.service');
const { AuditAction } = require('../engines/ur-audit.logger');

const LEGACY_BREAKAGE_CHAIN = [
  { stepOrder: 1, roleCode: 'DEPT_MANAGER' },
  { stepOrder: 2, roleCode: 'COST_CONTROL' },
  { stepOrder: 3, roleCode: 'FINANCE_MANAGER' },
  { stepOrder: 4, roleCode: 'GENERAL_MANAGER' },
];

async function _resolveOrgGroupIds(currentTenantId) {
  if (!currentTenantId) return new Set();
  const currentTenant = await prisma.tenant.findUnique({
    where: { id: currentTenantId },
    select: { parentId: true },
  });
  const orgRootId = currentTenant?.parentId ?? currentTenantId;
  const rows = await prisma.tenant.findMany({
    where: { isActive: true, OR: [{ id: orgRootId }, { parentId: orgRootId }] },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

async function _resolveTenantSlug(tenantId, tenantSlug) {
  if (tenantSlug) return String(tenantSlug).trim().toLowerCase();
  if (!tenantId) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  return tenant?.slug ? String(tenant.slug).trim().toLowerCase() : null;
}

async function _getRoleDriftSnapshot(roleCode) {
  const role = await prisma.role.findUnique({
    where: { code: roleCode },
    select: { id: true, code: true, name: true },
  });
  if (!role) {
    return { roleCode, found: false, driftDetected: false };
  }

  const urRows = await prisma.urRolePermission.findMany({
    where: { roleId: role.id },
    select: { permission: { select: { legacyCode: true } } },
  });
  const urLegacyCodes = [...new Set(urRows.map((r) => r.permission.legacyCode))].sort();

  const legacyRows = await prisma.rolePermission.findMany({
    where: { roleId: role.id },
    select: { permission: { select: { code: true } } },
  });
  const legacyPermissionCodes = [...new Set(legacyRows.map((r) => r.permission.code))].sort();
  const effectiveRuntimeCodes = computeEffectiveRuntimePermissionCodes(role.code, urLegacyCodes, legacyPermissionCodes);

  const urSet = new Set(urLegacyCodes);
  const legacySet = new Set(legacyPermissionCodes);
  const inUrNotInLegacy = urLegacyCodes.filter((c) => !legacySet.has(c));
  const inLegacyNotInUr = legacyPermissionCodes.filter((c) => !urSet.has(c));

  return {
    roleCode: role.code,
    roleName: role.name,
    found: true,
    protected: true,
    urPermissionCount: urLegacyCodes.length,
    legacyPermissionCount: legacyPermissionCodes.length,
    effectiveRuntimeCount: effectiveRuntimeCodes.length,
    driftDetected: inUrNotInLegacy.length > 0 || inLegacyNotInUr.length > 0,
    drift: {
      inUrNotInLegacy,
      inLegacyNotInUr,
      addedByMatrixUnion: [],
    },
  };
}

async function _getAssignmentDiagnostics(tenantId) {
  const orgGroupIds = await _resolveOrgGroupIds(tenantId);
  const orgGroupArr = [...orgGroupIds];

  if (orgGroupArr.length === 0) {
    return {
      activeAssignments: 0,
      inactiveAssignments: 0,
      membersWithoutAssignment: 0,
      samples: [],
    };
  }

  const orgScope = {
    OR: [
      { properties: { none: {} } },
      { properties: { some: { propertyId: { in: orgGroupArr } } } },
    ],
  };

  const [activeAssignments, inactiveAssignments, members] = await Promise.all([
    prisma.urUserAssignment.count({ where: { isActive: true, ...orgScope } }),
    prisma.urUserAssignment.count({ where: { isActive: false, ...orgScope } }),
    prisma.tenantMember.findMany({
      where: { tenantId: { in: orgGroupArr }, isActive: true },
      select: {
        userId: true,
        tenantId: true,
        user: { select: { email: true, firstName: true, lastName: true } },
        role: { select: { code: true } },
      },
    }),
  ]);

  const activeAssignmentUserIds = new Set(
    (
      await prisma.urUserAssignment.findMany({
        where: { isActive: true, ...orgScope },
        select: { userId: true },
      })
    ).map((row) => row.userId),
  );

  const membersWithoutAssignment = members.filter((m) => !activeAssignmentUserIds.has(m.userId));

  return {
    activeAssignments,
    inactiveAssignments,
    membersWithoutAssignment: membersWithoutAssignment.length,
    samples: membersWithoutAssignment.slice(0, 5).map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      membershipRole: m.role?.code ?? null,
      tenantId: m.tenantId,
    })),
  };
}

async function _getShadowStats() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [permissionMismatches, workflowMismatches] = await Promise.all([
    prisma.urAuditEvent.count({
      where: { action: AuditAction.SHADOW_MISMATCH, createdAt: { gte: since } },
    }),
    prisma.urAuditEvent.count({
      where: { action: AuditAction.WORKFLOW_SHADOW_MISMATCH, createdAt: { gte: since } },
    }),
  ]);

  return {
    windowDays: 7,
    permissionShadowMismatches: permissionMismatches,
    workflowShadowMismatches: workflowMismatches,
    totalMismatches: permissionMismatches + workflowMismatches,
  };
}

function _deriveOverallStatus(findings) {
  const actionable = findings.some((f) => f.severity === 'actionable');
  return {
    status: actionable ? 'actionable' : 'healthy',
    findingCount: findings.length,
    actionableCount: findings.filter((f) => f.severity === 'actionable').length,
  };
}

async function getAccSystemDiagnostics({ userId, tenantId, tenantSlug = null }) {
  const resolvedSlug = await _resolveTenantSlug(tenantId, tenantSlug);
  const findings = [];

  const featureFlags = {
    ...getAccFeatureFlagStatus(),
    ...getShadowFeatureFlagStatus(),
  };

  let permission = null;
  if (userId && tenantId) {
    const membership = await prisma.tenantMember.findFirst({
      where: { userId, tenantId, isActive: true },
      include: { role: true, tenant: { select: { id: true, slug: true } } },
    });

    if (membership) {
      const rc = membershipRoleCode(membership);
      const bestRole = await resolveUserBestRole(userId, rc);
      let roleId = membership.roleId ?? membership.role?.id;
      if (bestRole) {
        const bestRoleId = await getRoleIdByCode(bestRole);
        if (bestRoleId) roleId = bestRoleId;
      }

      permission = await evaluatePermissionResolution({
        userId,
        membership,
        roleId,
        roleCode: bestRole,
        tenantId,
        tenantSlug: resolvedSlug ?? membership.tenant?.slug,
      });

      if (permission.drift || permission.source === 'legacy-drift-fallback') {
        findings.push({
          id: 'permission-drift',
          severity: 'actionable',
          message: 'Session permission resolution drift detected; legacy fallback applied.',
          detail: {
            source: permission.source,
            legacyCount: permission.legacyCount,
            enforcedCount: permission.enforcedCount,
          },
        });
      }
    }
  }

  const legacyTransferSteps = TRANSFER_APPROVAL_ROLE_CODES.map((roleCode, index) => ({
    stepOrder: index + 1,
    roleCode,
  }));

  const [transferWorkflow, breakageWorkflow, policyStatus, policySummary, assignments, shadow] =
    await Promise.all([
      evaluateWorkflowEnforcement({
        moduleKey: 'TRANSFER',
        tenantId,
        tenantSlug: resolvedSlug,
        legacySteps: legacyTransferSteps,
      }),
      evaluateWorkflowEnforcement({
        moduleKey: 'BREAKAGE',
        tenantId,
        tenantSlug: resolvedSlug,
        legacySteps: LEGACY_BREAKAGE_CHAIN,
      }),
      Promise.resolve(getPolicyEnforcementStatus({ tenantId, tenantSlug: resolvedSlug })),
      getPolicySummary(),
      _getAssignmentDiagnostics(tenantId),
      _getShadowStats(),
    ]);

  if (transferWorkflow.drift || transferWorkflow.source === 'legacy-drift-fallback') {
    findings.push({
      id: 'workflow-transfer-drift',
      severity: 'actionable',
      message: 'TRANSFER workflow drift detected; legacy chain preserved.',
      detail: { source: transferWorkflow.source, enforcedCount: transferWorkflow.enforcedCount },
    });
  }

  if (breakageWorkflow.drift || breakageWorkflow.source === 'legacy-drift-fallback') {
    findings.push({
      id: 'workflow-breakage-drift',
      severity: 'actionable',
      message: 'BREAKAGE workflow drift detected; legacy chain preserved.',
      detail: { source: breakageWorkflow.source, enforcedCount: breakageWorkflow.enforcedCount },
    });
  }

  if (assignments.inactiveAssignments > 0) {
    findings.push({
      id: 'inactive-assignments',
      severity: 'actionable',
      message: `${assignments.inactiveAssignments} inactive ACC assignment(s) in org scope.`,
      detail: { count: assignments.inactiveAssignments },
    });
  }

  if (assignments.membersWithoutAssignment > 0) {
    findings.push({
      id: 'members-without-assignment',
      severity: 'actionable',
      message: `${assignments.membersWithoutAssignment} active member(s) without ACC assignment.`,
      detail: { count: assignments.membersWithoutAssignment, samples: assignments.samples },
    });
  }

  if (shadow.totalMismatches > 0) {
    findings.push({
      id: 'shadow-mismatches',
      severity: 'actionable',
      message: `${shadow.totalMismatches} shadow mismatch event(s) in the last ${shadow.windowDays} days.`,
      detail: shadow,
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: 'aligned',
      severity: 'healthy',
      message: 'ACC runtime complete (P18): all cutover modules bound to published workflows.',
      detail: null,
    });
  }

  const overall = _deriveOverallStatus(findings);

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    tenantSlug: resolvedSlug,
    overall,
    featureFlags,
    permission,
    workflows: {
      enforcement: getWorkflowEnforcementStatus({ tenantId, tenantSlug: resolvedSlug }),
      transfer: transferWorkflow,
      breakage: breakageWorkflow,
    },
    policies: {
      enforcement: policyStatus,
      summary: policySummary,
    },
    scope: getAccScopeRuntimeStatus(),
    assignments,
    shadow,
    findings,
    rollback: {
      disableHardCutover: 'ACC_HARD_CUTOVER=false',
      disablePermissions: 'ACC_ENFORCE_PERMISSIONS=false',
      disableWorkflows: 'ACC_ENFORCE_WORKFLOWS=false',
      disablePolicies: 'ACC_ENFORCE_ADVANCED_POLICIES=false',
    },
  };
}

async function getProtectedRolesPolicyReadOnly() {
  const roles = await Promise.all(
    PROTECTED_ROLE_CODES.map((roleCode) => _getRoleDriftSnapshot(roleCode)),
  );

  return {
    readOnly: true,
    message: 'System-protected roles cannot be modified via User Rights UI.',
    roles,
  };
}

module.exports = {
  getAccSystemDiagnostics,
  getProtectedRolesPolicyReadOnly,
};
