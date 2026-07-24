'use strict';

const prisma = require('../config/database');
const {
  PolicyConfigError,
  listFieldSecurityRules,
  createFieldSecurityRule,
  updateFieldSecurityRule,
  deleteFieldSecurityRule,
  listUserExceptions,
  createUserException,
  updateUserException,
  deleteUserException: removeUserException,
  listScheduledAccess,
  createScheduledAccess,
  updateScheduledAccess,
  deleteScheduledAccess,
  getSummary,
} = require('../services/acc-advanced-policy.service');
const { observeAdvancedPolicies } = require('../engines/policy-evaluation.engine');
const { resolveAdvancedPolicyEvaluation } = require('../services/policy-enforcement-pilot.service');

const handle = (label, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof PolicyConfigError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error(`[acc-advanced-policy] ${label}:`, err);
    return res.status(500).json({ success: false, message: `Failed: ${label}` });
  }
};

const getPolicySummary = handle('getPolicySummary', async (_req, res) => {
  const data = await getSummary();
  return res.json({ success: true, data });
});

const getFieldSecurity = handle('getFieldSecurity', async (req, res) => {
  const data = await listFieldSecurityRules({
    tenantId: req.user?.tenantId ?? null,
    resourceCode: req.query.resourceCode,
  });
  return res.json({ success: true, data });
});

const postFieldSecurity = handle('postFieldSecurity', async (req, res) => {
  const data = await createFieldSecurityRule(
    { ...req.body, tenantId: req.body?.tenantId ?? req.user?.tenantId ?? null },
    req.user?.id,
  );
  return res.status(201).json({ success: true, data });
});

const patchFieldSecurity = handle('patchFieldSecurity', async (req, res) => {
  const data = await updateFieldSecurityRule(req.params.id, req.body || {}, req.user?.id);
  return res.json({ success: true, data });
});

const deleteFieldSecurity = handle('deleteFieldSecurity', async (req, res) => {
  await deleteFieldSecurityRule(req.params.id, req.user?.id);
  return res.json({ success: true });
});

const getUserExceptions = handle('getUserExceptions', async (req, res) => {
  const data = await listUserExceptions({ userId: req.query.userId });
  return res.json({ success: true, data });
});

const postUserException = handle('postUserException', async (req, res) => {
  const data = await createUserException(req.body || {}, req.user?.id);
  return res.status(201).json({ success: true, data });
});

const patchUserException = handle('patchUserException', async (req, res) => {
  const data = await updateUserException(req.params.id, req.body || {}, req.user?.id);
  return res.json({ success: true, data });
});

const deleteUserException = handle('deleteUserException', async (req, res) => {
  await removeUserException(req.params.id, req.user?.id);
  return res.json({ success: true });
});

const getScheduledAccess = handle('getScheduledAccess', async (req, res) => {
  const data = await listScheduledAccess({
    tenantId: req.user?.tenantId ?? null,
    userId: req.query.userId,
  });
  return res.json({ success: true, data });
});

const postScheduledAccess = handle('postScheduledAccess', async (req, res) => {
  const data = await createScheduledAccess(
    { ...req.body, tenantId: req.body?.tenantId ?? req.user?.tenantId ?? null },
    req.user?.id,
  );
  return res.status(201).json({ success: true, data });
});

const patchScheduledAccess = handle('patchScheduledAccess', async (req, res) => {
  const data = await updateScheduledAccess(req.params.id, req.body || {}, req.user?.id);
  return res.json({ success: true, data });
});

const deleteScheduledAccessHandler = handle('deleteScheduledAccess', async (req, res) => {
  await deleteScheduledAccess(req.params.id, req.user?.id);
  return res.json({ success: true });
});

const postEvaluate = handle('postEvaluate', async (req, res) => {
  const body = req.body || {};
  const tenantId = body.tenantId ?? req.user?.tenantId ?? null;
  let tenantSlug = body.tenantSlug ?? null;
  if (tenantId && !tenantSlug) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    tenantSlug = tenant?.slug ?? null;
  }

  const data = await resolveAdvancedPolicyEvaluation({
    userId: body.userId ?? req.user?.id,
    tenantId,
    tenantSlug,
    roleId: body.roleId ?? req.user?.roleId ?? null,
    resourceCode: body.resourceCode ?? null,
    fieldKey: body.fieldKey ?? null,
    at: body.at ? new Date(body.at) : new Date(),
  });
  return res.json({ success: true, data });
});

module.exports = {
  getPolicySummary,
  getFieldSecurity,
  postFieldSecurity,
  patchFieldSecurity,
  deleteFieldSecurity,
  getUserExceptions,
  postUserException,
  patchUserException,
  deleteUserException,
  getScheduledAccess,
  postScheduledAccess,
  patchScheduledAccess,
  deleteScheduledAccess: deleteScheduledAccessHandler,
  postEvaluate,
};
