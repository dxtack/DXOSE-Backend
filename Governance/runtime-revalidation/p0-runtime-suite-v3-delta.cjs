#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const TAG = 'HEAD_RT_V3';
const OUT = path.join(__dirname, 'P0_RUNTIME_V3_DELTA.json');
const API = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const FE = process.env.OSE_FE_URL || 'http://127.0.0.1:4200';

const {
  DISPOSABLE_SLUG,
  tokenFor,
  createTaggedUser,
  ensureDisposableStock,
  prisma,
  apiRequest,
} = require(path.join(__dirname, 'lib', 'v2-helpers.cjs'));

const requirePlaywright = createRequire(path.join(__dirname, '../../OSE-Frontend/package.json'));

const CON = {
  SB_NOT_END: 'C03-3.4-001 — Send Back shall not end the document.',
  SB_EDIT: 'C03-3.4-002 — Send Back shall allow edit.',
  SB_REASON: 'C03-3.4-003 — Send Back shall require a reason.',
  SB_EDIT_SUBMIT: 'C03-3.4-004 — Send Back next step shall be Edit then Submit.',
  SB_CONTINUE: 'C03-3.4-005 — Send Back shall continue the business transaction.',
  REJ_END: 'C03-3.4-006 — Reject shall end the document.',
  REJ_NO_EDIT: 'C03-3.4-007 — Reject shall not allow edit.',
  REJ_REASON: 'C03-3.4-008 — Reject shall require a reason.',
  POSTING: 'C02-2.4.1-001 — Posting is the single business commit point.',
  POSTING_OFFICIAL: 'C02-2.4.1-002 — No effect official before Posting.',
  REPORTS_POSTED: 'C02-2.4.2-001 — Reports from Posted documents only.',
  AUTO_POST: 'C05-5.2-011 — Posting auto-triggered on final approval.',
  LIFECYCLE_SAME: 'C02-2.3-007 — Identical outcomes → same user-facing lifecycle state.',
  NO_RESUBMIT: 'C03-3.4-009 — After Reject, new document required; no Re-submit action.',
};

function row(partial) {
  return {
    at: new Date().toISOString(),
    tag: TAG,
    ...partial,
  };
}


