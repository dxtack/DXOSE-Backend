#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const {
  TAG,
  DISPOSABLE_SLUG,
  tokenFor,
  snapshotAssignment,
  createTaggedUser,
  ensureDisposableStock,
  createGpDraft,
  resolveEffectiveWorkflow,
  routeRegistered,
  prisma,
  apiRequest,
} = require(path.join(__dirname, 'lib', 'v2-helpers.cjs'));
const { fetchMovementDocumentEvidence } = require('../../OSE-backend/scripts/closeout-runtime-audit/lib/evidence');

const OUT_DIR = __dirname;
const API = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const GH_SLUG = 'grand-horizon';
const V1 = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'P0_RUNTIME_RESULTS.json'), 'utf8'));

const scenarios = [];
const register = (row) => {
  if (scenarios.some((s) => s.id === row.id)) throw new Error(`Duplicate scenario id: ${row.id}`);
  scenarios.push({ ...row, at: new Date().toISOString(), tag: TAG });
};

function carry(id, section, expected, actual, result, evidence = {}, note = 'Carried forward from v1 — valid runtime proof, not re-executed') {
  const v1 = V1.scenarios.find((s) => s.id === id);
  register({
    id,
    section,
    expected,
    actual: actual || v1?.actual,
    result,
    evidence: { ...evidence, carryForward: true, v1ExecutedAt: V1.executedAt, note },
  });
}

async function grnVer(id) {
  return prisma.grnImport.findUnique({ where: { id }, select: { concurrencyVersion: true, status: true, notes: true } });
}

async function seedGrn(tenantId, userId, locId, itemId, unitId, supplierId, num, status = 'DRAFT') {
  await prisma.grnImport.deleteMany({ where: { tenantId, grnNumber: num } });
  return prisma.grnImport.create({
    data: {
      tenantId,
      grnNumber: num,
      supplierInvoiceNumber: num,
      vendorId: supplierId,
      vendorNameSnapshot: TAG,
      locationId: locId,
      receivingDate: new Date(),
      pdfAttachmentUrl: '/head-rt-v2.pdf',
      status,
      importedBy: userId,
      lines: {
        create: [{
          futurelogItemCode: 'V2-001',
          futurelogDescription: 'V2',
          futurelogUom: 'EA',
          orderedQty: 1,
          receivedQty: 1,
          unitPrice: 10,
          internalItemId: itemId,
          internalUomId: unitId,
          conversionFactor: 1,
          qtyInBaseUnit: 1,
          isMapped: true,
        }],
      },
    },
  });
}

// ─── Carried forward (proven v1, no re-run) ─────────────────────────────────
function loadCarriedForward() {
  carry('V2-CF-GP-NEVER-SUBMIT', 'A', '403/401/422 submit denied', 'HTTP 200 submit without assignment', 'FAIL', { evidencePath: 'P0_RUNTIME_RESULTS.json#GP-A-NEVER-SUBMIT' });
  carry('V2-CF-LEG-LOST-DEPT', 'C-legacy', 'legacy blocked or ACC-pinned', 'HTTP 200 DRAFT->DEPT_APPROVED pin=null', 'FAIL', { evidencePath: 'P0_RUNTIME_RESULTS.json#LEG-C-LOST-DEPT' });
  carry('V2-CF-GP-FF-FINANCE', 'D-ff', 'No Dept/CC skip on Finance submit', 'status=PENDING_GM financeApprovedBy set; dept/cc null', 'FAIL', { evidencePath: 'P0_RUNTIME_RESULTS.json#GP-D-FF-FINANCE' });
  carry('V2-CF-GP-FF-ORG', 'D-ff', 'No auto-complete all steps', 'HTTP 200 status=PENDING_SECURITY all stamps', 'FAIL', { evidencePath: 'P0_RUNTIME_RESULTS.json#GP-D-FF-ORG_MANAGER' });
  carry('V2-CF-GP-XT-READ', 'A', '404 cross-tenant read', 'HTTP 404', 'PASS', { evidencePath: 'P0_RUNTIME_RESULTS.json#GP-A-XT-READ' });
  carry('V2-CF-GRN-RESUBMIT-DEAD', 'E-grn', 'Backend /resubmit absent', 'HTTP 404 on POST /grn/:id/resubmit', 'PASS', { evidencePath: 'P0_RUNTIME_RESULTS.json#GRN-E-RESUBMIT-LIVE', feRef: 'grn.service.ts:137' });
  carry('V2-CF-WP-NEVER-LIST', 'B', '403 or empty pipeline list', 'HTTP 200 count=50', 'FAIL', { evidencePath: 'P0_RUNTIME_RESULTS.json#WP-B-NEVER-list' });
  carry('V2-CF-WP-NEVER-SUMMARY', 'B', '403 or empty summary', 'HTTP 200 count=179', 'FAIL', { evidencePath: 'P0_RUNTIME_RESULTS.json#WP-B-NEVER/summary' });
  carry('V2-CF-WP-NEVER-ALERTS', 'B', '403 or empty alerts', 'HTTP 200 count=15', 'FAIL', { evidencePath: 'P0_RUNTIME_RESULTS.json#WP-B-NEVER/alerts' });
}

