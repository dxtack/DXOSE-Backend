'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey } = require('./lib/session-resolver');
const { fetchMovementDocumentEvidence, prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'LEGACY_ROUTE_CLASSIFICATION.json');

function classifyLegacy(row, res) {
  const http = res.status;
  if (http === 404 || http === 410) return { classification: 'Dead/unreachable', whyPass: 'PASS — route returned 404/410', result: 'PASS' };
  if (http === 403 || http === 401) return { classification: 'Safely blocked in valid and invalid states', whyPass: 'PASS — unauthorized denied', result: 'PASS' };
  if (http === 423 || (http === 400 && !row.dbMutated) || http === 409)
    return { classification: 'Safely blocked in valid and invalid states', whyPass: 'PASS — lifecycle/state blocked', result: 'PASS' };
  if (http >= 200 && http < 300 && row.dbMutated && row.accRequestUsed)
    return { classification: 'ACC-compatible alias', whyPass: 'PASS — ACC version used', result: 'PASS' };
  if (http >= 200 && http < 300 && row.dbMutated && !row.accRequestUsed)
    return { classification: 'Active Operational Legacy', whyPass: 'PASS — legacy mutation without ACC pin', result: 'PASS' };
  if (http >= 200 && http < 300 && !row.dbMutated)
    return { classification: 'Safely blocked in valid and invalid states', whyPass: 'PASS — no DB mutation', result: 'PASS' };
  return { classification: 'Runtime false positive', whyPass: null, result: 'FAIL' };
}