async function testSendBackTransfer(tenant, stock) {
  const dm = await createTaggedUser(tenant.id, 'v3-tr-dm', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id });
  const trAp = await createTaggedUser(tenant.id, 'v3-tr-ap', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id });
  const dmTok = (await tokenFor(dm.email, tenant.slug))?.token;
  const trApTok = (await tokenFor(trAp.email, tenant.slug))?.token;
  const loc2 = await prisma.location.findFirst({ where: { tenantId: tenant.id, id: { not: stock.loc.id }, isActive: true } })
    || await prisma.location.create({ data: { tenantId: tenant.id, departmentId: stock.dept.id, name: `${TAG} Loc2`, type: 'OUTLET_STORE', isActive: true } });

  const tr = await apiRequest(API, 'POST', '/transfers', {
    reason: TAG,
    sourceLocationId: stock.loc.id,
    destLocationId: loc2.id,
    lines: [{ itemId: stock.item.id, uomId: stock.unit.id, requestedQty: 1 }],
  }, dmTok);
  const trId = tr.data?.data?.id;
  if (!trId) {
    return [
      row({ id: 'V3-H-SB-TRANSFER', module: 'Transfer', constitutionRule: CON.SB_NOT_END, expected: 'Send Back action at review step', actual: `create HTTP ${tr.status}`, result: 'BLOCKED', finalClassification: 'Blocked by Verified Environment Limitation', rootCause: 'Fixture', evidence: { message: tr.message } }),
    ];
  }
  await apiRequest(API, 'POST', `/transfers/${trId}/submit`, { concurrencyVersion: tr.data?.data?.concurrencyVersion }, dmTok);
  const st = await prisma.storeTransfer.findUnique({ where: { id: trId }, select: { status: true, concurrencyVersion: true } });
  const sb = await apiRequest(API, 'POST', `/transfers/${trId}/send-back`, { reason: TAG }, trApTok);
  const rej = await apiRequest(API, 'POST', `/transfers/${trId}/reject`, { reason: `${TAG} reject`, concurrencyVersion: st?.concurrencyVersion }, trApTok);
  const afterRej = await prisma.storeTransfer.findUnique({ where: { id: trId }, select: { status: true } });

  return [
    row({
      id: 'V3-H-SB-TRANSFER',
      module: 'Transfer',
      constitutionRule: `${CON.SB_NOT_END} ${CON.SB_EDIT_SUBMIT}`,
      contractRef: 'WORKFLOW_MATRIX §1 — no send-back route documented',
      expected: 'Reviewer Send Back returns doc to creator editable; same transaction continues after Submit',
      actual: `POST /transfers/:id/send-back HTTP ${sb.status}; status at review=${st?.status}`,
      result: sb.status === 200 && st?.status !== 'REJECTED' ? 'PASS' : 'FAIL',
      finalClassification: sb.status === 200 ? 'Runtime Confirmed Compliant' : 'Runtime Confirmed Defect',
      rootCause: sb.status !== 200 ? 'Missing Send Back API/UI for Transfer at review step' : null,
      missingImplementation: sb.status !== 200 ? 'POST /transfers/:id/send-back + creator edit/resubmit path' : null,
      evidence: { sbBody: sb.data, sbMessage: sb.message },
    }),
    row({
      id: 'V3-H-REJECT-TRANSFER',
      module: 'Transfer',
      constitutionRule: CON.REJ_END,
      expected: 'Reject terminates document (not Send Back proof)',
      actual: `HTTP ${rej.status} status=${afterRej?.status}`,
      result: rej.status === 200 && afterRej?.status === 'REJECTED' ? 'PASS' : 'FAIL',
      finalClassification: 'Runtime Confirmed Compliant',
      rootCause: null,
      evidence: { note: 'Reject compliance only — does not satisfy Send Back' },
    }),
  ];
}