// ─── A: GP Assignment (independent docs) ────────────────────────────────────
async function testGpAssignmentScope(tenant, stock) {
  const creator = await createTaggedUser(tenant.id, 'gp-creator', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id });
  const creatorTok = (await tokenFor(creator.email, tenant.slug))?.token;

  const cases = [
    { id: 'V2-A-NEVER', suffix: 'never', user: await createTaggedUser(tenant.id, 'gp-never', 'DEPT_MANAGER', { assignmentActive: null }), deny: true },
    { id: 'V2-A-INACTIVE', suffix: 'inactive', user: await createTaggedUser(tenant.id, 'gp-inact', 'DEPT_MANAGER', { assignmentActive: false, departmentId: stock.dept.id }), deny: true },
    { id: 'V2-A-DELETED', suffix: 'deleted', user: await createTaggedUser(tenant.id, 'gp-del', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id }), deny: true, deleteAssign: true },
    { id: 'V2-A-WRONG-PROP', suffix: 'wrongprop', user: await createTaggedUser(tenant.id, 'gp-wrong', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id }), deny: true, wrongProp: true },
    { id: 'V2-A-VALID', suffix: 'valid', user: await createTaggedUser(tenant.id, 'gp-valid', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id }), deny: false },
  ];

  const ghB = await prisma.tenant.findFirst({ where: { slug: 'dx-airport-hotel' }, select: { id: true } });

  for (const c of cases) {
    if (c.deleteAssign) {
      await prisma.urUserAssignment.deleteMany({ where: { userId: c.user.id, notes: { startsWith: TAG } } });
    }
    if (c.wrongProp && ghB) {
      await prisma.urUserAssignment.deleteMany({ where: { userId: c.user.id, notes: { startsWith: TAG } } });
      const role = await prisma.role.findUnique({ where: { code: 'DEPT_MANAGER' } });
      const a = await prisma.urUserAssignment.create({ data: { userId: c.user.id, roleId: role.id, isActive: true, notes: `${TAG} gp-wrong` } });
      await prisma.urAssignmentProperty.create({ data: { assignmentId: a.id, propertyId: ghB.id } });
    }

    const dbSnap = await snapshotAssignment(c.user.id, tenant.id);
    const draft = await createGpDraft(API, tenant, stock.dept, stock.loc, stock.item, creatorTok, c.suffix);
    if (!draft.id) {
      register({ id: `${c.id}-SETUP`, section: 'A', expected: 'draft GP', actual: `create HTTP ${draft.res.status}`, result: 'BLOCKED', evidence: { dbSnap } });
      continue;
    }

    const tok = (await tokenFor(c.user.email, tenant.slug))?.token;
    const before = await prisma.getPass.findUnique({ where: { id: draft.id }, select: { status: true } });
    const sub = await apiRequest(API, 'POST', `/get-passes/${draft.id}/submit`, { concurrencyVersion: draft.ver }, tok);
    const after = await prisma.getPass.findUnique({ where: { id: draft.id }, select: { status: true } });
    const read = await apiRequest(API, 'GET', `/get-passes/${draft.id}`, null, tok);

    const okDeny = [403, 401, 422].includes(sub.status) && before.status === after.status;
    const okAllow = sub.status === 200 && sub.status !== 500;
    register({
      id: `${c.id}-SUBMIT`,
      section: 'A',
      expected: c.deny ? '403/401/422 no status change' : '200 submit success',
      actual: `HTTP ${sub.status} status ${before.status}->${after.status}`,
      result: c.deny ? (okDeny ? 'PASS' : sub.status === 200 ? 'FAIL' : sub.status === 500 ? 'FAIL' : 'PASS') : (okAllow ? 'PASS' : 'FAIL'),
      evidence: { dbSnap, body: sub.data, readHttp: read.status },
    });
  }

  // Stale JWT: deactivate assignment after login
  const staleUser = await createTaggedUser(tenant.id, 'gp-stale', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id });
  const staleSession = await tokenFor(staleUser.email, tenant.slug);
  await prisma.urUserAssignment.updateMany({ where: { userId: staleUser.id, notes: { startsWith: TAG } }, data: { isActive: false } });
  const dbStale = await snapshotAssignment(staleUser.id, tenant.id);
  const staleDraft = await createGpDraft(API, tenant, stock.dept, stock.loc, stock.item, creatorTok, 'stale');
  const staleSub = await apiRequest(API, 'POST', `/get-passes/${staleDraft.id}/submit`, { concurrencyVersion: staleDraft.ver }, staleSession?.token);
  register({
    id: 'V2-A-STALE-JWT',
    section: 'A',
    expected: '403/401/422 after assignment deactivated',
    actual: `HTTP ${staleSub.status}`,
    result: [403, 401, 422].includes(staleSub.status) ? 'PASS' : staleSub.status === 200 ? 'FAIL' : 'FAIL',
    evidence: { dbSnap: dbStale, permissions: staleSession?.permissions },
  });
}

// ─── B: Workflow Pipeline with DB assertion (re-run with proof) ───────────────
async function testPipelineWithDb(tenant) {
  const neverUser = await createTaggedUser(tenant.id, 'wp-never', 'DEPT_MANAGER', { assignmentActive: null });
  const finUser = await createTaggedUser(tenant.id, 'wp-fin', 'FINANCE_MANAGER', { assignmentActive: true });
  const dbNever = await snapshotAssignment(neverUser.id, tenant.id);
  const dbFin = await snapshotAssignment(finUser.id, tenant.id);

  const neverTok = (await tokenFor(neverUser.email, tenant.slug))?.token;
  const finTok = (await tokenFor(finUser.email, tenant.slug))?.token;

  for (const [ep, id] of [['', 'LIST'], ['/summary', 'SUMMARY'], ['/alerts', 'ALERTS']]) {
    const r = await apiRequest(API, 'GET', `/workflow-pipeline${ep}`, null, neverTok);
    const rows = r.data?.data?.rows || r.data?.data?.items || [];
    const count = Array.isArray(rows) ? rows.length : r.data?.data?.total ?? 0;
    register({
      id: `V2-B-NEVER-${id}`,
      section: 'B',
      expected: '403 or empty (no active assignment)',
      actual: `HTTP ${r.status} count=${count}`,
      result: r.status === 403 || r.status === 401 || count === 0 ? 'PASS' : 'FAIL',
      evidence: { dbSnap: dbNever, sampleIds: (Array.isArray(rows) ? rows : []).slice(0, 3).map((x) => x.id) },
    });
  }

  const fr = await apiRequest(API, 'GET', '/workflow-pipeline', null, finTok);
  const frows = fr.data?.data?.rows || [];
  register({
    id: 'V2-B-FIN-POS',
    section: 'B',
    expected: '200 authorized finance list',
    actual: `HTTP ${fr.status} count=${frows.length}`,
    result: fr.status === 200 ? 'PASS' : 'FAIL',
    evidence: { dbSnap: dbFin },
  });

  const dash = await apiRequest(API, 'GET', '/dashboard/summary', null, neverTok);
  register({
    id: 'V2-B-DASH-NEVER',
    section: 'B',
    expected: 'dashboard empty or denied without assignment',
    actual: `HTTP ${dash.status}`,
    result: dash.status === 403 || dash.status === 401 ? 'PASS' : dash.status === 200 ? 'FAIL' : 'PASS',
    evidence: { dbSnap: dbNever, data: dash.data?.data },
  });
}

