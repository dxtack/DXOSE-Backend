'use strict';

/**
 * Phase 4 — Deterministic timeline fixture seeder.
 * Usage: node Governance/phase-4-workflow-timeline/phase-4-timeline-fixture-seed.cjs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const GOV_DIR = __dirname;
const BACKEND = path.join(__dirname, '../../OSE-backend');
const API_BASE = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const FIXTURE_TAG = 'PHASE4_TIMELINE_GATE';
const PASSWORD = 'Phase4Gate@123';
const EMAIL_DOMAIN = 'phase4-timeline-gate.local';
const CHILD_SLUG = 'closeout-audit-hotel-disposable';

const { apiRequest, getSession } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/http'));
const prisma = require(path.join(BACKEND, 'src/config/database'));
const grnService = require(path.join(BACKEND, 'src/services/grn.service'));
const {
  findActorWithRole,
  approveCostAndFinanceForSendBackCycle,
  actorFromMember,
} = require(path.join(BACKEND, 'scripts/lib/grn-timeline-fixture.helpers'));
const inventoryCountService = require(path.join(BACKEND, 'src/services/inventoryCount.service'));
const {
  normalizeTimeline,
  FIXTURES_PATH,
  timelineEntriesFromResponse,
} = require('./phase-4-timeline-assertions.lib.cjs');

function is2xx(status) {
  return status >= 200 && status < 300;
}

async function upsertGateUser({ email, roleCode, tenantId, departmentId }) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, isActive: true },
    create: { email, passwordHash: hash, isActive: true, firstName: 'Phase4', lastName: roleCode },
  });
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    update: { roleId: role.id, isActive: true, departmentId: departmentId || null },
    create: { tenantId, userId: user.id, roleId: role.id, isActive: true, departmentId: departmentId || null },
  });
  await prisma.urUserAssignment.deleteMany({ where: { userId: user.id, notes: { startsWith: FIXTURE_TAG } } });
  const a = await prisma.urUserAssignment.create({
    data: { userId: user.id, roleId: role.id, isActive: true, notes: `${FIXTURE_TAG} ${roleCode}` },
  });
  await prisma.urAssignmentProperty.create({ data: { assignmentId: a.id, propertyId: tenantId } });
  if (departmentId) {
    await prisma.urAssignmentDepartment.create({ data: { assignmentId: a.id, departmentId } });
  }
  return { email, userId: user.id, password: PASSWORD };
}

async function seedActor(roleCode, tenantId, departmentId, slot = 'a') {
  const u = await upsertGateUser({
    email: `p4-${roleCode.toLowerCase()}-${String(slot).toLowerCase()}@${EMAIL_DOMAIN}`,
    roleCode,
    tenantId,
    departmentId,
  });
  const slug = (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })).slug;
  const sess = await getSession(API_BASE, u, slug);
  return { ...u, token: sess?.token };
}

async function fetchTimeline(token, moduleKey, id) {
  return apiRequest(API_BASE, 'GET', `/constitution/timeline/${moduleKey}/${id}`, null, token);
}

async function ensureStock(tenantId, departmentId) {
  let dept = departmentId
    ? await prisma.department.findFirst({ where: { id: departmentId, tenantId } })
    : await prisma.department.findFirst({ where: { tenantId, isActive: true } });
  if (!dept) {
    dept = await prisma.department.create({
      data: { tenantId, code: 'P4FB', name: `${FIXTURE_TAG} FB`, isActive: true },
    });
  }
  let loc = await prisma.location.findFirst({ where: { tenantId, departmentId: dept.id, isActive: true } });
  if (!loc) {
    loc = await prisma.location.create({
      data: { tenantId, departmentId: dept.id, name: `${FIXTURE_TAG} Store`, type: 'MAIN_STORE', isActive: true },
    });
  }
  let destLoc = await prisma.location.findFirst({
    where: { tenantId, isActive: true, id: { not: loc.id } },
  });
  if (!destLoc) {
    destLoc = await prisma.location.create({
      data: { tenantId, departmentId: dept.id, name: `${FIXTURE_TAG} Dest`, type: 'SUB_STORE', isActive: true },
    });
  }
  let item = await prisma.item.findFirst({ where: { tenantId, isActive: true, departmentId: dept.id } });
  if (!item) {
    item = await prisma.item.create({
      data: {
        tenantId,
        name: `${FIXTURE_TAG} Item`,
        code: `P4-${Date.now()}`,
        isActive: true,
        unitPrice: 5,
        defaultStoreId: loc.id,
        departmentId: dept.id,
      },
    });
  }
  await prisma.stockBalance.upsert({
    where: { tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: loc.id } },
    update: { qtyOnHand: 200 },
    create: { tenantId, itemId: item.id, locationId: loc.id, qtyOnHand: 200, wacUnitCost: 5 },
  });
  return { departmentId: dept.id, locationId: loc.id, destLocationId: destLoc.id, itemId: item.id, tenantId };
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
    select: { id: true, status: true, concurrencyVersion: true, passNo: true },
  });
}

async function ensureGrnPrerequisites(tenantId, stock) {
  let supplier = await prisma.supplier.findFirst({ where: { tenantId, isActive: true } });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: { tenantId, name: `${FIXTURE_TAG} Supplier`, isActive: true },
    });
  }

  let unit = await prisma.unit.findFirst({ where: { tenantId, isActive: true } });
  if (!unit) {
    unit = await prisma.unit.create({
      data: { tenantId, name: 'Each', code: 'EA', isActive: true },
    });
  }

  let item = await prisma.item.findFirst({
    where: { tenantId, itemUnits: { some: {} } },
    include: { itemUnits: { include: { unit: true } } },
  });
  if (!item) {
    item = await prisma.item.create({
      data: {
        tenantId,
        name: `${FIXTURE_TAG} GRN Item`,
        code: `P4-GRN-${Date.now()}`,
        isActive: true,
        unitPrice: 10,
        defaultStoreId: stock.locationId,
        departmentId: stock.departmentId,
        supplierId: supplier.id,
        itemUnits: {
          create: {
            tenantId,
            unitId: unit.id,
            unitType: 'BASE',
            conversionRate: 1,
            isDefault: true,
          },
        },
      },
      include: { itemUnits: { include: { unit: true } } },
    });
  }

  return { supplier, item };
}

async function seedGrnFixture(ctx, token) {
  const { supplier, item } = await ensureGrnPrerequisites(ctx.tenantId, ctx.stock);
  if (!supplier || !item?.itemUnits?.[0]) throw new Error('GRN seed: missing supplier/item');

  const costUser = await findActorWithRole(prisma, ctx.tenantId, 'COST_CONTROL');
  const financeUser = await findActorWithRole(prisma, ctx.tenantId, 'FINANCE_MANAGER');
  if (!costUser || !financeUser) throw new Error('GRN seed: missing cost/finance actors');

  const tag = `${FIXTURE_TAG}-GRN-${Date.now()}`;
  let grn = await grnService.createGrn({
    supplierId: supplier.id,
    locationId: ctx.stock.locationId,
    grnNumber: tag,
    supplierInvoiceNumber: `INV-${tag}`,
    receivingDate: new Date(),
    invoiceUrl: '/uploads/test-invoice.pdf',
    lines: [{
      itemId: item.id,
      uomId: item.itemUnits[0].unitId,
      receivedQty: 3,
      orderedQty: 3,
      unitPrice: 10,
    }],
    tenantId: ctx.tenantId,
    userId: ctx.storekeeper.userId,
  });
  grn = await grnService.submitForApproval(grn.id, ctx.tenantId, ctx.storekeeper.userId, grn.concurrencyVersion);
  await approveCostAndFinanceForSendBackCycle(prisma, { tenantId: ctx.tenantId }, grn.id, costUser, financeUser);
  grn = await grnService.getGrn(grn.id, ctx.tenantId);

  const tl = await fetchTimeline(token, 'GRN', grn.id);
  const entries = timelineEntriesFromResponse(tl);
  if (!entries.length) throw new Error('GRN seed: empty timeline');

  return {
    module: 'GRN',
    id: grn.id,
    documentNo: grn.grnNumber,
    status: grn.status,
    normalizedTimeline: normalizeTimeline(entries),
    lifecycleCounts: {
      SUBMIT_FOR_APPROVAL: entries.filter((e) => e.lifecycleEventType === 'SUBMIT_FOR_APPROVAL').length,
      SEND_BACK: entries.filter((e) => e.lifecycleEventType === 'SEND_BACK').length,
    },
  };
}

async function seedTransferFixture(ctx) {
  const { token: skToken } = ctx.storekeeper;
  const { token: dmToken } = ctx.deptManager;
  const { token: ccToken } = ctx.costControl;
  const { token: finToken } = ctx.financeManager;
  const unit = await prisma.unit.findFirst({ where: { tenantId: ctx.tenantId, isActive: true } });
  if (!unit) throw new Error('Transfer seed: missing unit');
  const payload = {
    sourceLocationId: ctx.stock.locationId,
    destLocationId: ctx.stock.destLocationId,
    reason: `${FIXTURE_TAG} transfer`,
    lines: [{ itemId: ctx.stock.itemId, uomId: unit.id, requestedQty: 1 }],
  };
  const create = await apiRequest(API_BASE, 'POST', '/transfers', payload, skToken);
  const id = create.data?.data?.id || create.data?.id;
  if (!id) throw new Error(`Transfer create failed: ${create.status} ${create.message || ''}`);
  let ver = (await prisma.storeTransfer.findFirst({ where: { id }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${id}/submit`, { concurrencyVersion: ver }, skToken);
  ver = (await prisma.storeTransfer.findFirst({ where: { id }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, dmToken);
  ver = (await prisma.storeTransfer.findFirst({ where: { id }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, ccToken);
  ver = (await prisma.storeTransfer.findFirst({ where: { id }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/transfers/${id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, finToken);

  const row = await prisma.storeTransfer.findFirst({ where: { id, tenantId: ctx.tenantId } });
  const tl = await fetchTimeline(ctx.orgManager.token, 'TRANSFER', id);
  const entries = timelineEntriesFromResponse(tl);
  if (!entries.length) throw new Error('Transfer seed: empty timeline');

  return {
    module: 'TRANSFER',
    id,
    documentNo: row?.documentNo || id,
    status: row?.status,
    normalizedTimeline: normalizeTimeline(entries),
  };
}

async function seedBreakageFixture(ctx) {
  const payload = {
    reason: `${FIXTURE_TAG} breakage`,
    suggestedAction: 'HOTEL',
    lines: [{ itemId: ctx.stock.itemId, locationId: ctx.stock.locationId, qty: 1, unitCost: 5, totalValue: 5 }],
    notes: FIXTURE_TAG,
  };
  const create = await apiRequest(API_BASE, 'POST', '/breakage', payload, ctx.deptManager.token);
  const id = create.data?.data?.id || create.data?.id;
  if (!id) throw new Error(`Breakage create failed: ${create.status}`);
  await apiRequest(API_BASE, 'POST', `/breakage/${id}/submit`, {}, ctx.deptManager.token);
  await apiRequest(API_BASE, 'POST', `/breakage/${id}/approve`, { comment: FIXTURE_TAG }, ctx.costControl.token);

  const row = await prisma.movementDocument.findFirst({ where: { id, tenantId: ctx.tenantId } });
  const tl = await fetchTimeline(ctx.orgManager.token, 'BREAKAGE', id);
  const entries = timelineEntriesFromResponse(tl);
  if (!entries.length) throw new Error('Breakage seed: empty timeline');

  return {
    module: 'BREAKAGE',
    id,
    documentNo: row?.documentNo || id,
    status: row?.status,
    normalizedTimeline: normalizeTimeline(entries),
  };
}

async function seedGetPassSendBackResubmit(ctx) {
  const { stock, deptManager, costControl, financeManager, orgManager } = ctx;
  const create = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock), deptManager.token);
  const gpId = create.data?.data?.id;
  if (!gpId) throw new Error(`Get Pass create failed: ${create.status}`);

  await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/submit`, { concurrencyVersion: create.data?.data?.concurrencyVersion ?? 0 }, deptManager.token);
  await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: (await gpRow(gpId, ctx.tenantId))?.concurrencyVersion ?? 0 }, deptManager.token);
  await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: (await gpRow(gpId, ctx.tenantId))?.concurrencyVersion ?? 0 }, costControl.token);

  const sendBackReason = `${FIXTURE_TAG} send back for correction`;
  const sb = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/send-back`,
    { reason: sendBackReason, concurrencyVersion: (await gpRow(gpId, ctx.tenantId))?.concurrencyVersion ?? 0 },
    financeManager.token,
  );
  if (!is2xx(sb.status)) throw new Error(`Send back failed: ${sb.status}`);

  const tlAfterSendBack = await fetchTimeline(orgManager.token, 'GET_PASS', gpId);
  const entriesAfterSb = timelineEntriesFromResponse(tlAfterSendBack);

  await apiRequest(
    API_BASE,
    'PUT',
    `/get-passes/${gpId}`,
    { borrowingEntity: `${FIXTURE_TAG} corrected`, concurrencyVersion: (await gpRow(gpId, ctx.tenantId))?.concurrencyVersion ?? 0 },
    deptManager.token,
  );
  const submit = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/submit`,
    { concurrencyVersion: (await gpRow(gpId, ctx.tenantId))?.concurrencyVersion ?? 0 },
    deptManager.token,
  );
  if (!is2xx(submit.status)) throw new Error(`Resubmit failed: ${submit.status}`);

  const tlFinal = await fetchTimeline(orgManager.token, 'GET_PASS', gpId);
  const entries = timelineEntriesFromResponse(tlFinal);
  if (!entries.length) throw new Error('Get Pass send-back/resubmit seed: empty timeline');
  const row = await gpRow(gpId, ctx.tenantId);

  return {
    module: 'GET_PASS',
    scenario: 'send_back_resubmit',
    id: gpId,
    documentNo: row?.passNo || gpId,
    status: row?.status,
    sendBackReason,
    normalizedTimeline: normalizeTimeline(entries),
    afterSendBackNormalized: normalizeTimeline(entriesAfterSb),
    expectations: {
      lifecycleCounts: { SEND_BACK: 1, RESUBMIT: 1, SUBMIT_FOR_APPROVAL: 1 },
      mustExcludeLifecycle: ['RETURN_PROCESSED'],
    },
  };
}

async function seedGetPassPhysicalReturn(ctx) {
  const { stock, deptManager, costControl, financeManager, security, orgManager } = ctx;
  const returnDate = new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0];
  const create = await apiRequest(
    API_BASE,
    'POST',
    '/get-passes',
    gpPayload(stock, { transferType: 'TEMPORARY', expectedReturnDate: returnDate }),
    deptManager.token,
  );
  const gpId = create.data?.data?.id;
  if (!gpId) throw new Error(`Get Pass TEMP create failed: ${create.status}`);

  let ver = create.data?.data?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/submit`, { concurrencyVersion: ver }, deptManager.token);
  for (const actor of [deptManager, costControl, financeManager, security]) {
    ver = (await gpRow(gpId, ctx.tenantId))?.concurrencyVersion ?? 0;
    await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, actor.token);
  }

  const line = await prisma.getPassLine.findFirst({ where: { getPassId: gpId } });
  const ret = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${gpId}/return`,
    { lines: [{ lineId: line.id, qtyGood: 1 }], notes: FIXTURE_TAG },
    financeManager.token,
  );
  if (!is2xx(ret.status)) throw new Error(`Physical return failed: ${ret.status}`);

  const tl = await fetchTimeline(orgManager.token, 'GET_PASS', gpId);
  const entries = timelineEntriesFromResponse(tl);
  const row = await gpRow(gpId, ctx.tenantId);

  return {
    module: 'GET_PASS',
    scenario: 'physical_return',
    id: gpId,
    documentNo: row?.passNo || gpId,
    status: row?.status,
    normalizedTimeline: normalizeTimeline(entries),
    expectations: {
      mustIncludeStageKeys: ['SECURITY_OUT', 'RETURN_PROCESSED'],
      mustExcludeLifecycle: ['SEND_BACK', 'RESUBMIT'],
      finalEvent: { stageKey: 'RETURN_PROCESSED', displayTitleKey: 'TIMELINE.STAGE.RETURN_PROCESSED_COMPLETED' },
    },
  };
}

async function seedGetPassV3GmFixture(ctx) {
  const v3Version = await prisma.accWorkflowVersion.findFirst({
    where: {
      versionNumber: 3,
      status: 'ARCHIVED',
      definition: { module: { key: 'GET_PASS' } },
      steps: { some: { statusKey: 'PENDING_GM' } },
    },
    select: { id: true, versionNumber: true },
  });
  if (!v3Version) throw new Error('Get Pass v3 GM seed: archived v3 version not found');

  const { stock, deptManager, costControl, financeManager, orgManager } = ctx;
  let gmActor = ctx.generalManager;
  if (!gmActor?.token) {
    gmActor = await seedActor('GENERAL_MANAGER', ctx.tenantId, stock.departmentId, 'gm');
    ctx.generalManager = gmActor;
  }

  const create = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock, { transferType: 'PERMANENT' }), deptManager.token);
  const gpId = create.data?.data?.id;
  if (!gpId) throw new Error(`Get Pass v3 create failed: ${create.status}`);

  await prisma.getPass.update({
    where: { id: gpId },
    data: { accWorkflowVersionId: v3Version.id },
  });

  let ver = create.data?.data?.concurrencyVersion ?? 0;
  await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/submit`, { concurrencyVersion: ver }, deptManager.token);

  for (const actor of [deptManager, costControl, financeManager, gmActor]) {
    ver = (await gpRow(gpId, ctx.tenantId))?.concurrencyVersion ?? 0;
    const appr = await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, actor.token);
    if (!is2xx(appr.status)) throw new Error(`Get Pass v3 approve failed at ${actor.email}: ${appr.status}`);
  }

  const row = await prisma.getPass.findFirst({
    where: { id: gpId, tenantId: ctx.tenantId },
    include: { gmApprover: { select: { id: true, firstName: true, lastName: true } }, accWorkflowVersion: { select: { id: true, versionNumber: true } } },
  });
  if (!row?.gmApprovedAt || !row.gmApprover) {
    throw new Error('Get Pass v3 GM seed: gmApprovedAt stamp missing after GM approval');
  }

  const tl = await fetchTimeline(orgManager.token, 'GET_PASS', gpId);
  const entries = timelineEntriesFromResponse(tl);
  if (!entries.some((e) => e.stageKey === 'GENERAL_MANAGER')) {
    throw new Error('Get Pass v3 GM seed: timeline missing GENERAL_MANAGER stage');
  }
  const gmIdx = entries.findIndex((e) => e.stageKey === 'GENERAL_MANAGER');
  const secIdx = entries.findIndex((e) => e.stageKey === 'SECURITY');
  if (secIdx >= 0 && gmIdx >= 0 && secIdx < gmIdx) {
    throw new Error('Get Pass v3 GM seed: SECURITY appears before GM');
  }

  return {
    module: 'GET_PASS',
    scenario: 'historical_v3_gm',
    id: gpId,
    documentNo: row.passNo,
    status: row.status,
    tenantId: ctx.tenantId,
    accWorkflowVersionId: row.accWorkflowVersionId,
    versionNumber: row.accWorkflowVersion?.versionNumber,
    gmApprovedAt: row.gmApprovedAt,
    gmActor: `${row.gmApprover.firstName} ${row.gmApprover.lastName}`.trim(),
    normalizedTimeline: normalizeTimeline(entries),
    expectations: {
      mustIncludeStageKeys: ['GENERAL_MANAGER', 'SECURITY'],
      stageCounts: { GENERAL_MANAGER: 1 },
    },
  };
}

async function gateServiceActor(tenantId, gateUser, permissions) {
  const member = await prisma.tenantMember.findFirst({
    where: { tenantId, userId: gateUser.userId, isActive: true },
    include: { user: true, role: true },
  });
  if (!member) throw new Error(`Missing tenant member for ${gateUser.email}`);
  return actorFromMember(member, permissions);
}

async function seedInventoryCountFixture(ctx) {
  const { stock, storekeeper, financeManager, generalManager, orgManager } = ctx;
  const operator = await gateServiceActor(ctx.tenantId, storekeeper, ['STOCK_COUNT_MANAGE', 'STOCK_COUNT_VIEW']);
  const financeUser = await gateServiceActor(ctx.tenantId, financeManager, ['STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT']);
  const gmUser = await gateServiceActor(ctx.tenantId, generalManager, ['STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT']);

  const created = await inventoryCountService.createSession(ctx.tenantId, operator.id, {
    departmentId: stock.departmentId,
    locationIds: [stock.locationId],
    blindMode: false,
    notes: FIXTURE_TAG,
  });
  await inventoryCountService.startSession(ctx.tenantId, operator.id, created.id, {});

  const session = await prisma.stockCountSession.findFirst({ where: { id: created.id } });
  const cells = await prisma.stockCountLocationQty.findMany({
    where: { sessionId: created.id, roundNo: session.currentRound },
  });
  for (const cell of cells) {
    await prisma.stockCountLocationQty.update({
      where: { id: cell.id },
      data: {
        countedQty: Number(cell.bookQty),
        varianceQty: 0,
        countedBy: operator.id,
        countedAt: new Date(),
      },
    });
  }

  await inventoryCountService.submitCounts(ctx.tenantId, operator.id, created.id, {});
  await inventoryCountService.submitForApproval(ctx.tenantId, operator.id, created.id, { managementNotes: FIXTURE_TAG });
  await inventoryCountService.approve(ctx.tenantId, financeUser.id, financeUser, created.id, { comment: FIXTURE_TAG });
  await inventoryCountService.approve(ctx.tenantId, gmUser.id, gmUser, created.id, { comment: FIXTURE_TAG });

  const sid = created.id;

  const row = await prisma.stockCountSession.findFirst({ where: { id: sid, tenantId: ctx.tenantId } });
  const tl = await fetchTimeline(orgManager.token, 'INVENTORY_COUNT', sid);
  const entries = timelineEntriesFromResponse(tl);
  if (!entries.length) throw new Error('IC seed: empty timeline');

  return {
    module: 'INVENTORY_COUNT',
    id: sid,
    documentNo: row?.sessionNo || sid,
    status: row?.status,
    normalizedTimeline: normalizeTimeline(entries),
    expectations: {
      lifecycleCounts: { SUBMIT_FOR_APPROVAL: 1 },
      mustIncludeStageKeys: ['COUNT_SUBMITTED', 'POSTED'],
      finalEvent: { entryType: 'POSTING', stageKey: 'POSTED' },
    },
  };
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: CHILD_SLUG } });
  if (!tenant) {
    console.error(`Tenant ${CHILD_SLUG} not found`);
    process.exit(1);
  }

  const stock = await ensureStock(tenant.id);
  const orgManager = await seedActor('ORG_MANAGER', tenant.id, stock.departmentId, 'org');
  const deptManager = await seedActor('DEPT_MANAGER', tenant.id, stock.departmentId, 'dm');
  const costControl = await seedActor('COST_CONTROL', tenant.id, stock.departmentId, 'cc');
  const financeManager = await seedActor('FINANCE_MANAGER', tenant.id, stock.departmentId, 'fin');
  const security = await seedActor('SECURITY', tenant.id, stock.departmentId, 'sec');
  const storekeeper = await seedActor('STOREKEEPER', tenant.id, stock.departmentId, 'sk');
  const generalManager = await seedActor('GENERAL_MANAGER', tenant.id, stock.departmentId, 'gm');

  if (![orgManager, deptManager, costControl, financeManager, security, storekeeper, generalManager].every((a) => a.token)) {
    console.error('Actor login failed — ensure backend is running');
    process.exit(1);
  }

  const ctx = {
    tenantId: tenant.id,
    tenantSlug: CHILD_SLUG,
    stock,
    orgManager,
    deptManager,
    costControl,
    financeManager,
    security,
    storekeeper,
    generalManager,
  };

  const fixtures = {
    generatedAt: new Date().toISOString(),
    fixtureTag: FIXTURE_TAG,
    tenantId: tenant.id,
    tenantSlug: CHILD_SLUG,
    grn: await seedGrnFixture(ctx, orgManager.token),
    transfer: await seedTransferFixture(ctx),
    breakage: await seedBreakageFixture(ctx),
    getPassSendBackResubmit: await seedGetPassSendBackResubmit(ctx),
    getPassPhysicalReturn: await seedGetPassPhysicalReturn(ctx),
    getPassV3Gm: await seedGetPassV3GmFixture(ctx),
    inventoryCount: await seedInventoryCountFixture(ctx),
  };

  fs.writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  console.log(`Wrote ${FIXTURES_PATH}`);
  console.log(JSON.stringify({
    grn: fixtures.grn.id,
    transfer: fixtures.transfer.id,
    breakage: fixtures.breakage.id,
    getPassSendBackResubmit: fixtures.getPassSendBackResubmit.id,
    getPassPhysicalReturn: fixtures.getPassPhysicalReturn.id,
    getPassV3Gm: fixtures.getPassV3Gm.id,
    inventoryCount: fixtures.inventoryCount.id,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