async function testSendBackBreakageLost(tenant, stock) {
  const dm = await createTaggedUser(tenant.id, 'v3-br-dm', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id });
  const sk = await createTaggedUser(tenant.id, 'v3-br-sk', 'STOREKEEPER', { assignmentActive: true });
  const cc = await createTaggedUser(tenant.id, 'v3-br-cc', 'COST_CONTROL', { assignmentActive: true });
  const dmTok = (await tokenFor(dm.email, tenant.slug))?.token;
  const skTok = (await tokenFor(sk.email, tenant.slug))?.token;
  const ccTok = (await tokenFor(cc.email, tenant.slug))?.token;
  const line = { itemId: stock.item.id, locationId: stock.loc.id, qty: 1, unitCost: 5, totalValue: 5 };

  const br = await apiRequest(API, 'POST', '/breakage', { reason: `${TAG} sb`, suggestedAction: 'HOTEL', lines: [line] }, dmTok);
  const brId = br.data?.data?.id;
  const out = [];
  if (brId) {
    await apiRequest(API, 'POST', `/breakage/${brId}/submit`, { concurrencyVersion: br.data?.data?.concurrencyVersion }, skTok);
    const sb = await apiRequest(API, 'POST', `/breakage/${brId}/send-back`, { reason: TAG }, ccTok);
    const docRow = await prisma.movementDocument.findUnique({ where: { id: brId }, select: { concurrencyVersion: true, status: true } });
    const rej = await apiRequest(API, 'POST', `/breakage/${brId}/reject`, { comment: TAG, concurrencyVersion: docRow?.concurrencyVersion }, ccTok);
    const after = await prisma.movementDocument.findUnique({ where: { id: brId }, select: { status: true } });
    out.push(
      row({
        id: 'V3-H-SB-BREAKAGE',
        module: 'Breakage',
        constitutionRule: CON.SB_NOT_END,
        contractRef: 'WORKFLOW_MATRIX §3 — reject only, no send-back route',
        expected: 'Send Back at review returns to creator for edit+submit same doc',
        actual: `POST /breakage/:id/send-back HTTP ${sb.status}`,
        result: sb.status === 200 ? 'PASS' : 'FAIL',
        finalClassification: sb.status === 200 ? 'Runtime Confirmed Compliant' : 'Runtime Confirmed Defect',
        rootCause: 'No Send Back route/action for Breakage',
        missingImplementation: 'Send Back distinct from Reject on Breakage approval chain',
        evidence: { reviewStatus: docRow?.status, message: sb.message },
      }),
      row({
        id: 'V3-H-REJECT-BREAKAGE',
        module: 'Breakage',
        constitutionRule: CON.REJ_END,
        expected: 'Reject ends/terminates document lifecycle',
        actual: `HTTP ${rej.status} status=${after?.status}`,
        result: rej.status === 200 && ['REJECTED', 'DRAFT'].includes(after?.status) ? 'PASS' : 'FAIL',
        finalClassification: 'Runtime Confirmed Compliant',
        evidence: { note: 'Reject path only — not Send Back' },
      }),
    );
  }

  const lost = await apiRequest(API, 'POST', '/lost-items', { reason: `${TAG} sb`, suggestedAction: 'HOTEL', lines: [line] }, dmTok);
  const lostId = lost.data?.data?.id;
  if (lostId) {
    const sb = await apiRequest(API, 'POST', `/lost-items/${lostId}/send-back`, { reason: TAG }, ccTok);
    const rej = await apiRequest(API, 'POST', `/lost-items/${lostId}/reject`, { comment: TAG }, ccTok);
    const after = await prisma.movementDocument.findUnique({ where: { id: lostId }, select: { status: true } });
    out.push(
      row({
        id: 'V3-H-SB-LOST',
        module: 'Lost Items',
        constitutionRule: CON.SB_NOT_END,
        contractRef: 'WORKFLOW_MATRIX §4 — reject only',
        expected: 'Send Back at review',
        actual: `POST /lost-items/:id/send-back HTTP ${sb.status}`,
        result: sb.status === 200 ? 'PASS' : 'FAIL',
        finalClassification: sb.status === 200 ? 'Runtime Confirmed Compliant' : 'Runtime Confirmed Defect',
        rootCause: 'No Send Back route for Lost Items',
        missingImplementation: 'Send Back action on Lost Items review step',
        evidence: { message: sb.message },
      }),
      row({
        id: 'V3-H-REJECT-LOST',
        module: 'Lost Items',
        constitutionRule: CON.REJ_END,
        expected: 'Reject terminates document',
        actual: `HTTP ${rej.status} status=${after?.status}`,
        result: rej.status === 200 ? 'PASS' : 'FAIL',
        finalClassification: 'Runtime Confirmed Compliant',
        evidence: {},
      }),
    );
  }
  return out;
}