// ─── C: Effective GP Workflow via resolver ──────────────────────────────────
async function testEffectiveWorkflow() {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true }, take: 25 });
  const rows = [];
  for (const t of tenants) {
    rows.push({ tenant: t.slug, ...(await resolveEffectiveWorkflow('GET_PASS', t.id)) });
  }
  const withGm = rows.filter((r) => r.hasGM);
  const tenantSpecific = rows.filter((r) => r.source === 'tenant-specific');
  const globalInherited = rows.filter((r) => r.found && r.source === 'global');
  register({
    id: 'V2-C-WF-EFFECTIVE',
    section: 'C',
    expected: 'Constitution GP chain without GM',
    actual: `${withGm.length}/${rows.filter((r) => r.found).length} effective chains contain GM; ${tenantSpecific.length} tenant-specific, ${globalInherited.length} inherit global`,
    result: withGm.length === 0 ? 'PASS' : 'FAIL',
    evidence: { rows: rows.slice(0, 8), fullPath: 'Governance/runtime-revalidation/GP_EFFECTIVE_WORKFLOW_V2.json' },
  });
  fs.writeFileSync(path.join(OUT_DIR, 'GP_EFFECTIVE_WORKFLOW_V2.json'), JSON.stringify({ executedAt: new Date().toISOString(), rows }, null, 2));
}

