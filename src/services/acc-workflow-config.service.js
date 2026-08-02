'use strict';

/**
 * ACC Workflow Builder — configuration API.
 * Reads/writes acc_* tables. Published versions are consumed at runtime by
 * acc-workflow-runtime / workflow-resolution.engine for operational modules.
 */

const prisma = require('../config/database');
const {
  AuditAction,
  logWorkflowVersionEvent,
  logWorkflowDefinitionEvent,
} = require('../engines/ur-audit.logger');
const { validateWorkflowChainSteps } = require('./acc-workflow-status-key-guard.service');
const { statusKeyFromRoleCode } = require('./acc-workflow-status-key.service');
const { defaultStepsForModule } = require('./acc-workflow-default-chains');
const { GRN_CREATE_ACTOR_ROLES } = require('./grnWorkflowContext.util');

/** Stable key for the auto-created canonical definition per module. */
const SYSTEM_DEFAULT_DEFINITION_KEY = 'system-default';

/**
 * Module → CREATE permission legacy codes (UR catalog).
 * Used to resolve which roles can initiate when allowedCreatorRoleIds is empty.
 * GRN uses explicit actor role codes (no GRN_CREATE permission).
 */
const MODULE_CREATE_PERMISSION_CODES = Object.freeze({
  BREAKAGE: ['BREAKAGE_CREATE', 'LOST_CREATE'],
  TRANSFER: ['TRANSFER_CREATE'],
  GET_PASS: ['GET_PASS_CREATE'],
  STOCK_COUNT: ['STOCK_COUNT_CREATE'],
  STOCK_REPORT: ['STOCK_REPORT_SUBMIT'],
});

/** GRN (and similar) modules that gate create by role code rather than UR permission. */
const MODULE_CREATE_ROLE_CODES = Object.freeze({
  GRN: [...GRN_CREATE_ACTOR_ROLES],
});

class ConfigError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const DEFAULT_MODULES = [
  { key: 'BREAKAGE', name: 'Breakage / Lost', description: 'Breakage and Lost item approval workflows', displayOrder: 10 },
  { key: 'TRANSFER', name: 'Store Transfer', description: 'Inter-store transfer approvals', displayOrder: 20 },
  { key: 'GRN', name: 'GRN', description: 'Goods receipt note workflows', displayOrder: 30 },
  { key: 'GET_PASS', name: 'Get Pass', description: 'Material exit pass workflows', displayOrder: 40 },
  { key: 'STOCK_COUNT', name: 'Stock Count', description: 'Physical count approval workflows', displayOrder: 50 },
  { key: 'STOCK_REPORT', name: 'Stock Report', description: 'Stock report approval workflows', displayOrder: 60 },
];

const _stepInclude = {
  approverRole: { select: { id: true, code: true, name: true } },
  permission: { select: { id: true, legacyCode: true, name: true } },
};

const _formatStep = (step) => ({
  id: step.id,
  stepOrder: step.stepOrder,
  label: step.label,
  approverRoleId: step.approverRoleId,
  approverRoleCode: step.approverRole?.code ?? null,
  approverRoleName: step.approverRole?.name ?? null,
  permissionId: step.permissionId ?? null,
  permissionCode: step.permission?.legacyCode ?? null,
  statusKey: step.statusKey ?? null,
  capabilityCode: step.capabilityCode,
  autoApprove: step.autoApprove,
});

const _normalizeCreatorRoleIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
};

const _formatRoleRef = (role) => ({
  id: role.id,
  code: role.code,
  name: role.name,
});

const _resolveRolesByIds = async (roleIds) => {
  const ids = _normalizeCreatorRoleIds(roleIds);
  if (!ids.length) return [];
  const rows = await prisma.role.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, name: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean).map(_formatRoleRef);
};

/**
 * Roles that currently hold module CREATE / initiate permission
 * (independent of the workflow allow-list). Used for Start Node display
 * when allowedCreatorRoleIds is empty.
 */