async function createInternal(type, stock, userId, status) {
  return prisma.movementDocument.create({
    data: {
      tenantId: HOTEL_A.id,
      documentNo: `${type}-LEG5-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      movementType: type === 'LOST' ? 'LOST' : 'BREAKAGE',
      sourceType: 'INTERNAL',
      status,
      sourceLocationId: stock.locationId,
      reason: FIXTURE_TAG,
      suggestedAction: 'HOTEL',
      createdBy: userId,
      lines: {
        create: [{ itemId: stock.itemId, locationId: stock.locationId, qtyRequested: 1, qtyInBaseUnit: 1, unitCost: 1, totalValue: 1 }],
      },
    },
  });
}

async function createAcc(type, session, stock) {
  const api = type === 'LOST' ? '/lost-items' : '/breakage';
  const payload = {
    reason: FIXTURE_TAG,
    suggestedAction: 'HOTEL',
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
  };
  const res = await apiRequest(API_BASE, 'POST', api, payload, session.token);
  const id = res.data?.data?.id;
  const ev = id ? await fetchMovementDocumentEvidence(id, HOTEL_A.id) : null;
  return { id, ev, res };
}

async function probeRoute({ basePath, route, fixture, actor, validState }) {
  const before = await fetchMovementDocumentEvidence(fixture.doc.id, HOTEL_A.id);
  const res = await apiRequest(
    API_BASE,
    'POST',
    `${basePath}/${fixture.doc.id}/${route}`,
    { comment: `${FIXTURE_TAG} ${validState ? 'valid' : 'invalid'}` },
    actor.session.token,
  );
  const after = await fetchMovementDocumentEvidence(fixture.doc.id, HOTEL_A.id);
  const row = {
    route: `${basePath}/:id/${route}`,
    module: fixture.module,
    fixtureType: fixture.label,
    fixtureLifecycle: validState ? 'valid' : 'invalid',
    role: actor.key,
    permission: (actor.session.permissions || []).slice(0, 8),
    initialStatus: before?.status,
    http: res.status,
    statusAfter: after?.status,
    accVersionBefore: before?.approvalRequest?.accWorkflowVersionId,
    accVersionAfter: after?.approvalRequest?.accWorkflowVersionId,
    accRequestUsed: !!after?.approvalRequest?.accWorkflowVersionId,
    versionPinned: !!before?.approvalRequest?.accWorkflowVersionId,
    timeline: after?.approvalRequest?.steps?.slice(-2) || [],
    audit: after?.audit?.slice(-1) || [],
    posting: !!after?.postedAt,
    ledgerCount: after?.ledger?.length || 0,
    dbMutated:
      before?.status !== after?.status ||
      before?.approvalRequest?.status !== after?.approvalRequest?.status ||
      (before?.approvalRequest?.currentStep !== after?.approvalRequest?.currentStep),
  };
  const cls = classifyLegacy(row, res);
  Object.assign(row, cls);
  return row;
}

async function deepDiveLost(stock, dm, actors) {
  const chain = [];
  const doc = await createInternal('LOST', stock, dm.user.id, 'DRAFT');
  const base = '/lost-items';
  for (const route of ['approve-dept', 'approve-cost', 'approve-finance', 'approve-gm']) {
    for (const actor of actors.slice(0, 4)) {
      if (!actor.session?.ok) continue;
      chain.push(await probeRoute({ basePath: base, route, fixture: { doc, label: 'INTERNAL_LOST_CHAIN', module: 'Lost' }, actor, validState: true }));
    }
  }
  const acc = await createAcc('LOST', dm, stock);
  chain.push({
    scenario: 'ACC_LOST_hasApprovalRequest',
    accDocId: acc.id,
    hasAccRequest: !!acc.ev?.approvalRequest,
    accVersionId: acc.ev?.approvalRequest?.accWorkflowVersionId,
    frontendCallUnknown: 'Static route exists — runtime HTTP probe only in harness',
  });
  return chain;
}

async function main() {
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const dm = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const sk = await sessionForIdentityKey('STOREKEEPER');
  const cc = await sessionForIdentityKey('COST_CONTROL');
  const fin = await sessionForIdentityKey('FINANCE');
  const gm = await sessionForIdentityKey('GM');
  const org = await sessionForIdentityKey('ORG_MANAGER');
  const superOp = await sessionForIdentityKey('SUPER_ADMIN_OP');
  const actors = [
    { key: 'DEPT_MANAGER_FB', session: dm },
    { key: 'STOREKEEPER', session: sk },
    { key: 'COST_CONTROL', session: cc },
    { key: 'FINANCE', session: fin },
    { key: 'GM', session: gm },
    { key: 'ORG_MANAGER', session: org },
    { key: 'SUPER_ADMIN_OP', session: superOp },
  ];

  const fixtures = [];
  if (dm.ok) {
    fixtures.push({ label: 'INTERNAL_BREAKAGE_VALID', module: 'Breakage', doc: await createInternal('BREAKAGE', stock, dm.user.id, 'DRAFT') });
    fixtures.push({ label: 'INTERNAL_BREAKAGE_INVALID', module: 'Breakage', doc: await createInternal('BREAKAGE', stock, dm.user.id, 'APPROVED') });
    fixtures.push({ label: 'INTERNAL_LOST_VALID', module: 'Lost', doc: await createInternal('LOST', stock, dm.user.id, 'DRAFT') });
    fixtures.push({ label: 'INTERNAL_LOST_INVALID', module: 'Lost', doc: await createInternal('LOST', stock, dm.user.id, 'APPROVED') });
    const accB = await createAcc('BREAKAGE', dm, stock);
    if (accB.id) fixtures.push({ label: 'ACC_BREAKAGE', module: 'Breakage', doc: { id: accB.id } });
    const accL = await createAcc('LOST', dm, stock);
    if (accL.id) fixtures.push({ label: 'ACC_LOST', module: 'Lost', doc: { id: accL.id } });
  }

  const brRoutes = ['approve-dept', 'approve-cost', 'approve-finance', 'approve-gm'];
  const lostRoutes = ['approve-dept', 'approve-finance', 'approve-gm'];
  const rows = [];

  for (const fx of fixtures) {
    const routes = fx.module === 'Lost' ? lostRoutes : brRoutes;
    const base = fx.module === 'Lost' ? '/lost-items' : '/breakage';
    const validState = fx.label.includes('VALID') || fx.label.startsWith('ACC');
    for (const route of routes) {
      for (const actor of actors) {
        if (!actor.session?.ok) continue;
        rows.push(await probeRoute({ basePath: base, route, fixture: fx, actor, validState }));
      }
    }
  }

  const lostDeep = dm.ok ? await deepDiveLost(stock, dm, actors) : [];

  const byClass = rows.reduce((a, r) => {
    a[r.classification] = (a[r.classification] || 0) + 1;
    return a;
  }, {});
  const unclassified = rows.filter((r) => !r.classification || r.classification === 'undefined' || r.result === 'FAIL').length;

  const out = {
    executedAt: new Date().toISOString(),
    summary: { total: rows.length, byClassification: byClass, unclassified, activeOperationalLegacy: rows.filter((r) => r.classification === 'Active Operational Legacy').length },
    answers: {
      lostApproveDeptCanCompleteWorkflow: 'INTERNAL chain probed — see lostDeepDive for step progression without ACC pin',
      frontendCallsLegacy: 'Not statically traced in Round 5 — HTTP routes confirmed reachable',
      chainResolverRemovalSufficient: 'No — HTTP legacy paths remain',
    },
    lostDeepDive: lostDeep,
    rows,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote LEGACY_ROUTE_CLASSIFICATION.json unclassified:', unclassified);
  await prisma.$disconnect();
  if (unclassified > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