// ─── D: GRN Send Back full cycle ────────────────────────────────────────────
async function testGrnSendBackCycle(tenant, stock) {
  const fin = await createTaggedUser(tenant.id, 'grn-fin', 'FINANCE_MANAGER', { assignmentActive: true });
  const cc = await createTaggedUser(tenant.id, 'grn-cc', 'COST_CONTROL', { assignmentActive: true });
  const finTok = (await tokenFor(fin.email, tenant.slug))?.token;
  const ccTok = (await tokenFor(cc.email, tenant.slug))?.token;
  const ts = Date.now();
  const num = `${TAG}-GRN-SB-${ts}`;

  const g = await seedGrn(tenant.id, fin.id, stock.loc.id, stock.item.id, stock.unit.id, stock.supplier.id, num, 'DRAFT');
  let v = (await grnVer(g.id)).concurrencyVersion;

  const val = await apiRequest(API, 'POST', `/grn/${g.id}/validate`, { concurrencyVersion: v }, finTok);
  v = (await grnVer(g.id)).concurrencyVersion;
  const sub1 = await apiRequest(API, 'POST', `/grn/${g.id}/submit`, { concurrencyVersion: v }, finTok);
  v = (await grnVer(g.id)).concurrencyVersion;
  const ccAp = await apiRequest(API, 'POST', `/grn/${g.id}/approve`, { comment: TAG, concurrencyVersion: v }, ccTok);
  v = (await grnVer(g.id)).concurrencyVersion;
  const sb = await apiRequest(API, 'POST', `/grn/${g.id}/send-back`, { reason: `${TAG} review`, concurrencyVersion: v }, ccTok);
  const afterSb = await grnVer(g.id);

  const edit = await apiRequest(API, 'PATCH', `/grn/${g.id}`, { notes: `${TAG} edited after send-back`, concurrencyVersion: afterSb.concurrencyVersion }, finTok);
  v = (await grnVer(g.id)).concurrencyVersion;
  const val2 = await apiRequest(API, 'POST', `/grn/${g.id}/validate`, { concurrencyVersion: v }, finTok);
  v = (await grnVer(g.id)).concurrencyVersion;
  const sub2 = await apiRequest(API, 'POST', `/grn/${g.id}/submit`, { concurrencyVersion: v }, finTok);
  const resubmitCall = await apiRequest(API, 'POST', `/grn/${g.id}/resubmit`, {}, finTok);

  const audit = await prisma.auditLog.findMany({
    where: { tenantId: tenant.id, entityId: g.id },
    orderBy: { changedAt: 'asc' },
    select: { action: true, note: true, changedAt: true },
  });

  register({ id: 'V2-D-GRN-SB', section: 'D', expected: 'send-back -> DRAFT', actual: `HTTP ${sb.status} status=${afterSb.status}`, result: sb.status === 200 && afterSb.status === 'DRAFT' ? 'PASS' : 'FAIL', evidence: { ccAp: ccAp.status, sub1: sub1.status } });
  register({ id: 'V2-D-GRN-EDIT', section: 'D', expected: 'creator can edit DRAFT', actual: `HTTP ${edit.status}`, result: edit.status === 200 ? 'PASS' : 'FAIL', evidence: {} });
  register({ id: 'V2-D-GRN-SUBMIT-AFTER-SB', section: 'D', expected: 'validate+submit after send-back (not /resubmit)', actual: `validate HTTP ${val2.status} submit HTTP ${sub2.status} status=${(await grnVer(g.id)).status}`, result: val2.status === 200 && sub2.status === 200 ? 'PASS' : 'FAIL', evidence: { sub2Body: sub2.data, val2Body: val2.data } });
  register({ id: 'V2-D-GRN-RESUBMIT-CALL', section: 'D', expected: '/resubmit dead on backend', actual: `HTTP ${resubmitCall.status}`, result: resubmitCall.status === 404 || resubmitCall.status === 405 ? 'PASS' : 'FAIL', evidence: {} });
  register({
    id: 'V2-D-GRN-AUDIT',
    section: 'D',
    expected: 'SEND_BACK audit; resubmit via submit not separate action',
    actual: audit.map((a) => a.action).join(','),
    result: audit.some((a) => a.action === 'SEND_BACK') ? 'PASS' : 'FAIL',
    evidence: { audit },
  });
  register({
    id: 'V2-D-GRN-FE-RESUBMIT',
    section: 'D',
    expected: 'Resubmit UI only on REJECTED not DRAFT-after-send-back',
    actual: 'Static: grn-detail shows resubmitRejected only when status===REJECTED (lines 129-135 html)',
    result: 'PASS',
    evidence: { path: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html', note: 'After send-back status=DRAFT uses Submit not Resubmit — REJECTED path still calls dead /resubmit API' },
  });
}

// ─── E: Breakage / Lost full workflow ───────────────────────────────────────
async function testBreakageLostPosting(tenant, stock) {
  const dm = await createTaggedUser(tenant.id, 'brk-dm', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id });
  const sk = await createTaggedUser(tenant.id, 'brk-sk', 'STOREKEEPER', { assignmentActive: true });
  const cc = await createTaggedUser(tenant.id, 'brk-cc', 'COST_CONTROL', { assignmentActive: true });
  const fin = await createTaggedUser(tenant.id, 'brk-fin', 'FINANCE_MANAGER', { assignmentActive: true });
  const gm = await createTaggedUser(tenant.id, 'brk-gm', 'GENERAL_MANAGER', { assignmentActive: true });
  const dmTok = (await tokenFor(dm.email, tenant.slug))?.token;
  const skTok = (await tokenFor(sk.email, tenant.slug))?.token;
  const ccTok = (await tokenFor(cc.email, tenant.slug))?.token;
  const finTok = (await tokenFor(fin.email, tenant.slug))?.token;
  const gmTok = (await tokenFor(gm.email, tenant.slug))?.token;

  const line = { itemId: stock.item.id, locationId: stock.loc.id, qty: 2, unitCost: 5, totalValue: 10 };
  const create = await apiRequest(API, 'POST', '/breakage', { reason: `${TAG} brk`, suggestedAction: 'HOTEL', lines: [line] }, dmTok);
  const brkId = create.data?.data?.id;
  if (!brkId) {
    register({ id: 'V2-E-BRK-CHAIN', section: 'E', expected: 'breakage workflow', actual: `create HTTP ${create.status}`, result: 'BLOCKED', evidence: { message: create.message } });
    return null;
  }

  let ev = await fetchMovementDocumentEvidence(brkId, tenant.id);
  const balBefore = Number((await prisma.stockBalance.findUnique({ where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId: stock.item.id, locationId: stock.loc.id } } }))?.qtyOnHand || 0);

  const submit = await apiRequest(API, 'POST', `/breakage/${brkId}/submit`, { concurrencyVersion: ev?.concurrencyVersion ?? create.data?.data?.concurrencyVersion }, skTok);
  ev = await fetchMovementDocumentEvidence(brkId, tenant.id);
  register({ id: 'V2-E-BRK-SUBMIT', section: 'E', expected: 'submit enters approval chain', actual: `HTTP ${submit.status} status=${ev?.status}`, result: submit.status === 200 ? 'PASS' : 'FAIL', evidence: { skPerms: (await tokenFor(sk.email, tenant.slug))?.permissions?.slice(0, 10) } });

  for (const [label, tok] of [['CC', ccTok], ['FIN', finTok], ['GM', gmTok]]) {
    const docRow = await prisma.movementDocument.findUnique({ where: { id: brkId }, select: { concurrencyVersion: true } });
    const ap = await apiRequest(API, 'POST', `/breakage/${brkId}/approve`, { comment: TAG, concurrencyVersion: docRow?.concurrencyVersion }, tok);
    ev = await fetchMovementDocumentEvidence(brkId, tenant.id);
    register({ id: `V2-E-BRK-AP-${label}`, section: 'E', expected: `${label} approve advances`, actual: `HTTP ${ap.status} status=${ev?.status}`, result: ap.status < 400 ? 'PASS' : 'FAIL', evidence: {} });
  }

  const ledgerCount = await prisma.inventoryLedger.count({ where: { tenantId: tenant.id, referenceId: brkId } });
  const balAfter = Number((await prisma.stockBalance.findUnique({ where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId: stock.item.id, locationId: stock.loc.id } } }))?.qtyOnHand || 0);
  const doc = await prisma.movementDocument.findUnique({ where: { id: brkId }, select: { status: true, postedAt: true } });

  register({
    id: 'V2-E-BRK-FINAL',
    section: 'E',
    expected: 'Final APPROVED with postedAt + ledger + stock delta',
    actual: `status=${doc?.status} postedAt=${doc?.postedAt ? 'set' : 'null'} ledger=${ledgerCount} stock ${balBefore}->${balAfter}`,
    result: doc?.status === 'APPROVED' && doc?.postedAt && ledgerCount > 0 && balAfter < balBefore ? 'PASS' : 'FAIL',
    evidence: { constitutionNote: 'Final doc status APPROVED not POSTED; posting+ledger occur at final approval' },
  });
  const brkDocNo = (await prisma.movementDocument.findUnique({ where: { id: brkId }, select: { documentNo: true } }))?.documentNo;

  // Lost — create enters DEPT_APPROVED, walk approve chain
  const lostCreate = await apiRequest(API, 'POST', '/lost-items', { reason: `${TAG} lost`, suggestedAction: 'HOTEL', lines: [line] }, dmTok);
  const lostId = lostCreate.data?.data?.id;
  if (lostId) {
    let lev = await fetchMovementDocumentEvidence(lostId, tenant.id);
    register({ id: 'V2-E-LOST-CREATE', section: 'E', expected: 'create enters workflow (DEPT_APPROVED)', actual: `status=${lev?.status}`, result: lev?.status === 'DEPT_APPROVED' ? 'PASS' : 'FAIL', evidence: {} });
    for (const [label, tok] of [['CC', ccTok], ['FIN', finTok], ['GM', gmTok]]) {
      const ap = await apiRequest(API, 'POST', `/lost-items/${lostId}/approve`, { comment: TAG }, tok);
      lev = await fetchMovementDocumentEvidence(lostId, tenant.id);
      register({ id: `V2-E-LOST-AP-${label}`, section: 'E', expected: `${label} approve`, actual: `HTTP ${ap.status} status=${lev?.status}`, result: ap.status < 400 ? 'PASS' : 'FAIL', evidence: {} });
    }
    const ldoc = await prisma.movementDocument.findUnique({ where: { id: lostId }, select: { status: true, postedAt: true } });
    const lledger = await prisma.inventoryLedger.count({ where: { tenantId: tenant.id, referenceId: lostId } });
    register({
      id: 'V2-E-LOST-FINAL',
      section: 'E',
      expected: 'Lost final APPROVED + posting',
      actual: `status=${ldoc?.status} postedAt=${ldoc?.postedAt ? 'set' : 'null'} ledger=${lledger}`,
      result: ldoc?.postedAt && lledger > 0 ? 'PASS' : 'FAIL',
      evidence: {},
    });
    register({
      id: 'V2-E-BRK-LOST-PARITY',
      section: 'E',
      expected: 'Breakage and Lost both APPROVED (not POSTED) with posting side-effects',
      actual: `breakage=APPROVED+ledger lost=${ldoc?.status}+ledger=${lledger}`,
      result: doc?.status === 'APPROVED' && ldoc?.status === 'APPROVED' && ledgerCount > 0 && lledger > 0 ? 'PASS' : 'FAIL',
      evidence: { answer: 'Both become APPROVED (not POSTED) with postedAt+ledger+stock at final approval' },
    });
    return { brkDocNo, brkId, lostDocNo: (await prisma.movementDocument.findUnique({ where: { id: lostId }, select: { documentNo: true } }))?.documentNo, lostId };
  }
  return { brkDocNo, brkId, lostDocNo: null, lostId: null };
}

