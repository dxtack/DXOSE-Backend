'use strict';

/**
 * Phase 1 — Assignment & Scope Enforcement runtime gate (corrected verification).
 * Usage: node Governance/phase-1-assignment-scope/phase-1-assignment-scope-gate.cjs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

const GOV_DIR = __dirname;
const BACKEND = path.join(__dirname, '../../OSE-backend');
const API_BASE = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const FIXTURE_TAG = 'PHASE1_SCOPE_GATE';
const PASSWORD = 'Phase1Gate@123';
const EMAIL_DOMAIN = 'phase1-gate.local';
const CHILD_SLUG = 'closeout-audit-hotel-disposable';
const ORG_SLUG = 'closeout-audit-org-disposable';

const { apiRequest, getSession, switchTenant } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/http'));
const prisma = require(path.join(BACKEND, 'src/config/database'));
const { HOTEL_A, HOTEL_B } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/constants'));

const scenarios = [];
const regression = [];
let gateChecklist = {};
let scopeFixtures = null;

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

function parsePipelineList(res) {
  const http = res.status;
  const payload = res.data?.data;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return {
    http,
    ok: is2xx(http),
    items,
    documentIds: items.map((i) => i.documentId).filter(Boolean),
    total: payload?.meta?.total ?? payload?.summary?.total ?? items.length,
    apiFailure: !is2xx(http),
  };
}

function parsePipelineSummary(res) {
  const http = res.status;
  const payload = res.data?.data;
  return {
    http,
    ok: is2xx(http),
    total: payload?.total ?? 0,
    apiFailure: !is2xx(http),
  };
}

function parsePipelineAlerts(res) {
  const http = res.status;
  const payload = res.data?.data;
  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
  return {
    http,
    ok: is2xx(http),
    items,
    documentIds: items.map((i) => i.documentId).filter(Boolean),
    apiFailure: !is2xx(http),
  };
}

function parseDashboard(res) {
  const http = res.status;
  const oh = res.data?.data?.operationalHealth || {};
  const detailIds = (arr) => (Array.isArray(arr) ? arr.map((x) => x.id).filter(Boolean) : []);
  const allDetailIds = [
    ...detailIds(oh.details?.openReqs),
    ...detailIds(oh.details?.pendingTransfers),
    ...detailIds(oh.details?.pendingGrns),
    ...detailIds(oh.details?.pendingLoss),
    ...detailIds(oh.details?.overdueLoans),
  ];
  const total =
    (oh.openReqsCount || 0) +
    (oh.pendingTransfersCount || 0) +
    (oh.pendingGrnsCount || 0) +
    (oh.pendingLossCount || 0) +
    (oh.overdueLoansCount || 0);
  return {
    http,
    ok: is2xx(http),
    total,
    allDetailIds,
    overdueLoanIds: detailIds(oh.details?.overdueLoans),
    overdueLoansCount: oh.overdueLoansCount || 0,
    pipelineTotal: oh.pipeline?.total ?? null,
    apiFailure: !is2xx(http),
  };
}

async function loadDisposableTenant() {
  const child = await prisma.tenant.findFirst({ where: { slug: CHILD_SLUG } });
  if (!child) throw new Error(`Run 00e-disposable-org-fixture.js first — missing ${CHILD_SLUG}`);
  return child;
}

async function upsertGateUser({ email, roleCode, tenantId, departmentId, skipUr = false, urActive = true, propertyIds = null }) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, isActive: true },
    create: { email, passwordHash: hash, isActive: true, firstName: 'Phase1', lastName: roleCode },
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
      data: { userId: user.id, roleId: role.id, isActive: urActive, notes: `${FIXTURE_TAG} ${roleCode}` },
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
      data: {
        tenantId,
        departmentId: dept.id,
        name: `${FIXTURE_TAG} ${deptCode} Store`,
        type: 'MAIN_STORE',
        isActive: true,
      },
    });
  }
  let item = await prisma.item.findFirst({ where: { tenantId, isActive: true, departmentId: dept.id } });
  if (!item) {
    item = await prisma.item.create({
      data: {
        tenantId,
        name: `${FIXTURE_TAG} Item ${deptCode}`,
        code: `P1G-${deptCode}-${Date.now()}`,
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

function movementPayload(stock, locationId, qty = 1) {
  const unitCost = 1;
  return {
    movementType: 'ADJUSTMENT',
    documentDate: new Date().toISOString().split('T')[0],
    sourceLocationId: locationId,
    notes: FIXTURE_TAG,
    lines: [{ itemId: stock.itemId, locationId, qtyRequested: qty, unitCost, totalValue: qty * unitCost }],
  };
}

async function createDraftGetPass(token, stock, tag) {
  return apiRequest(API_BASE, 'POST', '/get-passes', {
    transferType: 'PERMANENT',
    borrowingEntity: `${tag} borrower`,
    departmentId: stock.departmentId,
    reason: tag,
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
  }, token);
}

async function getPassStatus(id, tenantId) {
  const row = await prisma.getPass.findFirst({ where: { id, tenantId }, select: { status: true } });
  return row?.status || null;
}

async function countLedger(tenantId, since) {
  return prisma.inventoryLedger.count({ where: { tenantId, createdAt: { gte: since } } });
}

async function stockQty(tenantId, itemId, locationId) {
  const b = await prisma.stockBalance.findUnique({
    where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
  });
  return Number(b?.qtyOnHand || 0);
}

async function countMovementDocs(tenantId, since) {
  return prisma.movementDocument.count({
    where: { tenantId, notes: FIXTURE_TAG, createdAt: { gte: since } },
  });
}

const PIPELINE_GP_STATUSES = [
  'PENDING_DEPT',
  'PENDING_COST_CONTROL',
  'PENDING_FINANCE',
  'PENDING_GM',
  'PENDING_SECURITY',
  'APPROVED',
  'OUT',
  'PARTIALLY_RETURNED',
  'RECEIVED_AT_DESTINATION',
  'RETURNING',
  'RETURN_RECEIVED_AT_GATE',
];

async function cleanupDisposablePipelineGetPasses(tenantId) {
  const visible = await prisma.getPass.findMany({
    where: { tenantId, status: { in: PIPELINE_GP_STATUSES } },
    select: { id: true },
  });
  if (!visible.length) return 0;
  const ids = visible.map((r) => r.id);
  await prisma.getPassLine.deleteMany({ where: { getPassId: { in: ids } } });
  await prisma.getPass.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function cleanupScopeFixtures(tenantId) {
  await prisma.getPassLine.deleteMany({
    where: { getPass: { tenantId, passNo: { startsWith: 'P1G-PIPE-' } } },
  });
  await prisma.getPass.deleteMany({ where: { tenantId, passNo: { startsWith: 'P1G-PIPE-' } } });
  await prisma.getPassLine.deleteMany({
    where: { getPass: { tenantId, passNo: { startsWith: 'P1G-FOREIGN-' } } },
  });
  await prisma.getPass.deleteMany({ where: { tenantId, passNo: { startsWith: 'P1G-FOREIGN-' } } });
}

async function seedScopedPipelineFixtures(child, stockIn, stockOut, creatorUserId) {
  await cleanupScopeFixtures(child.id);
  const ts = Date.now();
  const inScope = await prisma.getPass.create({
    data: {
      tenantId: child.id,
      passNo: `P1G-PIPE-IN-${ts}`,
      transferType: 'PERMANENT',
      borrowingEntity: `${FIXTURE_TAG} in-scope`,
      departmentId: stockIn.departmentId,
      reason: FIXTURE_TAG,
      status: 'PENDING_DEPT',
      createdBy: creatorUserId,
      lines: {
        create: [{ itemId: stockIn.itemId, locationId: stockIn.locationId, qty: 1, conditionOut: 'GOOD' }],
      },
    },
  });
  const outScope = await prisma.getPass.create({
    data: {
      tenantId: child.id,
      passNo: `P1G-PIPE-OUT-${ts}`,
      transferType: 'PERMANENT',
      borrowingEntity: `${FIXTURE_TAG} out-scope`,
      departmentId: stockOut.departmentId,
      reason: FIXTURE_TAG,
      status: 'PENDING_DEPT',
      createdBy: creatorUserId,
      lines: {
        create: [{ itemId: stockOut.itemId, locationId: stockOut.locationId, qty: 1, conditionOut: 'GOOD' }],
      },
    },
  });
  const overdueIn = await prisma.getPass.create({
    data: {
      tenantId: child.id,
      passNo: `P1G-PIPE-OVD-IN-${ts}`,
      transferType: 'PERMANENT',
      borrowingEntity: `${FIXTURE_TAG} overdue in`,
      departmentId: stockIn.departmentId,
      reason: FIXTURE_TAG,
      status: 'OUT',
      expectedReturnDate: new Date(Date.now() - 86400000),
      createdBy: creatorUserId,
      lines: {
        create: [{ itemId: stockIn.itemId, locationId: stockIn.locationId, qty: 1, conditionOut: 'GOOD' }],
      },
    },
  });
  const overdueOut = await prisma.getPass.create({
    data: {
      tenantId: child.id,
      passNo: `P1G-PIPE-OVD-OUT-${ts}`,
      transferType: 'PERMANENT',
      borrowingEntity: `${FIXTURE_TAG} overdue out`,
      departmentId: stockOut.departmentId,
      reason: FIXTURE_TAG,
      status: 'OUT',
      expectedReturnDate: new Date(Date.now() - 86400000),
      createdBy: creatorUserId,
      lines: {
        create: [{ itemId: stockOut.itemId, locationId: stockOut.locationId, qty: 1, conditionOut: 'GOOD' }],
      },
    },
  });
  return {
    inScopeId: inScope.id,
    outScopeId: outScope.id,
    overdueInId: overdueIn.id,
    overdueOutId: overdueOut.id,
    tag: ts,
  };
}

async function ensureForeignTenantGetPass(foreignStock, creatorUserId) {
  await prisma.getPassLine.deleteMany({
    where: { getPass: { tenantId: HOTEL_B.id, passNo: { startsWith: 'P1G-FOREIGN-' } } },
  });
  await prisma.getPass.deleteMany({ where: { tenantId: HOTEL_B.id, passNo: { startsWith: 'P1G-FOREIGN-' } } });
  const ts = Date.now();
  const gp = await prisma.getPass.create({
    data: {
      tenantId: HOTEL_B.id,
      passNo: `P1G-FOREIGN-${ts}`,
      transferType: 'PERMANENT',
      borrowingEntity: `${FIXTURE_TAG} foreign tenant`,
      departmentId: foreignStock.departmentId,
      reason: FIXTURE_TAG,
      status: 'DRAFT',
      createdBy: creatorUserId,
      lines: {
        create: [{ itemId: foreignStock.itemId, locationId: foreignStock.locationId, qty: 1, conditionOut: 'GOOD' }],
      },
    },
  });
  if (!gp?.id) throw new Error('Failed to create foreign-tenant Get Pass fixture');
  return gp.id;
}

async function seedGrnDraft(tenantId, userId, stock) {
  const supplier = await prisma.supplier.findFirst({ where: { tenantId } });
  const unit = await prisma.unit.findFirst({ where: { tenantId } });
  const num = `P1G-GRN-${Date.now()}`;
  return prisma.grnImport.create({
    data: {
      tenantId,
      grnNumber: num,
      supplierInvoiceNumber: num,
      vendorId: supplier?.id,
      vendorNameSnapshot: FIXTURE_TAG,
      locationId: stock.locationId,
      receivingDate: new Date(),
      pdfAttachmentUrl: '/phase1-gate.pdf',
      status: 'DRAFT',
      importedBy: userId,
      lines: {
        create: [{
          futurelogItemCode: 'P1G-001',
          futurelogDescription: FIXTURE_TAG,
          futurelogUom: 'EA',
          orderedQty: 1,
          receivedQty: 1,
          unitPrice: 1,
          internalItemId: stock.itemId,
          internalUomId: unit?.id,
          conversionFactor: 1,
          qtyInBaseUnit: 1,
          isMapped: true,
        }],
      },
    },
  });
}

async function runGetPassScenarios(child, stock, foreignStock, foreignGpId) {
  const ts = Date.now();

  const never = await upsertGateUser({
    email: `p1-never@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    skipUr: true,
  });
  const neverSess = await getSession(API_BASE, never, child.slug);
  const gpNeverDraft = await prisma.getPass.create({
    data: {
      tenantId: child.id,
      passNo: `P1G-NEVER-${ts}`,
      transferType: 'PERMANENT',
      borrowingEntity: `${FIXTURE_TAG} never`,
      departmentId: stock.departmentId,
      reason: FIXTURE_TAG,
      status: 'DRAFT',
      createdBy: never.userId,
      lines: { create: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }] },
    },
  });
  const submitNever = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpNeverDraft.id}/submit`,
    { concurrencyVersion: gpNeverDraft.concurrencyVersion ?? 0 },
    neverSess.token,
  );
  const statusNever = await getPassStatus(gpNeverDraft.id, child.id);
  record(1, 'Never assigned Submit → denied', submitNever.status === 403 && statusNever === 'DRAFT', {
    http: submitNever.status,
    statusAfter: statusNever,
  });

  const inactive = await upsertGateUser({
    email: `p1-inactive@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    urActive: false,
  });
  const inactiveSess = await getSession(API_BASE, inactive, child.slug);
  const gpIn = await createDraftGetPass(inactiveSess.token, stock, `${FIXTURE_TAG}-inactive-${ts}`);
  const gpInId = gpIn.data?.data?.id;
  let submitIn = { status: gpIn.status === 403 ? 403 : 0 };
  if (gpInId) {
    submitIn = await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${gpInId}/submit`,
      { concurrencyVersion: gpIn.data?.data?.concurrencyVersion ?? 0 },
      inactiveSess.token,
    );
  }
  const statusIn = gpInId ? await getPassStatus(gpInId, child.id) : null;
  record(2, 'Inactive Assignment Submit → denied', (submitIn.status === 403 || gpIn.status === 403) && statusIn !== 'PENDING_DEPT', {
    createHttp: gpIn.status,
    submitHttp: submitIn.status,
    statusAfter: statusIn,
  });

  const deleted = await upsertGateUser({
    email: `p1-deleted@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  await prisma.urUserAssignment.deleteMany({ where: { userId: deleted.userId, notes: { startsWith: FIXTURE_TAG } } });
  await prisma.user.update({ where: { id: deleted.userId }, data: { permissionVersion: { increment: 1 } } });
  const deletedSess = await getSession(API_BASE, deleted, child.slug);
  const gpDel = await createDraftGetPass(deletedSess.token, stock, `${FIXTURE_TAG}-deleted-${ts}`);
  record(3, 'Deleted Assignment Submit → denied', gpDel.status === 403, { createHttp: gpDel.status });

  const wrongProp = await upsertGateUser({
    email: `p1-wrongprop@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    propertyIds: [HOTEL_B.id],
  });
  const wrongSess = await getSession(API_BASE, wrongProp, child.slug);
  const gpWrong = await createDraftGetPass(wrongSess.token, stock, `${FIXTURE_TAG}-wrong-${ts}`);
  record(4, 'Wrong-property Assignment Submit → denied', gpWrong.status === 403, { createHttp: gpWrong.status });

  const staleUser = await upsertGateUser({
    email: `p1-stale@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const staleToken = (await getSession(API_BASE, staleUser, child.slug)).token;
  await prisma.urUserAssignment.updateMany({ where: { userId: staleUser.userId }, data: { isActive: false } });
  await prisma.user.update({ where: { id: staleUser.userId }, data: { permissionVersion: { increment: 1 } } });
  const gpStale = await createDraftGetPass(staleToken, stock, `${FIXTURE_TAG}-stale-${ts}`);
  record(5, 'Stale JWT after deactivate → denied', gpStale.status === 401, { http: gpStale.status, code: gpStale.errorCode });

  const valid = await upsertGateUser({
    email: `p1-valid@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const validSess = await getSession(API_BASE, valid, child.slug);
  const gpValid = await createDraftGetPass(validSess.token, stock, `${FIXTURE_TAG}-valid-${ts}`);
  const gpValidId = gpValid.data?.data?.id;
  const submitValid = gpValidId
    ? await apiRequest(
        API_BASE,
        'POST',
        `/get-passes/${gpValidId}/submit`,
        { concurrencyVersion: gpValid.data?.data?.concurrencyVersion ?? 0 },
        validSess.token,
      )
    : { status: 0 };
  const statusValid = gpValidId ? await getPassStatus(gpValidId, child.id) : null;
  record(6, 'Valid Active Assignment Submit → success', is2xx(submitValid.status) && statusValid === 'PENDING_DEPT', {
    http: submitValid.status,
    statusAfter: statusValid,
  });

  record(7, 'Denied scenarios do not change DRAFT status', statusNever === 'DRAFT' && statusIn !== 'PENDING_DEPT', {
    never: statusNever,
    inactive: statusIn,
  });

  if (!foreignGpId) {
    record(8, 'Cross-tenant read → 404', false, { error: 'foreign Get Pass fixture missing — FAIL' });
  } else {
    const crossRead = await apiRequest(API_BASE, 'GET', `/get-passes/${foreignGpId}`, null, validSess.token);
    record(8, 'Cross-tenant read → 404', crossRead.status === 404, {
      http: crossRead.status,
      foreignPassId: foreignGpId,
      foreignTenantId: HOTEL_B.id,
    });
  }

  const finance = await upsertGateUser({
    email: `p1-finance-cr@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const finSess = await getSession(API_BASE, finance, child.slug);
  const gpFin = await createDraftGetPass(finSess.token, stock, `${FIXTURE_TAG}-fin-${ts}`);
  const gpFinId = gpFin.data?.data?.id;
  let finStatus = null;
  if (gpFinId) {
    const subFin = await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${gpFinId}/submit`,
      { concurrencyVersion: gpFin.data?.data?.concurrencyVersion ?? 0 },
      finSess.token,
    );
    if (is2xx(subFin.status)) finStatus = subFin.data?.data?.status || (await getPassStatus(gpFinId, child.id));
  }
  const finRow = gpFinId
    ? await prisma.getPass.findFirst({
        where: { id: gpFinId },
        select: { status: true, deptApprovedBy: true, costControlApprovedBy: true, financeApprovedBy: true },
      })
    : null;
  record(
    9,
    'Finance creator does not bypass Dept/CC',
    finStatus === 'PENDING_DEPT' && !finRow?.costControlApprovedBy && !finRow?.financeApprovedBy,
    { statusAfter: finStatus, row: finRow },
  );

  const orgRoot = await prisma.tenant.findFirst({ where: { slug: ORG_SLUG } });
  const orgMgr = await upsertGateUser({
    email: `p1-org-cr@${EMAIL_DOMAIN}`,
    roleCode: 'ORG_MANAGER',
    tenantId: orgRoot?.id || child.id,
    departmentId: stock.departmentId,
    propertyIds: [child.id],
  });
  const orgSess = await getSession(API_BASE, orgMgr, child.slug);
  const gpOrg = await createDraftGetPass(orgSess.token, stock, `${FIXTURE_TAG}-org-${ts}`);
  const gpOrgId = gpOrg.data?.data?.id;
  let orgRow = null;
  if (gpOrgId) {
    await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${gpOrgId}/submit`,
      { concurrencyVersion: gpOrg.data?.data?.concurrencyVersion ?? 0 },
      orgSess.token,
    );
    orgRow = await prisma.getPass.findFirst({
      where: { id: gpOrgId },
      select: { status: true, deptApprovedBy: true, costControlApprovedBy: true, financeApprovedBy: true, securityApprovedBy: true },
    });
  }
  const stampedCount = orgRow
    ? [orgRow.deptApprovedBy, orgRow.costControlApprovedBy, orgRow.financeApprovedBy, orgRow.securityApprovedBy].filter(Boolean).length
    : 0;
  record(10, 'ORG_MANAGER creator does not self-stamp stages', orgRow?.status === 'PENDING_DEPT' && stampedCount === 0, {
    statusAfter: orgRow?.status,
    stampedCount,
  });
}

async function runPipelineDashboardScenarios(child, stock, scopedUserToken, fixtures) {
  const never = await upsertGateUser({
    email: `p1-pipe-never@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    skipUr: true,
  });
  const neverSess = await getSession(API_BASE, never, child.slug);

  const listNever = parsePipelineList(await apiRequest(API_BASE, 'GET', '/workflow-pipeline?module=GET_PASS', null, neverSess.token));
  record(11, 'Never-assigned pipeline list → denied/empty', listNever.ok && listNever.documentIds.length === 0 && listNever.total === 0, listNever);

  const sumNever = parsePipelineSummary(await apiRequest(API_BASE, 'GET', '/workflow-pipeline/summary', null, neverSess.token));
  record(12, 'Never-assigned pipeline summary → denied/empty', sumNever.ok && sumNever.total === 0, sumNever);

  const alertsNever = parsePipelineAlerts(await apiRequest(API_BASE, 'GET', '/workflow-pipeline/alerts?module=GET_PASS', null, neverSess.token));
  record(13, 'Never-assigned pipeline alerts → denied/empty', alertsNever.ok && alertsNever.documentIds.length === 0, alertsNever);

  const wrongProp = await upsertGateUser({
    email: `p1-pipe-wrong@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    propertyIds: [HOTEL_B.id],
  });
  const wrongSess = await getSession(API_BASE, wrongProp, child.slug);
  const listWrong = parsePipelineList(await apiRequest(API_BASE, 'GET', '/workflow-pipeline?module=GET_PASS', null, wrongSess.token));
  record(
    14,
    'Wrong-property user sees no rows/IDs',
    listWrong.ok && !listWrong.documentIds.includes(fixtures.inScopeId) && !listWrong.documentIds.includes(fixtures.outScopeId),
    listWrong,
  );

  const listPos = parsePipelineList(await apiRequest(API_BASE, 'GET', '/workflow-pipeline?module=GET_PASS', null, scopedUserToken));
  const sumPos = parsePipelineSummary(await apiRequest(API_BASE, 'GET', '/workflow-pipeline/summary', null, scopedUserToken));
  const sumByModule = (await apiRequest(API_BASE, 'GET', '/workflow-pipeline/summary', null, scopedUserToken)).data?.data?.byModule?.GET_PASS ?? 0;
  const alertsPos = parsePipelineAlerts(await apiRequest(API_BASE, 'GET', '/workflow-pipeline/alerts?module=GET_PASS', null, scopedUserToken));
  const pipelineOk =
    listPos.ok &&
    sumPos.ok &&
    alertsPos.ok &&
    listPos.documentIds.includes(fixtures.inScopeId) &&
    listPos.documentIds.includes(fixtures.overdueInId) &&
    !listPos.documentIds.includes(fixtures.outScopeId) &&
    !listPos.documentIds.includes(fixtures.overdueOutId) &&
    listPos.documentIds.length === 2 &&
    sumByModule === 2 &&
    alertsPos.documentIds.length <= 2 &&
    !alertsPos.documentIds.includes(fixtures.outScopeId);
  record(15, 'Authorized user sees scoped pipeline only', pipelineOk, {
    listHttp: listPos.http,
    summaryHttp: sumPos.http,
    alertsHttp: alertsPos.http,
    documentIds: listPos.documentIds,
    expectedInScope: fixtures.inScopeId,
    expectedOutScope: fixtures.outScopeId,
    summaryGetPassModule: sumByModule,
  });

  const dashNever = parseDashboard(await apiRequest(API_BASE, 'GET', '/dashboard/summary', null, neverSess.token));
  record(16, 'Never-assigned dashboard ops metrics → empty', dashNever.ok && dashNever.total === 0 && dashNever.allDetailIds.length === 0, dashNever);

  const dashWrong = parseDashboard(await apiRequest(API_BASE, 'GET', '/dashboard/summary', null, wrongSess.token));
  record(
    17,
    'Wrong-property dashboard metrics do not leak',
    dashWrong.ok &&
      !dashWrong.allDetailIds.includes(fixtures.inScopeId) &&
      !dashWrong.allDetailIds.includes(fixtures.outScopeId) &&
      !dashWrong.overdueLoanIds.includes(fixtures.overdueOutId),
    dashWrong,
  );

  const dashPos = parseDashboard(await apiRequest(API_BASE, 'GET', '/dashboard/summary', null, scopedUserToken));
  const dashOk =
    dashPos.ok &&
    dashPos.overdueLoansCount === 1 &&
    dashPos.overdueLoanIds.includes(fixtures.overdueInId) &&
    !dashPos.overdueLoanIds.includes(fixtures.overdueOutId) &&
    !dashPos.allDetailIds.includes(fixtures.outScopeId);
  record(18, 'Authorized dashboard scoped to assignment', dashOk, {
    http: dashPos.http,
    overdueLoanIds: dashPos.overdueLoanIds,
    expectedOverdueIn: fixtures.overdueInId,
    expectedOverdueOut: fixtures.overdueOutId,
    overdueLoansCount: dashPos.overdueLoansCount,
  });
}

async function runMovementScenarios(child, stock, foreignStock) {
  const since = new Date();
  const ledgerBefore = await countLedger(child.id, since);
  const stockBefore = await stockQty(child.id, stock.itemId, stock.locationId);
  const mvBefore = await countMovementDocs(child.id, since);

  const noAssign = await upsertGateUser({
    email: `p1-mv-no@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    skipUr: true,
  });
  const noSess = await getSession(API_BASE, noAssign, child.slug);
  const createNo = await apiRequest(API_BASE, 'POST', '/movements', movementPayload(stock, stock.locationId), noSess.token);
  record(19, 'No-assignment movement create → denied', createNo.status === 403, { http: createNo.status });

  const valid = await upsertGateUser({
    email: `p1-mv-valid@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const validSess = await getSession(API_BASE, valid, child.slug);

  const wrongCreate = await apiRequest(
    API_BASE,
    'POST',
    '/movements',
    movementPayload(stock, foreignStock.locationId),
    validSess.token,
  );
  const mvAfterWrong = await countMovementDocs(child.id, since);
  const ledgerAfterWrong = await countLedger(child.id, since);
  const stockAfterWrong = await stockQty(child.id, stock.itemId, stock.locationId);
  record(
    20,
    'Cross-property movement create → denied without 500',
    (wrongCreate.status === 403 || wrongCreate.status === 404) && wrongCreate.status !== 500 && mvAfterWrong === mvBefore,
    { http: wrongCreate.status, foreignLocationId: foreignStock.locationId, foreignTenantId: foreignStock.tenantId },
  );
  record(23, 'Wrong-property denial does not create ledger', ledgerAfterWrong === ledgerBefore, { before: ledgerBefore, after: ledgerAfterWrong });
  record(24, 'Wrong-property denial does not change stock', stockAfterWrong === stockBefore, { before: stockBefore, after: stockAfterWrong });

  const createOk = await apiRequest(API_BASE, 'POST', '/movements', movementPayload(stock, stock.locationId), validSess.token);
  const docId = createOk.data?.data?.id;
  record(21, 'Valid movement create → success', is2xx(createOk.status) && !!docId, { http: createOk.status });

  let postOk = { status: 0 };
  if (docId) {
    postOk = await apiRequest(
      API_BASE,
      'POST',
      `/movements/${docId}/post`,
      { concurrencyVersion: createOk.data?.data?.concurrencyVersion ?? 0 },
      validSess.token,
    );
  }
  record(22, 'Valid movement post → success', is2xx(postOk.status), { http: postOk.status });

  if (docId) {
    const dupPost = await apiRequest(
      API_BASE,
      'POST',
      `/movements/${docId}/post`,
      { concurrencyVersion: (createOk.data?.data?.concurrencyVersion ?? 0) + 1 },
      validSess.token,
    );
    record(25, 'Duplicate post behavior unchanged', dupPost.status === 409 || dupPost.status === 400 || dupPost.status === 422, {
      http: dupPost.status,
    });
  } else {
    record(25, 'Duplicate post behavior unchanged', false, { skip: 'no doc' });
  }
}

async function createMovementDraftViaApi(token, stock) {
  const res = await apiRequest(API_BASE, 'POST', '/movements', movementPayload(stock, stock.locationId), token);
  if (!is2xx(res.status)) return null;
  return res.data?.data;
}

async function assertPostDenied({ id, name, token, docId, tenantId, stock, since, expectedStatuses }) {
  const statusBefore = await prisma.movementDocument.findFirst({ where: { id: docId, tenantId }, select: { status: true } });
  const ledgerBefore = await countLedger(tenantId, since);
  const stockBefore = await stockQty(tenantId, stock.itemId, stock.locationId);
  const postRes = await apiRequest(
    API_BASE,
    'POST',
    `/movements/${docId}/post`,
    { concurrencyVersion: (await prisma.movementDocument.findFirst({ where: { id: docId }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0 },
    token,
  );
  const statusAfter = await prisma.movementDocument.findFirst({ where: { id: docId, tenantId }, select: { status: true } });
  const ledgerAfter = await countLedger(tenantId, since);
  const stockAfter = await stockQty(tenantId, stock.itemId, stock.locationId);
  const denied = expectedStatuses.includes(postRes.status);
  const pass = denied && statusAfter?.status === 'DRAFT' && ledgerAfter === ledgerBefore && stockAfter === stockBefore;
  record(id, name, pass, {
    http: postRes.status,
    statusBefore: statusBefore?.status,
    statusAfter: statusAfter?.status,
    ledgerBefore,
    ledgerAfter,
    stockBefore,
    stockAfter,
  });
}

async function runMovementPostDenials(child, stock) {
  const since = new Date();
  const author = await upsertGateUser({
    email: `p1-mv-post-auth@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const authorSess = await getSession(API_BASE, author, child.slug);

  const docDeactivate = await createMovementDraftViaApi(authorSess.token, stock);
  const docWrongProp = await createMovementDraftViaApi(authorSess.token, stock);
  const docNoAssign = await createMovementDraftViaApi(authorSess.token, stock);

  if (!docDeactivate?.id || !docWrongProp?.id || !docNoAssign?.id) {
    record(26, 'Movement post after assignment deactivation → denied', false, { error: 'failed to seed drafts' });
    record(27, 'Movement post with wrong-property assignment → denied', false, { error: 'failed to seed drafts' });
    record(28, 'Movement post with stale JWT → denied', false, { error: 'failed to seed drafts' });
    record(29, 'Movement post with no assignment → denied', false, { error: 'failed to seed drafts' });
    return;
  }

  await prisma.urUserAssignment.updateMany({ where: { userId: author.userId }, data: { isActive: false } });
  await prisma.user.update({ where: { id: author.userId }, data: { permissionVersion: { increment: 1 } } });
  await assertPostDenied({
    id: 26,
    name: 'Movement post after assignment deactivation → denied',
    token: authorSess.token,
    docId: docDeactivate.id,
    tenantId: child.id,
    stock,
    since,
    expectedStatuses: [401, 403],
  });
  await prisma.urUserAssignment.updateMany({ where: { userId: author.userId }, data: { isActive: true } });

  const wrongPropUser = await upsertGateUser({
    email: `p1-mv-post-wrong@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    propertyIds: [HOTEL_B.id],
  });
  const wrongSess = await getSession(API_BASE, wrongPropUser, child.slug);
  await assertPostDenied({
    id: 27,
    name: 'Movement post with wrong-property assignment → denied',
    token: wrongSess.token,
    docId: docWrongProp.id,
    tenantId: child.id,
    stock,
    since,
    expectedStatuses: [403],
  });

  const staleUser = await upsertGateUser({
    email: `p1-mv-post-stale@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const staleSess = await getSession(API_BASE, staleUser, child.slug);
  const docStale = await createMovementDraftViaApi(staleSess.token, stock);
  if (!docStale?.id) {
    record(28, 'Movement post with stale JWT → denied', false, { error: 'failed to seed stale draft' });
  } else {
  const staleToken = staleSess.token;
  await prisma.urUserAssignment.updateMany({ where: { userId: staleUser.userId }, data: { isActive: false } });
  await prisma.user.update({ where: { id: staleUser.userId }, data: { permissionVersion: { increment: 1 } } });
  await assertPostDenied({
    id: 28,
    name: 'Movement post with stale JWT → denied',
    token: staleToken,
    docId: docStale.id,
    tenantId: child.id,
    stock,
    since,
    expectedStatuses: [401],
  });
  }

  const neverUser = await upsertGateUser({
    email: `p1-mv-post-never@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    skipUr: true,
  });
  const neverSess = await getSession(API_BASE, neverUser, child.slug);
  await assertPostDenied({
    id: 29,
    name: 'Movement post with no assignment → denied',
    token: neverSess.token,
    docId: docNoAssign.id,
    tenantId: child.id,
    stock,
    since,
    expectedStatuses: [403],
  });
}

async function runRegressionSuite(child, stock) {
  const fin = await upsertGateUser({
    email: `p1-reg-fin@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const store = await upsertGateUser({
    email: `p1-reg-store@${EMAIL_DOMAIN}`,
    roleCode: 'STOREKEEPER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const finSess = await getSession(API_BASE, fin, child.slug);
  const storeSess = await getSession(API_BASE, store, child.slug);

  const grn = await seedGrnDraft(child.id, fin.userId, stock);
  const grnList = await apiRequest(API_BASE, 'GET', '/grn?limit=5', null, finSess.token);
  const grnDetail = await apiRequest(API_BASE, 'GET', `/grn/${grn.id}`, null, finSess.token);
  recordRegression('GRN authorized list + detail', is2xx(grnList.status) && is2xx(grnDetail.status), {
    listHttp: grnList.status,
    detailHttp: grnDetail.status,
    grnId: grn.id,
  });

  const trList = await apiRequest(API_BASE, 'GET', '/transfers?limit=5', null, storeSess.token);
  recordRegression('Transfer authorized list', is2xx(trList.status), { http: trList.status });

  const brList = await apiRequest(API_BASE, 'GET', '/breakage?limit=5', null, finSess.token);
  recordRegression('Breakage authorized list', is2xx(brList.status), { http: brList.status });

  const lostList = await apiRequest(API_BASE, 'GET', '/lost-items?limit=5', null, finSess.token);
  recordRegression('Lost Items authorized list', is2xx(lostList.status), { http: lostList.status });

  const icList = await apiRequest(API_BASE, 'GET', '/inventory-count/sessions?limit=5', null, finSess.token);
  recordRegression('Inventory Count authorized list', is2xx(icList.status), { http: icList.status });

  const gpCreate = await createDraftGetPass(finSess.token, stock, `${FIXTURE_TAG}-reg-create`);
  const gpId = gpCreate.data?.data?.id;
  recordRegression('Get Pass authorized create', is2xx(gpCreate.status) && !!gpId, { http: gpCreate.status, id: gpId });

  const gpList = await apiRequest(API_BASE, 'GET', '/get-passes?limit=5', null, finSess.token);
  recordRegression('Get Pass authorized list', is2xx(gpList.status), { http: gpList.status });

  const gpDetail = gpId
    ? await apiRequest(API_BASE, 'GET', `/get-passes/${gpId}`, null, finSess.token)
    : { status: 0 };
  recordRegression('Get Pass authorized detail', gpId ? is2xx(gpDetail.status) : false, { http: gpDetail.status, id: gpId });

  const orgRoot = await prisma.tenant.findFirst({ where: { slug: ORG_SLUG } });
  const orgMgr = await upsertGateUser({
    email: `p1-reg-org@${EMAIL_DOMAIN}`,
    roleCode: 'ORG_MANAGER',
    tenantId: orgRoot?.id || child.id,
    propertyIds: [child.id],
  });
  const orgLogin = await getSession(API_BASE, orgMgr, ORG_SLUG);
  const sw = orgLogin.ok
    ? await switchTenant(API_BASE, orgLogin.token, child.slug)
    : { status: 0 };
  recordRegression('Tenant switch permission refresh', is2xx(sw.status) && !!sw.data?.data?.accessToken, {
    http: sw.status,
    hasNewToken: !!sw.data?.data?.accessToken,
  });

  const pipe = await apiRequest(
    API_BASE,
    'GET',
    '/workflow-pipeline/summary?module=GET_PASS',
    null,
    finSess.token,
  );
  recordRegression('Workflow Pipeline authorized summary', is2xx(pipe.status), { http: pipe.status });

  const mvCreate = await apiRequest(API_BASE, 'POST', '/movements', movementPayload(stock, stock.locationId), finSess.token);
  recordRegression('Movement authorized create', is2xx(mvCreate.status), { http: mvCreate.status });

  try {
    execSync('node scripts/verify-acc-p12-cutover-wave2.js', { cwd: BACKEND, stdio: 'pipe' });
    recordRegression('verify-acc-p12-cutover-wave2.js', true);
  } catch (e) {
    recordRegression('verify-acc-p12-cutover-wave2.js', false, { error: String(e.message || e).slice(0, 200) });
  }

  try {
    execSync('node scripts/movement-adjustment-rbac.test.js', { cwd: BACKEND, stdio: 'pipe' });
    recordRegression('movement-adjustment-rbac.test.js', true);
  } catch (e) {
    recordRegression('movement-adjustment-rbac.test.js', false, { error: String(e.message || e).slice(0, 200) });
  }

  try {
    execSync('node src/services/getPass.service.test.js', { cwd: BACKEND, stdio: 'pipe' });
    recordRegression('getPass.service.test.js', true);
  } catch (e) {
    recordRegression('getPass.service.test.js', false, { error: String(e.message || e).slice(0, 300) });
  }

  try {
    const feDir = path.join(__dirname, '../../OSE-frontend');
    execSync('npm run build -- --configuration=development', { cwd: feDir, stdio: 'pipe', timeout: 300000 });
    recordRegression('Frontend development build', true);
  } catch (e) {
    recordRegression('Frontend development build', false, { error: String(e.message || e).slice(0, 300) });
  }
}

function buildChecklist() {
  const byId = Object.fromEntries(scenarios.map((s) => [s.id, s.pass]));
  gateChecklist = {
    'Get Pass invalid assignments denied': [1, 2, 3, 4].every((i) => byId[i]),
    'Get Pass valid assignment succeeds': byId[6],
    'Stale authorization denied': [5, 28].every((i) => byId[i]),
    'Pipeline list scope': byId[11],
    'Pipeline summary scope': byId[12],
    'Pipeline alerts scope': byId[13],
    'Pipeline authorized in-scope only': byId[15],
    'Dashboard scope': [16, 17, 18].every((i) => byId[i]),
    'Movements cross-property denial': byId[20],
    'Movements valid create/post': byId[21] && byId[22],
    'Movement unauthorized post denied': [26, 27, 28, 29].every((i) => byId[i]),
    'Finance fast-forward blocked': byId[9],
    'ORG_MANAGER fast-forward blocked': byId[10],
    'Cross-tenant read remains 404': byId[8],
    'No unauthorized mutation': [1, 2, 3, 4, 19, 20, 26, 27, 28, 29].every((i) => byId[i]),
    'No unauthorized ledger/stock effect': [23, 24, 26, 27, 28, 29].every((i) => byId[i]),
    'Full regression suite': regression.every((r) => r.pass),
    'Frontend build': regression.find((r) => r.name === 'Frontend development build')?.pass ?? false,
    'Backend relevant tests': regression.filter((r) => !r.name.includes('Frontend')).every((r) => r.pass),
  };
}

async function main() {
  console.log('Phase 1 Assignment & Scope Gate (corrected) — starting');
  const ping = await apiRequest(API_BASE.replace(/\/api$/, ''), 'GET', '/health', null).catch(() => ({ status: 0 }));
  if (ping.status !== 200) {
    console.error('API not reachable at', API_BASE);
    process.exit(2);
  }

  const child = await loadDisposableTenant();
  const stockIn = await ensureStock(child.id, 'FB');
  const stockOut = await ensureStock(child.id, 'HK');
  const foreignStock = await ensureStock(HOTEL_B.id, 'FB');

  const seedUser = await upsertGateUser({
    email: `p1-seed@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stockIn.departmentId,
  });
  await cleanupDisposablePipelineGetPasses(child.id);
  scopeFixtures = await seedScopedPipelineFixtures(child, stockIn, stockOut, seedUser.userId);

  let foreignGpId = null;
  try {
    foreignGpId = await ensureForeignTenantGetPass(foreignStock, seedUser.userId);
  } catch (e) {
    console.error('Foreign Get Pass fixture failed:', e.message);
  }

  const scopedUser = await upsertGateUser({
    email: `p1-scoped@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: child.id,
    departmentId: stockIn.departmentId,
  });
  const scopedSess = await getSession(API_BASE, scopedUser, child.slug);

  await runPipelineDashboardScenarios(child, stockIn, scopedSess.token, scopeFixtures);
  await runGetPassScenarios(child, stockIn, foreignStock, foreignGpId);
  await runMovementScenarios(child, stockIn, foreignStock);
  await runMovementPostDenials(child, stockIn);
  await runRegressionSuite(child, stockIn);

  buildChecklist();

  const runtimePass = scenarios.filter((s) => s.pass).length;
  const runtimeFail = scenarios.filter((s) => !s.pass).length;
  const regPass = regression.filter((r) => r.pass).length;
  const regFail = regression.filter((r) => !r.pass).length;
  const phaseClosed = Object.values(gateChecklist).every(Boolean);

  const out = {
    executedAt: new Date().toISOString(),
    gateVersion: 'phase1-corrected-v2',
    tenant: { id: child.id, slug: child.slug },
    foreignTenant: { id: HOTEL_B.id, slug: HOTEL_B.slug },
    apiBase: API_BASE,
    fixtures: scopeFixtures,
    foreignGetPassId: foreignGpId,
    scenarios,
    regression,
    totals: { runtimePass, runtimeFail, regressionPass: regPass, regressionFail: regFail },
    gateChecklist,
    phaseClosed,
  };

  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_1_RUNTIME_RESULTS.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ runtimePass, runtimeFail, regPass, regFail, phaseClosed, gateChecklist }, null, 2));
  await prisma.$disconnect();
  process.exit(phaseClosed ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