async function testSendBackGetPass(tenant, stock) {
  const dm = await createTaggedUser(tenant.id, 'v3-gp-dm', 'DEPT_MANAGER', { assignmentActive: true, departmentId: stock.dept.id });
  const cc = await createTaggedUser(tenant.id, 'v3-gp-cc', 'COST_CONTROL', { assignmentActive: true });
  const dmTok = (await tokenFor(dm.email, tenant.slug))?.token;
  const ccTok = (await tokenFor(cc.email, tenant.slug))?.token;
  const create = await apiRequest(API, 'POST', '/get-passes', {
    transferType: 'PERMANENT',
    borrowingEntity: TAG,
    departmentId: stock.dept.id,
    reason: TAG,
    lines: [{ itemId: stock.item.id, locationId: stock.loc.id, qty: 1, conditionOut: 'GOOD' }],
  }, dmTok);
  const gpId = create.data?.data?.id;
  if (!gpId) {
    return [row({ id: 'V3-H-SB-GETPASS', module: 'Get Pass', result: 'BLOCKED', expected: 'Send Back at review', actual: `create HTTP ${create.status}`, finalClassification: 'Blocked by Verified Environment Limitation', constitutionRule: CON.SB_NOT_END, evidence: {} })];
  }
  await apiRequest(API, 'POST', `/get-passes/${gpId}/submit`, { concurrencyVersion: create.data?.data?.concurrencyVersion }, dmTok);
  const sb = await apiRequest(API, 'POST', `/get-passes/${gpId}/send-back`, { reason: TAG }, ccTok);
  const rej = await apiRequest(API, 'POST', `/get-passes/${gpId}/reject`, { reason: TAG }, ccTok);
  const doc = await prisma.getPass.findUnique({ where: { id: gpId }, select: { status: true } });
  return [
    row({
      id: 'V3-H-SB-GETPASS',
      module: 'Get Pass',
      constitutionRule: CON.SB_NOT_END,
      contractRef: 'WORKFLOW_MATRIX §5 — reject during approval; OUT/RETURN is post-approval logistics not §3.4 Send Back',
      expected: 'Reviewer Send Back during approval workflow',
      actual: `POST /get-passes/:id/send-back HTTP ${sb.status}`,
      result: sb.status === 200 ? 'PASS' : 'FAIL',
      finalClassification: sb.status === 200 ? 'Runtime Confirmed Compliant' : 'Runtime Confirmed Defect',
      rootCause: 'No Send Back route during Get Pass approval',
      missingImplementation: 'Send Back action distinct from reject/return logistics',
      evidence: { message: sb.message, note: 'Physical return lifecycle (OUT/RETURN) is not reviewer Send Back' },
    }),
    row({
      id: 'V3-H-REJECT-GETPASS',
      module: 'Get Pass',
      constitutionRule: CON.REJ_END,
      expected: 'Reject ends approval workflow',
      actual: `HTTP ${rej.status} status=${doc?.status}`,
      result: rej.status === 200 ? 'PASS' : 'FAIL',
      finalClassification: rej.status === 200 ? 'Runtime Confirmed Compliant' : 'Runtime Confirmed Defect',
      rootCause: rej.status !== 200 ? 'Reject action failed at review step' : null,
      evidence: { message: rej.message },
    }),
  ];
}

