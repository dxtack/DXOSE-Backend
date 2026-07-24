'use strict';

const prisma = require('../config/database');
const {
  getAccSystemDiagnostics,
  getProtectedRolesPolicyReadOnly,
} = require('../services/acc-system-diagnostics.service');

async function _tenantContext(req) {
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

async function getDiagnostics(req, res) {
  const userId = req.user?.id;
  const { tenantId, tenantSlug } = await _tenantContext(req);
  if (!tenantId) {
    return res.status(400).json({ success: false, message: 'Tenant session required.' });
  }

  const data = await getAccSystemDiagnostics({ userId, tenantId, tenantSlug });
  return res.json({ success: true, data });
}

async function getProtectedRolesPolicy(req, res) {
  const data = await getProtectedRolesPolicyReadOnly();
  return res.json({ success: true, data });
}

const {
  getAccRuntimeConfigSnapshot,
  listRuntimeSettings,
  upsertRuntimeSetting,
  upsertRuntimeSettingsBatch,
} = require('../services/acc-runtime-config.service');

async function getRuntimeSettings(req, res) {
  const tenantId = req.user?.tenantId ?? null;
  const rows = await listRuntimeSettings({ tenantId });
  const snapshot = getAccRuntimeConfigSnapshot(tenantId);
  return res.json({ success: true, data: { settings: rows, snapshot } });
}

async function patchRuntimeSettings(req, res) {
  const tenantId = req.user?.tenantId ?? null;
  const { settings, key, value } = req.body || {};
  const updatedById = req.user?.id ?? null;

  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const rows = await upsertRuntimeSettingsBatch({ settings, tenantId, updatedById });
    return res.json({ success: true, data: rows });
  }
  if (key) {
    const row = await upsertRuntimeSetting({ tenantId, key, value, updatedById });
    return res.json({ success: true, data: row });
  }
  return res.status(400).json({ success: false, message: 'Provide settings object or key/value.' });
}

module.exports = {
  getDiagnostics,
  getProtectedRolesPolicy,
  getRuntimeSettings,
  patchRuntimeSettings,
};