const _resolveModuleCreateRoles = async (moduleKey) => {
  const key = String(moduleKey || '').trim().toUpperCase();
  if (!key) return [];

  const roleCodes = MODULE_CREATE_ROLE_CODES[key];
  if (roleCodes?.length) {
    const rows = await prisma.role.findMany({
      where: { code: { in: roleCodes }, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(_formatRoleRef);
  }

  const permissionCodes = MODULE_CREATE_PERMISSION_CODES[key];
  if (!permissionCodes?.length) return [];

  const rows = await prisma.urRolePermission.findMany({
    where: {
      permission: { legacyCode: { in: permissionCodes } },
      role: { isActive: true },
    },
    select: {
      role: { select: { id: true, code: true, name: true } },
    },
  });

  const byId = new Map();
  for (const row of rows) {
    if (row.role?.id && !byId.has(row.role.id)) {
      byId.set(row.role.id, _formatRoleRef(row.role));
    }
  }
  return [...byId.values()].sort((a, b) =>
    String(a.name || a.code).localeCompare(String(b.name || b.code)),
  );
};

const _assertCreatorRoleIdsExist = async (roleIds) => {
  const ids = _normalizeCreatorRoleIds(roleIds);
  if (!ids.length) return ids;
  const found = await prisma.role.count({ where: { id: { in: ids } } });
  if (found !== ids.length) {
    throw new ConfigError('One or more initiator roles were not found.');
  }
  return ids;
};

const _formatVersion = (
  version,
  { includeSteps = false, allowedCreatorRoles = null, moduleCreateRoles = null } = {},
) => ({
  id: version.id,
  definitionId: version.definitionId,
  versionNumber: version.versionNumber,
  status: version.status,
  publishedAt: version.publishedAt,
  publishedById: version.publishedById,
  notes: version.notes,
  allowedCreatorRoleIds: _normalizeCreatorRoleIds(version.allowedCreatorRoleIds),
  createdAt: version.createdAt,
  updatedAt: version.updatedAt,
  stepCount: version._count?.steps ?? version.steps?.length ?? 0,
  ...(allowedCreatorRoles != null ? { allowedCreatorRoles } : {}),
  ...(moduleCreateRoles != null ? { moduleCreateRoles } : {}),
  ...(includeSteps ? { steps: (version.steps || []).map(_formatStep) } : {}),
});

/** Enrich a version row (with optional definition.module) for API responses. */
const _enrichAndFormatVersion = async (version, { includeSteps = false } = {}) => {
  const ids = _normalizeCreatorRoleIds(version.allowedCreatorRoleIds);
  const moduleKey = version.definition?.module?.key ?? null;
  const [allowedCreatorRoles, moduleCreateRoles] = await Promise.all([
    includeSteps || ids.length > 0 ? _resolveRolesByIds(ids) : Promise.resolve([]),
    includeSteps ? _resolveModuleCreateRoles(moduleKey) : Promise.resolve(null),
  ]);
  return _formatVersion(version, {
    includeSteps,
    allowedCreatorRoles: includeSteps || ids.length > 0 ? allowedCreatorRoles : undefined,
    moduleCreateRoles: includeSteps ? (moduleCreateRoles ?? []) : undefined,
  });
};

const _auditVersion = async (actorId, action, payload) => {
  if (!actorId) return;
  try {
    await logWorkflowVersionEvent(actorId, action, payload);
  } catch (err) {
    console.error('[acc-workflow-config] audit log failed:', err?.message ?? err);
  }
};

const _auditDefinition = async (actorId, action, payload) => {
  if (!actorId) return;
  try {
    await logWorkflowDefinitionEvent(actorId, action, payload);
  } catch (err) {
    console.error('[acc-workflow-config] definition audit log failed:', err?.message ?? err);
  }
};

const _versionAuditPayload = (version, extra = {}) => ({
  versionId: version.id,
  definitionId: version.definitionId,
  versionNumber: version.versionNumber,
  status: version.status,
  ...extra,
});

const _assertDraftDeletable = (version) => {
  if (version.status !== 'DRAFT') {
    throw new ConfigError(
      'Only DRAFT versions can be deleted. Published versions must be archived.',
      403,
    );
  }
};

const _formatDefinition = (definition) => {
  const published = definition.versions?.[0] ?? null;
  return {
    id: definition.id,
    moduleId: definition.moduleId,
    key: definition.key,
    name: definition.name,
    description: definition.description,
    tenantId: definition.tenantId,
    isActive: definition.isActive,
    isDefault: !!definition.isDefault,
    publishedVersionId: published?.id ?? null,
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
    versionCount: definition._count?.versions ?? 0,
    publishedVersion: published ? _formatVersion(published) : null,
  };
};

const _definitionInclude = {
  _count: { select: { versions: true } },
  versions: {
    where: { status: 'PUBLISHED' },
    orderBy: [{ versionNumber: 'desc' }],
    take: 1,
    include: { _count: { select: { steps: true } } },
  },
};

/** Clear other defaults in the module, then mark this definition as default. */
const _setDefaultInTx = async (tx, { moduleId, definitionId }) => {
  await tx.accWorkflowDefinition.updateMany({
    where: { moduleId, isDefault: true, id: { not: definitionId } },
    data: { isDefault: false },
  });
  await tx.accWorkflowDefinition.update({
    where: { id: definitionId },
    data: { isDefault: true },
  });
};

const _findModuleDefaultDefinition = async (moduleId) => {
  const preferred = await prisma.accWorkflowDefinition.findFirst({
    where: { moduleId, isActive: true, isDefault: true },
    include: {
      versions: {
        where: { status: 'PUBLISHED' },
        orderBy: [{ versionNumber: 'desc' }],
        take: 1,
        include: { steps: { orderBy: [{ stepOrder: 'asc' }] } },
      },
    },
  });
  if (preferred) return preferred;

  return prisma.accWorkflowDefinition.findFirst({
    where: {
      moduleId,
      isActive: true,
      versions: { some: { status: 'PUBLISHED' } },
    },
    orderBy: [{ createdAt: 'asc' }],
    include: {
      versions: {
        where: { status: 'PUBLISHED' },
        orderBy: [{ versionNumber: 'desc' }],
        take: 1,
        include: { steps: { orderBy: [{ stepOrder: 'asc' }] } },
      },
    },
  });
};

const _cloneStepsPayload = (steps) =>
  (steps || []).map((step) => ({
    stepOrder: step.stepOrder,
    label: step.label,
    approverRoleId: step.approverRoleId,
    permissionId: step.permissionId,
    statusKey: step.statusKey,
    capabilityCode: step.capabilityCode,
    autoApprove: step.autoApprove,
  }));

/**
 * Resolve module default-chain templates into AccWorkflowStepDefinition create rows
 * (role / permission UUIDs). Used when auto-seeding a published system default.
 */
const _buildDefaultStepCreates = async (moduleKey) => {
  let chain = defaultStepsForModule(moduleKey);
  if (!chain.length) {
    chain = [
      {
        stepOrder: 1,
        roleCode: 'DEPT_MANAGER',
        label: 'Approval',
        statusKey: 'PENDING_APPROVAL',
      },
    ];
  }

  const roleCodes = [...new Set(chain.map((s) => s.roleCode).filter(Boolean))];
  const permissionCodes = [...new Set(chain.map((s) => s.permissionCode).filter(Boolean))];

  const roles = await prisma.role.findMany({
    where: { code: { in: roleCodes } },
    select: { id: true, code: true },
  });
  const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r.id]));
  const missingRoles = roleCodes.filter((code) => !roleByCode[code]);
  if (missingRoles.length) {
    throw new ConfigError(
      `Cannot seed default workflow for ${moduleKey}: missing roles ${missingRoles.join(', ')}.`,
      500,
    );
  }

  let permByCode = {};
  if (permissionCodes.length) {
    const perms = await prisma.urPermission.findMany({
      where: { legacyCode: { in: permissionCodes } },
      select: { id: true, legacyCode: true },
    });
    permByCode = Object.fromEntries(perms.map((p) => [p.legacyCode, p.id]));
  }

  return chain.map((step) => ({
    stepOrder: step.stepOrder,
    label: step.label || null,
    approverRoleId: roleByCode[step.roleCode],
    permissionId: step.permissionCode ? permByCode[step.permissionCode] || null : null,
    statusKey: step.statusKey?.trim?.()?.toUpperCase?.() || step.statusKey || null,
    capabilityCode: step.capabilityCode || null,
    autoApprove: false,
  }));
};

