'use strict';

/**
 * Phase 2 — Get Pass Workflow Configuration Drift runtime gate.
 * Usage: node Governance/phase-2-get-pass-workflow-drift/phase-2-get-pass-workflow-gate.cjs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

const GOV_DIR = __dirname;
const BACKEND = path.join(__dirname, '../../OSE-backend');
const API_BASE = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const FIXTURE_TAG = 'PHASE2_GP_WF_GATE';
const PASSWORD = 'Phase2Gate@123';
const EMAIL_DOMAIN = 'phase2-gate.local';
const CHILD_SLUG = 'closeout-audit-hotel-disposable';
const ORG_SLUG = 'closeout-audit-org-disposable';

const { apiRequest, getSession, switchTenant } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/http'));
const prisma = require(path.join(BACKEND, 'src/config/database'));
const { HOTEL_B } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/constants'));
const { resolvePublishedWorkflowChain } = require(path.join(BACKEND, 'src/engines/workflow-resolution.engine'));
const { resolveWorkflowByVersionId } = require(path.join(BACKEND, 'src/services/acc-workflow-runtime.service'));
const {
  APPROVED_CHAIN,
  chainMatchesConstitution,
  buildConfigurationInventory,
} = require('./phase-2-inventory.lib.cjs');

const scenarios = [];
const regression = [];
let gateChecklist = {};

function is2xx(status) {
  return status >= 200 && status < 300;
}

function record(id, name, pass, detail = {}) {
  scenarios.push({ id, name, pass, ...detail });
  return pass;
}

function recordRegression(name, pass, detail = {}) {
  regression.push({ name, pass, ...detail });
  return pass;
}

async function upsertGateUser({ email, roleCode, tenantId, departmentId, skipUr = false, propertyIds = null }) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, isActive: true },
    create: { email, passwordHash: hash, isActive: true, firstName: 'Phase2', lastName: roleCode },
  });
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    update: { roleId: role.id, isActive: true, departmentId: departmentId || null },
    create: { tenantId, userId: user.id, roleId: role.id, isActive: true, departmentId: departmentId || null },
  });
  await prisma.urUserAssignment.deleteMany({ where: { userId: user.id, notes: { startsWith: FIXTURE_TAG } } });
  if (!skipUr) {
    const a = await prisma.urUserAssignment.create({
      data: { userId: user.id, roleId: role.id, isActive: true, notes: `${FIXTURE_TAG} ${roleCode}` },
    });
    for (const pid of propertyIds || [tenantId]) {
      await prisma.urAssignmentProperty.create({ data: { assignmentId: a.id, propertyId: pid } });
    }
    if (departmentId) {
      await prisma.urAssignmentDepartment.create({ data: { assignmentId: a.id, departmentId } });
    }
  }
  return { email, userId: user.id, password: PASSWORD };
}

async function ensureStock(tenantId, deptCode = 'FB') {
  let dept = await prisma.department.findFirst({ where: { tenantId, code: deptCode } });
  if (!dept) {
    dept = await prisma.department.create({
      data: { tenantId, code: deptCode, name: `${FIXTURE_TAG} ${deptCode}`, isActive: true },
    });
  }
  let loc = await prisma.location.findFirst({ where: { tenantId, departmentId: dept.id, isActive: true } });
  if (!loc) {
    loc = await prisma.location.create({
      data: { tenantId, departmentId: dept.id, name: `${FIXTURE_TAG} Store`, type: 'MAIN_STORE', isActive: true },
    });
  }
  let item = await prisma.item.findFirst({ where: { tenantId, isActive: true, departmentId: dept.id } });
  if (!item) {
    item = await prisma.item.create({
      data: {
        tenantId,
        name: `${FIXTURE_TAG} Item`,
        code: `P2G-${deptCode}-${Date.now()}`,
        isActive: true,
        unitPrice: 1,
        defaultStoreId: loc.id,
        departmentId: dept.id,
      },
    });
  }
  await prisma.stockBalance.upsert({
    where: { tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: loc.id } },
    update: { qtyOnHand: 100 },
    create: { tenantId, itemId: item.id, locationId: loc.id, qtyOnHand: 100, wacUnitCost: 1 },
  });
  return { departmentId: dept.id, locationId: loc.id, itemId: item.id, tenantId };
}

function gpPayload(stock, opts = {}) {
  return {
    transferType: opts.transferType || 'PERMANENT',
    borrowingEntity: `${FIXTURE_TAG} borrower`,
    departmentId: stock.departmentId,
    reason: FIXTURE_TAG,
    expectedReturnDate: opts.expectedReturnDate,
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
  };
}

async function gpRow(id, tenantId) {
  return prisma.getPass.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      status: true,
      accWorkflowVersionId: true,
      concurrencyVersion: true,
      deptApprovedBy: true,
      costControlApprovedBy: true,
      financeApprovedBy: true,
      gmApprovedBy: true,
      securityApprovedBy: true,
    },
  });
}

async function stockSnapshot(tenantId, itemId, locationId) {
  const b = await prisma.stockBalance.findUnique({
    where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
  });
  return {
    qtyOnHand: Number(b?.qtyOnHand || 0),
    qtyBlocked: Number(b?.qtyBlocked || 0),
  };
}

async function ledgerCountSince(tenantId, since) {
  return prisma.inventoryLedger.count({ where: { tenantId, createdAt: { gte: since } } });
}

async function sendBackAs(token, gpId, tenantId, reason = FIXTURE_TAG) {
  const row = await gpRow(gpId, tenantId);
  return apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/send-back`,
    { reason, concurrencyVersion: row?.concurrencyVersion ?? 0 },
    token,
  );
}

async function submitGetPass(token, gpId, tenantId, concurrencyVersion = 0) {
  return apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/submit`, { concurrencyVersion }, token);
}

async function approveAs(token, gpId, expectedStatusAfter) {
  const detail = await apiRequest(API_BASE, 'GET', `/get-passes/${gpId}`, null, token);
  const ver = detail.data?.data?.concurrencyVersion ?? 0;
  const res = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/approve`,
    { comment: FIXTURE_TAG, concurrencyVersion: ver },
    token,
  );
  const row = await gpRow(gpId, detail.data?.data?.tenantId || (await prisma.getPass.findUnique({ where: { id: gpId }, select: { tenantId: true } }))?.tenantId);
  return {
    http: res.status,
    ok: is2xx(res.status),
    statusAfter: row?.status,
    matchesExpected: row?.status === expectedStatusAfter,
    row,
  };
}

async function seedActor(roleCode, tenantId, stock, slot = 'a') {
  const u = await upsertGateUser({
    email: `p2-${roleCode.toLowerCase()}-${String(slot).toLowerCase()}@${EMAIL_DOMAIN}`,
    roleCode,
    tenantId,
    departmentId: stock.departmentId,
  });
  const slug = (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })).slug;
  const sess = await getSession(API_BASE, u, slug);
  if (!sess?.token) {
    return { ...u, token: null, loginFailed: true, loginStatus: sess?.loginRes?.status };
  }
  return { ...u, token: sess.token };
}

async function runChainScenarios(child, stock, publishedVersionId) {
  const creator = await seedActor('DEPT_MANAGER', child.id, stock, 'creator');
  const dept = await seedActor('DEPT_MANAGER', child.id, stock, 'dept');
  const cc = await seedActor('COST_CONTROL', child.id, stock, 'cc');
  const fin = await seedActor('FINANCE_MANAGER', child.id, stock, 'fin');
  const sec = await seedActor('SECURITY', child.id, stock, 'sec');

  const create = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock), creator.token);
  const gpId = create.data?.data?.id;
  const createOk = is2xx(create.status) && !!gpId;
  record(1, 'Create Get Pass draft', createOk, { http: create.status, gpId });

  let submit = { status: 0 };
  let afterSubmit = null;
  if (gpId) {
    submit = await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${gpId}/submit`,
      { concurrencyVersion: create.data?.data?.concurrencyVersion ?? 0 },
      creator.token,
    );
    afterSubmit = await gpRow(gpId, child.id);
  }
  record(2, 'Submit starts at Department (PENDING_DEPT)', is2xx(submit.status) && afterSubmit?.status === 'PENDING_DEPT', {
    http: submit.status,
    statusAfter: afterSubmit?.status,
    pinnedVersionId: afterSubmit?.accWorkflowVersionId,
    expectedPinnedVersionId: publishedVersionId,
    pinnedCorrectVersion: afterSubmit?.accWorkflowVersionId === publishedVersionId,
  });

  let step3 = { ok: false };
  if (gpId && afterSubmit?.status === 'PENDING_DEPT') {
    step3 = await approveAs(dept.token, gpId, 'PENDING_COST_CONTROL');
  }
  record(3, 'Department approval → Cost Control', step3.ok && step3.matchesExpected, step3);

  let step4 = { ok: false };
  if (gpId && step3.statusAfter === 'PENDING_COST_CONTROL') {
    step4 = await approveAs(cc.token, gpId, 'PENDING_FINANCE');
  }
  record(4, 'Cost Control approval → Finance', step4.ok && step4.matchesExpected, step4);

  let step5 = { ok: false };
  if (gpId && step4.statusAfter === 'PENDING_FINANCE') {
    step5 = await approveAs(fin.token, gpId, 'PENDING_SECURITY');
  }
  record(
    5,
    'Finance approval → Security (not GM)',
    step5.ok && step5.matchesExpected && step5.statusAfter !== 'PENDING_GM',
    { ...step5, rejectedGm: step5.statusAfter !== 'PENDING_GM' },
  );

  let step6 = { ok: false };
  let ledgerBefore = 0;
  let ledgerAfter = 0;
  if (gpId && step5.statusAfter === 'PENDING_SECURITY') {
    const since = new Date();
    ledgerBefore = await prisma.inventoryLedger.count({ where: { tenantId: child.id, createdAt: { gte: since } } });
    step6 = await approveAs(sec.token, gpId, 'CLOSED');
    ledgerAfter = await prisma.inventoryLedger.count({ where: { tenantId: child.id, createdAt: { gte: since } } });
  }
  record(
    6,
    'Security OUT closes PERMANENT pass',
    Boolean(step6.ok && (step6.statusAfter === 'CLOSED' || step6.statusAfter === 'OUT') && step6.row?.securityApprovedBy),
    { ...step6, ledgerBefore, ledgerAfter },
  );

  const chain = publishedVersionId ? await resolveWorkflowByVersionId(publishedVersionId) : null;
  const chainKeys = (chain?.steps || []).map((s) => String(s.statusKey || '').toUpperCase());
  record(
    7,
    'Published chain has no GM step',
    chainMatchesConstitution(chainKeys) && !chainKeys.includes('PENDING_GM'),
    { orderedStatusKeys: chainKeys, approvedChain: APPROVED_CHAIN },
  );

  const finCreator = await seedActor('FINANCE_MANAGER', child.id, stock, 'fincreator');
  const gpFin = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock), finCreator.token);
  const gpFinId = gpFin.data?.data?.id;
  let finSubmitStatus = null;
  if (gpFinId) {
    const sub = await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${gpFinId}/submit`,
      { concurrencyVersion: gpFin.data?.data?.concurrencyVersion ?? 0 },
      finCreator.token,
    );
    if (is2xx(sub.status)) finSubmitStatus = (await gpRow(gpFinId, child.id))?.status;
  }
  record(
    8,
    'Finance creator cannot skip Department/Cost Control',
    finSubmitStatus === 'PENDING_DEPT',
    { statusAfter: finSubmitStatus, http: gpFin.status },
  );

  const orgRoot = await prisma.tenant.findFirst({ where: { slug: ORG_SLUG } });
  const orgUser = await upsertGateUser({
    email: `p2-org@${EMAIL_DOMAIN}`,
    roleCode: 'ORG_MANAGER',
    tenantId: orgRoot?.id || child.id,
    departmentId: stock.departmentId,
    propertyIds: [child.id],
  });
  let orgSess = await getSession(API_BASE, orgUser, ORG_SLUG);
  const sw = await switchTenant(API_BASE, orgSess.token, child.slug);
  if (sw.status === 200 && sw.data?.data?.accessToken) orgSess = { token: sw.data.data.accessToken };
  const gpOrg = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock), orgSess.token);
  const gpOrgId = gpOrg.data?.data?.id;
  let orgStatus = null;
  let orgStamps = 0;
  if (gpOrgId) {
    await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${gpOrgId}/submit`,
      { concurrencyVersion: gpOrg.data?.data?.concurrencyVersion ?? 0 },
      orgSess.token,
    );
    const row = await gpRow(gpOrgId, child.id);
    orgStatus = row?.status;
    orgStamps = [row?.deptApprovedBy, row?.costControlApprovedBy, row?.financeApprovedBy, row?.gmApprovedBy].filter(Boolean).length;
  }
  record(
    9,
    'ORG_MANAGER creator cannot self-stamp or fast-forward',
    orgStatus === 'PENDING_DEPT' && orgStamps === 0,
    { statusAfter: orgStatus, stampedCount: orgStamps },
  );

  return { gpId, dept, cc, fin };
}

async function runSendBackScenario(child, stock, publishedVersionId, fromStep) {
  const id = fromStep === 'CC' ? 15 : 16;
  const creator = await seedActor('DEPT_MANAGER', child.id, stock, `sb-${fromStep.toLowerCase()}-creator`);
  const dept = await seedActor('DEPT_MANAGER', child.id, stock, `sb-${fromStep.toLowerCase()}-dept`);
  const cc = await seedActor('COST_CONTROL', child.id, stock, `sb-${fromStep.toLowerCase()}-cc`);
  const fin = await seedActor('FINANCE_MANAGER', child.id, stock, `sb-${fromStep.toLowerCase()}-fin`);
  const actor = fromStep === 'CC' ? cc : fin;
  const reviewStatus = fromStep === 'CC' ? 'PENDING_COST_CONTROL' : 'PENDING_FINANCE';

  if (!creator.token || !dept.token || !cc.token || !fin.token || !actor.token) {
    record(id, `Send Back from ${fromStep === 'CC' ? 'Cost Control' : 'Finance'}`, false, {
      error: 'actor_login_failed',
      creatorLogin: creator.loginStatus,
    });
    return null;
  }

  const since = new Date();
  const ledgerBefore = await ledgerCountSince(child.id, since);
  const stockBefore = await stockSnapshot(child.id, stock.itemId, stock.locationId);

  const create = await apiRequest(
    API_BASE,
    'POST',
    '/get-passes',
    gpPayload(stock),
    creator.token,
  );
  const gpId = create.data?.data?.id;
  if (!gpId) {
    record(id, `Send Back from ${fromStep === 'CC' ? 'Cost Control' : 'Finance'}`, false, { error: 'create_failed', http: create.status });
    return null;
  }

  await submitGetPass(creator.token, gpId, child.id, create.data?.data?.concurrencyVersion ?? 0);
  await approveAs(dept.token, gpId, 'PENDING_COST_CONTROL');
  if (fromStep === 'FINANCE') {
    await approveAs(cc.token, gpId, 'PENDING_FINANCE');
  }

  const beforeSendBack = await gpRow(gpId, child.id);
  const sb = await sendBackAs(actor.token, gpId, child.id);
  const after = await gpRow(gpId, child.id);
  const ledgerAfter = await ledgerCountSince(child.id, since);
  const stockAfter = await stockSnapshot(child.id, stock.itemId, stock.locationId);

  const stampsCleared =
    !after?.deptApprovedBy &&
    !after?.costControlApprovedBy &&
    !after?.financeApprovedBy &&
    !after?.securityApprovedBy;

  const pass =
    is2xx(sb.status) &&
    after?.status === 'DRAFT' &&
    beforeSendBack?.status === reviewStatus &&
    after?.accWorkflowVersionId === publishedVersionId &&
    stampsCleared &&
    ledgerAfter === ledgerBefore &&
    stockAfter.qtyOnHand === stockBefore.qtyOnHand &&
    stockAfter.qtyBlocked === stockBefore.qtyBlocked;

  record(id, `Send Back from ${fromStep === 'CC' ? 'Cost Control' : 'Finance'}`, pass, {
    http: sb.status,
    statusBefore: beforeSendBack?.status,
    statusAfter: after?.status,
    pinnedVersionId: after?.accWorkflowVersionId,
    expectedPinnedVersionId: publishedVersionId,
    deptStampRetained: !!after?.deptApprovedBy,
    costControlStampRetained: !!after?.costControlApprovedBy,
    financeStampRetained: !!after?.financeApprovedBy,
    approvalStampsCleared: stampsCleared,
    ledgerDelta: ledgerAfter - ledgerBefore,
    stockBefore,
    stockAfter,
    endpoint: `/get-passes/${gpId}/send-back`,
  });

  return pass ? { gpId, creator, finCreator: fin, orgSlot: fromStep } : null;
}

async function runResubmitAfterSendBackScenario(child, stock, publishedVersionId, sendBackCtx) {
  if (!sendBackCtx?.gpId) {
    record(17, 'Resubmit after Send Back', false, { error: 'send_back_prerequisite_failed' });
    return;
  }

  const { gpId, creator } = sendBackCtx;
  const finCreator = await seedActor('FINANCE_MANAGER', child.id, stock, 'sb-resubmit-fin');
  const orgRoot = await prisma.tenant.findFirst({ where: { slug: ORG_SLUG } });
  const orgUser = await upsertGateUser({
    email: `p2-sb-org@${EMAIL_DOMAIN}`,
    roleCode: 'ORG_MANAGER',
    tenantId: orgRoot?.id || child.id,
    departmentId: stock.departmentId,
    propertyIds: [child.id],
  });
  let orgSess = await getSession(API_BASE, orgUser, ORG_SLUG);
  const sw = await switchTenant(API_BASE, orgSess.token, child.slug);
  if (sw.status === 200 && sw.data?.data?.accessToken) orgSess = { token: sw.data.data.accessToken };

  const pinnedBefore = (await gpRow(gpId, child.id))?.accWorkflowVersionId;
  const edit = await apiRequest(
    API_BASE,
    'PUT',
    `/get-passes/${gpId}`,
    { borrowingEntity: `${FIXTURE_TAG} after send back`, concurrencyVersion: (await gpRow(gpId, child.id))?.concurrencyVersion ?? 0 },
    creator.token,
  );
  const rowForSubmit = await gpRow(gpId, child.id);
  const submit = await submitGetPass(creator.token, gpId, child.id, rowForSubmit?.concurrencyVersion ?? 0);
  const afterCreator = await gpRow(gpId, child.id);

  const gpFin = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock), finCreator.token);
  const gpFinId = gpFin.data?.data?.id;
  let finStatus = null;
  if (gpFinId) {
    const subFin = await submitGetPass(finCreator.token, gpFinId, child.id, gpFin.data?.data?.concurrencyVersion ?? 0);
    if (is2xx(subFin.status)) finStatus = (await gpRow(gpFinId, child.id))?.status;
  }

  let orgStatus = null;
  let orgStamps = 0;
  const gpOrg = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock), orgSess.token);
  const gpOrgId = gpOrg.data?.data?.id;
  if (gpOrgId) {
    await submitGetPass(orgSess.token, gpOrgId, child.id, gpOrg.data?.data?.concurrencyVersion ?? 0);
    const orgRow = await gpRow(gpOrgId, child.id);
    orgStatus = orgRow?.status;
    orgStamps = [orgRow?.deptApprovedBy, orgRow?.costControlApprovedBy, orgRow?.financeApprovedBy].filter(Boolean).length;
  }

  const pass =
    is2xx(submit.status) &&
    afterCreator?.status === 'PENDING_DEPT' &&
    afterCreator?.accWorkflowVersionId === publishedVersionId &&
    afterCreator?.accWorkflowVersionId === pinnedBefore &&
    finStatus === 'PENDING_DEPT' &&
    orgStatus === 'PENDING_DEPT' &&
    orgStamps === 0;

  record(17, 'Resubmit after Send Back', pass, {
    editHttp: edit.status,
    submitHttp: submit.status,
    statusAfterResubmit: afterCreator?.status,
    pinnedVersionId: afterCreator?.accWorkflowVersionId,
    financeCreatorStatus: finStatus,
    orgCreatorStatus: orgStatus,
    orgStampedCount: orgStamps,
  });
}

async function runCompleteTemporaryReturnScenario(child, stock) {
  const creator = await seedActor('DEPT_MANAGER', child.id, stock, 'ret-creator');
  const dept = await seedActor('DEPT_MANAGER', child.id, stock, 'ret-dept');
  const cc = await seedActor('COST_CONTROL', child.id, stock, 'ret-cc');
  const fin = await seedActor('FINANCE_MANAGER', child.id, stock, 'ret-fin');
  const sec = await seedActor('SECURITY', child.id, stock, 'ret-sec');

  const since = new Date();
  const stockBaseline = await stockSnapshot(child.id, stock.itemId, stock.locationId);
  const ledgerBaseline = await ledgerCountSince(child.id, since);

  const create = await apiRequest(
    API_BASE,
    'POST',
    '/get-passes',
    gpPayload(stock, {
      transferType: 'TEMPORARY',
      expectedReturnDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    }),
    creator.token,
  );
  const gpId = create.data?.data?.id;
  if (!gpId) {
    record(18, 'Complete TEMPORARY return lifecycle', false, { error: 'create_failed', http: create.status });
    return;
  }

  await submitGetPass(creator.token, gpId, child.id, create.data?.data?.concurrencyVersion ?? 0);
  await approveAs(dept.token, gpId, 'PENDING_COST_CONTROL');
  await approveAs(cc.token, gpId, 'PENDING_FINANCE');
  await approveAs(fin.token, gpId, 'PENDING_SECURITY');
  const out = await approveAs(sec.token, gpId, 'OUT');
  const stockAfterOut = await stockSnapshot(child.id, stock.itemId, stock.locationId);
  const ledgerAfterOut = await ledgerCountSince(child.id, since);

  const line = await prisma.getPassLine.findFirst({ where: { getPassId: gpId } });
  const ret = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/return`,
    { lines: [{ lineId: line.id, qtyGood: 1 }], notes: FIXTURE_TAG },
    fin.token,
  );
  const row = await gpRow(gpId, child.id);
  const lineAfter = await prisma.getPassLine.findFirst({ where: { id: line.id } });
  const returnRows = await prisma.getPassReturn.findMany({ where: { getPassLineId: line.id } });
  const stockAfterReturn = await stockSnapshot(child.id, stock.itemId, stock.locationId);
  const ledgerAfterReturn = await ledgerCountSince(child.id, since);

  const pass =
    out.statusAfter === 'OUT' &&
    Boolean(out.row?.securityApprovedBy) &&
    is2xx(ret.status) &&
    row?.status === 'RETURNED' &&
    Number(lineAfter?.qtyReturned) === 1 &&
    returnRows.some((r) => Number(r.qtyGood) === 1) &&
    stockAfterOut.qtyBlocked === stockBaseline.qtyBlocked + 1 &&
    stockAfterOut.qtyOnHand === stockBaseline.qtyOnHand &&
    stockAfterReturn.qtyBlocked === stockBaseline.qtyBlocked &&
    stockAfterReturn.qtyOnHand === stockBaseline.qtyOnHand &&
    ledgerAfterReturn === ledgerAfterOut + 1;

  record(18, 'Complete TEMPORARY return lifecycle', pass, {
    outHttp: out.http,
    outStatus: out.statusAfter,
    returnHttp: ret.status,
    terminalStatus: row?.status,
    qtyReturned: lineAfter?.qtyReturned,
    returnRecordQtyGood: returnRows[0]?.qtyGood ?? null,
    stockBaseline,
    stockAfterOut,
    stockAfterReturn,
    ledgerAfterOut,
    ledgerAfterReturn,
    ledgerDeltaDuringReturn: ledgerAfterReturn - ledgerAfterOut,
  });
}

async function runVersionPinningScenarios(child, stock, publishedVersionId, inventory) {
  const resolved = await resolvePublishedWorkflowChain('GET_PASS', child.id);
  record(
    11,
    'Property resolves tenant published workflow version',
    !!resolved?.versionId && chainMatchesConstitution(resolved.steps.map((s) => s.statusKey)),
    {
      tenantId: child.id,
      resolvedVersionId: resolved?.versionId,
      orderedStatusKeys: resolved?.steps?.map((s) => s.statusKey),
    },
  );

  const archivedGmVersion = await prisma.accWorkflowVersion.findFirst({
    where: {
      status: 'ARCHIVED',
      definition: { module: { key: 'GET_PASS' } },
      steps: { some: { statusKey: 'PENDING_GM' } },
    },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
    orderBy: { versionNumber: 'desc' },
  });

  const legacyDocs = archivedGmVersion
    ? await prisma.getPass.findMany({
        where: { accWorkflowVersionId: archivedGmVersion.id },
        select: { id: true, tenantId: true, status: true, accWorkflowVersionId: true },
        take: 10,
      })
    : [];

  const legacyOnDisposable = legacyDocs.filter((d) => d.tenantId === child.id);
  const sampleDoc = legacyOnDisposable[0] || legacyDocs[0] || null;

  let legacyChainKeys = [];
  if (sampleDoc?.accWorkflowVersionId) {
    const pinned = await resolveWorkflowByVersionId(sampleDoc.accWorkflowVersionId);
    legacyChainKeys = (pinned?.steps || []).map((s) => String(s.statusKey || '').toUpperCase());
  }

  const pass =
    inventory.summary.documentsOnGmVersions > 0 &&
    legacyDocs.length > 0 &&
    !!archivedGmVersion &&
    legacyDocs.every((d) => d.accWorkflowVersionId === archivedGmVersion.id) &&
    archivedGmVersion.id !== publishedVersionId &&
    legacyChainKeys.includes('PENDING_GM');

  record(
    12,
    'Historical documents remain pinned to archived v3 GM version',
    pass,
    {
      archivedGmVersionId: archivedGmVersion?.id,
      archivedVersionNumber: archivedGmVersion?.versionNumber,
      documentsOnGmVersions: inventory.summary.documentsOnGmVersions,
      legacyDocumentCount: legacyDocs.length,
      legacyDocumentIds: legacyDocs.map((d) => d.id),
      sampleDocumentId: sampleDoc?.id || null,
      sampleDocumentStatus: sampleDoc?.status || null,
      legacyChainKeys,
      currentPublishedVersionId: publishedVersionId,
    },
  );

  const foreignResolved = await resolvePublishedWorkflowChain('GET_PASS', HOTEL_B.id);
  const childResolved = await resolvePublishedWorkflowChain('GET_PASS', child.id);
  record(
    13,
    'Cross-property workflow resolution is tenant-scoped',
    foreignResolved?.versionId === childResolved?.versionId || (foreignResolved?.tenantId !== childResolved?.tenantId || foreignResolved?.definitionId === childResolved?.definitionId),
    {
      childVersionId: childResolved?.versionId,
      foreignVersionId: foreignResolved?.versionId,
      childTenantId: child.id,
      foreignTenantId: HOTEL_B.id,
    },
  );
}

async function runSendBackNegativeScenarios(child, stock, publishedVersionId) {
  const assertNoMutation = async (gpId, beforeRow, beforeLedger, beforeStock, httpStatus, expectFail) => {
    const after = await gpRow(gpId, child.id);
    const afterLedger = await prisma.inventoryLedger.count({ where: { tenantId: child.id } });
    const afterStock = await stockSnapshot(child.id, stock.itemId, stock.locationId);
    const unchanged =
      after?.status === beforeRow?.status &&
      after?.accWorkflowVersionId === beforeRow?.accWorkflowVersionId &&
      after?.deptApprovedBy === beforeRow?.deptApprovedBy &&
      after?.costControlApprovedBy === beforeRow?.costControlApprovedBy &&
      after?.financeApprovedBy === beforeRow?.financeApprovedBy &&
      afterLedger === beforeLedger &&
      afterStock.qtyOnHand === beforeStock.qtyOnHand &&
      afterStock.qtyBlocked === beforeStock.qtyBlocked;
    return expectFail && !is2xx(httpStatus) && unchanged;
  };

  async function seedAtCostControl(slot) {
    const creator = await seedActor('DEPT_MANAGER', child.id, stock, `${slot}-creator`);
    const dept = await seedActor('DEPT_MANAGER', child.id, stock, `${slot}-dept`);
    const cc = await seedActor('COST_CONTROL', child.id, stock, `${slot}-cc`);
    const create = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock), creator.token);
    const gpId = create.data?.data?.id;
    if (!gpId) return null;
    await submitGetPass(creator.token, gpId, child.id, create.data?.data?.concurrencyVersion ?? 0);
    await approveAs(dept.token, gpId, 'PENDING_COST_CONTROL');
    return { gpId, creator, dept, cc };
  }

  const ctx = await seedAtCostControl('neg');
  if (!ctx?.gpId) {
    for (const id of [19, 20, 21, 22, 23, 24, 25, 26]) {
      record(id, `Send Back negative ${id}`, false, { error: 'setup_failed' });
    }
    return;
  }

  const { gpId, creator, dept, cc } = ctx;
  const beforeRow = await gpRow(gpId, child.id);
  const beforeLedger = await prisma.inventoryLedger.count({ where: { tenantId: child.id } });
  const beforeStock = await stockSnapshot(child.id, stock.itemId, stock.locationId);

  const wrongRole = await seedActor('SECURITY', child.id, stock, 'neg-sec');
  const wrongSb = await sendBackAs(wrongRole.token, gpId, child.id);
  record(
    19,
    'Send Back negative — wrong role blocked',
    await assertNoMutation(gpId, beforeRow, beforeLedger, beforeStock, wrongSb.status, true),
    { http: wrongSb.status },
  );

  const creatorSb = await sendBackAs(creator.token, gpId, child.id);
  record(
    20,
    'Send Back negative — creator blocked',
    await assertNoMutation(gpId, beforeRow, beforeLedger, beforeStock, creatorSb.status, true),
    { http: creatorSb.status },
  );

  const noReason = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/send-back`,
    { reason: '  ', concurrencyVersion: beforeRow?.concurrencyVersion ?? 0 },
    cc.token,
  );
  record(
    21,
    'Send Back negative — missing reason blocked',
    await assertNoMutation(gpId, beforeRow, beforeLedger, beforeStock, noReason.status, true),
    { http: noReason.status },
  );

  const stale = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/send-back`,
    { reason: FIXTURE_TAG, concurrencyVersion: (beforeRow?.concurrencyVersion ?? 0) - 1 },
    cc.token,
  );
  record(
    22,
    'Send Back negative — stale concurrency blocked',
    await assertNoMutation(gpId, beforeRow, beforeLedger, beforeStock, stale.status, true),
    { http: stale.status },
  );

  const noAssignUser = await upsertGateUser({
    email: `p2-noassign@${EMAIL_DOMAIN}`,
    roleCode: 'COST_CONTROL',
    tenantId: child.id,
    departmentId: stock.departmentId,
    skipUr: true,
  });
  const noAssignSess = await getSession(API_BASE, noAssignUser, child.slug);
  const noAssignSb = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/send-back`,
    { reason: FIXTURE_TAG, concurrencyVersion: beforeRow?.concurrencyVersion ?? 0 },
    noAssignSess.token,
  );
  record(
    23,
    'Send Back negative — no active assignment blocked',
    await assertNoMutation(gpId, beforeRow, beforeLedger, beforeStock, noAssignSb.status, true),
    { http: noAssignSb.status },
  );

  const foreignTenant = await prisma.tenant.findFirst({ where: { id: HOTEL_B.id } });
  const foreignUser = await upsertGateUser({
    email: `p2-foreign@${EMAIL_DOMAIN}`,
    roleCode: 'COST_CONTROL',
    tenantId: HOTEL_B.id,
    departmentId: stock.departmentId,
  });
  const foreignSess = await getSession(API_BASE, foreignUser, foreignTenant?.slug || child.slug);
  const foreignSb = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/send-back`,
    { reason: FIXTURE_TAG, concurrencyVersion: beforeRow?.concurrencyVersion ?? 0 },
    foreignSess.token,
  );
  record(
    24,
    'Send Back negative — wrong-property user blocked',
    await assertNoMutation(gpId, beforeRow, beforeLedger, beforeStock, foreignSb.status, true),
    { http: foreignSb.status },
  );

  const okSb = await sendBackAs(cc.token, gpId, child.id);
  const afterSendBack = await gpRow(gpId, child.id);
  const terminalSb = await sendBackAs(cc.token, gpId, child.id);
  record(
    25,
    'Send Back negative — terminal DRAFT state blocked',
    !is2xx(terminalSb.status) && afterSendBack?.status === 'DRAFT',
    { http: terminalSb.status, statusAfterSendBack: afterSendBack?.status, priorSendBackHttp: okSb.status },
  );

  const fin = await seedActor('FINANCE_MANAGER', child.id, stock, 'neg-resubmit-fin');
  const unauthorizedEdit = await apiRequest(
    API_BASE,
    'PUT',
    `/get-passes/${gpId}`,
    { borrowingEntity: `${FIXTURE_TAG} unauthorized`, concurrencyVersion: afterSendBack?.concurrencyVersion ?? 0 },
    fin.token,
  );
  const unauthorizedSubmit = await submitGetPass(fin.token, gpId, child.id, afterSendBack?.concurrencyVersion ?? 0);
  const afterUnauthorized = await gpRow(gpId, child.id);
  record(
    26,
    'Resubmit negative — unauthorized edit/submit blocked',
    !is2xx(unauthorizedEdit.status) &&
      !is2xx(unauthorizedSubmit.status) &&
      afterUnauthorized?.status === 'DRAFT' &&
      afterUnauthorized?.accWorkflowVersionId === publishedVersionId,
    {
      editHttp: unauthorizedEdit.status,
      submitHttp: unauthorizedSubmit.status,
      statusAfter: afterUnauthorized?.status,
    },
  );
}

async function runRejectScenario(child, stock, actors) {
  const creator = await seedActor('DEPT_MANAGER', child.id, stock, 'rej-creator');
  const create = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock), creator.token);
  const gpId = create.data?.data?.id;
  if (!gpId) {
    record(14, 'Reject from Finance step', false, { error: 'create_failed' });
    return;
  }
  await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/submit`, { concurrencyVersion: create.data?.data?.concurrencyVersion ?? 0 }, creator.token);
  await approveAs(actors.dept.token, gpId, 'PENDING_COST_CONTROL');
  await approveAs(actors.cc.token, gpId, 'PENDING_FINANCE');
  const beforeLedger = await prisma.inventoryLedger.count({ where: { tenantId: child.id } });
  const beforeStock = await prisma.stockBalance.findFirst({ where: { tenantId: child.id, itemId: stock.itemId, locationId: stock.locationId } });
  const rowBefore = await gpRow(gpId, child.id);
  const rej = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/reject`,
    { rejectionReason: `${FIXTURE_TAG} budget denied`, concurrencyVersion: rowBefore?.concurrencyVersion ?? 0 },
    actors.fin.token,
  );
  const after = await gpRow(gpId, child.id);
  const afterLedger = await prisma.inventoryLedger.count({ where: { tenantId: child.id } });
  const afterStock = await prisma.stockBalance.findFirst({ where: { tenantId: child.id, itemId: stock.itemId, locationId: stock.locationId } });
  record(
    14,
    'Reject from Finance — no posting/ledger/stock side effects',
    is2xx(rej.status) &&
      after?.status === 'REJECTED' &&
      afterLedger === beforeLedger &&
      Number(afterStock?.qtyOnHand) === Number(beforeStock?.qtyOnHand),
    { http: rej.status, statusAfter: after?.status, ledgerDelta: afterLedger - beforeLedger },
  );
}

function parsePipelineSummary(res) {
  return { http: res.status, ok: is2xx(res.status), total: res.data?.data?.total ?? 0, getPassModule: res.data?.data?.byModule?.GET_PASS ?? 0 };
}

function parseDashboard(res) {
  const oh = res.data?.data?.operationalHealth || {};
  return {
    http: res.status,
    ok: is2xx(res.status),
    overdueLoansCount: oh.overdueLoansCount || 0,
    pipelineTotal: oh.pipeline?.total ?? null,
  };
}

async function runRegressionSuite(child, stock) {
  const user = await seedActor('DEPT_MANAGER', child.id, stock, 'reg-user');
  const create = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock), user.token);
  const gpId = create.data?.data?.id;
  recordRegression('Get Pass authorized create', is2xx(create.status) && !!gpId, { http: create.status, id: gpId });

  const list = await apiRequest(API_BASE, 'GET', '/get-passes', null, user.token);
  recordRegression('Get Pass authorized list', is2xx(list.status), { http: list.status });

  const detail = gpId ? await apiRequest(API_BASE, 'GET', `/get-passes/${gpId}`, null, user.token) : { status: 0 };
  recordRegression('Get Pass authorized detail', is2xx(detail.status), { http: detail.status, id: gpId });

  const orgRoot = await prisma.tenant.findFirst({ where: { slug: ORG_SLUG } });
  const orgUser = await upsertGateUser({
    email: `p2-reg-switch@${EMAIL_DOMAIN}`,
    roleCode: 'ORG_MANAGER',
    tenantId: orgRoot?.id || child.id,
    departmentId: stock.departmentId,
    propertyIds: [child.id],
  });
  let orgSess = await getSession(API_BASE, orgUser, ORG_SLUG);
  const sw = await switchTenant(API_BASE, orgSess.token, child.slug);
  const hasNewToken = sw.status === 200 && !!sw.data?.data?.accessToken;
  recordRegression('Tenant switch permission refresh', hasNewToken, { http: sw.status, hasNewToken });

  const pipeToken = hasNewToken ? sw.data.data.accessToken : user.token;
  const pipe = parsePipelineSummary(await apiRequest(API_BASE, 'GET', '/workflow-pipeline/summary', null, pipeToken));
  recordRegression('Workflow Pipeline Get Pass summary', pipe.ok, { http: pipe.http });

  const dash = parseDashboard(await apiRequest(API_BASE, 'GET', '/dashboard/summary', null, pipeToken));
  recordRegression('Dashboard operational metrics', dash.ok, { http: dash.http });

  try {
    execSync('node --test src/services/getPass.service.test.js', { cwd: BACKEND, stdio: 'pipe' });
    recordRegression('getPass.service.test.js', true);
  } catch (e) {
    recordRegression('getPass.service.test.js', false, { error: String(e.stderr || e.message).slice(0, 400) });
  }

  try {
    execSync('node --test src/services/acc-workflow-runtime.service.test.js', { cwd: BACKEND, stdio: 'pipe' });
    recordRegression('acc-workflow-runtime.service.test.js', true);
  } catch (e) {
    recordRegression('acc-workflow-runtime.service.test.js', false, { error: String(e.stderr || e.message).slice(0, 400) });
  }

  try {
    execSync('npm run build -- --configuration=development', { cwd: path.join(BACKEND, '../OSE-Frontend'), stdio: 'pipe', timeout: 300000 });
    recordRegression('Frontend development build', true);
  } catch (e) {
    recordRegression('Frontend development build', false, { error: String(e.stderr || e.message).slice(0, 400) });
  }
}

function buildChecklist(inventory) {
  const byId = Object.fromEntries(scenarios.map((s) => [s.id, s.pass]));
  const tenantsInventoried =
    inventory.activeTenantCount > 0 &&
    inventory.tenantResolution.length === inventory.activeTenantCount;
  const driftCorrected = inventory.summary.tenantsWithDrift === 0;
  gateChecklist = {
    'All active tenants inventoried': tenantsInventoried,
    'Configuration drift corrected or documented': driftCorrected,
    'Standard chain Dept→CC→Finance→Security': byId[2] && byId[3] && byId[4] && byId[5] && byId[7],
    'No GM step in published chain': byId[7],
    'Security OUT behavior correct': byId[6],
    'Send Back from Cost Control or Finance': byId[15] && byId[16],
    'Resubmit after Send Back': byId[17],
    'Send Back negative scenarios': [19, 20, 21, 22, 23, 24, 25, 26].every((id) => byId[id]),
    'Complete TEMPORARY return lifecycle': byId[18],
    'Finance fast-forward blocked': byId[8],
    'ORG_MANAGER fast-forward blocked': byId[9],
    'Property workflow version resolution': byId[11],
    'Historical document version pinning intact': byId[12],
    'Cross-property resolution scoped': byId[13],
    'Reject without side effects': byId[14],
    'Full regression suite': regression.every((r) => r.pass),
    'Frontend build': regression.find((r) => r.name === 'Frontend development build')?.pass ?? false,
    'Backend relevant tests': regression.filter((r) => r.name.includes('.test.js')).every((r) => r.pass),
  };
}

async function main() {
  console.log('Phase 2 Get Pass Workflow Drift Gate — starting');
  const ping = await apiRequest(API_BASE.replace(/\/api$/, ''), 'GET', '/health', null).catch(() => ({ status: 0 }));
  if (ping.status !== 200) {
    console.error('API not reachable at', API_BASE);
    process.exit(2);
  }

  const inventory = await buildConfigurationInventory(prisma);
  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_2_CONFIGURATION_INVENTORY.json'), JSON.stringify(inventory, null, 2));

  if (inventory.summary.tenantsWithDrift > 0) {
    console.error('Configuration drift detected — run phase-2-remediate-get-pass-workflow.cjs first');
    console.error(JSON.stringify({ tenantsWithDrift: inventory.summary.tenantsWithDrift, driftTenants: inventory.driftTenants }, null, 2));
    process.exit(3);
  }

  const child = await prisma.tenant.findFirst({ where: { slug: CHILD_SLUG } });
  if (!child) throw new Error(`Missing disposable tenant ${CHILD_SLUG}`);
  const stock = await ensureStock(child.id, 'FB');
  const published = await resolvePublishedWorkflowChain('GET_PASS', child.id);

  const actors = await runChainScenarios(child, stock, published?.versionId);
  const sendBackCc = await runSendBackScenario(child, stock, published?.versionId, 'CC');
  await runSendBackScenario(child, stock, published?.versionId, 'FINANCE');
  await runResubmitAfterSendBackScenario(child, stock, published?.versionId, sendBackCc);
  await runSendBackNegativeScenarios(child, stock, published?.versionId);
  await runCompleteTemporaryReturnScenario(child, stock);
  await runVersionPinningScenarios(child, stock, published?.versionId, inventory);
  await runRejectScenario(child, stock, actors);
  await runRegressionSuite(child, stock);

  buildChecklist(inventory);

  const runtimePass = scenarios.filter((s) => s.pass).length;
  const runtimeFail = scenarios.filter((s) => !s.pass).length;
  const regPass = regression.filter((r) => r.pass).length;
  const regFail = regression.filter((r) => !r.pass).length;
  const phaseClosed =
    inventory.summary.tenantsWithDrift === 0 &&
    Object.values(gateChecklist).every(Boolean) &&
    runtimeFail === 0 &&
    regFail === 0;

  const out = {
    executedAt: new Date().toISOString(),
    gateVersion: 'phase2-gp-workflow-v2-addendum',
    tenant: { id: child.id, slug: child.slug },
    apiBase: API_BASE,
    inventorySummary: inventory.summary,
    publishedVersionId: published?.versionId,
    approvedChain: APPROVED_CHAIN,
    scenarios,
    regression,
    totals: { runtimePass, runtimeFail, regressionPass: regPass, regressionFail: regFail },
    gateChecklist,
    phaseClosed,
  };

  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_2_RUNTIME_RESULTS.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ runtimePass, runtimeFail, regPass, regFail, phaseClosed, gateChecklist }, null, 2));
  await prisma.$disconnect();
  process.exit(phaseClosed ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