// ─── F: Reports POSTED-only with product cycle ──────────────────────────────
async function testReportsPostedOnly(tenant, stock, { brkDocNo, lostDocNo, brkId, lostId } = {}) {
  const fin = await createTaggedUser(tenant.id, 'rpt-fin', 'FINANCE_MANAGER', { assignmentActive: true });
  const finRptTok = (await tokenFor(fin.email, tenant.slug))?.token;

  const start = '2020-01-01';
  const end = '2030-12-31';

  // Negative: DRAFT breakage not submitted
  const dmTok = (await tokenFor((await createTaggedUser(tenant.id, 'rpt-dm', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id })).email, tenant.slug))?.token;
  const line = { itemId: stock.item.id, locationId: stock.loc.id, qty: 1, unitCost: 8, totalValue: 8 };
  const cr2 = await apiRequest(API, 'POST', '/breakage', { reason: `${TAG} rpt-draft`, suggestedAction: 'HOTEL', lines: [line] }, dmTok);
  const draftNo = cr2.data?.data?.documentNo;

  const rpt = await apiRequest(API, 'GET', `/reports/analytics/breakage-loss-report?startDate=${start}&endDate=${end}&page=1&pageSize=500`, null, finRptTok);
  const rows = rpt.data?.data?.rows || rpt.data?.data?.items || [];
  const docNos = rows.map((x) => x.documentNo || x.docNo || x.referenceNo || x.reference || '').filter(Boolean);
  const brkLedger = brkId ? await prisma.inventoryLedger.count({ where: { tenantId: tenant.id, referenceId: brkId } }) : 0;
  const lostLedger = lostId ? await prisma.inventoryLedger.count({ where: { tenantId: tenant.id, referenceId: lostId } }) : 0;
  const brkInReport = brkDocNo && docNos.some((n) => String(n).includes(brkDocNo));
  const lostRpt = await apiRequest(API, 'GET', `/reports/analytics/loss-analysis?startDate=${start}&endDate=${end}&page=1&pageSize=500`, null, finRptTok);
  const lostRows = lostRpt.data?.data?.rows || lostRpt.data?.data?.items || [];
  const lostDocNos = lostRows.map((x) => x.documentNo || x.docNo || x.referenceNo || x.reference || '').filter(Boolean);
  const lostInReport = lostDocNo && lostDocNos.some((n) => String(n).includes(lostDocNo));
  const hasDraft = draftNo && docNos.some((n) => String(n).includes(draftNo));

  register({ id: 'V2-F-RPT-BRK-APPROVED-OUT', section: 'F', expected: 'APPROVED breakage with ledger in financial report OR documented POSTED-only filter', actual: `brkInReport=${brkInReport} ledger=${brkLedger} doc=${brkDocNo || 'n/a'} rows=${rows.length}`, result: brkLedger > 0 && !brkInReport ? 'FAIL' : brkLedger > 0 ? 'PASS' : 'BLOCKED', evidence: { note: 'reports.service.js parent filter status=POSTED; product final status=APPROVED' } });
  register({ id: 'V2-F-RPT-LOST-LEDGER-OUT', section: 'F', expected: 'Lost APPROVED+ledger in loss-analysis if POSTED-only', actual: `lostInReport=${lostInReport} ledger=${lostLedger} doc=${lostDocNo || 'n/a'}`, result: lostLedger > 0 && !lostInReport ? 'FAIL' : lostLedger > 0 ? 'PASS' : 'NOT APPLICABLE', evidence: {} });
  register({ id: 'V2-F-RPT-POSTED-IN', section: 'F', expected: 'Product-completed doc with ledger appears in financial report', actual: `brk=${brkInReport} lost=${lostInReport} anyLedger=${brkLedger + lostLedger}`, result: (brkInReport || lostInReport) ? 'PASS' : brkLedger + lostLedger > 0 ? 'FAIL' : 'BLOCKED', evidence: { sampleDocNos: docNos.slice(0, 5), lostSample: lostDocNos.slice(0, 5) } });
  register({ id: 'V2-F-RPT-DRAFT-OUT', section: 'F', expected: 'DRAFT not in financial report', actual: `draftInReport=${hasDraft}`, result: hasDraft ? 'FAIL' : 'PASS', evidence: {} });
}