/**
 * When a module has no active definitions, create the system default definition
 * with a published v1 chain so Workflow Builder Column 3 can render immediately.
 * Idempotent under concurrent list calls (re-checks inside the transaction).
 */
const _ensureModuleDefaultDefinition = async (moduleId) => {
  const module = await prisma.accModule.findUnique({
    where: { id: moduleId },
    select: { id: true, key: true, name: true },
  });
  if (!module) throw new ConfigError('Module not found.', 404);

  // Only a system-scoped active definition satisfies the list for all tenants.
  // Tenant-only drafts must not block creating the canonical system default.
  const alreadyHasSystem = await prisma.accWorkflowDefinition.findFirst({
    where: { moduleId, isActive: true, tenantId: null },
    select: { id: true },
  });
  if (alreadyHasSystem) return;

  const stepRows = await _buildDefaultStepCreates(module.key);
  if (!stepRows.length) {
    throw new ConfigError(
      `No default workflow chain configured for module ${module.key}.`,
      500,
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const again = await tx.accWorkflowDefinition.count({
        where: { moduleId, isActive: true, tenantId: null },
      });
      if (again > 0) return;

      const definition = await tx.accWorkflowDefinition.create({
        data: {
          moduleId,
          key: SYSTEM_DEFAULT_DEFINITION_KEY,
          name: `${module.name} — System Default`,
          description: 'Auto-created system default workflow for this module.',
          tenantId: null,
          isActive: true,
          isDefault: true,
        },
      });

      const version = await tx.accWorkflowVersion.create({
        data: {
          definitionId: definition.id,
          versionNumber: 1,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          notes: 'Initial system default (auto-created)',
        },
      });

      await tx.accWorkflowStepDefinition.createMany({
        data: stepRows.map((step) => ({
          versionId: version.id,
          ...step,
        })),
      });
    });
  } catch (err) {
    // Concurrent create of the same key — treat as success and let caller re-query.
    if (err.code === 'P2002') return;
    throw err;
  }
};

const ensureDefaultModules = async () => {
  for (const mod of DEFAULT_MODULES) {
    await prisma.accModule.upsert({
      where: { key: mod.key },
      create: mod,
      update: {
        name: mod.name,
        description: mod.description,
        displayOrder: mod.displayOrder,
        isActive: true,
      },
    });
  }
};

const listModules = async () => {
  await ensureDefaultModules();
  const rows = await prisma.accModule.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { definitions: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    key: m.key,
    name: m.name,
    description: m.description,
    displayOrder: m.displayOrder,
    definitionCount: m._count.definitions,
  }));
};

const createModule = async ({ key, name, description, displayOrder }) => {
  if (!key?.trim() || !name?.trim()) {
    throw new ConfigError('Module key and name are required.');
  }
  const normalizedKey = String(key).trim().toUpperCase().replace(/\s+/g, '_');
  return prisma.accModule.create({
    data: {
      key: normalizedKey,
      name: String(name).trim(),
      description: description?.trim() || null,
      displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
    },
    select: { id: true, key: true, name: true, description: true, displayOrder: true },
  });
};

