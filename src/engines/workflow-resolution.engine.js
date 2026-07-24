'use strict';

/**
 * ACC Workflow Resolution Engine — ZERO LEGACY (published versions only).
 */

const prisma = require('../config/database');
const { normalizeRole } = require('../services/rbac.service');
const { formatAccStep } = require('../services/acc-workflow-step-resolver.service');

const REQUEST_TYPE_TO_MODULE_KEY = Object.freeze({
  BREAKAGE: 'BREAKAGE',
  LOST: 'BREAKAGE',
  /** Get Pass return dispositions use the same published BREAKAGE chain (not GET_PASS/Security). */
  GET_PASS_RETURN: 'BREAKAGE',
  STORE_TRANSFER: 'TRANSFER',
  COUNT_ADJUSTMENT: 'STOCK_COUNT',
  GRN_IMPORT: 'GRN',
  STOCK_REPORT: 'STOCK_REPORT',
});

const _stepInclude = {
  approverRole: { select: { code: true } },
  permission: { select: { legacyCode: true, name: true } },
};

async function _findPublishedVersion(moduleKey, tenantId) {
  const module = await prisma.accModule.findUnique({
    where: { key: moduleKey },
    select: { id: true, key: true },
  });
  if (!module) return null;

  const versionInclude = {
    steps: { orderBy: { stepOrder: 'asc' }, include: _stepInclude },
    definition: { select: { id: true, key: true, tenantId: true } },
  };

  const findLatestPublished = (scopeTenantId) =>
    prisma.accWorkflowVersion.findFirst({
      where: {
        status: 'PUBLISHED',
        definition: { moduleId: module.id, isActive: true, tenantId: scopeTenantId },
      },
      orderBy: [{ publishedAt: 'desc' }, { versionNumber: 'desc' }],
      include: versionInclude,
    });

  if (tenantId) {
    const tenantVersion = await findLatestPublished(tenantId);
    if (tenantVersion) {
      return { module, definition: tenantVersion.definition, version: tenantVersion };
    }
  }

  const globalVersion = await findLatestPublished(null);
  if (!globalVersion) return null;
  return { module, definition: globalVersion.definition, version: globalVersion };
}

async function resolvePublishedWorkflowChain(moduleKey, tenantId = null) {
  const resolved = await _findPublishedVersion(moduleKey, tenantId);
  if (!resolved) return null;

  const { module, definition, version } = resolved;
  const steps = version.steps.map((s) => formatAccStep(s));

  return {
    moduleKey: module.key,
    moduleId: module.id,
    definitionId: definition.id,
    definitionKey: definition.key,
    tenantId: definition.tenantId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    steps,
    roleCodes: steps.map((s) => s.roleCode).filter(Boolean),
  };
}

function moduleKeyForRequestType(requestType) {
  return REQUEST_TYPE_TO_MODULE_KEY[String(requestType || '').trim()] ?? null;
}

module.exports = {
  resolvePublishedWorkflowChain,
  moduleKeyForRequestType,
  REQUEST_TYPE_TO_MODULE_KEY,
};
