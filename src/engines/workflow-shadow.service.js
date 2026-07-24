'use strict';

/**
 * ACC Workflow Shadow Service — Stage S11.
 * Compares legacy workflow templates with ACC published chains.
 * Fire-and-forget only — never changes production approval behavior.
 */

const { PrismaClient } = require('@prisma/client');
const { normalizeRole } = require('../services/rbac.service');
const { resolvePublishedWorkflowChain } = require('./workflow-resolution.engine');
const { AuditAction } = require('./ur-audit.logger');
const { isAccWorkflowShadowEnabled } = require('../acc-runtime/featureFlags');

const prisma = new PrismaClient();

const _roleCodesFromLegacySteps = (legacySteps) =>
  (legacySteps || [])
    .map((s) => normalizeRole(s.roleCode ?? s.role))
    .filter(Boolean);

const _roleCodesFromAccSteps = (accSteps) =>
  (accSteps || [])
    .map((s) => normalizeRole(s.roleCode))
    .filter(Boolean);

/**
 * Compare legacy template chain vs ACC published chain.
 * @returns {{ mismatch: boolean, mismatchType?: string, details?: object }}
 */
function compareWorkflowChains(legacySteps, accResolution) {
  const legacyRoles = _roleCodesFromLegacySteps(legacySteps);

  if (!accResolution) {
    return {
      mismatch: true,
      mismatchType: 'NO_PUBLISHED_WORKFLOW',
      details: { legacyRoles, accRoles: [] },
    };
  }

  const accRoles = _roleCodesFromAccSteps(accResolution.steps);

  if (legacyRoles.length !== accRoles.length) {
    return {
      mismatch: true,
      mismatchType: 'STEP_COUNT_MISMATCH',
      details: { legacyRoles, accRoles, legacyCount: legacyRoles.length, accCount: accRoles.length },
    };
  }

  for (let i = 0; i < legacyRoles.length; i += 1) {
    if (legacyRoles[i] !== accRoles[i]) {
      return {
        mismatch: true,
        mismatchType: 'ROLE_MISMATCH_AT_STEP',
        details: {
          stepOrder: i + 1,
          legacyRole: legacyRoles[i],
          accRole: accRoles[i],
          legacyRoles,
          accRoles,
        },
      };
    }
  }

  return { mismatch: false, details: { legacyRoles, accRoles } };
}

function _buildContext({ moduleKey, tenantId, legacySteps, accResolution, compareResult, context }) {
  return {
    mismatchType: compareResult.mismatchType ?? null,
    moduleKey,
    tenantId: tenantId ?? null,
    legacyRoles: _roleCodesFromLegacySteps(legacySteps),
    accRoles: accResolution?.roleCodes ?? [],
    accVersionId: accResolution?.versionId ?? null,
    accVersionNumber: accResolution?.versionNumber ?? null,
    definitionKey: accResolution?.definitionKey ?? null,
    source: context?.source ?? null,
    requestType: context?.requestType ?? null,
    documentId: context?.documentId ?? null,
    transferId: context?.transferId ?? null,
    timestamp: new Date().toISOString(),
    ...(compareResult.details ?? {}),
  };
}

async function _persistMismatch(actorId, payload) {
  if (!actorId) return;
  try {
    await prisma.urAuditEvent.create({
      data: {
        actorId: actorId ?? null,
        action: AuditAction.WORKFLOW_SHADOW_MISMATCH,
        targetEntityId: payload.accVersionId ?? payload.documentId ?? payload.transferId ?? null,
        entityType: 'AccWorkflowShadow',
        newValue: payload,
      },
    });
  } catch (err) {
    process.stderr.write(
      `[ACC_WORKFLOW_SHADOW_ERROR] audit write failed: ${err?.message ?? err}\n`,
    );
  }
}

/**
 * Run ACC vs legacy workflow comparison (awaitable — for tests/scripts).
 */
async function evaluateWorkflowShadow({ moduleKey, tenantId, legacySteps, context = {}, actorId = null }) {
  if (!isAccWorkflowShadowEnabled()) {
    return { skipped: true, reason: 'shadow_disabled' };
  }

  const accResolution = await resolvePublishedWorkflowChain(moduleKey, tenantId);
  const compareResult = compareWorkflowChains(legacySteps, accResolution);

  if (!compareResult.mismatch) {
    return { skipped: false, mismatch: false, accResolution, compareResult };
  }

  const payload = _buildContext({
    moduleKey,
    tenantId,
    legacySteps,
    accResolution,
    compareResult,
    context,
  });

  process.stderr.write(`[ACC_WORKFLOW_SHADOW_MISMATCH] ${JSON.stringify(payload)}\n`);
  await _persistMismatch(actorId, payload);

  return { skipped: false, mismatch: true, accResolution, compareResult, payload };
}

/**
 * Schedule shadow comparison without blocking caller (production hook).
 */
function scheduleWorkflowShadowCompare(params) {
  if (!isAccWorkflowShadowEnabled()) return;

  setImmediate(() => {
    evaluateWorkflowShadow(params).catch((err) => {
      process.stderr.write(
        `[ACC_WORKFLOW_SHADOW_ERROR] ${err?.message ?? err} | module=${params?.moduleKey}\n`,
      );
    });
  });
}

/** @deprecated S17 — prefer accRuntime.isAccWorkflowShadowEnabled() */
function getWorkflowShadowFlagStatus() {
  return {
    accWorkflowShadow: isAccWorkflowShadowEnabled(),
  };
}

module.exports = {
  compareWorkflowChains,
  evaluateWorkflowShadow,
  scheduleWorkflowShadowCompare,
  getWorkflowShadowFlagStatus,
};