const listDefinitions = async (moduleId, { tenantId = null, status = 'active' } = {}) => {
  const module = await prisma.accModule.findUnique({ where: { id: moduleId }, select: { id: true } });
  if (!module) throw new ConfigError('Module not found.', 404);

  const isActive = status === 'archived' ? false : true;

  const query = {
    where: {
      moduleId,
      isActive,
      OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: _definitionInclude,
  };

  let rows = await prisma.accWorkflowDefinition.findMany(query);

  // Option A: every module must expose a system default. Seed on first active list.
  if (isActive && rows.length === 0) {
    await _ensureModuleDefaultDefinition(moduleId);
    rows = await prisma.accWorkflowDefinition.findMany(query);
  }

  return rows.map(_formatDefinition);
};

/**
 * Create a definition. When cloneFromDefault=true, seeds a DRAFT version with
 * steps copied from the module's default (or first published) definition.
 */
const createDefinition = async (
  moduleId,
  { key, name, description, tenantId = null, cloneFromDefault = false } = {},
) => {
  if (!key?.trim() || !name?.trim()) {
    throw new ConfigError('Definition key and name are required.');
  }
  const module = await prisma.accModule.findUnique({ where: { id: moduleId }, select: { id: true } });
  if (!module) throw new ConfigError('Module not found.', 404);

  const normalizedKey = String(key).trim().toLowerCase().replace(/\s+/g, '-');
  const existingCount = await prisma.accWorkflowDefinition.count({ where: { moduleId } });
  const makeDefault = existingCount === 0;

  let sourceSteps = [];
  if (cloneFromDefault) {
    const source = await _findModuleDefaultDefinition(moduleId);
    sourceSteps = _cloneStepsPayload(source?.versions?.[0]?.steps);
    if (cloneFromDefault && sourceSteps.length === 0) {
      throw new ConfigError(
        'No default published definition is available to clone steps from.',
        404,
      );
    }
  }

  try {
    const createdId = await prisma.$transaction(async (tx) => {
      const row = await tx.accWorkflowDefinition.create({
        data: {
          moduleId,
          key: normalizedKey,
          name: String(name).trim(),
          description: description?.trim() || null,
          tenantId: tenantId || null,
          isDefault: makeDefault,
        },
      });

      if (sourceSteps.length > 0) {
        const version = await tx.accWorkflowVersion.create({
          data: {
            definitionId: row.id,
            versionNumber: 1,
            status: 'DRAFT',
            notes: 'Cloned steps from module default definition',
          },
        });
        await tx.accWorkflowStepDefinition.createMany({
          data: sourceSteps.map((step) => ({
            versionId: version.id,
            stepOrder: step.stepOrder,
            label: step.label?.trim?.() || step.label || null,
            approverRoleId: step.approverRoleId || null,
            permissionId: step.permissionId || null,
            statusKey: step.statusKey?.trim?.()?.toUpperCase?.() || step.statusKey || null,
            capabilityCode: step.capabilityCode?.trim?.() || step.capabilityCode || null,
            autoApprove: !!step.autoApprove,
          })),
        });
      }

      return row.id;
    });

    const row = await prisma.accWorkflowDefinition.findUnique({
      where: { id: createdId },
      include: _definitionInclude,
    });
    return _formatDefinition(row);
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ConfigError('A definition with this key already exists for the module/tenant scope.');
    }
    throw err;
  }
};

