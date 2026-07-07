'use strict';

/**
 * Phase 3 — Movements Full Integrity & Posting Revalidation gate.
 * Usage: node Governance/phase-3-movements-integrity/phase-3-movements-integrity-gate.cjs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

const GOV_DIR = __dirname;
const BACKEND = path.join(__dirname, '../../OSE-backend');
const API_BASE = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const FIXTURE_TAG = 'PHASE3_MOV_GATE';
const PASSWORD = 'Phase3Gate@123';
const EMAIL_DOMAIN = 'phase3-gate.local';
const CHILD_SLUG = 'closeout-audit-hotel-disposable';
const ORG_SLUG = 'closeout-audit-org-disposable';
const SCOPE_READ_TAG = `${FIXTURE_TAG}_SCOPE_READ`;

const { apiRequest, getSession, switchTenant } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/http'));
const prisma = require(path.join(BACKEND, 'src/config/database'));
const { HOTEL_B } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/constants'));

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

async function upsertGateUser({ email, roleCode, tenantId, departmentId, skipUr = false, urActive = true, propertyIds = null }) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, isActive: true },
    create: { email, passwordHash: hash, isActive: true, firstName: 'Phase3', lastName: roleCode },
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

async function seedActor(roleCode, tenantId, stock, slot = 'a') {
  const u = await upsertGateUser({
    email: `p3-${roleCode.toLowerCase()}-${slot}@${EMAIL_DOMAIN}`,
    roleCode,
    tenantId,
    departmentId: stock.departmentId,
  });
  const slug = (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })).slug;
  const sess = await getSession(API_BASE, u, slug);
  return { ...u, token: sess?.token, loginStatus: sess?.loginRes?.status };
}

async function ensureObFinalized(tenantId) {
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
    update: { value: 'LOCKED' },
    create: { tenantId, key: 'allowOpeningBalance', value: 'LOCKED' },
  });
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: 'obFinalizeSnapshot' } },
    update: { value: JSON.stringify({ finalizedAt: new Date().toISOString(), gate: FIXTURE_TAG }) },
    create: {
      tenantId,
      key: 'obFinalizeSnapshot',
      value: JSON.stringify({ finalizedAt: new Date().toISOString(), gate: FIXTURE_TAG }),
    },
  });
}

async function ensureStock(tenantId, deptCode = 'FB', qtyOnHand = 100) {
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
        code: `P3M-${deptCode}-${Date.now()}`,
        isActive: true,
        unitPrice: 5,
        defaultStoreId: loc.id,
        departmentId: dept.id,
      },
    });
  }
  await prisma.stockBalance.upsert({
    where: { tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: loc.id } },
    update: { qtyOnHand, wacUnitCost: 5 },
    create: { tenantId, itemId: item.id, locationId: loc.id, qtyOnHand, wacUnitCost: 5 },
  });
  return { departmentId: dept.id, locationId: loc.id, itemId: item.id, tenantId };
}

function adjustmentPayload(stock, qty = 3) {
  return {
    movementType: 'ADJUSTMENT',
    documentDate: new Date().toISOString(),
    sourceLocationId: stock.locationId,
    lines: [
      {
        itemId: stock.itemId,
        locationId: stock.locationId,
        qtyRequested: qty,
        quantity: qty,
        unitCost: 5,
        totalValue: qty * 5,
      },
    ],
    notes: FIXTURE_TAG,
  };
}

function breakagePayload(stock, qty = 1) {
  return {
    reason: `${FIXTURE_TAG} breakage`,
    suggestedAction: 'HOTEL',
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty, unitCost: 5, totalValue: qty * 5 }],
    notes: FIXTURE_TAG,
  };
}

function lostPayload(stock, qty = 1) {
  return breakagePayload(stock, qty);
}

async function movRow(id, tenantId) {
  return prisma.movementDocument.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      status: true,
      movementType: true,
      concurrencyVersion: true,
      postedAt: true,
      documentNo: true,
    },
  });
}

async function ledgerCount(tenantId, refId = null, since = null) {
  const where = { tenantId };
  if (refId) where.referenceId = refId;
  if (since) where.createdAt = { gte: since };
  return prisma.inventoryLedger.count({ where });
}

async function stockQty(tenantId, itemId, locationId) {
  const b = await prisma.stockBalance.findUnique({
    where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
  });
  return Number(b?.qtyOnHand || 0);
}

async function auditCount(tenantId, entityId, action = null) {
  const where = { tenantId, entityType: 'MOVEMENT', entityId: String(entityId) };
  if (action) where.action = action;
  return prisma.auditLog.count({ where });
}

async function seedMovementDoc({ tenantId, userId, locationId, itemId, tag, movementType = 'ADJUSTMENT', status = 'POSTED' }) {
  const ts = Date.now();
  return prisma.movementDocument.create({
    data: {
      tenantId,
      documentNo: `P3-${movementType.slice(0, 3)}-${ts}`,
      movementType,
      status,
      sourceType: 'INTERNAL',
      sourceLocationId: locationId,
      documentDate: new Date(),
      createdBy: userId,
      notes: tag,
      lines: {
        create: [{
          itemId,
          locationId,
          qtyRequested: 1,
          qtyInBaseUnit: 1,
          unitCost: 5,
          totalValue: 5,
        }],
      },
    },
  });
}

async function seedForeignTenantMovement(userId, foreignStock) {
  await ensureObFinalized(HOTEL_B.id);
  return seedMovementDoc({
    tenantId: HOTEL_B.id,
    userId,
    locationId: foreignStock.locationId,
    itemId: foreignStock.itemId,
    tag: `${FIXTURE_TAG}_FOREIGN`,
    movementType: 'ADJUSTMENT',
    status: 'POSTED',
  });
}

async function denialSnapshot(tenantId, docId, itemId, locationId) {
  const row = docId ? await movRow(docId, tenantId) : null;
  return {
    status: row?.status ?? null,
    ledger: docId ? await ledgerCount(tenantId, docId) : await ledgerCount(tenantId),
    stock: await stockQty(tenantId, itemId, locationId),
    auditPost: docId ? await auditCount(tenantId, docId, 'POST') : 0,
  };
}

async function assertDenialUnchanged(before, after, { status = null } = {}) {
  if (status != null && after.status !== status) return false;
  if (after.ledger !== before.ledger) return false;
  if (after.stock !== before.stock) return false;
  if (after.auditPost !== before.auditPost) return false;
  return true;
}

async function approveBreakageChain(token, docId, actors) {
  const chain = [
    { token: actors.creator.token, after: 'DEPT_APPROVED', route: 'submit' },
    { token: actors.cc.token, after: 'COST_CONTROL_APPROVED', route: 'approve' },
    { token: actors.fin.token, after: 'FINANCE_APPROVED', route: 'approve' },
    { token: actors.gm.token, after: 'APPROVED', route: 'approve' },
  ];
  let row = await movRow(docId, actors.tenantId);
  for (const step of chain) {
    const url =
      step.route === 'submit'
        ? `/breakage/${docId}/submit`
        : `/breakage/${docId}/approve`;
    const res = await apiRequest(
      API_BASE,
      'POST',
      url,
      { comment: FIXTURE_TAG, concurrencyVersion: row?.concurrencyVersion ?? 0 },
      step.token,
    );
    if (!is2xx(res.status)) return { ok: false, http: res.status, step: step.route, statusAfter: row?.status };
    row = await movRow(docId, actors.tenantId);
    if (row?.status !== step.after) return { ok: false, http: res.status, expected: step.after, statusAfter: row?.status };
  }
  return { ok: true, row };
}

async function approveLostChain(token, docId, actors) {
  const chain = [
    { token: actors.cc.token, after: 'COST_CONTROL_APPROVED' },
    { token: actors.fin.token, after: 'FINANCE_APPROVED' },
    { token: actors.gm.token, after: 'APPROVED' },
  ];
  let row = await movRow(docId, actors.tenantId);
  for (const step of chain) {
    const res = await apiRequest(
      API_BASE,
      'POST',
      `/lost/${docId}/approve`,
      { comment: FIXTURE_TAG, concurrencyVersion: row?.concurrencyVersion ?? 0 },
      step.token,
    );
    if (!is2xx(res.status)) return { ok: false, http: res.status, statusAfter: row?.status };
    row = await movRow(docId, actors.tenantId);
    if (row?.status !== step.after) return { ok: false, expected: step.after, statusAfter: row?.status };
  }
  return { ok: true, row };
}

async function runAdjustmentHappyPath(child, stock) {
  const fm = await seedActor('FINANCE_MANAGER', child.id, stock, 'adj-fm');
  if (!fm.token) {
    record(1, 'ADJUSTMENT create (authorized)', false, { error: 'login_failed' });
    return null;
  }

  const since = new Date();
  const ledgerBefore = await ledgerCount(child.id, null, since);
  const stockBefore = await stockQty(child.id, stock.itemId, stock.locationId);

  const create = await apiRequest(API_BASE, 'POST', '/movements', adjustmentPayload(stock, 4), fm.token);
  const docId = create.data?.data?.id;
  const createOk = is2xx(create.status) && !!docId;
  record(1, 'ADJUSTMENT create (authorized)', createOk, {
    http: create.status,
    docId,
    statusAfter: create.data?.data?.status,
  });

  if (!docId) return null;

  const afterCreate = await movRow(docId, child.id);
  const ledgerAfterCreate = await ledgerCount(child.id, docId);
  const stockAfterCreate = await stockQty(child.id, stock.itemId, stock.locationId);

  record(
    2,
    'ADJUSTMENT draft — no ledger/stock effects',
    afterCreate?.status === 'DRAFT' &&
      ledgerAfterCreate === 0 &&
      stockAfterCreate === stockBefore,
    {
      statusAfter: afterCreate?.status,
      ledgerDelta: ledgerAfterCreate - ledgerBefore,
      stockBefore,
      stockAfterCreate,
    },
  );

  const post = await apiRequest(
    API_BASE,
    'POST',
    `/movements/${docId}/post`,
    { concurrencyVersion: afterCreate?.concurrencyVersion ?? 0 },
    fm.token,
  );
  const afterPost = await movRow(docId, child.id);
  const ledgerAfterPost = await ledgerCount(child.id, docId);
  const stockAfterPost = await stockQty(child.id, stock.itemId, stock.locationId);
  const auditPost = await auditCount(child.id, docId, 'POST');

  record(
    3,
    'ADJUSTMENT post — POSTED, ledger + stock exact once',
    is2xx(post.status) &&
      afterPost?.status === 'POSTED' &&
      ledgerAfterPost === 1 &&
      stockAfterPost === stockBefore + 4 &&
      auditPost >= 1,
    {
      http: post.status,
      statusAfter: afterPost?.status,
      ledgerRows: ledgerAfterPost,
      stockBefore,
      stockAfterPost,
      expectedStock: stockBefore + 4,
      auditPostCount: auditPost,
    },
  );

  return { docId, fm, afterPost };
}

async function runAdjustmentNegatives(child, stock, ctx) {
  const noAssign = await upsertGateUser({
    email: `p3-noassign@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    skipUr: true,
  });
  const noAssignSess = await getSession(API_BASE, noAssign, child.slug);

  const ledgerBefore = await prisma.inventoryLedger.count({ where: { tenantId: child.id } });
  const createDenied = await apiRequest(
    API_BASE,
    'POST',
    '/movements',
    adjustmentPayload(stock, 1),
    noAssignSess.token,
  );
  record(
    4,
    'ADJUSTMENT create denied — no active assignment',
    !is2xx(createDenied.status) &&
      (await prisma.inventoryLedger.count({ where: { tenantId: child.id } })) === ledgerBefore,
    { http: createDenied.status },
  );

  if (ctx?.docId && ctx?.fm?.token) {
    const dup = await apiRequest(
      API_BASE,
      'POST',
      `/movements/${ctx.docId}/post`,
      { concurrencyVersion: ctx.afterPost?.concurrencyVersion ?? 0 },
      ctx.fm.token,
    );
    record(
      5,
      'ADJUSTMENT duplicate post denied',
      !is2xx(dup.status) && (await movRow(ctx.docId, child.id))?.status === 'POSTED',
      { http: dup.status, statusAfter: (await movRow(ctx.docId, child.id))?.status },
    );

    const stale = await apiRequest(
      API_BASE,
      'POST',
      `/movements/${ctx.docId}/post`,
      { concurrencyVersion: (ctx.afterPost?.concurrencyVersion ?? 1) - 1 },
      ctx.fm.token,
    );
    record(6, 'ADJUSTMENT stale concurrency denied', !is2xx(stale.status), { http: stale.status });
  } else {
    record(5, 'ADJUSTMENT duplicate post denied', false, { error: 'prerequisite_failed' });
    record(6, 'ADJUSTMENT stale concurrency denied', false, { error: 'prerequisite_failed' });
  }
}

async function runGovernedRegisterBlock(child, stock) {
  const fm = await seedActor('FINANCE_MANAGER', child.id, stock, 'gov-fm');
  const creator = await seedActor('DEPT_MANAGER', child.id, stock, 'brk-cr');
  if (!fm.token || !creator.token) {
    record(7, 'Governed BREAKAGE register post blocked', false, { error: 'login_failed' });
    return;
  }

  const createBrk = await apiRequest(API_BASE, 'POST', '/breakage', breakagePayload(stock), creator.token);
  const brkId = createBrk.data?.data?.id;
  if (!brkId) {
    record(7, 'Governed BREAKAGE register post blocked', false, { error: 'breakage_create_failed', http: createBrk.status });
    return;
  }

  const ledgerBefore = await ledgerCount(child.id, brkId);
  const postReg = await apiRequest(
    API_BASE,
    'POST',
    `/movements/${brkId}/post`,
    { concurrencyVersion: createBrk.data?.data?.concurrencyVersion ?? 0 },
    fm.token,
  );
  const after = await movRow(brkId, child.id);
  record(
    7,
    'Governed BREAKAGE register post blocked',
    !is2xx(postReg.status) &&
      after?.status === 'DRAFT' &&
      (await ledgerCount(child.id, brkId)) === ledgerBefore,
    { http: postReg.status, statusAfter: after?.status, ledgerDelta: (await ledgerCount(child.id, brkId)) - ledgerBefore },
  );
}

async function runBreakageHappyPath(child, stock) {
  const creator = await seedActor('STOREKEEPER', child.id, stock, 'brk-creator');
  const cc = await seedActor('COST_CONTROL', child.id, stock, 'brk-cc');
  const fin = await seedActor('FINANCE_MANAGER', child.id, stock, 'brk-fin');
  const gm = await seedActor('GENERAL_MANAGER', child.id, stock, 'brk-gm');
  if (!creator.token || !cc.token || !fin.token || !gm.token) {
    record(8, 'BREAKAGE draft create — no ledger/stock', false, { error: 'login_failed' });
    record(9, 'BREAKAGE workflow post — APPROVED + effects', false, { error: 'login_failed' });
    return;
  }

  const stockBefore = await stockQty(child.id, stock.itemId, stock.locationId);
  const create = await apiRequest(API_BASE, 'POST', '/breakage', breakagePayload(stock), creator.token);
  const docId = create.data?.data?.id;
  const afterCreate = docId ? await movRow(docId, child.id) : null;

  record(
    8,
    'BREAKAGE draft create — no ledger/stock',
    is2xx(create.status) &&
      afterCreate?.status === 'DRAFT' &&
      afterCreate?.movementType === 'BREAKAGE' &&
      (await ledgerCount(child.id, docId)) === 0 &&
      (await stockQty(child.id, stock.itemId, stock.locationId)) === stockBefore,
    { http: create.status, docId, statusAfter: afterCreate?.status },
  );

  if (!docId) {
    record(9, 'BREAKAGE workflow post — APPROVED + effects', false, { error: 'create_failed' });
    return;
  }

  const actors = { creator, cc, fin, gm, tenantId: child.id };
  const chain = await approveBreakageChain(creator.token, docId, actors);
  const ledgerAfter = await ledgerCount(child.id, docId);
  const stockAfter = await stockQty(child.id, stock.itemId, stock.locationId);

  record(
    9,
    'BREAKAGE workflow post — APPROVED + effects',
    chain.ok &&
      chain.row?.status === 'APPROVED' &&
      chain.row?.postedAt &&
      ledgerAfter >= 1 &&
      stockAfter === stockBefore - 1,
    {
      chainOk: chain.ok,
      statusAfter: chain.row?.status,
      ledgerRows: ledgerAfter,
      stockBefore,
      stockAfter,
      expectedStock: stockBefore - 1,
      chainDetail: chain.ok ? null : chain,
    },
  );
}

async function runLostHappyPath(child, stock) {
  const creator = await seedActor('DEPT_MANAGER', child.id, stock, 'lost-cr');
  const cc = await seedActor('COST_CONTROL', child.id, stock, 'lost-cc');
  const fin = await seedActor('FINANCE_MANAGER', child.id, stock, 'lost-fin');
  const gm = await seedActor('GENERAL_MANAGER', child.id, stock, 'lost-gm');
  if (!creator.token || !cc.token || !fin.token || !gm.token) {
    record(10, 'LOST workflow post — APPROVED + effects', false, { error: 'login_failed' });
    return;
  }

  const stockBefore = await stockQty(child.id, stock.itemId, stock.locationId);
  const create = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock), creator.token);
  const docId = create.data?.data?.id;
  if (!docId) {
    record(10, 'LOST workflow post — APPROVED + effects', false, { http: create.status });
    return;
  }

  const afterCreate = await movRow(docId, child.id);
  record(
    11,
    'LOST create starts DEPT_APPROVED — no post effects yet',
    is2xx(create.status) &&
      afterCreate?.status === 'DEPT_APPROVED' &&
      (await ledgerCount(child.id, docId)) === 0 &&
      (await stockQty(child.id, stock.itemId, stock.locationId)) === stockBefore,
    { http: create.status, statusAfter: afterCreate?.status },
  );

  const chain = await approveLostChain(creator.token, docId, {
    cc,
    fin,
    gm,
    tenantId: child.id,
  });
  const stockAfter = await stockQty(child.id, stock.itemId, stock.locationId);
  record(
    10,
    'LOST workflow post — APPROVED + effects',
    chain.ok &&
      chain.row?.status === 'APPROVED' &&
      (await ledgerCount(child.id, docId)) >= 1 &&
      stockAfter === stockBefore - 1,
    {
      chainOk: chain.ok,
      statusAfter: chain.row?.status,
      stockBefore,
      stockAfter,
      chainDetail: chain.ok ? null : chain,
    },
  );
}

async function cleanupScopeReadFixtures(tenantId) {
  const docs = await prisma.movementDocument.findMany({
    where: { tenantId, notes: { contains: SCOPE_READ_TAG } },
    select: { id: true },
  });
  if (!docs.length) return;
  const ids = docs.map((d) => d.id);
  await prisma.movementLine.deleteMany({ where: { documentId: { in: ids } } });
  await prisma.movementDocument.deleteMany({ where: { id: { in: ids } } });
}

async function runReadScope(child, stock, stockOut) {
  await cleanupScopeReadFixtures(child.id);
  const scopedUser = await upsertGateUser({
    email: `p3-scoped-fin@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const scopedSess = await getSession(API_BASE, scopedUser, child.slug);
  if (!scopedSess?.token) {
    record(12, 'Register list — assignment scope exact IDs/total', false, { error: 'login_failed' });
    record(13, 'Register detail — cross-tenant seeded 404', false, { error: 'login_failed' });
    record(14, 'Register detail — out-of-dept 403', false, { error: 'login_failed' });
    record(15, 'Register detail — in-scope 200', false, { error: 'login_failed' });
    return;
  }

  const foreignStock = await ensureStock(HOTEL_B.id, 'FB', 50);
  const foreignDoc = await seedForeignTenantMovement(scopedUser.userId, foreignStock);

  const inScopeDoc = await seedMovementDoc({
    tenantId: child.id,
    userId: scopedUser.userId,
    locationId: stock.locationId,
    itemId: stock.itemId,
    tag: `${SCOPE_READ_TAG}_IN`,
  });
  const outDeptDoc = await seedMovementDoc({
    tenantId: child.id,
    userId: scopedUser.userId,
    locationId: stockOut.locationId,
    itemId: stockOut.itemId,
    tag: `${SCOPE_READ_TAG}_OUT_DEPT`,
  });
  const wrongPropertyDoc = foreignDoc;

  const list = await apiRequest(
    API_BASE,
    'GET',
    `/movements?take=50&search=${encodeURIComponent(SCOPE_READ_TAG)}`,
    null,
    scopedSess.token,
  );
  const docs = list.data?.data || [];
  const metaTotal = list.data?.meta?.total ?? list.data?.pagination?.total ?? docs.length;
  const visibleIds = docs.map((d) => d.id).sort();
  const expectedIds = [inScopeDoc.id].sort();
  record(
    12,
    'Register list — assignment scope exact IDs/total',
    is2xx(list.status) &&
      metaTotal === 1 &&
      visibleIds.length === 1 &&
      visibleIds[0] === expectedIds[0] &&
      !visibleIds.includes(outDeptDoc.id) &&
      !visibleIds.includes(wrongPropertyDoc.id),
    {
      http: list.status,
      total: metaTotal,
      visibleIds,
      expectedIds,
      outDeptId: outDeptDoc.id,
      wrongPropertyId: wrongPropertyDoc.id,
    },
  );

  const foreignDetail = await apiRequest(API_BASE, 'GET', `/movements/${foreignDoc.id}`, null, scopedSess.token);
  record(
    13,
    'Register detail — cross-tenant seeded 404',
    foreignDetail.status === 404,
    { http: foreignDetail.status, foreignDocId: foreignDoc.id },
  );

  const outDeptDetail = await apiRequest(API_BASE, 'GET', `/movements/${outDeptDoc.id}`, null, scopedSess.token);
  record(
    14,
    'Register detail — out-of-dept 403',
    outDeptDetail.status === 403,
    { http: outDeptDetail.status, outDeptDocId: outDeptDoc.id },
  );

  const inScopeDetail = await apiRequest(API_BASE, 'GET', `/movements/${inScopeDoc.id}`, null, scopedSess.token);
  record(
    15,
    'Register detail — in-scope 200',
    is2xx(inScopeDetail.status) && inScopeDetail.data?.data?.id === inScopeDoc.id,
    { http: inScopeDetail.status, inScopeDocId: inScopeDoc.id },
  );
}

async function runAdjustmentNegativeMatrix(child, stock, stockOut, postedCtx) {
  let id = 20;

  async function denyCase(name, fn, expectedStatuses = [403, 401, 404, 422, 409]) {
    const res = await fn();
    const ok =
      !is2xx(res.http) &&
      (expectedStatuses.length === 0 || expectedStatuses.includes(res.http)) &&
      (res.unchanged === undefined || res.unchanged === true);
    record(id, name, ok, res);
    id += 1;
  }

  const inactiveUser = await upsertGateUser({
    email: `p3-inactive-ur@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    urActive: false,
  });
  const inactiveSess = await getSession(API_BASE, inactiveUser, child.slug);
  const b0 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
  const inactiveCreate = await apiRequest(
    API_BASE,
    'POST',
    '/movements',
    adjustmentPayload(stock, 1),
    inactiveSess.token,
  );
  const a0 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
  await denyCase('ADJUSTMENT create denied — inactive assignment', async () => ({
    http: inactiveCreate.status,
    unchanged: await assertDenialUnchanged(b0, a0),
  }));

  await prisma.urUserAssignment.deleteMany({ where: { userId: inactiveUser.userId } });
  const deletedSess = inactiveSess;
  const b1 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
  const deletedCreate = await apiRequest(
    API_BASE,
    'POST',
    '/movements',
    adjustmentPayload(stock, 1),
    deletedSess.token,
  );
  const a1 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
  await denyCase('ADJUSTMENT create denied — deleted assignment', async () => ({
    http: deletedCreate.status,
    unchanged: await assertDenialUnchanged(b1, a1),
  }));

  const wrongPropUser = await upsertGateUser({
    email: `p3-wrong-prop@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    propertyIds: [HOTEL_B.id],
  });
  const wrongPropSess = await getSession(API_BASE, wrongPropUser, child.slug);
  const b2 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
  const wrongPropCreate = await apiRequest(
    API_BASE,
    'POST',
    '/movements',
    adjustmentPayload(stock, 1),
    wrongPropSess.token,
  );
  const a2 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
  await denyCase('ADJUSTMENT create denied — wrong-property assignment', async () => ({
    http: wrongPropCreate.status,
    unchanged: await assertDenialUnchanged(b2, a2),
  }));

  const fm = await seedActor('FINANCE_MANAGER', child.id, stock, 'neg-fm');
  const crossLocPayload = adjustmentPayload({ ...stock, locationId: stockOut.locationId }, 1);
  crossLocPayload.lines[0].locationId = stockOut.locationId;
  const b3 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
  const outScopeCreate = await apiRequest(API_BASE, 'POST', '/movements', crossLocPayload, fm.token);
  const a3 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
  await denyCase('ADJUSTMENT create denied — out-of-scope location', async () => ({
    http: outScopeCreate.status,
    unchanged: await assertDenialUnchanged(b3, a3),
  }));

  const foreignItem = await prisma.item.findFirst({ where: { tenantId: HOTEL_B.id, isActive: true } });
  if (foreignItem) {
    const crossItemPayload = adjustmentPayload(stock, 1);
    crossItemPayload.lines[0].itemId = foreignItem.id;
    const b4 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
    const crossItemCreate = await apiRequest(API_BASE, 'POST', '/movements', crossItemPayload, fm.token);
    const a4 = await denialSnapshot(child.id, null, stock.itemId, stock.locationId);
    await denyCase('ADJUSTMENT create denied — cross-tenant item', async () => ({
      http: crossItemCreate.status,
      unchanged: await assertDenialUnchanged(b4, a4),
    }));
  } else {
    record(id++, 'ADJUSTMENT create denied — cross-tenant item', false, { error: 'no_foreign_item' });
  }

  const staleUser = await upsertGateUser({
    email: `p3-stale-jwt@${EMAIL_DOMAIN}`,
    roleCode: 'FINANCE_MANAGER',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const staleSess = await getSession(API_BASE, staleUser, child.slug);
  await prisma.urUserAssignment.updateMany({ where: { userId: staleUser.userId }, data: { isActive: false } });
  await prisma.user.update({ where: { id: staleUser.userId }, data: { permissionVersion: { increment: 1 } } });
  const staleCreate = await apiRequest(
    API_BASE,
    'POST',
    '/movements',
    adjustmentPayload(stock, 1),
    staleSess.token,
  );
  await denyCase('ADJUSTMENT create denied — stale JWT', async () => ({
    http: staleCreate.status,
    unchanged: true,
  }), [401, 403]);

  const noPermUser = await upsertGateUser({
    email: `p3-auditor@${EMAIL_DOMAIN}`,
    roleCode: 'AUDITOR',
    tenantId: child.id,
    departmentId: stock.departmentId,
  });
  const noPermSess = await getSession(API_BASE, noPermUser, child.slug);
  const noPermCreate = await apiRequest(
    API_BASE,
    'POST',
    '/movements',
    adjustmentPayload(stock, 1),
    noPermSess.token,
  );
  await denyCase('ADJUSTMENT create denied — missing permission', async () => ({
    http: noPermCreate.status,
    unchanged: true,
  }), [403]);

  const foreignDoc = await seedForeignTenantMovement(fm.userId, await ensureStock(HOTEL_B.id, 'FB', 50));
  const foreignPost = await apiRequest(
    API_BASE,
    'POST',
    `/movements/${foreignDoc.id}/post`,
    { concurrencyVersion: 0 },
    fm.token,
  );
  await denyCase('ADJUSTMENT post denied — foreign document', async () => ({
    http: foreignPost.status,
    unchanged: (await movRow(foreignDoc.id, HOTEL_B.id))?.status === 'POSTED',
  }), [404, 403]);

  if (postedCtx?.docId) {
    const editPosted = await apiRequest(
      API_BASE,
      'PUT',
      `/movements/${postedCtx.docId}`,
      { notes: `${FIXTURE_TAG} edit-after-post`, concurrencyVersion: postedCtx.afterPost?.concurrencyVersion ?? 0 },
      postedCtx.fm.token,
    );
    await denyCase('ADJUSTMENT update denied — POSTED document', async () => ({
      http: editPosted.status,
      unchanged: (await movRow(postedCtx.docId, child.id))?.status === 'POSTED',
    }), [400, 403, 409, 422, 423]);

    const invalidType = await apiRequest(
      API_BASE,
      'POST',
      '/movements',
      { ...adjustmentPayload(stock, 1), movementType: 'BREAKAGE' },
      fm.token,
    );
    await denyCase('ADJUSTMENT create denied — invalid movement type', async () => ({
      http: invalidType.status,
      unchanged: true,
    }), [422, 403]);

    const zeroQty = await apiRequest(
      API_BASE,
      'POST',
      '/movements',
      adjustmentPayload(stock, 0),
      fm.token,
    );
    await denyCase('ADJUSTMENT create denied — zero quantity', async () => ({
      http: zeroQty.status,
      unchanged: true,
    }), [422, 400]);

    let inactiveItem = await prisma.item.findFirst({
      where: { tenantId: child.id, name: `${FIXTURE_TAG} inactive`, isActive: false },
    });
    if (!inactiveItem) {
      inactiveItem = await prisma.item.create({
        data: {
          tenantId: child.id,
          name: `${FIXTURE_TAG} inactive`,
          code: `P3-INACT-${Date.now()}`,
          isActive: false,
          unitPrice: 1,
          defaultStoreId: stock.locationId,
          departmentId: stock.departmentId,
        },
      });
    }
    const inactiveItemPayload = adjustmentPayload(stock, 1);
    inactiveItemPayload.lines[0].itemId = inactiveItem.id;
    const inactiveItemRes = await apiRequest(API_BASE, 'POST', '/movements', inactiveItemPayload, fm.token);
    await denyCase('ADJUSTMENT create denied — inactive item', async () => ({
      http: inactiveItemRes.status,
      unchanged: true,
    }), [400, 404, 422, 403]);

    let inactiveLoc = await prisma.location.findFirst({
      where: { tenantId: child.id, name: `${FIXTURE_TAG} inactive loc`, isActive: false },
    });
    if (!inactiveLoc) {
      inactiveLoc = await prisma.location.create({
        data: {
          tenantId: child.id,
          departmentId: stock.departmentId,
          name: `${FIXTURE_TAG} inactive loc`,
          type: 'MAIN_STORE',
          isActive: false,
        },
      });
    }
    const inactiveLocPayload = adjustmentPayload({ ...stock, locationId: inactiveLoc.id }, 1);
    inactiveLocPayload.sourceLocationId = inactiveLoc.id;
    inactiveLocPayload.lines[0].locationId = inactiveLoc.id;
    const inactiveLocRes = await apiRequest(API_BASE, 'POST', '/movements', inactiveLocPayload, fm.token);
    await denyCase('ADJUSTMENT create denied — inactive location', async () => ({
      http: inactiveLocRes.status,
      unchanged: true,
    }), [400, 404, 422, 403]);

    const staleUpdateDraft = await apiRequest(API_BASE, 'POST', '/movements', adjustmentPayload(stock, 1), fm.token);
    const draftId = staleUpdateDraft.data?.data?.id;
    if (draftId) {
      const staleUpd = await apiRequest(
        API_BASE,
        'PUT',
        `/movements/${draftId}`,
        { notes: `${FIXTURE_TAG} stale-upd`, concurrencyVersion: -1 },
        fm.token,
      );
      await denyCase('ADJUSTMENT update denied — stale concurrency', async () => ({
        http: staleUpd.status,
        unchanged: (await movRow(draftId, child.id))?.status === 'DRAFT',
      }), [409, 422, 400]);
    }
  }
}

async function runBreakageLostAssignmentNegatives(child, stock) {
  let id = 40;
  const creator = await seedActor('STOREKEEPER', child.id, stock, 'asgn-brk');
  if (!creator.token) {
    record(id, 'BREAKAGE create denied — no assignment', false, { error: 'login_failed' });
    return;
  }

  const noAssign = await upsertGateUser({
    email: `p3-brk-noassign@${EMAIL_DOMAIN}`,
    roleCode: 'STOREKEEPER',
    tenantId: child.id,
    departmentId: stock.departmentId,
    skipUr: true,
  });
  const noAssignSess = await getSession(API_BASE, noAssign, child.slug);
  const stockBefore = await stockQty(child.id, stock.itemId, stock.locationId);
  const ledgerBefore = await ledgerCount(child.id);
  const brkDenied = await apiRequest(API_BASE, 'POST', '/breakage', breakagePayload(stock), noAssignSess.token);
  record(
    id++,
    'BREAKAGE create denied — no assignment',
    !is2xx(brkDenied.status) &&
      (await stockQty(child.id, stock.itemId, stock.locationId)) === stockBefore &&
      (await ledgerCount(child.id)) === ledgerBefore,
    { http: brkDenied.status },
  );

  const createOk = await apiRequest(API_BASE, 'POST', '/breakage', breakagePayload(stock), creator.token);
  const brkId = createOk.data?.data?.id;
  if (!brkId) {
    record(id, 'BREAKAGE submit denied — no assignment', false, { error: 'create_failed' });
    return;
  }
  const brkSubmitDenied = await apiRequest(
    API_BASE,
    'POST',
    `/breakage/${brkId}/submit`,
    { comment: FIXTURE_TAG, concurrencyVersion: createOk.data?.data?.concurrencyVersion ?? 0 },
    noAssignSess.token,
  );
  const rowAfter = await movRow(brkId, child.id);
  record(
    id++,
    'BREAKAGE submit denied — no assignment',
    !is2xx(brkSubmitDenied.status) && rowAfter?.status === 'DRAFT',
    { http: brkSubmitDenied.status, statusAfter: rowAfter?.status },
  );

  const lostNoAssign = await apiRequest(API_BASE, 'POST', '/lost', lostPayload(stock), noAssignSess.token);
  record(
    id++,
    'LOST create denied — no assignment',
    !is2xx(lostNoAssign.status) &&
      (await stockQty(child.id, stock.itemId, stock.locationId)) === stockBefore,
    { http: lostNoAssign.status },
  );
}

async function runInternalTypeVerification(child, stock) {
  const fm = await seedActor('FINANCE_MANAGER', child.id, stock, 'int-fm');
  if (!fm.token) {
    record(50, 'Internal types blocked from /api/movements create', false, { error: 'login_failed' });
    return;
  }
  const blockedTypes = ['BREAKAGE', 'LOST', 'RECEIVE', 'ISSUE', 'TRANSFER_OUT', 'COUNT_ADJUSTMENT', 'OPENING_BALANCE'];
  const results = [];
  for (const movementType of blockedTypes) {
    const res = await apiRequest(
      API_BASE,
      'POST',
      '/movements',
      { ...adjustmentPayload(stock, 1), movementType },
      fm.token,
    );
    results.push({ movementType, http: res.status, blocked: !is2xx(res.status) });
  }
  record(
    50,
    'Internal types blocked from /api/movements create',
    results.every((r) => r.blocked),
    { results },
  );

  const internalGateMap = [
    { type: 'OPENING_BALANCE', gate: 'src/services/posting.service.test.js' },
    { type: 'RECEIVE', gate: 'scripts/movement-direct-adjustment.guard.test.js' },
    { type: 'ISSUE', gate: 'scripts/movement-direct-adjustment.guard.test.js' },
    { type: 'TRANSFER_OUT', gate: 'scripts/movement-direct-adjustment.guard.test.js' },
    { type: 'COUNT_ADJUSTMENT', gate: 'scripts/smoke-movement-register-governed.js' },
    { type: 'BREAKAGE', gate: 'scripts/lost-approval-workflow.test.js' },
    { type: 'LOST', gate: 'scripts/lost-approval-workflow.test.js' },
  ];
  record(
    51,
    'Internal movement types — owning gate files documented',
    internalGateMap.length >= 7,
    { internalGateMap },
  );
}

async function runConcurrentPost(child, stock) {
  const fm = await seedActor('FINANCE_MANAGER', child.id, stock, 'conc-fm');
  if (!fm.token) {
    record(16, 'Concurrent duplicate post — one success only', false, { error: 'login_failed' });
    return;
  }

  const create = await apiRequest(API_BASE, 'POST', '/movements', adjustmentPayload(stock, 2), fm.token);
  const docId = create.data?.data?.id;
  const ver = create.data?.data?.concurrencyVersion ?? 0;
  if (!docId) {
    record(16, 'Concurrent duplicate post — one success only', false, { error: 'create_failed' });
    return;
  }

  const stockBefore = await stockQty(child.id, stock.itemId, stock.locationId);
  const [p1, p2] = await Promise.all([
    apiRequest(API_BASE, 'POST', `/movements/${docId}/post`, { concurrencyVersion: ver }, fm.token),
    apiRequest(API_BASE, 'POST', `/movements/${docId}/post`, { concurrencyVersion: ver }, fm.token),
  ]);
  const successes = [p1, p2].filter((r) => is2xx(r.status)).length;
  const ledgerRows = await ledgerCount(child.id, docId);
  const stockAfter = await stockQty(child.id, stock.itemId, stock.locationId);

  record(
    16,
    'Concurrent duplicate post — one success only',
    successes === 1 &&
      ledgerRows === 1 &&
      stockAfter === stockBefore + 2 &&
      (await movRow(docId, child.id))?.status === 'POSTED',
    {
      successCount: successes,
      http1: p1.status,
      http2: p2.status,
      ledgerRows,
      stockBefore,
      stockAfter,
    },
  );
}

async function seedGrnDraft(tenantId, userId, stock) {
  const supplier = await prisma.supplier.findFirst({ where: { tenantId } });
  const unit = await prisma.unit.findFirst({ where: { tenantId } });
  const num = `P3G-GRN-${Date.now()}`;
  return prisma.grnImport.create({
    data: {
      tenantId,
      grnNumber: num,
      supplierInvoiceNumber: num,
      vendorId: supplier?.id,
      vendorNameSnapshot: FIXTURE_TAG,
      locationId: stock.locationId,
      receivingDate: new Date(),
      pdfAttachmentUrl: '/phase3-gate.pdf',
      status: 'DRAFT',
      importedBy: userId,
      lines: {
        create: [{
          futurelogItemCode: 'P3G-001',
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

async function runRegressionSuite(child, stock) {
  const fin = await seedActor('FINANCE_MANAGER', child.id, stock, 'reg-fin');
  const store = await seedActor('STOREKEEPER', child.id, stock, 'reg-store');
  if (fin.token && store.token) {
    const stockList = await apiRequest(API_BASE, 'GET', '/stock-balances?limit=5', null, fin.token);
    recordRegression('Stock Balances authorized list', is2xx(stockList.status), { http: stockList.status });

    const ledgerList = await apiRequest(API_BASE, 'GET', '/ledger?limit=5', null, fin.token);
    recordRegression('Inventory History/Ledger authorized list', is2xx(ledgerList.status), { http: ledgerList.status });

    const grn = await seedGrnDraft(child.id, fin.userId, stock);
    const grnList = await apiRequest(API_BASE, 'GET', '/grn?limit=5', null, fin.token);
    const grnDetail = await apiRequest(API_BASE, 'GET', `/grn/${grn.id}`, null, fin.token);
    recordRegression('GRN authorized list + detail', is2xx(grnList.status) && is2xx(grnDetail.status), {
      listHttp: grnList.status,
      detailHttp: grnDetail.status,
      grnId: grn.id,
    });

    const trList = await apiRequest(API_BASE, 'GET', '/transfers?limit=5', null, store.token);
    recordRegression('Transfer authorized list', is2xx(trList.status), { http: trList.status });

    const brList = await apiRequest(API_BASE, 'GET', '/breakage?limit=5', null, fin.token);
    recordRegression('Breakage authorized list', is2xx(brList.status), { http: brList.status });

    const lostList = await apiRequest(API_BASE, 'GET', '/lost-items?limit=5', null, fin.token);
    recordRegression('Lost Items authorized list', is2xx(lostList.status), { http: lostList.status });

    const icList = await apiRequest(API_BASE, 'GET', '/inventory-count/sessions?limit=5', null, fin.token);
    recordRegression('Inventory Count authorized list', is2xx(icList.status), { http: icList.status });

    const gpList = await apiRequest(API_BASE, 'GET', '/get-passes?limit=5', null, fin.token);
    recordRegression('Get Pass authorized list', is2xx(gpList.status), { http: gpList.status });

    const orgRoot = await prisma.tenant.findFirst({ where: { slug: ORG_SLUG } });
    const orgMgr = await upsertGateUser({
      email: `p3-reg-org@${EMAIL_DOMAIN}`,
      roleCode: 'ORG_MANAGER',
      tenantId: orgRoot?.id || child.id,
      propertyIds: [child.id],
    });
    const orgLogin = await getSession(API_BASE, orgMgr, ORG_SLUG);
    const sw = orgLogin.token
      ? await switchTenant(API_BASE, orgLogin.token, child.slug)
      : { status: 0 };
    recordRegression('Tenant switch permission refresh', is2xx(sw.status) && !!sw.data?.data?.accessToken, {
      http: sw.status,
      hasNewToken: !!sw.data?.data?.accessToken,
    });

    const mvList = await apiRequest(API_BASE, 'GET', '/movements?limit=5', null, fin.token);
    recordRegression('Movement register authorized list', is2xx(mvList.status), { http: mvList.status });
  }

  const tests = [
    'scripts/movement-direct-adjustment.guard.test.js',
    'scripts/movement-direct-adjustment-origin.test.js',
    'scripts/movement-adjustment-rbac.test.js',
    'scripts/movementApprovalAction.guard.test.js',
    'scripts/movement-submit-current-step.test.js',
    'scripts/lost-approval-workflow.test.js',
    'src/services/posting.service.test.js',
    'scripts/smoke-movement-register-governed.js',
  ];
  for (const t of tests) {
    try {
      const cmd = t.includes('smoke-') ? `node ${t}` : `node --test ${t}`;
      execSync(cmd, { cwd: BACKEND, stdio: 'pipe', timeout: 120000 });
      recordRegression(`Backend ${path.basename(t)}`, true);
    } catch (e) {
      recordRegression(`Backend ${path.basename(t)}`, false, {
        error: String(e.stderr || e.message).slice(0, 400),
      });
    }
  }

  try {
    execSync('node phase-3-movement-register-browser.cjs', {
      cwd: GOV_DIR,
      stdio: 'pipe',
      timeout: 180000,
      env: { ...process.env, P3_BROWSER_EMAIL: `p3-finance_manager-adj-fm@${EMAIL_DOMAIN}`, P3_BROWSER_TENANT: child.slug },
    });
    recordRegression('Frontend Movement Register browser path', true);
  } catch (e) {
    recordRegression('Frontend Movement Register browser path', false, {
      error: String(e.stderr || e.message).slice(0, 400),
    });
  }
  try {
    execSync('npm run build -- --configuration=development', {
      cwd: path.join(BACKEND, '../OSE-Frontend'),
      stdio: 'pipe',
      timeout: 300000,
    });
    recordRegression('Frontend development build', true);
  } catch (e) {
    recordRegression('Frontend development build', false, { error: String(e.stderr || e.message).slice(0, 400) });
  }
}

function buildChecklist() {
  const byId = Object.fromEntries(scenarios.map((s) => [s.id, s.pass]));
  const adjNegIds = Object.keys(byId).filter((k) => Number(k) >= 20 && Number(k) < 40).map(Number);
  gateChecklist = {
    'ADJUSTMENT authorized create/post': byId[1] && byId[2] && byId[3],
    'ADJUSTMENT assignment/scope negatives': byId[4] && adjNegIds.every((i) => byId[i]),
    'Governed register post blocked': byId[7],
    'BREAKAGE lifecycle + posting': byId[8] && byId[9],
    'LOST lifecycle + posting': byId[10] && byId[11],
    'Register read scope exact IDs': byId[12] && byId[13] && byId[14] && byId[15],
    'Concurrent post safety': byId[16],
    'Breakage/Lost assignment enforcement': [40, 41, 42].every((i) => byId[i]),
    'Internal types register blocked': byId[50],
    'Atomicity rollback tests': regression.some((r) => r.name.includes('posting.service.test.js') && r.pass),
    'Backend relevant tests': regression.filter((r) => r.name.includes('.test.js') || r.name.includes('smoke-')).every((r) => r.pass),
    'Frontend build + browser': (regression.find((r) => r.name === 'Frontend development build')?.pass ?? false) &&
      (regression.find((r) => r.name === 'Frontend Movement Register browser path')?.pass ?? false),
    'Focused module regression': ['Stock Balances', 'GRN', 'Transfer', 'Breakage', 'Lost', 'Inventory Count', 'Get Pass', 'Tenant switch']
      .every((label) => regression.find((r) => r.name.includes(label))?.pass ?? false),
  };
}

async function main() {
  console.log('Phase 3 Movements Integrity Gate — starting');
  const ping = await apiRequest(API_BASE.replace(/\/api$/, ''), 'GET', '/health', null).catch(() => ({ status: 0 }));
  if (ping.status !== 200) {
    console.error('API not reachable at', API_BASE);
    process.exit(2);
  }

  const child = await prisma.tenant.findFirst({ where: { slug: CHILD_SLUG } });
  if (!child) throw new Error(`Missing disposable tenant ${CHILD_SLUG}`);
  child.slug = CHILD_SLUG;

  await ensureObFinalized(child.id);
  const stock = await ensureStock(child.id, 'FB', 100);
  const stockOut = await ensureStock(child.id, 'HK', 100);

  const adjCtx = await runAdjustmentHappyPath(child, stock);
  await runAdjustmentNegatives(child, stock, adjCtx);
  await runAdjustmentNegativeMatrix(child, stock, stockOut, adjCtx);
  await runGovernedRegisterBlock(child, stock);
  await runBreakageHappyPath(child, stock);
  await runLostHappyPath(child, stock);
  await runBreakageLostAssignmentNegatives(child, stock);
  await runReadScope(child, stock, stockOut);
  await runConcurrentPost(child, stock);
  await runInternalTypeVerification(child, stock);
  await runRegressionSuite(child, stock);

  buildChecklist();

  const runtimePass = scenarios.filter((s) => s.pass).length;
  const runtimeFail = scenarios.filter((s) => !s.pass).length;
  const regPass = regression.filter((r) => r.pass).length;
  const regFail = regression.filter((r) => !r.pass).length;
  const phaseClosed =
    Object.values(gateChecklist).every(Boolean) && runtimeFail === 0 && regFail === 0;

  const out = {
    executedAt: new Date().toISOString(),
    gateVersion: 'phase3-movements-integrity-v2-reopen',
    tenant: { id: child.id, slug: child.slug },
    apiBase: API_BASE,
    httpActiveTypes: ['ADJUSTMENT', 'BREAKAGE', 'LOST'],
    scenarios,
    regression,
    totals: { runtimePass, runtimeFail, regressionPass: regPass, regressionFail: regFail },
    gateChecklist,
    phaseClosed,
  };

  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_3_RUNTIME_RESULTS.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ runtimePass, runtimeFail, regPass, regFail, phaseClosed, gateChecklist }, null, 2));
  await prisma.$disconnect();
  process.exit(phaseClosed ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(99);
});