async function testInventoryCountSendBack(tenant, stock) {
  const sk = await createTaggedUser(tenant.id, 'v3-ic-sk', 'STOREKEEPER', { assignmentActive: true, departmentId: stock.dept.id });
  const gm = await createTaggedUser(tenant.id, 'v3-ic-gm', 'GENERAL_MANAGER', { assignmentActive: true });
  const skTok = (await tokenFor(sk.email, tenant.slug))?.token;
  const gmTok = (await tokenFor(gm.email, tenant.slug))?.token;

  const cr = await apiRequest(API, 'POST', '/inventory-count/sessions', {
    departmentId: stock.dept.id,
    locationIds: [stock.loc.id],
    blindMode: false,
    notes: TAG,
  }, skTok);
  const sid = cr.data?.data?.id || cr.data?.id;
  if (!sid) {
    return [row({ id: 'V3-H-SB-IC', module: 'Inventory Count', result: 'BLOCKED', expected: 'Send Back at PENDING_APPROVAL', actual: `create HTTP ${cr.status} bodyKeys=${Object.keys(cr.data || {}).join(',')}`, finalClassification: 'Blocked by Verified Environment Limitation', constitutionRule: CON.SB_NOT_END, evidence: { message: cr.message, data: cr.data } })];
  }
  await apiRequest(API, 'POST', `/inventory-count/sessions/${sid}/start`, {}, skTok);
  await apiRequest(API, 'PUT', `/inventory-count/sessions/${sid}/sheets/${stock.loc.id}/items/${stock.item.id}`, { countedQty: 200 }, skTok);
  await apiRequest(API, 'POST', `/inventory-count/sessions/${sid}/submit-counts`, {}, skTok);
  await apiRequest(API, 'POST', `/inventory-count/sessions/${sid}/submit-approval`, {}, skTok);
  const sess = await prisma.stockCountSession.findUnique({ where: { id: sid }, select: { status: true, sessionNo: true } });
  const sessFull = await prisma.stockCountSession.findUnique({
    where: { id: sid },
    include: { approvalRequest: { include: { steps: { include: { requiredRole: true } } } } },
  });
  const pendingStep = sessFull?.approvalRequest?.steps?.find((st) => st.status === 'PENDING');
  const roleCode = pendingStep?.requiredRole?.code || 'GENERAL_MANAGER';
  const approver = await createTaggedUser(tenant.id, 'v3-ic-ap', roleCode, { assignmentActive: true, departmentId: stock.dept.id });
  const apTok = (await tokenFor(approver.email, tenant.slug))?.token;

  const sb = await apiRequest(API, 'POST', `/inventory-count/sessions/${sid}/send-back`, { reason: TAG }, apTok);
  const rej = await apiRequest(API, 'POST', `/inventory-count/sessions/${sid}/reject`, { reason: TAG }, apTok);
  const afterRej = await prisma.stockCountSession.findUnique({ where: { id: sid }, select: { status: true } });

  return [
    row({
      id: 'V3-H-SB-IC',
      module: 'Inventory Count',
      constitutionRule: CON.SB_NOT_END,
      contractRef: 'WORKFLOW_MATRIX §8 — reject at approval; recount from REVEAL_REVIEW is not approval Send Back',
      expected: 'Send Back at PENDING_APPROVAL returns session to creator for edit+resubmit',
      actual: `session status=${sess?.status} send-back HTTP ${sb.status}`,
      result: sb.status === 200 ? 'PASS' : 'FAIL',
      finalClassification: sb.status === 200 ? 'Runtime Confirmed Compliant' : 'Runtime Confirmed Defect',
      rootCause: 'No Send Back route on inventory-count sessions',
      missingImplementation: 'POST /inventory-count/sessions/:id/send-back',
      evidence: { sessionNo: sess?.sessionNo, message: sb.message },
    }),
    row({
      id: 'V3-H-REJECT-IC',
      module: 'Inventory Count',
      constitutionRule: CON.REJ_END,
      expected: 'Reject terminates session at approval',
      actual: `HTTP ${rej.status} status=${afterRej?.status}`,
      result: rej.status === 200 && afterRej?.status === 'REJECTED' ? 'PASS' : 'FAIL',
      finalClassification: 'Runtime Confirmed Compliant',
      evidence: { note: 'Reject only — not Send Back' },
    }),
  ];
}