const updateDefinition = async (definitionId, { name, description, isActive, isDefault }) => {
  const existing = await prisma.accWorkflowDefinition.findUnique({ where: { id: definitionId } });
  if (!existing) throw new ConfigError('Definition not found.', 404);

  if (isActive != null) {
    const nextActive = !!isActive;
    if (nextActive === existing.isActive) {
      throw new ConfigError(
        nextActive ? 'Definition is already active.' : 'Definition is already retired.',
      );
    }
  }

  if (isDefault === true && !existing.isActive && isActive !== true) {
    throw new ConfigError('Only active definitions can be set as default.');
  }

  if (isDefault === false && existing.isDefault) {
    throw new ConfigError(
      'Cannot unset default directly. Set another definition as default instead.',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.accWorkflowDefinition.update({
      where: { id: definitionId },
      data: {
        ...(name != null ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(isActive != null ? { isActive: !!isActive } : {}),
        ...(isActive === false ? { isDefault: false } : {}),
      },
    });

    if (isDefault === true) {
      await _setDefaultInTx(tx, {
        moduleId: existing.moduleId,
        definitionId,
      });
    }
  });

  const row = await prisma.accWorkflowDefinition.findUnique({
    where: { id: definitionId },
    include: _definitionInclude,
  });
  return _formatDefinition(row);
};

/**
 * Hard-delete a workflow definition (cascades versions + steps).
 * Allowed when the definition is retired, or has never had a PUBLISHED version.
 * Blocked when any version is pinned by runtime documents.
 */
const deleteDefinition = async (definitionId, actorId = null) => {
  const definition = await prisma.accWorkflowDefinition.findUnique({
    where: { id: definitionId },
    include: {
      versions: {
        include: {
          _count: {
            select: {
              approvalRequests: true,
              getPasses: true,
              grnImports: true,
              storeRequisitions: true,
            },
          },
        },
      },
    },
  });
  if (!definition) throw new ConfigError('Definition not found.', 404);

  const hasPublishedVersion = definition.versions.some((v) => v.status === 'PUBLISHED');
  if (definition.isActive && hasPublishedVersion) {
    throw new ConfigError(
      'Active definitions with a published version cannot be deleted. Archive the definition first.',
      403,
    );
  }

  const pinnedCount = definition.versions.reduce(
    (sum, v) =>
      sum
      + v._count.approvalRequests
      + v._count.getPasses
      + v._count.grnImports
      + v._count.storeRequisitions,
    0,
  );
  if (pinnedCount > 0) {
    throw new ConfigError('Cannot delete a definition referenced by runtime documents.', 403);
  }

  const snapshot = {
    definitionId: definition.id,
    moduleId: definition.moduleId,
    key: definition.key,
    name: definition.name,
    isActive: definition.isActive,
    versionCount: definition.versions.length,
    versionIds: definition.versions.map((v) => v.id),
  };

  await prisma.accWorkflowDefinition.delete({ where: { id: definitionId } });
  await _auditDefinition(actorId, AuditAction.WORKFLOW_DEFINITION_DELETED, snapshot);
  return { deleted: true, definitionId };
};

const listVersions = async (definitionId) => {
  const definition = await prisma.accWorkflowDefinition.findUnique({
    where: { id: definitionId },
    select: { id: true },
  });
  if (!definition) throw new ConfigError('Definition not found.', 404);

  const rows = await prisma.accWorkflowVersion.findMany({
    where: { definitionId },
    orderBy: [{ versionNumber: 'desc' }],
    include: { _count: { select: { steps: true } } },
  });
  return rows.map((v) => _formatVersion(v));
};

const getVersion = async (versionId) => {
  const row = await prisma.accWorkflowVersion.findUnique({
    where: { id: versionId },
    include: {
      steps: { orderBy: [{ stepOrder: 'asc' }], include: _stepInclude },
      definition: { include: { module: { select: { key: true } } } },
    },
  });
  if (!row) throw new ConfigError('Version not found.', 404);
  return _enrichAndFormatVersion(row, { includeSteps: true });
};

const createDraftVersion = async (
  definitionId,
  { notes = null, cloneFromPublished = false } = {},
  actorId = null,
) => {
  const definition = await prisma.accWorkflowDefinition.findUnique({
    where: { id: definitionId },
    select: { id: true },
  });
  if (!definition) throw new ConfigError('Definition not found.', 404);

  const latest = await prisma.accWorkflowVersion.findFirst({
    where: { definitionId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });
  const nextNumber = (latest?.versionNumber ?? 0) + 1;

  let sourceSteps = [];
  let sourceVersionNumber = null;
  let sourceCreatorRoleIds = [];
  if (cloneFromPublished) {
    const published = await prisma.accWorkflowVersion.findFirst({
      where: { definitionId, status: 'PUBLISHED' },
      orderBy: [{ versionNumber: 'desc' }],
      include: { steps: { orderBy: [{ stepOrder: 'asc' }] } },
    });
    if (!published) {
      throw new ConfigError('No published version available to clone from.', 404);
    }
    sourceSteps = _cloneStepsPayload(published.steps);
    sourceVersionNumber = published.versionNumber;
    sourceCreatorRoleIds = _normalizeCreatorRoleIds(published.allowedCreatorRoleIds);
  }

  const row = await prisma.$transaction(async (tx) => {
    const version = await tx.accWorkflowVersion.create({
      data: {
        definitionId,
        versionNumber: nextNumber,
        status: 'DRAFT',
        allowedCreatorRoleIds: sourceCreatorRoleIds,
        notes:
          notes?.trim()
          || (sourceVersionNumber != null
            ? `Cloned from published v${sourceVersionNumber}`
            : null),
      },
      include: { _count: { select: { steps: true } } },
    });

    if (sourceSteps.length > 0) {
      await tx.accWorkflowStepDefinition.createMany({
        data: sourceSteps.map((step) => ({
          versionId: version.id,
          stepOrder: step.stepOrder,
          label: step.label || null,
          approverRoleId: step.approverRoleId || null,
          permissionId: step.permissionId || null,
          statusKey: step.statusKey || null,
          capabilityCode: step.capabilityCode || null,
          autoApprove: !!step.autoApprove,
        })),
      });
      version._count = { steps: sourceSteps.length };
    }

    return version;
  });

  await _auditVersion(
    actorId,
    AuditAction.WORKFLOW_VERSION_CREATED,
    _versionAuditPayload(row, {
      clonedFromPublished: !!cloneFromPublished,
      sourceVersionNumber,
      stepCount: sourceSteps.length,
    }),
  );
  return _formatVersion(row);
};

/**
 * Aggregate workspace payload for Column 3:
 * definition meta, published version (with steps), active draft (with steps),
 * operational version list, and governance audit trail.
 */
const getDefinitionWorkspace = async (definitionId, { auditLimit = 50 } = {}) => {
  const definition = await prisma.accWorkflowDefinition.findUnique({
    where: { id: definitionId },
    include: _definitionInclude,
  });
  if (!definition) throw new ConfigError('Definition not found.', 404);

  const versions = await prisma.accWorkflowVersion.findMany({
    where: { definitionId },
    orderBy: [{ versionNumber: 'desc' }],
    include: { _count: { select: { steps: true } } },
  });

  const publishedSummary = versions.find((v) => v.status === 'PUBLISHED') ?? null;
  const draftSummary = versions.find((v) => v.status === 'DRAFT') ?? null;

  const [publishedVersion, draftVersion, audit] = await Promise.all([
    publishedSummary ? getVersion(publishedSummary.id) : Promise.resolve(null),
    draftSummary ? getVersion(draftSummary.id) : Promise.resolve(null),
    listDefinitionAudit(definitionId, { limit: auditLimit }),
  ]);

  return {
    definition: _formatDefinition(definition),
    publishedVersion,
    draftVersion,
    versions: versions.map((v) => _formatVersion(v)),
    audit,
  };
};

const updateDraftVersion = async (versionId, { notes }) => {
  const version = await prisma.accWorkflowVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new ConfigError('Version not found.', 404);
  if (version.status !== 'DRAFT') {
    throw new ConfigError('Only DRAFT versions can be edited.');
  }

  const row = await prisma.accWorkflowVersion.update({
    where: { id: versionId },
    data: { notes: notes?.trim() || null },
    include: { _count: { select: { steps: true } } },
  });
  return _formatVersion(row);
};

const _validateStepsPayload = (steps, { moduleKey } = {}) => {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new ConfigError('At least one step is required.');
  }
  const orders = new Set();
  for (const step of steps) {
    const order = Number(step.stepOrder);
    if (!Number.isInteger(order) || order < 1) {
      throw new ConfigError('Each step must have a positive integer stepOrder.');
    }
    if (orders.has(order)) {
      throw new ConfigError('Step order values must be unique.');
    }
    orders.add(order);
    if (!step.approverRoleId && !step.capabilityCode?.trim()) {
      throw new ConfigError(`Step ${order} requires approverRoleId or capabilityCode.`);
    }
  }
  try {
    validateWorkflowChainSteps(steps, { moduleKey, context: 'publish' });
  } catch (e) {
    throw new ConfigError(e.message, e.statusCode || 400);
  }
};

const _assertStepRefsExist = async (steps) => {
  const roleIds = [...new Set(steps.map((s) => s.approverRoleId).filter(Boolean))];
  const permissionIds = [...new Set(steps.map((s) => s.permissionId).filter(Boolean))];
  if (roleIds.length > 0) {
    const found = await prisma.role.count({ where: { id: { in: roleIds } } });
    if (found !== roleIds.length) throw new ConfigError('One or more approver roles were not found.');
  }
  if (permissionIds.length > 0) {
    const found = await prisma.urPermission.count({ where: { id: { in: permissionIds } } });
    if (found !== permissionIds.length) throw new ConfigError('One or more step permissions were not found.');
  }
};

const _writeDraftStepsInTx = async (tx, versionId, steps, { moduleKey } = {}) => {
  const roleIds = [...new Set(steps.map((s) => s.approverRoleId).filter(Boolean))];
  const roleCodeById = new Map();
  if (roleIds.length > 0) {
    const roles = await tx.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, code: true },
    });
    for (const role of roles) {
      roleCodeById.set(role.id, role.code);
    }
  }

  await tx.accWorkflowStepDefinition.deleteMany({ where: { versionId } });
  await tx.accWorkflowStepDefinition.createMany({
    data: steps.map((step) => {
      const roleCode = step.approverRoleId ? roleCodeById.get(step.approverRoleId) : null;
      const fromRole = statusKeyFromRoleCode(roleCode, moduleKey);
      const explicit = step.statusKey?.trim()?.toUpperCase() || null;
      return {
        versionId,
        stepOrder: step.stepOrder,
        label: step.label?.trim() || null,
        approverRoleId: step.approverRoleId || null,
        permissionId: step.permissionId || null,
        // Prefer role-derived key so free-text client values cannot drift from role mapping.
        statusKey: fromRole || explicit || null,
        capabilityCode: step.capabilityCode?.trim() || null,
        autoApprove: !!step.autoApprove,
      };
    }),
  });
};

