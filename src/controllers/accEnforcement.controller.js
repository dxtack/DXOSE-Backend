'use strict';

const {
  getPermissionEnforcementStatus,
  evaluatePermissionResolution,
} = require('../services/acc-enforcement-pilot.service');
const {
  getWorkflowEnforcementStatus,
  evaluateWorkflowEnforcement,
} = require('../services/workflow-enforcement-pilot.service');
const {
  getPolicyEnforcementStatus,
  resolveAdvancedPolicyEvaluation,
} = require('../services/policy-enforcement-pilot.service');
const {
  getAssignmentCoverageReport,
  getSessionLinkageAnalysis,
} = require('../services/acc-p2-assignment-coverage.service');
const { getAuthorizeRoleInventory } = require('../services/acc-p2-route-migration.service');
const { getP2EnforcementAlignmentStatus } = require('../services/acc-p2-enforcement-status.service');
const { TRANSFER_APPROVAL_ROLE_CODES } = require('../services/approvalChain.service');
const {
  getRoleIdByCode,
  resolveUserBestRole,
  membershipRoleCode,
} = require('../services/rbac.service');
const prisma = require('../config/database');

async function getStatus(req, res) {
  const tenantId = req.user?.tenantId ?? null;
  let tenantSlug = req.user?.tenantSlug ?? null;

  if (tenantId && !tenantSlug) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    tenantSlug = tenant?.slug ?? null;
  }

  return res.json({
    success: true,
    data: getPermissionEnforcementStatus({ tenantId, tenantSlug }),
  });
}

async function getSessionEvaluation(req, res) {
  const userId = req.user?.id;
  const tenantId = req.user?.tenantId;
  if (!userId || !tenantId) {
    return res.status(400).json({ success: false, message: 'Tenant session required.' });
  }

  const membership = await prisma.tenantMember.findFirst({
    where: { userId, tenantId, isActive: true },
    include: { role: true, tenant: { select: { id: true, slug: true } } },
  });
  if (!membership) {
    return res.status(404).json({ success: false, message: 'Active membership not found.' });
  }

  const rc = membershipRoleCode(membership);
  const bestRole = await resolveUserBestRole(userId, rc);
  let roleId = membership.roleId ?? membership.role?.id;
  if (bestRole) {
    const bestRoleId = await getRoleIdByCode(bestRole);
    if (bestRoleId) roleId = bestRoleId;
  }

  const evaluation = await evaluatePermissionResolution({
    userId,
    membership,
    roleId,
    roleCode: bestRole,
    tenantId,
    tenantSlug: membership.tenant?.slug,
  });

  return res.json({
    success: true,
    data: {
      ...evaluation,
      jwtPermissionCount: Array.isArray(req.user?.permissions) ? req.user.permissions.length : null,
    },
  });
}

const LEGACY_BREAKAGE_CHAIN = [
  { stepOrder: 1, roleCode: 'DEPT_MANAGER' },
  { stepOrder: 2, roleCode: 'COST_CONTROL' },
  { stepOrder: 3, roleCode: 'FINANCE_MANAGER' },
  { stepOrder: 4, roleCode: 'GENERAL_MANAGER' },
];

async function _tenantSlugForRequest(req) {
  const tenantId = req.user?.tenantId ?? null;
  let tenantSlug = req.user?.tenantSlug ?? null;
  if (tenantId && !tenantSlug) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    tenantSlug = tenant?.slug ?? null;
  }
  return { tenantId, tenantSlug };
}

async function getWorkflowStatus(req, res) {
  const { tenantId, tenantSlug } = await _tenantSlugForRequest(req);
  return res.json({
    success: true,
    data: getWorkflowEnforcementStatus({ tenantId, tenantSlug }),
  });
}

async function getWorkflowEvaluation(req, res) {
  const { tenantId, tenantSlug } = await _tenantSlugForRequest(req);
  const moduleKey = String(req.query.moduleKey || 'TRANSFER').trim().toUpperCase();

  const evaluation = await evaluateWorkflowEnforcement({ moduleKey, tenantId, tenantSlug });

  return res.json({
    success: true,
    data: {
      moduleKey,
      ...evaluation,
    },
  });
}

async function getPolicyStatus(req, res) {
  const { tenantId, tenantSlug } = await _tenantSlugForRequest(req);
  return res.json({
    success: true,
    data: getPolicyEnforcementStatus({ tenantId, tenantSlug }),
  });
}

async function getPolicyEvaluation(req, res) {
  const userId = req.user?.id;
  const { tenantId, tenantSlug } = await _tenantSlugForRequest(req);
  if (!userId || !tenantId) {
    return res.status(400).json({ success: false, message: 'Tenant session required.' });
  }

  const membership = await prisma.tenantMember.findFirst({
    where: { userId, tenantId, isActive: true },
    include: { role: true, tenant: { select: { id: true, slug: true } } },
  });
  if (!membership) {
    return res.status(404).json({ success: false, message: 'Active membership not found.' });
  }

  const resourceCode = req.query.resourceCode ? String(req.query.resourceCode).trim().toUpperCase() : 'BREAKAGE';
  const fieldKey = req.query.fieldKey ? String(req.query.fieldKey).trim() : 'unitCost';

  const evaluation = await resolveAdvancedPolicyEvaluation({
    userId,
    tenantId,
    tenantSlug: tenantSlug ?? membership.tenant?.slug,
    roleId: membership.roleId ?? membership.role?.id,
    resourceCode,
    fieldKey,
  });

  return res.json({
    success: true,
    data: evaluation,
  });
}

async function getP2Status(req, res) {
  const { tenantId, tenantSlug } = await _tenantSlugForRequest(req);
  const coverage = await getAssignmentCoverageReport({ tenantId });
  return res.json({
    success: true,
    data: {
      ...getP2EnforcementAlignmentStatus({ tenantId, tenantSlug }),
      assignmentCoverage: coverage.summary,
    },
  });
}

async function getAssignmentCoverage(req, res) {
  const tenantId = req.query.tenantId || req.user?.tenantId || null;
  const data = await getAssignmentCoverageReport({ tenantId });
  return res.json({ success: true, data });
}

async function getLinkageAnalysis(req, res) {
  const userId = req.query.userId || req.user?.id;
  const tenantId = req.user?.tenantId;
  if (!userId || !tenantId) {
    return res.status(400).json({ success: false, message: 'userId and tenant session required.' });
  }
  const data = await getSessionLinkageAnalysis(userId, tenantId);
  return res.json({ success: true, data });
}

async function getRouteMigrationInventory(req, res) {
  return res.json({ success: true, data: getAuthorizeRoleInventory() });
}

module.exports = {
  getStatus,
  getSessionEvaluation,
  getWorkflowStatus,
  getWorkflowEvaluation,
  getPolicyStatus,
  getPolicyEvaluation,
  getP2Status,
  getAssignmentCoverage,
  getLinkageAnalysis,
  getRouteMigrationInventory,
};
