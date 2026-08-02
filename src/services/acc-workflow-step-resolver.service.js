'use strict';

/**
 * P20 — Resolve workflow step role + permission from ACC step definitions.
 * Runtime permission comes from AccWorkflowStepDefinition.permissionId
 * (UrPermission.legacyCode) or capabilityCode — not from static status maps.
 */

const prisma = require('../config/database');
const { normalizeRole } = require('./rbac.service');

const _stepInclude = {
  approverRole: { select: { id: true, code: true, name: true } },
  permission: { select: { id: true, legacyCode: true, name: true } },
};

function formatAccStep(step) {
  if (!step) return null;
  const roleCode = step.approverRole?.code ? normalizeRole(step.approverRole.code) : null;
  const fromPermissionId = step.permission?.legacyCode
    ? String(step.permission.legacyCode).trim().toUpperCase()
    : null;
  const fromCapability = step.capabilityCode
    ? String(step.capabilityCode).trim().toUpperCase()
    : null;
  // Prefer catalog permissionId; capabilityCode is the Builder free-text fallback.
  const permissionCode = fromPermissionId || fromCapability || null;
  return {
    stepOrder: step.stepOrder,
    label: step.label,
    roleCode,
    approverRoleId: step.approverRoleId,
    permissionId: step.permissionId,
    permissionCode,
    statusKey: step.statusKey ? String(step.statusKey).trim().toUpperCase() : null,
    capabilityCode: step.capabilityCode,
    autoApprove: step.autoApprove,
  };
}

function resolveStepRoleCode(step) {
  const formatted = formatAccStep(step);
  return formatted?.roleCode ?? null;
}

/**
 * Strict ACC permission for a step row.
 * Returns permissionCode from permissionId / capabilityCode only — never a status map.
 */
function resolveStepPermissionCode(step) {
  const formatted = formatAccStep(step);
  return formatted?.permissionCode ?? null;
}

async function loadWorkflowVersionSteps(versionId) {
  if (!versionId) return [];
  const steps = await prisma.accWorkflowStepDefinition.findMany({
    where: { versionId },
    orderBy: { stepOrder: 'asc' },
    include: _stepInclude,
  });
  return steps.map(formatAccStep);
}

async function loadWorkflowVersionChain(versionId) {
  if (!versionId) return null;
  const version = await prisma.accWorkflowVersion.findUnique({
    where: { id: versionId },
    include: {
      definition: { include: { module: { select: { key: true } } } },
      steps: { orderBy: { stepOrder: 'asc' }, include: _stepInclude },
    },
  });
  if (!version) return null;
  const steps = version.steps.map(formatAccStep);
  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    moduleKey: version.definition?.module?.key ?? null,
    steps,
    roleCodes: steps.map((s) => s.roleCode).filter(Boolean),
  };
}

async function resolveStepByOrder(versionId, stepOrder) {
  const chain = await loadWorkflowVersionChain(versionId);
  if (!chain) return null;
  return chain.steps.find((s) => s.stepOrder === stepOrder) ?? null;
}

async function resolveStepByStatusKey(versionId, statusKey) {
  const chain = await loadWorkflowVersionChain(versionId);
  if (!chain) return null;
  const key = String(statusKey || '').trim().toUpperCase();
  return chain.steps.find((s) => s.statusKey === key) ?? null;
}

module.exports = {
  formatAccStep,
  resolveStepRoleCode,
  resolveStepPermissionCode,
  loadWorkflowVersionSteps,
  loadWorkflowVersionChain,
  resolveStepByOrder,
  resolveStepByStatusKey,
};