/** Re-derive statusKey from approver roles before publish (fixes legacy free-text keys). */
const _normalizeDraftStatusKeysInTx = async (tx, versionId, moduleKey) => {
  const steps = await tx.accWorkflowStepDefinition.findMany({
    where: { versionId },
    include: { approverRole: { select: { code: true } } },
  });
  for (const step of steps) {
    const next = statusKeyFromRoleCode(step.approverRole?.code, moduleKey);
    if (!next || next === step.statusKey) continue;
    await tx.accWorkflowStepDefinition.update({
      where: { id: step.id },
      data: { statusKey: next },
    });
  }
};

/** Archive every PUBLISHED version under the same module (sibling definitions included). */
const _archivePublishedForModuleInTx = async (tx, { moduleId, exceptVersionId = null }) => {
  const siblingDefs = await tx.accWorkflowDefinition.findMany({
    where: { moduleId },
    select: { id: true },
  });
  const definitionIds = siblingDefs.map((d) => d.id);
  if (!definitionIds.length) return;
  await tx.accWorkflowVersion.updateMany({
    where: {
      definitionId: { in: definitionIds },
      status: 'PUBLISHED',
      ...(exceptVersionId ? { id: { not: exceptVersionId } } : {}),
    },
    data: { status: 'ARCHIVED' },
  });
};

const replaceDraftSteps = async (versionId, stepsOrBody, actorId = null) => {
  const steps = Array.isArray(stepsOrBody) ? stepsOrBody : stepsOrBody?.steps;
  const hasCreatorRoles =
    !Array.isArray(stepsOrBody)
    && Object.prototype.hasOwnProperty.call(stepsOrBody || {}, 'allowedCreatorRoleIds');
  const creatorRoleIdsRaw = hasCreatorRoles ? stepsOrBody.allowedCreatorRoleIds : undefined;

  const version = await prisma.accWorkflowVersion.findUnique({
    where: { id: versionId },
    include: { definition: { include: { module: { select: { key: true } } } } },
  });
  if (!version) throw new ConfigError('Version not found.', 404);
  if (version.status !== 'DRAFT') {
    throw new ConfigError('Steps can only be edited on DRAFT versions.');
  }

  _validateStepsPayload(steps, { moduleKey: version.definition?.module?.key });
  await _assertStepRefsExist(steps);
  const creatorRoleIds = hasCreatorRoles
    ? await _assertCreatorRoleIdsExist(creatorRoleIdsRaw)
    : null;

  await prisma.$transaction(async (tx) => {
    await _writeDraftStepsInTx(tx, versionId, steps, {
      moduleKey: version.definition?.module?.key,
    });
    if (creatorRoleIds) {
      await tx.accWorkflowVersion.update({
        where: { id: versionId },
        data: { allowedCreatorRoleIds: creatorRoleIds },
      });
    }
  });

  const result = await getVersion(versionId);
  await _auditVersion(
    actorId,
    AuditAction.WORKFLOW_VERSION_STEPS_UPDATED,
    _versionAuditPayload(version, {
      stepCount: steps.length,
      ...(creatorRoleIds
        ? { allowedCreatorRoleIds: creatorRoleIds }
        : {}),
    }),
  );
  return result;
};