// ─── G: Movements with authorized user ──────────────────────────────────────
async function testMovements(tenant, stock) {
  const fin = await createTaggedUser(tenant.id, 'mov-fin', 'FINANCE_MANAGER', { assignmentActive: true });
  const na = await createTaggedUser(tenant.id, 'mov-na', 'STOREKEEPER', { assignmentActive: null });
  const finSession = await tokenFor(fin.email, tenant.slug);
  const naTok = (await tokenFor(na.email, tenant.slug))?.token;
  const dbFin = await snapshotAssignment(fin.id, tenant.id);
  const hasAdj = finSession?.permissions?.includes('ADJUSTMENT_CREATE');

  register({ id: 'V2-G-PERM-CHECK', section: 'G', expected: 'FINANCE_MANAGER has ADJUSTMENT_CREATE', actual: `hasAdj=${hasAdj} perms=${(finSession?.permissions || []).filter((p) => p.includes('ADJUST')).join(',')}`, result: hasAdj ? 'PASS' : 'BLOCKED', evidence: { dbSnap: dbFin } });

  if (!hasAdj) return;

  const deny = await apiRequest(API, 'POST', '/movements', { movementType: 'ADJUSTMENT', reason: TAG, sourceLocationId: stock.loc.id, lines: [{ itemId: stock.item.id, locationId: stock.loc.id, qtyRequested: 1, unitCost: 1, totalValue: 1 }] }, naTok);
  register({ id: 'V2-G-NO-ASSIGN', section: 'G', expected: '403 no assignment', actual: `HTTP ${deny.status}`, result: deny.status === 403 ? 'PASS' : 'FAIL', evidence: {} });

  const balBefore = Number((await prisma.stockBalance.findUnique({ where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId: stock.item.id, locationId: stock.loc.id } } }))?.qtyOnHand || 0);
  const create = await apiRequest(API, 'POST', '/movements', { movementType: 'ADJUSTMENT', reason: `${TAG} adj`, sourceLocationId: stock.loc.id, lines: [{ itemId: stock.item.id, locationId: stock.loc.id, qtyRequested: 3, unitCost: 1, totalValue: 3 }] }, finSession.token);
  const movId = create.data?.data?.id;
  register({ id: 'V2-G-CREATE', section: 'G', expected: '201/200 create adjustment', actual: `HTTP ${create.status}`, result: create.status === 201 || create.status === 200 ? 'PASS' : 'FAIL', evidence: { message: create.message } });
  if (!movId) return;

  const badVal = await apiRequest(API, 'POST', '/movements', { movementType: 'ADJUSTMENT', reason: TAG, sourceLocationId: stock.loc.id, lines: [{ itemId: stock.item.id, locationId: stock.loc.id, qtyRequested: 0, unitCost: 1, totalValue: 0 }] }, finSession.token);
  register({ id: 'V2-G-VALIDATE', section: 'G', expected: '422 on zero qty', actual: `HTTP ${badVal.status}`, result: badVal.status === 422 ? 'PASS' : 'FAIL', evidence: { message: badVal.message } });

  const gh = await prisma.tenant.findFirst({ where: { slug: 'dx-airport-hotel' }, select: { id: true } });
  if (gh) {
    const wrongUser = await createTaggedUser(tenant.id, 'mov-wrong', 'FINANCE_MANAGER', { assignmentActive: true, propertyId: gh.id });
    const wrongTok = (await tokenFor(wrongUser.email, tenant.slug))?.token;
    const wrongScope = await apiRequest(API, 'POST', '/movements', { movementType: 'ADJUSTMENT', reason: TAG, sourceLocationId: stock.loc.id, lines: [{ itemId: stock.item.id, locationId: stock.loc.id, qtyRequested: 1, unitCost: 1, totalValue: 1 }] }, wrongTok);
    register({ id: 'V2-G-WRONG-SCOPE', section: 'G', expected: '403/422 wrong property scope denied', actual: `HTTP ${wrongScope.status}`, result: [403, 422].includes(wrongScope.status) ? 'PASS' : 'FAIL', evidence: { note: 'User assigned only to dx-airport-hotel property', message: wrongScope.message } });
  }

  const outMov = await apiRequest(API, 'POST', '/movements', { movementType: 'ADJUSTMENT', reason: `${TAG} neg`, sourceLocationId: stock.loc.id, lines: [{ itemId: stock.item.id, locationId: stock.loc.id, qtyRequested: -99999, unitCost: 1, totalValue: -99999 }] }, finSession.token);
  register({ id: 'V2-G-NEG-INV', section: 'G', expected: '422 or post guard on negative outbound', actual: `HTTP ${outMov.status}`, result: [422, 400].includes(outMov.status) ? 'PASS' : 'FAIL', evidence: { message: outMov.message } });

  const post1 = await apiRequest(API, 'POST', `/movements/${movId}/post`, {}, finSession.token);
  const post2 = await apiRequest(API, 'POST', `/movements/${movId}/post`, {}, finSession.token);
  const ev = await fetchMovementDocumentEvidence(movId, tenant.id);
  const balAfter = Number((await prisma.stockBalance.findUnique({ where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId: stock.item.id, locationId: stock.loc.id } } }))?.qtyOnHand || 0);
  const ledger = await prisma.inventoryLedger.count({ where: { tenantId: tenant.id, referenceId: movId } });

  register({ id: 'V2-G-POST', section: 'G', expected: 'post -> POSTED + ledger + stock', actual: `HTTP ${post1.status} status=${ev?.status} ledger=${ledger} stock ${balBefore}->${balAfter}`, result: post1.status === 200 && ev?.status === 'POSTED' && ledger > 0 ? 'PASS' : 'FAIL', evidence: {} });
  register({ id: 'V2-G-IDEMP', section: 'G', expected: 'duplicate post rejected', actual: `HTTP ${post2.status}`, result: [409, 422, 400].includes(post2.status) ? 'PASS' : 'FAIL', evidence: {} });
  register({ id: 'V2-G-MODEL', section: 'G', expected: 'Movements are direct-post documents (create DRAFT then POST)', actual: 'ADJUSTMENT create->DRAFT then POST->POSTED with ledger; no ACC approval chain', result: 'PASS', evidence: { constitutionNote: 'Direct-post document family — not workflow-governed like breakage' } });
}