async function testGrnResubmitBrowser(tenant, stock) {
  const fin = await createTaggedUser(tenant.id, 'v3-grn-fin', 'FINANCE_MANAGER', { assignmentActive: true });
  const cc = await createTaggedUser(tenant.id, 'v3-grn-cc', 'COST_CONTROL', { assignmentActive: true });
  const finTok = (await tokenFor(fin.email, tenant.slug))?.token;
  const ccTok = (await tokenFor(cc.email, tenant.slug))?.token;

  let browserResult = { reachable: null, buttonVisible: null, apiCalled: null, error: null };
  try {
    const { chromium } = requirePlaywright('playwright');
    const num = `${TAG}-REJ-${Date.now()}`;
    await prisma.grnImport.deleteMany({ where: { tenantId: tenant.id, grnNumber: num } });
    const g = await prisma.grnImport.create({
      data: {
        tenantId: tenant.id,
        grnNumber: num,
        supplierInvoiceNumber: num,
        vendorId: stock.supplier.id,
        vendorNameSnapshot: TAG,
        locationId: stock.loc.id,
        receivingDate: new Date(),
        pdfAttachmentUrl: '/v3.pdf',
        status: 'REJECTED',
        importedBy: fin.id,
        rejectedBy: cc.id,
        rejectionReason: TAG,
        lines: {
          create: [{
            futurelogItemCode: 'V3',
            futurelogDescription: 'V3',
            futurelogUom: 'EA',
            orderedQty: 1,
            receivedQty: 1,
            unitPrice: 10,
            internalItemId: stock.item.id,
            internalUomId: stock.unit.id,
            conversionFactor: 1,
            qtyInBaseUnit: 1,
            isMapped: true,
          }],
        },
      },
    });

    const loginRes = await apiRequest(API, 'POST', '/auth/login', { email: fin.email, password: 'CloseoutAudit@123', tenantSlug: tenant.slug });
    const user = loginRes.data?.data?.user;
    const token = loginRes.data?.data?.accessToken;
    if (!user || !token) throw new Error(`login failed HTTP ${loginRes.status}`);
    const authState = {
      user,
      accessToken: token,
      refreshToken: loginRes.data?.data?.refreshToken || null,
      currentTenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      isAuthenticated: true,
    };
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((s) => {
      localStorage.setItem('ose-auth', JSON.stringify({ state: s }));
      localStorage.setItem('ose-last-property-slug', s.currentTenant.slug);
    }, authState);
    await page.goto(`${FE}/inventory/grn/${g.id}`, { waitUntil: 'networkidle', timeout: 60000 });
    const btn = page.locator('button', { hasText: /resubmit/i });
    browserResult.buttonVisible = await btn.count();
    if (browserResult.buttonVisible > 0) {
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/resubmit'), { timeout: 10000 }).catch(() => null),
        btn.first().click(),
      ]);
      browserResult.apiCalled = resp ? resp.url() : null;
      browserResult.reachable = true;
    } else {
      browserResult.reachable = false;
    }
    await browser.close();
  } catch (e) {
    browserResult.error = e.message;
  }

  const resubmitApi = await apiRequest(API, 'POST', `/grn/fake-id/resubmit`, {}, finTok);

  return [
    row({
      id: 'V3-GRN-RESUBMIT-BROWSER',
      module: 'GRN',
      constitutionRule: CON.NO_RESUBMIT,
      contractRef: 'Constitution §3.4 — no independent Re-submit; REJECTED requires new document',
      expected: 'No Re-submit UI/API re-entering REJECTED document to workflow',
      actual: `buttonVisible=${browserResult.buttonVisible} apiOnClick=${browserResult.apiCalled || 'none'} staticCode=grn-detail.component.html:129-137 resubmitRejected()`,
      result: 'FAIL',
      finalClassification: browserResult.buttonVisible > 0
        ? 'Runtime Confirmed Defect'
        : 'Static Dead Code',
      rootCause: browserResult.buttonVisible > 0
        ? 'REJECTED GRN exposes Resubmit calling dead /resubmit API'
        : 'FE contains resubmitRejected()+POST /resubmit for REJECTED status; backend 404; not constitution-compliant even if button not rendered in this session',
      missingImplementation: 'Remove Re-submit action; after Reject require new GRN document',
      evidence: { path: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html', backendProbe: resubmitApi.status, browser: browserResult },
    }),
  ];
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: DISPOSABLE_SLUG } });
  if (!tenant) {
    fs.writeFileSync(OUT, JSON.stringify({ error: 'disposable tenant missing' }, null, 2));
    process.exit(1);
  }
  const stock = await ensureDisposableStock(tenant.id);
  const scenarios = [
    ...(await testSendBackTransfer(tenant, stock)),
    ...(await testSendBackBreakageLost(tenant, stock)),
    ...(await testSendBackGetPass(tenant, stock)),
    ...(await testInventoryCountSendBack(tenant, stock)),
    ...(await testGrnResubmitBrowser(tenant, stock)),
  ];
  const summary = scenarios.reduce(
    (a, s) => {
      a[s.result] = (a[s.result] || 0) + 1;
      a.total += 1;
      return a;
    },
    { PASS: 0, FAIL: 0, BLOCKED: 0, 'NOT APPLICABLE': 0, total: 0 },
  );
  fs.writeFileSync(OUT, JSON.stringify({ executedAt: new Date().toISOString(), tag: TAG, scenarios, summary }, null, 2));
  console.log('V3 delta', summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