/**
 * Publish a DRAFT version. Optionally persist `steps` in the same transaction
 * before flipping status to PUBLISHED (atomic save-and-publish).
 * Archives other published versions for this definition and sibling definitions
 * under the same AccModule so only one published chain is active per module.
 */
const publishVersion = async (
  versionId,
  publishedById,
  { steps: pendingSteps = undefined, allowedCreatorRoleIds: pendingCreatorRoles = undefined } = {},
) => {
  const version = await prisma.accWorkflowVersion.findUnique({
    where: { id: versionId },
    include: {
      _count: { select: { steps: true } },
      steps: { orderBy: { stepOrder: 'asc' } },
      definition: { include: { module: { select: { id: true, key: true } } } },
    },
  });
  if (!version) throw new ConfigError('Version not found.', 404);
  if (version.status !== 'DRAFT') {
    throw new ConfigError('Only DRAFT versions can be published.');
  }

  const moduleKey = version.definition?.module?.key;
  const moduleId = version.definition?.moduleId ?? version.definition?.module?.id;
  const stepsToPersist = Array.isArray(pendingSteps) ? pendingSteps : null;
  const hasCreatorRoles = pendingCreatorRoles !== undefined;
  const creatorRoleIds = hasCreatorRoles
    ? await _assertCreatorRoleIdsExist(pendingCreatorRoles)
    : null;

  if (stepsToPersist) {
    _validateStepsPayload(stepsToPersist, { moduleKey });
    await _assertStepRefsExist(stepsToPersist);
  } else if (version._count.steps < 1) {
    throw new ConfigError('Cannot publish a version without steps.');
  } else {
    try {
      validateWorkflowChainSteps(version.steps, { moduleKey, context: 'publish' });
    } catch (e) {
      throw new ConfigError(e.message, e.statusCode || 400);
    }
  }

  const previousPublished = await prisma.accWorkflowVersion.findFirst({
    where: { definitionId: version.definitionId, status: 'PUBLISHED' },
    select: { id: true, versionNumber: true },
  });

  await prisma.$transaction(async (tx) => {
    if (stepsToPersist) {
      await _writeDraftStepsInTx(tx, versionId, stepsToPersist, { moduleKey });
    } else {
      await _normalizeDraftStatusKeysInTx(tx, versionId, moduleKey);
    }
    if (creatorRoleIds) {
      await tx.accWorkflowVersion.update({
        where: { id: versionId },
        data: { allowedCreatorRoleIds: creatorRoleIds },
      });
    }
    if (moduleId) {
      await _archivePublishedForModuleInTx(tx, { moduleId, exceptVersionId: versionId });
      await _setDefaultInTx(tx, {
        moduleId,
        definitionId: version.definitionId,
      });
    } else {
      await tx.accWorkflowVersion.updateMany({
        where: { definitionId: version.definitionId, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      });
    }
    await tx.accWorkflowVersion.update({
      where: { id: versionId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: publishedById || null,
      },
    });
  });

  const result = await getVersion(versionId);
  await _auditVersion(
    publishedById,
    AuditAction.WORKFLOW_VERSION_PUBLISHED,
    _versionAuditPayload(version, {
      previousPublishedVersionId: previousPublished?.id ?? null,
      previousPublishedVersionNumber: previousPublished?.versionNumber ?? null,
      stepCount: stepsToPersist?.length ?? version._count.steps,
      ...(creatorRoleIds ? { allowedCreatorRoleIds: creatorRoleIds } : {}),
    }),
  );
  return result;
};

const archiveVersion = async (versionId, actorId = null) => {
  const version = await prisma.accWorkflowVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new ConfigError('Version not found.', 404);
  if (version.status === 'ARCHIVED') {
    throw new ConfigError('Version is already archived.');
  }
  if (version.status === 'DRAFT') {
    throw new ConfigError('DRAFT versions cannot be archived. Edit, publish, or delete instead.');
  }

  const row = await prisma.accWorkflowVersion.update({
    where: { id: versionId },
    data: { status: 'ARCHIVED' },
    include: {
      steps: { orderBy: [{ stepOrder: 'asc' }], include: _stepInclude },
    },
  });
  await _auditVersion(
    actorId,
    AuditAction.WORKFLOW_VERSION_ARCHIVED,
    _versionAuditPayload(version),
  );
  return _formatVersion(row, { includeSteps: true });
};

const restoreVersion = async (versionId, restoredById) => {
  const version = await prisma.accWorkflowVersion.findUnique({
    where: { id: versionId },
    include: {
      _count: { select: { steps: true } },
      definition: { select: { id: true, moduleId: true } },
    },
  });
  if (!version) throw new ConfigError('Version not found.', 404);
  if (version.status !== 'ARCHIVED') {
    throw new ConfigError('Only ARCHIVED versions can be restored to published.');
  }
  if (version._count.steps < 1) {
    throw new ConfigError('Cannot restore a version without steps.');
  }

  const previousPublished = await prisma.accWorkflowVersion.findFirst({
    where: { definitionId: version.definitionId, status: 'PUBLISHED' },
    select: { id: true, versionNumber: true },
  });

  const moduleId = version.definition?.moduleId;

  await prisma.$transaction(async (tx) => {
    if (moduleId) {
      await _archivePublishedForModuleInTx(tx, { moduleId, exceptVersionId: versionId });
    } else {
      await tx.accWorkflowVersion.updateMany({
        where: { definitionId: version.definitionId, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      });
    }
    await tx.accWorkflowVersion.update({
      where: { id: versionId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: restoredById || null,
      },
    });
  });

  const result = await getVersion(versionId);
  await _auditVersion(
    restoredById,
    AuditAction.WORKFLOW_VERSION_RESTORED,
    _versionAuditPayload(version, {
      previousPublishedVersionId: previousPublished?.id ?? null,
      previousPublishedVersionNumber: previousPublished?.versionNumber ?? null,
    }),
  );
  return result;
};

const deleteDraftVersion = async (versionId, actorId = null) => {
  const version = await prisma.accWorkflowVersion.findUnique({
    where: { id: versionId },
    include: {
      _count: {
        select: {
          steps: true,
          approvalRequests: true,
          getPasses: true,
          grnImports: true,
          storeRequisitions: true,
        },
      },
    },
  });
  if (!version) throw new ConfigError('Version not found.', 404);
  _assertDraftDeletable(version);

  const pinnedCount =
    version._count.approvalRequests
    + version._count.getPasses
    + version._count.grnImports
    + version._count.storeRequisitions;
  if (pinnedCount > 0) {
    throw new ConfigError('Cannot delete a version referenced by runtime documents.', 403);
  }

  const snapshot = _versionAuditPayload(version, { stepCount: version._count.steps });
  await prisma.accWorkflowVersion.delete({ where: { id: versionId } });
  await _auditVersion(actorId, AuditAction.WORKFLOW_VERSION_DELETED, snapshot);
  return { deleted: true, ...snapshot };
};

const cloneVersion = async (sourceVersionId, { notes = null } = {}, actorId = null) => {
  const source = await prisma.accWorkflowVersion.findUnique({
    where: { id: sourceVersionId },
    include: {
      steps: { orderBy: [{ stepOrder: 'asc' }] },
    },
  });
  if (!source) throw new ConfigError('Version not found.', 404);

  const draftNotes =
    notes?.trim()
    || `Cloned from v${source.versionNumber} (${source.status})`;
  const draft = await createDraftVersion(source.definitionId, { notes: draftNotes }, actorId);
  const creatorRoleIds = _normalizeCreatorRoleIds(source.allowedCreatorRoleIds);

  if (source.steps.length > 0) {
    await replaceDraftSteps(
      draft.id,
      {
        steps: source.steps.map((step) => ({
          stepOrder: step.stepOrder,
          label: step.label,
          approverRoleId: step.approverRoleId,
          permissionId: step.permissionId,
          statusKey: step.statusKey,
          capabilityCode: step.capabilityCode,
          autoApprove: step.autoApprove,
        })),
        allowedCreatorRoleIds: creatorRoleIds,
      },
      actorId,
    );
  } else if (creatorRoleIds.length > 0) {
    await prisma.accWorkflowVersion.update({
      where: { id: draft.id },
      data: { allowedCreatorRoleIds: creatorRoleIds },
    });
  }

  const result = await getVersion(draft.id);
  await _auditVersion(
    actorId,
    AuditAction.WORKFLOW_VERSION_CLONED,
    _versionAuditPayload(
      { ...result, definitionId: source.definitionId },
      {
        sourceVersionId: source.id,
        sourceVersionNumber: source.versionNumber,
        sourceStatus: source.status,
      },
    ),
  );
  return result;
};

const WORKFLOW_AUDIT_ACTIONS = Object.freeze([
  AuditAction.WORKFLOW_VERSION_CREATED,
  AuditAction.WORKFLOW_VERSION_STEPS_UPDATED,
  AuditAction.WORKFLOW_VERSION_PUBLISHED,
  AuditAction.WORKFLOW_VERSION_ARCHIVED,
  AuditAction.WORKFLOW_VERSION_DELETED,
  AuditAction.WORKFLOW_VERSION_CLONED,
  AuditAction.WORKFLOW_VERSION_RESTORED,
]);

const listDefinitionAudit = async (definitionId, { limit = 50 } = {}) => {
  const definition = await prisma.accWorkflowDefinition.findUnique({
    where: { id: definitionId },
    select: { id: true, key: true, name: true },
  });
  if (!definition) throw new ConfigError('Definition not found.', 404);

  const versionRows = await prisma.accWorkflowVersion.findMany({
    where: { definitionId },
    select: { id: true },
  });
  const versionIds = versionRows.map((v) => v.id);

  const events = await prisma.urAuditEvent.findMany({
    where: {
      action: { in: [...WORKFLOW_AUDIT_ACTIONS] },
      OR: [
        { targetEntityId: { in: versionIds } },
        {
          newValue: {
            path: ['definitionId'],
            equals: definitionId,
          },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    include: {
      actor: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  return events.map((e) => ({
    id: e.id,
    action: e.action,
    actorName: `${e.actor.firstName} ${e.actor.lastName}`.trim(),
    actorEmail: e.actor.email,
    targetEntityId: e.targetEntityId,
    entityType: e.entityType,
    oldValue: e.oldValue,
    newValue: e.newValue,
    createdAt: e.createdAt,
  }));
};

module.exports = {
  ConfigError,
  listModules,
  createModule,
  listDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  getDefinitionWorkspace,
  listVersions,
  getVersion,
  createDraftVersion,
  updateDraftVersion,
  replaceDraftSteps,
  publishVersion,
  archiveVersion,
  restoreVersion,
  deleteDraftVersion,
  cloneVersion,
  listDefinitionAudit,
};