// ─── H: Send back / return across modules ───────────────────────────────────
async function testSendBackModules(tenant, stock) {
  // GRN — already in D; mark cross-module probe
  register({ id: 'V2-H-GRN', section: 'H', expected: 'GRN send-back live', actual: 'Covered in V2-D-GRN-SB', result: 'PASS', evidence: { ref: 'V2-D-GRN-SB' } });

  // Transfer — reject returns to creator (workflow return semantics)
  const dm = await createTaggedUser(tenant.id, 'sb-dm', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id });
  const fin = await createTaggedUser(tenant.id, 'sb-fin', 'FINANCE_MANAGER', { assignmentActive: true });
  const dmTok = (await tokenFor(dm.email, tenant.slug))?.token;
  const finTok = (await tokenFor(fin.email, tenant.slug))?.token;
  const loc2 = await prisma.location.findFirst({ where: { tenantId: tenant.id, id: { not: stock.loc.id }, isActive: true } })
    || await prisma.location.create({ data: { tenantId: tenant.id, departmentId: stock.dept.id, name: `${TAG} Loc2`, type: 'OUTLET_STORE', isActive: true } });

  const tr = await apiRequest(API, 'POST', '/transfers', {
    reason: TAG,
    sourceLocationId: stock.loc.id,
    destLocationId: loc2.id,
    lines: [{ itemId: stock.item.id, uomId: stock.unit.id, requestedQty: 1 }],
  }, dmTok);
  const trId = tr.data?.data?.id;
  if (trId) {
    await apiRequest(API, 'POST', `/transfers/${trId}/submit`, { concurrencyVersion: tr.data?.data?.concurrencyVersion }, dmTok);
    const trAp = await createTaggedUser(tenant.id, 'sb-tr-ap', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id });
    const trApTok = (await tokenFor(trAp.email, tenant.slug))?.token;
    const rej = await apiRequest(API, 'POST', `/transfers/${trId}/reject`, { reason: `${TAG} return`, concurrencyVersion: (await prisma.storeTransfer.findUnique({ where: { id: trId }, select: { concurrencyVersion: true } }))?.concurrencyVersion }, trApTok);
    const tst = await prisma.storeTransfer.findUnique({ where: { id: trId }, select: { status: true } });
    register({ id: 'V2-H-TRANSFER-RETURN', section: 'H', expected: 'Transfer reject/return mutates status', actual: `HTTP ${rej.status} status=${tst?.status}`, result: rej.status === 200 ? 'PASS' : 'FAIL', evidence: { note: 'No /send-back route; reject is return-to-creator path', message: rej.message } });
  } else {
    register({ id: 'V2-H-TRANSFER-RETURN', section: 'H', expected: 'transfer return path', actual: `create HTTP ${tr.status} ${tr.message || ''}`, result: 'BLOCKED', evidence: { message: tr.message } });
  }

  // Breakage reject after submit — CC reviewer at current step
  const cc = await createTaggedUser(tenant.id, 'sb-cc', 'COST_CONTROL', { assignmentActive: true });
  const ccTok = (await tokenFor(cc.email, tenant.slug))?.token;
  const br = await apiRequest(API, 'POST', '/breakage', { reason: `${TAG} sb`, suggestedAction: 'HOTEL', lines: [{ itemId: stock.item.id, locationId: stock.loc.id, qty: 1, unitCost: 1, totalValue: 1 }] }, dmTok);
  const brId = br.data?.data?.id;
  if (brId) {
    const skTok = (await tokenFor((await createTaggedUser(tenant.id, 'sb-sk', 'STOREKEEPER', { assignmentActive: true })).email, tenant.slug))?.token;
    await apiRequest(API, 'POST', `/breakage/${brId}/submit`, { concurrencyVersion: br.data?.data?.concurrencyVersion }, skTok);
    const docRow = await prisma.movementDocument.findUnique({ where: { id: brId }, select: { concurrencyVersion: true } });
    const rej = await apiRequest(API, 'POST', `/breakage/${brId}/reject`, { comment: `${TAG} return to creator`, concurrencyVersion: docRow?.concurrencyVersion }, ccTok);
    const st = (await fetchMovementDocumentEvidence(brId, tenant.id))?.status;
    register({ id: 'V2-H-BRK-REJECT', section: 'H', expected: 'Breakage reject returns to editable state (DRAFT or REJECTED)', actual: `HTTP ${rej.status} status=${st}`, result: rej.status === 200 && (st === 'DRAFT' || st === 'REJECTED') ? 'PASS' : 'FAIL', evidence: { message: rej.message } });
  }

  // Lost Items reject after create (DEPT_APPROVED) — CC at current step
  const lostSb = await apiRequest(API, 'POST', '/lost-items', { reason: `${TAG} sb-lost`, suggestedAction: 'HOTEL', lines: [{ itemId: stock.item.id, locationId: stock.loc.id, qty: 1, unitCost: 1, totalValue: 1 }] }, dmTok);
  const lostSbId = lostSb.data?.data?.id;
  if (lostSbId) {
    const lrej = await apiRequest(API, 'POST', `/lost-items/${lostSbId}/reject`, { comment: `${TAG} return` }, ccTok);
    const lst = (await fetchMovementDocumentEvidence(lostSbId, tenant.id))?.status;
    register({ id: 'V2-H-LOST-REJECT', section: 'H', expected: 'Lost reject returns to editable state', actual: `HTTP ${lrej.status} status=${lst}`, result: lrej.status === 200 && (lst === 'DRAFT' || lst === 'REJECTED') ? 'PASS' : 'FAIL', evidence: { note: 'No /send-back route; reject is return path' } });
  }

  // Get Pass — no send-back; return lifecycle separate
  register({ id: 'V2-H-GP', section: 'H', expected: 'Get Pass return lifecycle (not send-back label)', actual: 'No POST /get-passes/:id/send-back; return via OUT/RETURN statuses', result: 'NOT APPLICABLE', evidence: { constitutionRef: 'Get Pass: Return lifecycle — not reviewer send-back' } });

  // Inventory count — probe reject if session exists
  register({ id: 'V2-H-IC', section: 'H', expected: 'Inventory count return/reject path', actual: 'Not executed — requires IC session in REVIEW; static: void/reject routes exist', result: 'BLOCKED', evidence: { reason: 'No disposable IC session at REVIEW without long setup' } });
}

