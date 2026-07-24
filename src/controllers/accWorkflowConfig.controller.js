'use strict';

/**
 * ACC Workflow Builder — HTTP handlers (configuration only, Stage S10).
 */

const {
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
} = require('../services/acc-workflow-config.service');
const {
  getWorkflowEnforcementStatus,
  listAllModulesRuntimeReadPath,
  getModuleRuntimeReadPath,
} = require('../services/acc-workflow-runtime.service');

const handle = (label, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof ConfigError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error(`[acc-workflow-config] ${label}:`, err);
    return res.status(500).json({ success: false, message: `Failed: ${label}` });
  }
};

const getModules = handle('getModules', async (_req, res) => {
  const data = await listModules();
  return res.json({ success: true, data });
});

const postModule = handle('postModule', async (req, res) => {
  const data = await createModule(req.body || {});
  return res.status(201).json({ success: true, data });
});

const getDefinitions = handle('getDefinitions', async (req, res) => {
  const status = req.query.status === 'archived' ? 'archived' : 'active';
  const data = await listDefinitions(req.params.moduleId, {
    tenantId: req.user?.tenantId ?? null,
    status,
  });
  return res.json({ success: true, data });
});

const postDefinition = handle('postDefinition', async (req, res) => {
  const data = await createDefinition(req.params.moduleId, {
    ...req.body,
    tenantId: req.body?.tenantId ?? req.user?.tenantId ?? null,
  });
  return res.status(201).json({ success: true, data });
});

const patchDefinition = handle('patchDefinition', async (req, res) => {
  const data = await updateDefinition(req.params.definitionId, req.body || {});
  return res.json({ success: true, data });
});

const getVersions = handle('getVersions', async (req, res) => {
  const data = await listVersions(req.params.definitionId);
  return res.json({ success: true, data });
});

const postVersion = handle('postVersion', async (req, res) => {
  const data = await createDraftVersion(req.params.definitionId, req.body || {}, req.user?.id);
  return res.status(201).json({ success: true, data });
});

const getVersionById = handle('getVersionById', async (req, res) => {
  const data = await getVersion(req.params.versionId);
  return res.json({ success: true, data });
});

const patchVersion = handle('patchVersion', async (req, res) => {
  const data = await updateDraftVersion(req.params.versionId, req.body || {});
  return res.json({ success: true, data });
});

const putVersionSteps = handle('putVersionSteps', async (req, res) => {
  const steps = req.body?.steps;
  const data = await replaceDraftSteps(req.params.versionId, steps, req.user?.id);
  return res.json({ success: true, data });
});

const postPublish = handle('postPublish', async (req, res) => {
  const data = await publishVersion(req.params.versionId, req.user?.id);
  return res.json({ success: true, data });
});

const postArchive = handle('postArchive', async (req, res) => {
  const data = await archiveVersion(req.params.versionId, req.user?.id);
  return res.json({ success: true, data });
});

const postRestore = handle('postRestore', async (req, res) => {
  const data = await restoreVersion(req.params.versionId, req.user?.id);
  return res.json({ success: true, data });
});

const deleteVersion = handle('deleteVersion', async (req, res) => {
  const data = await deleteDraftVersion(req.params.versionId, req.user?.id);
  return res.json({ success: true, data });
});

const postCloneVersion = handle('postCloneVersion', async (req, res) => {
  const data = await cloneVersion(req.params.versionId, req.body || {}, req.user?.id);
  return res.status(201).json({ success: true, data });
});

const getDefinitionAudit = handle('getDefinitionAudit', async (req, res) => {
  const limit = parseInt(req.query.limit ?? '50', 10);
  const data = await listDefinitionAudit(req.params.definitionId, { limit });
  return res.json({ success: true, data });
});

const getRuntimeEnforcement = handle('getRuntimeEnforcement', async (req, res) => {
  const tenantId = req.user?.tenantId ?? null;
  let tenantSlug = req.user?.tenantSlug ?? null;
  if (tenantId && !tenantSlug) {
    const prisma = require('../config/database');
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    tenantSlug = tenant?.slug ?? null;
  }
  return res.json({
    success: true,
    data: getWorkflowEnforcementStatus({ tenantId, tenantSlug }),
  });
});

const getRuntimeModules = handle('getRuntimeModules', async (req, res) => {
  const tenantId = req.user?.tenantId ?? null;
  const data = await listAllModulesRuntimeReadPath(tenantId);
  return res.json({ success: true, data });
});

const getRuntimeModuleByKey = handle('getRuntimeModuleByKey', async (req, res) => {
  const tenantId = req.user?.tenantId ?? null;
  const moduleKey = String(req.params.moduleKey || '').trim().toUpperCase();
  const data = await getModuleRuntimeReadPath(moduleKey, tenantId);
  return res.json({ success: true, data });
});

module.exports = {
  getModules,
  postModule,
  getDefinitions,
  postDefinition,
  patchDefinition,
  getVersions,
  postVersion,
  getVersionById,
  patchVersion,
  putVersionSteps,
  postPublish,
  postArchive,
  postRestore,
  deleteVersion,
  postCloneVersion,
  getDefinitionAudit,
  getRuntimeEnforcement,
  getRuntimeModules,
  getRuntimeModuleByKey,
};
