'use strict';

/**
 * Phase 5 — Deterministic Transfer / Breakage / Lost detail fixtures.
 * Usage: node Governance/phase-5-operational-details/phase-5-fixture-seed.cjs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const GOV_DIR = __dirname;
const BACKEND = path.join(__dirname, '../../OSE-backend');
const API_BASE = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const FIXTURE_TAG = 'PHASE5_DETAIL_GATE';
const PASSWORD = 'Phase5Gate@123';
const EMAIL_DOMAIN = 'phase5-detail-gate.local';
const CHILD_SLUG = 'closeout-audit-hotel-disposable';

const { apiRequest, getSession } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/http'));
const { HOTEL_B } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/constants'));
const prisma = require(path.join(BACKEND, 'src/config/database'));
const { FIXTURES_PATH, detailData, sumLineQty, sumLineTotals } = require('./phase-5-detail-assertions.lib.cjs');
const { stockSnapshot } = require('./phase-5-posting-assertions.lib.cjs');

function is2xx(s) {
  return s >= 200 && s < 300;
}

async function upsertGateUser({ email, roleCode, tenantId, departmentId, skipUr = false, urActive = true, propertyIds = null }) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, isActive: true },
    create: { email, passwordHash: hash, isActive: true, firstName: 'Phase5', lastName: roleCode },
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

async function seedActor(roleCode, tenantId, departmentId, slot = 'a', skipUr = false) {
  const u = await upsertGateUser({
    email: `p5-${roleCode.toLowerCase()}-${slot}@${EMAIL_DOMAIN}`,
    roleCode,
    tenantId,
    departmentId,
    skipUr,
  });
  const slug = (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })).slug;
  const sess = await getSession(API_BASE, u, slug);
  return { ...u, token: sess?.token };
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
  let destLoc = await prisma.location.findFirst({
    where: { tenantId, isActive: true, id: { not: loc.id }, departmentId: dept.id },
  });
  if (!destLoc) {
    destLoc = await prisma.location.create({
      data: { tenantId, departmentId: dept.id, name: `${FIXTURE_TAG} Dest`, type: 'OUTLET_STORE', isActive: true },
    });
  }
  let item = await prisma.item.findFirst({ where: { tenantId, isActive: true, departmentId: dept.id } });
  if (!item) {
    item = await prisma.item.create({
      data: {
        tenantId,
        name: `${FIXTURE_TAG} Item`,
        code: `P5-${Date.now()}`,
        isActive: true,
        unitPrice: 5,
        defaultStoreId: loc.id,
        departmentId: dept.id,
      },
    });
  }
  let unit = await prisma.unit.findFirst({ where: { tenantId, isActive: true } });
  if (!unit) {
    unit = await prisma.unit.create({ data: { tenantId, name: 'Each', code: 'EA', isActive: true } });
  }
  await prisma.stockBalance.upsert({
    where: { tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: loc.id } },
    update: { qtyOnHand: 500 },
    create: { tenantId, itemId: item.id, locationId: loc.id, qtyOnHand: 500, wacUnitCost: 5 },
  });
  await prisma.stockBalance.upsert({
    where: { tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: destLoc.id } },
    update: { qtyOnHand: 50 },
    create: { tenantId, itemId: item.id, locationId: destLoc.id, qtyOnHand: 50, wacUnitCost: 5 },
  });
  return { departmentId: dept.id, locationId: loc.id, destLocationId: destLoc.id, itemId: item.id, unitId: unit.id, tenantId };
}

function transferPayload(stock, tag) {
  return {
    sourceLocationId: stock.locationId,
    destLocationId: stock.destLocationId,
    reason: `${FIXTURE_TAG} ${tag}`,
    lines: [{ itemId: stock.itemId, uomId: stock.unitId, requestedQty: 1 }],
  };
}

function movementPayload(stock, tag, movementType = 'BREAKAGE') {
  return {
    reason: `${FIXTURE_TAG} ${tag}`,
    suggestedAction: movementType === 'LOST' ? 'HOTEL' : 'HOTEL',
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 5, totalValue: 5 }],
    notes: FIXTURE_TAG,
  };
}

function lostPayload(stock, tag, suggestedAction = 'HOTEL', responsibleEmployeeName = null) {
  const body = movementPayload(stock, tag, 'LOST');
  body.suggestedAction = suggestedAction;
  if (responsibleEmployeeName) body.responsibleEmployeeName = responsibleEmployeeName;
  return body;
}

async function trRow(id, tenantId) {
  return prisma.storeTransfer.findFirst({ where: { id, tenantId }, select: { id: true, status: true, concurrencyVersion: true, transferNo: true } });
}

async function movRow(id, tenantId) {
  return prisma.movementDocument.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, concurrencyVersion: true, documentNo: true, suggestedAction: true },
  });
}

async function snapshotDetail(module, id, token) {
  const paths = { TRANSFER: `/transfers/${id}`, BREAKAGE: `/breakage/${id}`, LOST: `/lost/${id}` };
  const res = await apiRequest(API_BASE, 'GET', paths[module], null, token);
  const d = detailData(res);
  return {
    http: res.status,
    id: d?.id,
    documentNo: d?.transferNo || d?.documentNo,
    status: d?.status,
    userFacingState: d?.constitutionUserFacingState || d?.userFacingState,
    lineCount: d?.lines?.length ?? 0,
    totalQty: sumLineQty(d?.lines),
    totalValue: sumLineTotals(d?.lines),
    lines: (d?.lines || []).map((l) => ({
      itemId: l.itemId,
      qty: l.qty ?? l.requestedQty ?? l.qtyRequested,
      unitCost: l.unitCost,
      totalValue: l.totalValue,
    })),
  };
}

async function seedTransferFixtures(ctx) {
  const { stock, storekeeper, deptManager, financeManager, orgManager } = ctx;
  const out = {};

  const cDraft = await apiRequest(API_BASE, 'POST', '/transfers', transferPayload(stock, 'DRAFT'), storekeeper.token);
  const draftId = cDraft.data?.data?.id;
  if (!draftId) throw new Error(`Transfer DRAFT create failed: ${cDraft.status}`);
  out.draft = { id: draftId, ...(await snapshotDetail('TRANSFER', draftId, orgManager.token)), scenario: 'DRAFT' };

  const cPen = await apiRequest(API_BASE, 'POST', '/transfers', transferPayload(stock, 'PENDING_DEPT'), storekeeper.token);
  const penId = cPen.data?.data?.id;
  let ver = (await trRow(penId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${penId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  out.pendingDept = { id: penId, ...(await snapshotDetail('TRANSFER', penId, orgManager.token)), scenario: 'PENDING_DEPT' };

  const cFin = await apiRequest(API_BASE, 'POST', '/transfers', transferPayload(stock, 'PENDING_FINANCE'), storekeeper.token);
  const finId = cFin.data?.data?.id;
  ver = (await trRow(finId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${finId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  ver = (await trRow(finId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${finId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, deptManager.token);
  out.pendingFinance = { id: finId, ...(await snapshotDetail('TRANSFER', finId, orgManager.token)), scenario: 'PENDING_FINANCE' };

  const cPost = await apiRequest(API_BASE, 'POST', '/transfers', transferPayload(stock, 'POSTED'), storekeeper.token);
  const postId = cPost.data?.data?.id;
  ver = (await trRow(postId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${postId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  ver = (await trRow(postId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${postId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, deptManager.token);
  ver = (await trRow(postId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${postId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, financeManager.token);
  const postedRow = await trRow(postId, ctx.tenantId);
  const ledger = await prisma.inventoryLedger.count({ where: { tenantId: ctx.tenantId, referenceId: postId } });
  out.posted = {
    id: postId,
    ...(await snapshotDetail('TRANSFER', postId, orgManager.token)),
    scenario: 'POSTED',
    ledgerRows: ledger,
    stockSource: Number((await prisma.stockBalance.findUnique({
      where: { tenantId_itemId_locationId: { tenantId: ctx.tenantId, itemId: stock.itemId, locationId: stock.locationId } },
    }))?.qtyOnHand),
  };

  const cRej = await apiRequest(API_BASE, 'POST', '/transfers', transferPayload(stock, 'REJECTED'), storekeeper.token);
  const rejId = cRej.data?.data?.id;
  ver = (await trRow(rejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${rejId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  ver = (await trRow(rejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${rejId}/reject`, { reason: FIXTURE_TAG, concurrencyVersion: ver }, deptManager.token);
  out.rejected = { id: rejId, ...(await snapshotDetail('TRANSFER', rejId, orgManager.token)), scenario: 'REJECTED' };

  const cDel = await apiRequest(API_BASE, 'POST', '/transfers', transferPayload(stock, 'DRAFT-DELETE'), storekeeper.token);
  const delId = cDel.data?.data?.id;
  out.draftDelete = { id: delId, ...(await snapshotDetail('TRANSFER', delId, orgManager.token)), scenario: 'DRAFT_DELETE' };

  const cFinRej = await apiRequest(API_BASE, 'POST', '/transfers', transferPayload(stock, 'PENDING_FINANCE_REJECT'), storekeeper.token);
  const finRejId = cFinRej.data?.data?.id;
  ver = (await trRow(finRejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${finRejId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  ver = (await trRow(finRejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${finRejId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, deptManager.token);
  out.pendingFinanceReject = { id: finRejId, ...(await snapshotDetail('TRANSFER', finRejId, orgManager.token)), scenario: 'PENDING_FINANCE_REJECT' };

  return out;
}

async function approveBreakageChain(id, actors) {
  for (const actor of [actors.costControl, actors.financeManager, actors.generalManager]) {
    const row = await movRow(id, actors.tenantId);
    if (row?.status === 'APPROVED') break;
    const ver = row?.concurrencyVersion ?? 0;
    const res = await apiRequest(API_BASE, 'POST', `/breakage/${id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, actor.token);
    if (!is2xx(res.status) && row?.status !== 'APPROVED') throw new Error(`Breakage approve failed: ${res.status} ${JSON.stringify(res.data || res.message || '')}`);
  }
}

async function approveBreakagePartial(id, actors, steps) {
  for (const key of steps) {
    const actor = actors[key];
    const row = await movRow(id, actors.tenantId);
    const ver = row?.concurrencyVersion ?? 0;
    const res = await apiRequest(API_BASE, 'POST', `/breakage/${id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, actor.token);
    if (!is2xx(res.status)) throw new Error(`Breakage partial approve (${key}) failed: ${res.status}`);
  }
}

async function seedBreakageFixtures(ctx) {
  const { stock, storekeeper, deptManager, costControl, financeManager, generalManager, orgManager } = ctx;
  const out = {};

  const cDraft = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'DRAFT'), storekeeper.token);
  const draftId = cDraft.data?.data?.id;
  if (!draftId) throw new Error(`Breakage DRAFT failed: ${cDraft.status} ${JSON.stringify(cDraft.data)}`);
  out.draft = { id: draftId, ...(await snapshotDetail('BREAKAGE', draftId, orgManager.token)), scenario: 'DRAFT' };

  const cDraftSubmit = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'DRAFT-SUBMIT'), storekeeper.token);
  const draftSubmitId = cDraftSubmit.data?.data?.id;
  out.draftSubmit = { id: draftSubmitId, ...(await snapshotDetail('BREAKAGE', draftSubmitId, orgManager.token)), scenario: 'DRAFT_SUBMIT' };

  const cCc = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'PENDING_CC'), storekeeper.token);
  const ccId = cCc.data?.data?.id;
  let ver = (await movRow(ccId, ctx.tenantId))?.concurrencyVersion ?? 0;
  const subCc = await apiRequest(API_BASE, 'POST', `/breakage/${ccId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  if (!is2xx(subCc.status)) throw new Error(`Breakage submit (CC) failed: ${subCc.status}`);
  out.pendingCostControl = { id: ccId, ...(await snapshotDetail('BREAKAGE', ccId, orgManager.token)), scenario: 'PENDING_COST_CONTROL' };

  const cCcRej = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'PENDING_CC_REJECT'), storekeeper.token);
  const ccRejId = cCcRej.data?.data?.id;
  ver = (await movRow(ccRejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/breakage/${ccRejId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  out.pendingCostControlReject = { id: ccRejId, ...(await snapshotDetail('BREAKAGE', ccRejId, orgManager.token)), scenario: 'PENDING_CC_REJECT' };

  const cAp = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'APPROVED'), storekeeper.token);
  const apId = cAp.data?.data?.id;
  ver = (await movRow(apId, ctx.tenantId))?.concurrencyVersion ?? 0;
  const subAp = await apiRequest(API_BASE, 'POST', `/breakage/${apId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  if (!is2xx(subAp.status)) throw new Error(`Breakage submit (approved) failed: ${subAp.status}`);
  await approveBreakageChain(apId, { ...ctx, tenantId: ctx.tenantId });
  const ledger = await prisma.inventoryLedger.count({ where: { tenantId: ctx.tenantId, referenceId: apId } });
  out.approved = { id: apId, ...(await snapshotDetail('BREAKAGE', apId, orgManager.token)), scenario: 'APPROVED', ledgerRows: ledger };

  const cFin = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'PENDING_FINANCE'), storekeeper.token);
  const finId = cFin.data?.data?.id;
  ver = (await movRow(finId, ctx.tenantId))?.concurrencyVersion ?? 0;
  const subFin = await apiRequest(API_BASE, 'POST', `/breakage/${finId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  if (!is2xx(subFin.status)) throw new Error(`Breakage submit (finance) failed: ${subFin.status}`);
  await approveBreakagePartial(finId, { ...ctx, tenantId: ctx.tenantId }, ['costControl']);
  out.pendingFinance = { id: finId, ...(await snapshotDetail('BREAKAGE', finId, orgManager.token)), scenario: 'PENDING_FINANCE' };

  const cGm = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'PENDING_GM'), storekeeper.token);
  const gmId = cGm.data?.data?.id;
  ver = (await movRow(gmId, ctx.tenantId))?.concurrencyVersion ?? 0;
  const subGm = await apiRequest(API_BASE, 'POST', `/breakage/${gmId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  if (!is2xx(subGm.status)) throw new Error(`Breakage submit (GM) failed: ${subGm.status}`);
  await approveBreakagePartial(gmId, { ...ctx, tenantId: ctx.tenantId }, ['costControl', 'financeManager']);
  out.pendingGm = { id: gmId, ...(await snapshotDetail('BREAKAGE', gmId, orgManager.token)), scenario: 'PENDING_GM' };

  const cRej = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'REJECTED'), storekeeper.token);
  const rejId = cRej.data?.data?.id;
  ver = (await movRow(rejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  const subRej = await apiRequest(API_BASE, 'POST', `/breakage/${rejId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  if (!is2xx(subRej.status)) throw new Error(`Breakage submit (reject) failed: ${subRej.status}`);
  ver = (await movRow(rejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/breakage/${rejId}/reject`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, costControl.token);
  out.rejected = { id: rejId, ...(await snapshotDetail('BREAKAGE', rejId, orgManager.token)), scenario: 'REJECTED' };

  const cVoid = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'VOID'), storekeeper.token);
  const voidId = cVoid.data?.data?.id;
  ver = (await movRow(voidId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/breakage/${voidId}/void`, { reason: FIXTURE_TAG, concurrencyVersion: ver }, storekeeper.token);
  out.void = { id: voidId, ...(await snapshotDetail('BREAKAGE', voidId, orgManager.token)), scenario: 'VOID' };

  return out;
}

async function approveLostChain(id, actors, gmBody = {}) {
  for (const actor of [actors.costControl, actors.financeManager, actors.generalManager]) {
    const row = await movRow(id, actors.tenantId);
    if (row?.status === 'APPROVED' || row?.status === 'REJECTED') break;
    const ver = row?.concurrencyVersion ?? 0;
    const body = { comment: FIXTURE_TAG, concurrencyVersion: ver, ...gmBody };
    const res = await apiRequest(API_BASE, 'POST', `/lost/${id}/approve`, body, actor.token);
    if (!is2xx(res.status) && row?.status !== 'APPROVED') throw new Error(`Lost approve failed: ${res.status} ${res.message || ''}`);
  }
}

async function seedLostFixtures(ctx) {
  const { stock, deptManager, orgManager } = ctx;
  const out = {};

  const cDept = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock, 'PENDING-CC-ENTRY'), deptManager.token);
  const deptId = cDept.data?.data?.id;
  if (!deptId) throw new Error(`Lost create failed: ${cDept.status}`);
  out.deptApproved = { id: deptId, ...(await snapshotDetail('LOST', deptId, orgManager.token)), scenario: 'DEPT_APPROVED' };

  const cDeptRej = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock, 'DEPT_REJECT'), deptManager.token);
  const deptRejId = cDeptRej.data?.data?.id;
  out.deptApprovedReject = { id: deptRejId, ...(await snapshotDetail('LOST', deptRejId, orgManager.token)), scenario: 'DEPT_APPROVED_REJECT' };

  const cPenFin = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock, 'PENDING_FINANCE'), deptManager.token);
  const penFinId = cPenFin.data?.data?.id;
  let ver = (await movRow(penFinId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/lost/${penFinId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, ctx.costControl.token);
  out.pendingFinance = { id: penFinId, ...(await snapshotDetail('LOST', penFinId, orgManager.token)), scenario: 'PENDING_FINANCE' };

  const cPenGm = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock, 'PENDING_GM'), deptManager.token);
  const penGmId = cPenGm.data?.data?.id;
  ver = (await movRow(penGmId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/lost/${penGmId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, ctx.costControl.token);
  ver = (await movRow(penGmId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/lost/${penGmId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, ctx.financeManager.token);
  out.pendingGm = { id: penGmId, ...(await snapshotDetail('LOST', penGmId, orgManager.token)), scenario: 'PENDING_GM' };

  const cEmp = await apiRequest(
    API_BASE,
    'POST',
    '/lost',
    lostPayload(stock, 'APPROVED_EMPLOYEE', 'EMPLOYEE', 'Phase5 Test Employee'),
    deptManager.token,
  );
  const empId = cEmp.data?.data?.id;
  await approveLostChain(empId, { ...ctx, tenantId: ctx.tenantId }, {
    accountability: 'EMPLOYEE',
    comment: 'Phase5 Test Employee',
  });
  out.approvedEmployee = { id: empId, ...(await snapshotDetail('LOST', empId, orgManager.token)), scenario: 'APPROVED_EMPLOYEE' };

  const cHotel = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock, 'APPROVED_HOTEL', 'HOTEL'), deptManager.token);
  const hotelId = cHotel.data?.data?.id;
  await approveLostChain(hotelId, { ...ctx, tenantId: ctx.tenantId }, { accountability: 'HOTEL' });
  out.approvedHotel = { id: hotelId, ...(await snapshotDetail('LOST', hotelId, orgManager.token)), scenario: 'APPROVED_HOTEL' };

  const cRej = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock, 'REJECTED'), deptManager.token);
  const rejId = cRej.data?.data?.id;
  ver = (await movRow(rejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  const rejRes = await apiRequest(API_BASE, 'POST', `/lost/${rejId}/reject`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, ctx.costControl.token);
  if (!is2xx(rejRes.status)) throw new Error(`Lost reject failed: ${rejRes.status} ${JSON.stringify(rejRes.data)}`);
  out.rejected = { id: rejId, ...(await snapshotDetail('LOST', rejId, orgManager.token)), scenario: 'REJECTED' };

  return out;
}

async function ensureOutOfScopeStock(tenantId) {
  let dept = await prisma.department.findFirst({ where: { tenantId, code: 'HK' } });
  if (!dept) {
    dept = await prisma.department.create({
      data: { tenantId, code: 'HK', name: `${FIXTURE_TAG} HK`, isActive: true },
    });
  }
  let loc = await prisma.location.findFirst({ where: { tenantId, departmentId: dept.id, isActive: true } });
  if (!loc) {
    loc = await prisma.location.create({
      data: { tenantId, departmentId: dept.id, name: `${FIXTURE_TAG} HK Store`, type: 'MAIN_STORE', isActive: true },
    });
  }
  let destLoc = await prisma.location.findFirst({
    where: { tenantId, departmentId: dept.id, isActive: true, id: { not: loc.id } },
  });
  if (!destLoc) {
    destLoc = await prisma.location.create({
      data: { tenantId, departmentId: dept.id, name: `${FIXTURE_TAG} HK Dest`, type: 'OUTLET_STORE', isActive: true },
    });
  }
  let item = await prisma.item.findFirst({ where: { tenantId, departmentId: dept.id, isActive: true } });
  if (!item) {
    item = await prisma.item.create({
      data: {
        tenantId,
        name: `${FIXTURE_TAG} HK Item`,
        code: `P5-HK-${Date.now()}`,
        isActive: true,
        unitPrice: 5,
        defaultStoreId: loc.id,
        departmentId: dept.id,
      },
    });
  }
  await prisma.stockBalance.upsert({
    where: { tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: loc.id } },
    update: { qtyOnHand: 100 },
    create: { tenantId, itemId: item.id, locationId: loc.id, qtyOnHand: 100, wacUnitCost: 5 },
  });
  let unit = await prisma.unit.findFirst({ where: { tenantId, isActive: true } });
  return { departmentId: dept.id, locationId: loc.id, destLocationId: destLoc.id, itemId: item.id, unitId: unit?.id, tenantId };
}

async function seedOutOfScopeFixtures(ctx) {
  const oosStock = await ensureOutOfScopeStock(ctx.tenantId);
  const scopedUser = await seedActor('DEPT_MANAGER', ctx.tenantId, ctx.stock.departmentId, 'scoped');
  const ts = Date.now();
  const uomId = oosStock.unitId || ctx.stock.unitId;

  const trDoc = await prisma.storeTransfer.create({
    data: {
      tenantId: ctx.tenantId,
      transferNo: `P5-OOS-TR-${ts}`,
      sourceLocationId: oosStock.locationId,
      destLocationId: oosStock.destLocationId,
      requestedBy: ctx.orgManager.userId,
      status: 'DRAFT',
      reason: `${FIXTURE_TAG} OOS`,
      lines: { create: [{ itemId: oosStock.itemId, uomId, requestedQty: 1 }] },
    },
  });

  const brDoc = await prisma.movementDocument.create({
    data: {
      tenantId: ctx.tenantId,
      documentNo: `P5-OOS-BRK-${ts}`,
      movementType: 'BREAKAGE',
      status: 'DRAFT',
      sourceLocationId: oosStock.locationId,
      reason: `${FIXTURE_TAG} OOS`,
      suggestedAction: 'HOTEL',
      createdBy: ctx.orgManager.userId,
      lines: {
        create: [{
          itemId: oosStock.itemId,
          locationId: oosStock.locationId,
          qtyRequested: 1,
          qtyInBaseUnit: 1,
          unitCost: 5,
          totalValue: 5,
        }],
      },
    },
  });

  const loDoc = await prisma.movementDocument.create({
    data: {
      tenantId: ctx.tenantId,
      documentNo: `P5-OOS-LOST-${ts}`,
      movementType: 'LOST',
      status: 'DEPT_APPROVED',
      sourceLocationId: oosStock.locationId,
      reason: `${FIXTURE_TAG} OOS`,
      suggestedAction: 'HOTEL',
      createdBy: ctx.deptManager.userId,
      lines: {
        create: [{
          itemId: oosStock.itemId,
          locationId: oosStock.locationId,
          qtyRequested: 1,
          qtyInBaseUnit: 1,
          unitCost: 5,
          totalValue: 5,
        }],
      },
    },
  });

  const trDetail = await apiRequest(API_BASE, 'GET', `/transfers/${trDoc.id}`, null, scopedUser.token);
  const brDetail = await apiRequest(API_BASE, 'GET', `/breakage/${brDoc.id}`, null, scopedUser.token);
  const loDetail = await apiRequest(API_BASE, 'GET', `/lost/${loDoc.id}`, null, scopedUser.token);

  return {
    scopedUserEmail: scopedUser.email,
    transfer: { id: trDoc.id, http: trDetail.status },
    breakage: { id: brDoc.id, http: brDetail.status },
    lost: { id: loDoc.id, http: loDetail.status },
    expectedStatus: 403,
  };
}

async function seedNegativeActors(ctx) {
  const inactiveU = await upsertGateUser({
    email: `p5-dept_manager-inactive@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: ctx.tenantId,
    departmentId: ctx.stock.departmentId,
    urActive: false,
  });
  const wrongPropertyId = HOTEL_B?.id && HOTEL_B.id !== ctx.tenantId ? HOTEL_B.id : ctx.tenantId;
  const wrongPropUser = await upsertGateUser({
    email: `p5-dept_manager-wrongprop@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: ctx.tenantId,
    departmentId: ctx.stock.departmentId,
    propertyIds: [wrongPropertyId],
  });
  const deletedU = await upsertGateUser({
    email: `p5-dept_manager-deleted@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: ctx.tenantId,
    departmentId: ctx.stock.departmentId,
  });
  await prisma.urUserAssignment.deleteMany({ where: { userId: deletedU.userId } });
  const viewOnly = await seedActor('AUDITOR', ctx.tenantId, ctx.stock.departmentId, 'view');
  return {
    noAssign: ctx.noAssign.email,
    inactiveAssign: inactiveU.email,
    wrongProperty: wrongPropUser.email,
    deletedAssign: deletedU.email,
    viewOnly: viewOnly.email,
  };
}

async function seedBrowserFlows(ctx) {
  const { stock, storekeeper } = ctx;
  const qty = 1;

  const cTr = await apiRequest(API_BASE, 'POST', '/transfers', transferPayload(stock, 'BROWSER-POST'), storekeeper.token);
  const trId = cTr.data?.data?.id;
  if (!trId) throw new Error('browser transfer create failed');
  let ver = (await trRow(trId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${trId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  const stockBeforeSrc = await stockSnapshot(ctx.tenantId, stock.itemId, stock.locationId);
  const stockBeforeDest = await stockSnapshot(ctx.tenantId, stock.itemId, stock.destLocationId);

  const cBr = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'BROWSER-CC'), storekeeper.token);
  const brCcId = cBr.data?.data?.id;
  ver = (await movRow(brCcId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/breakage/${brCcId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  const brStockBefore = await stockSnapshot(ctx.tenantId, stock.itemId, stock.locationId);

  const cVoid = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'BROWSER-VOID'), storekeeper.token);
  const voidDraftId = cVoid.data?.data?.id;

  const cRej = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'BROWSER-VOID-REJ'), storekeeper.token);
  const voidRejId = cRej.data?.data?.id;
  ver = (await movRow(voidRejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/breakage/${voidRejId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  ver = (await movRow(voidRejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/breakage/${voidRejId}/reject`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, ctx.costControl.token);

  const cLost = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock, 'BROWSER-CHAIN', 'EMPLOYEE', 'Phase5 Browser Employee'), ctx.deptManager.token);
  const lostChainId = cLost.data?.data?.id;

  const cLostRej = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock, 'BROWSER-REJECT'), ctx.deptManager.token);
  const lostRejectId = cLostRej.data?.data?.id;

  const cLostHotel = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock, 'BROWSER-CHAIN-HOTEL', 'HOTEL'), ctx.deptManager.token);
  const lostHotelId = cLostHotel.data?.data?.id;

  const cTrRej = await apiRequest(API_BASE, 'POST', '/transfers', transferPayload(stock, 'BROWSER-REJECT'), storekeeper.token);
  const trRejId = cTrRej.data?.data?.id;
  ver = (await trRow(trRejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${trRejId}/submit`, { concurrencyVersion: ver }, storekeeper.token);
  ver = (await trRow(trRejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${trRejId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, ctx.deptManager.token);

  const cBrRej = await apiRequest(API_BASE, 'POST', '/breakage', movementPayload(stock, 'BROWSER-REJECT'), storekeeper.token);
  const brRejId = cBrRej.data?.data?.id;
  ver = (await movRow(brRejId, ctx.tenantId))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/breakage/${brRejId}/submit`, { concurrencyVersion: ver }, storekeeper.token);

  return {
    transferPost: {
      id: trId,
      itemId: stock.itemId,
      sourceLocationId: stock.locationId,
      destLocationId: stock.destLocationId,
      qty,
      stockBefore: { source: stockBeforeSrc, dest: stockBeforeDest },
    },
    breakageApprove: {
      pendingCcId: brCcId,
      itemId: stock.itemId,
      locationId: stock.locationId,
      qty,
      stockBefore: brStockBefore,
    },
    breakageVoidDraft: { draftId: voidDraftId },
    breakageVoidRejected: { rejectedId: voidRejId },
    lostChain: { deptApprovedId: lostChainId, itemId: stock.itemId, locationId: stock.locationId, qty },
    lostChainHotel: { deptApprovedId: lostHotelId, itemId: stock.itemId, locationId: stock.locationId, qty },
    lostReject: { deptApprovedId: lostRejectId },
    transferReject: { pendingFinanceId: trRejId },
    breakageReject: { pendingCcId: brRejId },
  };
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: CHILD_SLUG } });
  if (!tenant) throw new Error(`Tenant ${CHILD_SLUG} not found`);

  const stock = await ensureStock(tenant.id);
  const storekeeper = await seedActor('STOREKEEPER', tenant.id, stock.departmentId, 'sk');
  const deptManager = await seedActor('DEPT_MANAGER', tenant.id, stock.departmentId, 'dm');
  const costControl = await seedActor('COST_CONTROL', tenant.id, stock.departmentId, 'cc');
  const financeManager = await seedActor('FINANCE_MANAGER', tenant.id, stock.departmentId, 'fin');
  const generalManager = await seedActor('GENERAL_MANAGER', tenant.id, stock.departmentId, 'gm');
  const orgManager = await seedActor('ORG_MANAGER', tenant.id, stock.departmentId, 'org');
  const noAssign = await seedActor('FINANCE_MANAGER', tenant.id, stock.departmentId, 'noassign', true);

  if (![storekeeper, deptManager, costControl, financeManager, generalManager, orgManager].every((a) => a.token)) {
    throw new Error('Actor login failed');
  }

  const ctx = {
    tenantId: tenant.id,
    tenantSlug: CHILD_SLUG,
    stock,
    storekeeper,
    deptManager,
    costControl,
    financeManager,
    generalManager,
    orgManager,
    noAssign,
  };

  const foreignTenantId = HOTEL_B?.id || (await prisma.tenant.findFirst({ where: { slug: { not: CHILD_SLUG } } }))?.id;
  const foreignDoc = foreignTenantId
    ? await prisma.storeTransfer.findFirst({ where: { tenantId: foreignTenantId }, select: { id: true } })
    : null;

  const fixtures = {
    generatedAt: new Date().toISOString(),
    fixtureTag: FIXTURE_TAG,
    tenantId: tenant.id,
    tenantSlug: CHILD_SLUG,
    actors: {
      orgManager: orgManager.email,
      storekeeper: storekeeper.email,
      deptManager: deptManager.email,
      costControl: costControl.email,
      financeManager: financeManager.email,
      generalManager: generalManager.email,
      noAssign: noAssign.email,
    },
    transfer: await seedTransferFixtures(ctx),
    breakage: await seedBreakageFixtures(ctx),
    lost: await seedLostFixtures(ctx),
    crossTenant: {
      foreignTransferId: foreignDoc?.id || '00000000-0000-0000-0000-000000000000',
      expectedStatus: 404,
    },
    outOfScope: await seedOutOfScopeFixtures(ctx),
    browserFlows: await seedBrowserFlows(ctx),
    negativeActors: await seedNegativeActors(ctx),
  };

  fixtures.actors.viewOnly = fixtures.negativeActors.viewOnly;
  fixtures.actors.inactiveAssign = fixtures.negativeActors.inactiveAssign;
  fixtures.actors.wrongProperty = fixtures.negativeActors.wrongProperty;
  fixtures.actors.deletedAssign = fixtures.negativeActors.deletedAssign;

  fs.writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  console.log('Wrote', FIXTURES_PATH);
  console.log(JSON.stringify({
    transfer: Object.fromEntries(Object.entries(fixtures.transfer).map(([k, v]) => [k, v.id])),
    breakage: Object.fromEntries(Object.entries(fixtures.breakage).map(([k, v]) => [k, v.id])),
    lost: Object.fromEntries(Object.entries(fixtures.lost).map(([k, v]) => [k, v.id])),
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
