'use strict';

/**
 * ACC Workflow Builder — configuration only (Stage S10).
 * Reads/writes acc_* tables. Not wired to runtime approval execution.
 */

const prisma = require('../config/database');
const { AuditAction, logWorkflowVersionEvent } = require('../engines/ur-audit.logger');
const { validateWorkflowChainSteps } = require('./acc-workflow-status-key-guard.service');

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

const _formatVersion = (version, { includeSteps = false } = {}) => ({
  id: version.id,
  definitionId: version.definitionId,
  versionNumber: version.versionNumber,
  status: version.status,
  publishedAt: version.publishedAt,
  publishedById: version.publishedById,
  notes: version.notes,
  createdAt: version.createdAt,
  updatedAt: version.updatedAt,
  stepCount: version._count?.steps ?? version.steps?.length ?? 0,
  ...(includeSteps ? { steps: (version.steps || []).map(_formatStep) } : {}),
});

const _auditVersion = async (actorId, action, payload) => {
  if (!actorId) return;
  try {
    await logWorkflowVersionEvent(actorId, action, payload);
  } catch (err) {
    console.error('[acc-workflow-config] audit log failed:', err?.message ?? err);
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

const _formatDefinition = (definition) => ({
  id: definition.id,
  moduleId: definition.moduleId,
  key: definition.key,
  name: definition.name,
  description: definition.description,
  tenantId: definition.tenantId,
  isActive: definition.isActive,
  createdAt: definition.createdAt,
  updatedAt: definition.updatedAt,
  versionCount: definition._count?.versions ?? 0,
  publishedVersion: definition.versions?.[0]
    ? _formatVersion(definition.versions[0])
    : null,
});

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

  const rows = await prisma.accWorkflowDefinition.findMany({
    where: {
      moduleId,
      isActive,
      OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
    },
    orderBy: [{ name: 'asc' }],
    include: {
      _count: { select: { versions: true } },
      versions: {
        where: { status: 'PUBLISHED' },
        orderBy: [{ versionNumber: 'desc' }],
        take: 1,
        include: { _count: { select: { steps: true } } },
      },
    },
  });
  return rows.map(_formatDefinition);
};

const createDefinition = async (moduleId, { key, name, description, tenantId = null }) => {
  if (!key?.trim() || !name?.trim()) {
    throw new ConfigError('Definition key and name are required.');
  }
  const module = await prisma.accModule.findUnique({ where: { id: moduleId }, select: { id: true } });
  if (!module) throw new ConfigError('Module not found.', 404);

  const normalizedKey = String(key).trim().toLowerCase().replace(/\s+/g, '-');
  try {
    const row = await prisma.accWorkflowDefinition.create({
      data: {
        moduleId,
        key: normalizedKey,
        name: String(name).trim(),
        description: description?.trim() || null,
        tenantId: tenantId || null,
      },
    });
    return _formatDefinition({ ...row, _count: { versions: 0 }, versions: [] });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ConfigError('A definition with this key already exists for the module/tenant scope.');
    }
    throw err;
  }
};

const updateDefinition = async (definitionId, { name, description, isActive }) => {
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

  const row = await prisma.accWorkflowDefinition.update({
    where: { id: definitionId },
    data: {
      ...(name != null ? { name: String(name).trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(isActive != null ? { isActive: !!isActive } : {}),
    },
    include: {
      _count: { select: { versions: true } },
      versions: {
        where: { status: 'PUBLISHED' },
        orderBy: [{ versionNumber: 'desc' }],
        take: 1,
        include: { _count: { select: { steps: true } } },
      },
    },
  });
  return _formatDefinition(row);
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
    },
  });
  if (!row) throw new ConfigError('Version not found.', 404);
  return _formatVersion(row, { includeSteps: true });
};

const createDraftVersion = async (definitionId, { notes = null } = {}, actorId = null) => {
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

  const row = await prisma.accWorkflowVersion.create({
    data: {
      definitionId,
      versionNumber: nextNumber,
      status: 'DRAFT',
      notes: notes?.trim() || null,
    },
    include: { _count: { select: { steps: true } } },
  });
  await _auditVersion(
    actorId,
    AuditAction.WORKFLOW_VERSION_CREATED,
    _versionAuditPayload(row),
  );
  return _formatVersion(row);
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

const replaceDraftSteps = async (versionId, steps, actorId = null) => {
  const version = await prisma.accWorkflowVersion.findUnique({
    where: { id: versionId },
    include: { definition: { include: { module: { select: { key: true } } } } },
  });
  if (!version) throw new ConfigError('Version not found.', 404);
  if (version.status !== 'DRAFT') {
    throw new ConfigError('Steps can only be edited on DRAFT versions.');
  }

  _validateStepsPayload(steps, { moduleKey: version.definition?.module?.key });

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

  await prisma.$transaction(async (tx) => {
    await tx.accWorkflowStepDefinition.deleteMany({ where: { versionId } });
    await tx.accWorkflowStepDefinition.createMany({
      data: steps.map((step) => ({
        versionId,
        stepOrder: step.stepOrder,
        label: step.label?.trim() || null,
        approverRoleId: step.approverRoleId || null,
        permissionId: step.permissionId || null,
        statusKey: step.statusKey?.trim()?.toUpperCase() || null,
        capabilityCode: step.capabilityCode?.trim() || null,
        autoApprove: !!step.autoApprove,
      })),
    });
  });

  const result = await getVersion(versionId);
  await _auditVersion(
    actorId,
    AuditAction.WORKFLOW_VERSION_STEPS_UPDATED,
    _versionAuditPayload(version, { stepCount: steps.length }),
  );
  return result;
};

const publishVersion = async (versionId, publishedById) => {
  const version = await prisma.accWorkflowVersion.findUnique({
    where: { id: versionId },
    include: {
      _count: { select: { steps: true } },
      steps: { orderBy: { stepOrder: 'asc' } },
      definition: { include: { module: { select: { key: true } } } },
    },
  });
  if (!version) throw new ConfigError('Version not found.', 404);
  if (version.status !== 'DRAFT') {
    throw new ConfigError('Only DRAFT versions can be published.');
  }
  if (version._count.steps < 1) {
    throw new ConfigError('Cannot publish a version without steps.');
  }

  try {
    validateWorkflowChainSteps(version.steps, {
      moduleKey: version.definition?.module?.key,
      context: 'publish',
    });
  } catch (e) {
    throw new ConfigError(e.message, e.statusCode || 400);
  }

  const previousPublished = await prisma.accWorkflowVersion.findFirst({
    where: { definitionId: version.definitionId, status: 'PUBLISHED' },
    select: { id: true, versionNumber: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.accWorkflowVersion.updateMany({
      where: { definitionId: version.definitionId, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
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
    include: { _count: { select: { steps: true } } },
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

  await prisma.$transaction(async (tx) => {
    await tx.accWorkflowVersion.updateMany({
      where: { definitionId: version.definitionId, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
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

  if (source.steps.length > 0) {
    await replaceDraftSteps(
      draft.id,
      source.steps.map((step) => ({
        stepOrder: step.stepOrder,
        label: step.label,
        approverRoleId: step.approverRoleId,
        permissionId: step.permissionId,
        statusKey: step.statusKey,
        capabilityCode: step.capabilityCode,
        autoApprove: step.autoApprove,
      })),
      actorId,
    );
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