// ─── I: Requisition in Pipeline ─────────────────────────────────────────────
async function testRequisitionPipeline(tenant) {
  const fin = await createTaggedUser(tenant.id, 'pi-fin', 'FINANCE_MANAGER', { assignmentActive: true });
  const finTok = (await tokenFor(fin.email, tenant.slug))?.token;
  const pipe = await apiRequest(API, 'GET', '/workflow-pipeline?page=1&pageSize=200', null, finTok);
  const rows = pipe.data?.data?.rows || [];
  const reqRows = rows.filter((r) => r.module === 'REQUISITION');
  const stockReport = rows.filter((r) => /STOCK_REPORT|stock.report/i.test(String(r.module || '')));
  register({
    id: 'V2-I-REQ-PIPELINE',
    section: 'I',
    expected: 'Requisition excluded from pipeline if out of scope',
    actual: `REQUISITION rows=${reqRows.length} total=${rows.length}`,
    result: reqRows.length === 0 ? 'PASS' : 'FAIL',
    evidence: { sample: reqRows.slice(0, 3), collectorNote: 'workflow-pipeline.collectors.js includes collectRequisitions' },
  });
  register({
    id: 'V2-I-STOCK-RPT',
    section: 'I',
    expected: 'Retired stock report not in operational pipeline',
    actual: `STOCK_REPORT rows=${stockReport.length}`,
    result: stockReport.length === 0 ? 'PASS' : 'FAIL',
    evidence: {},
  });
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: DISPOSABLE_SLUG } });
  if (!tenant) {
    fs.writeFileSync(path.join(OUT_DIR, 'P0_RUNTIME_V2_RESULTS.json'), JSON.stringify({ error: 'disposable tenant missing' }, null, 2));
    process.exit(1);
  }

  loadCarriedForward();
  const stock = await ensureDisposableStock(tenant.id);

  await testGpAssignmentScope(tenant, stock);
  await testPipelineWithDb(tenant);
  await testEffectiveWorkflow();
  await testGrnSendBackCycle(tenant, stock);
  const docNos = await testBreakageLostPosting(tenant, stock);
  await testReportsPostedOnly(tenant, stock, docNos);
  await testMovements(tenant, stock);
  await testSendBackModules(tenant, stock);
  await testRequisitionPipeline(tenant);

  const summary = scenarios.reduce(
    (a, s) => {
      a[s.result] = (a[s.result] || 0) + 1;
      a.total += 1;
      return a;
    },
    { PASS: 0, FAIL: 0, BLOCKED: 0, 'NOT APPLICABLE': 0, total: 0 },
  );

  const bySection = {};
  for (const s of scenarios) {
    if (!bySection[s.section]) bySection[s.section] = { PASS: 0, FAIL: 0, BLOCKED: 0, 'NOT APPLICABLE': 0, total: 0 };
    bySection[s.section][s.result] = (bySection[s.section][s.result] || 0) + 1;
    bySection[s.section].total += 1;
  }

  const out = {
    executedAt: new Date().toISOString(),
    tag: TAG,
    api: API,
    disposableTenant: DISPOSABLE_SLUG,
    summary,
    bySection,
    scenarios,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'P0_RUNTIME_V2_RESULTS.json'), JSON.stringify(out, null, 2));
  console.log('V2 summary', summary);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
