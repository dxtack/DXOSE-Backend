'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { fetchMovementDocumentEvidence, prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'LOST_LEGACY_CHAIN_FINAL.json');

async function createInternalLost(stock, userId) {
  return prisma.movementDocument.create({
    data: {
      tenantId: HOTEL_A.id,
      documentNo: `LOST-R7-${Date.now()}`,
      movementType: 'LOST',
      sourceType: 'INTERNAL',
      status: 'DRAFT',
      sourceLocationId: stock.locationId,
      reason: `${FIXTURE_TAG} legacy LOST reproduce`,
      suggestedAction: 'HOTEL',
      createdBy: userId,
      lines: {
        create: [{ itemId: stock.itemId, locationId: stock.locationId, qtyRequested: 1, qtyInBaseUnit: 1, unitCost: 1, totalValue: 1 }],
      },
    },
  });
}

function snapshot(ev) {
  return {
    status: ev?.status,
    sourceType: ev?.sourceType,
    approvalRequestId: ev?.approvalRequest?.id || null,
    accVersionPin: ev?.approvalRequest?.accWorkflowVersionId || null,
    timeline: (ev?.timeline || []).map((t) => t.action),
    audit: (ev?.audit || []).map((a) => a.action),
    ledgerCount: ev?.ledger?.length || 0,
    stockPosted: !!ev?.postedAt,
  };
}

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const dm = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const cc = await sessionForIdentityKey('COST_CONTROL');
  const fin = await sessionForIdentityKey('FINANCE');
  const gm = await sessionForIdentityKey('GM');
  if (!dm.ok) throw new Error('DEPT_MANAGER_FB login failed');

  const reproduce = [];
  const doc = await createInternalLost(stock, dm.user.id);
  const before0 = await fetchMovementDocumentEvidence(doc.id, HOTEL_A.id);
  reproduce.push({
    step: 'fixture_created',
    sourceType: before0?.sourceType,
    status: before0?.status,
    approvalRequest: !!before0?.approvalRequest,
    createdBy: dm.user.id,
    role: 'DEPT_MANAGER_FB',
    permissions: (dm.permissions || []).filter((p) => /LOST|APPROVE|ISSUE/.test(p)),
    assignment: dm.identity?.departmentId || stock.departmentId,
    locationId: stock.locationId,
  });

  const chain = [
    { step: 'approve-dept', actor: dm, role: 'DEPT_MANAGER_FB' },
    { step: 'approve-cost', actor: cc, role: 'COST_CONTROL' },
    { step: 'approve-finance', actor: fin, role: 'FINANCE' },
    { step: 'approve-gm', actor: gm, role: 'GM' },
  ];

  const steps = [];
  let classification = 'Safely blocked — chain did not start';

  for (const c of chain) {
    if (!c.actor.ok) {
      steps.push({ step: c.step, error: 'login_failed', role: c.role });
      break;
    }
    const before = await fetchMovementDocumentEvidence(doc.id, HOTEL_A.id);
    const res = await apiRequest(
      API_BASE,
      'POST',
      `/lost-items/${doc.id}/${c.step}`,
      { comment: `${FIXTURE_TAG} chain` },
      c.actor.token,
    );
    const after = await fetchMovementDocumentEvidence(doc.id, HOTEL_A.id);
    const row = {
      step: c.step,
      role: c.role,
      permissions: (c.actor.permissions || []).slice(0, 8),
      http: res.status,
      message: res.message,
      before: snapshot(before),
      after: snapshot(after),
      dbMutated: before?.status !== after?.status,
      accPin: after?.approvalRequest?.accWorkflowVersionId || null,
    };
    steps.push(row);
    if (c.step === 'approve-dept' && res.status === 200 && before?.status !== after?.status && !after?.approvalRequest?.accWorkflowVersionId) {
      classification = 'Partial Active Operational Legacy';
    }
    if (res.status !== 200 || !row.dbMutated) break;
  }

  const completed = steps.every((s) => s.http >= 200 && s.http < 300 && s.dbMutated);
  if (completed && !steps[0]?.accPin) classification = 'Full Active Operational Legacy';

  const round5Reference = {
    route: '/lost-items/:id/approve-dept',
    fixtureType: 'INTERNAL_LOST_CHAIN',
    role: 'DEPT_MANAGER_FB',
    initialStatus: 'DRAFT',
    http: 200,
    statusAfter: 'DEPT_APPROVED',
    accVersionPin: null,
    evidence: 'LEGACY_ROUTE_CLASSIFICATION.json lostDeepDive[0]',
  };

  const round6Regression = {
    note: 'Round 6 used per-route fresh INTERNAL doc with generic DEPT actor — got 403 on approve-dept',
    explanation:
      'Round 5/7 use DEPT_MANAGER_FB with ISSUE_APPROVE/APPROVE_LOST, doc createdBy=dept user, same department/location as assignment. Round 6 script did not guarantee APPROVE_LOST actor match on first step.',
  };

  const out = {
    executedAt: new Date().toISOString(),
    round5ReferenceUnchanged: round5Reference,
    round6RegressionExplanation: round6Regression,
    reproduceConditions: reproduce,
    sequentialChainOnSameDocument: steps,
    finalClassification: classification,
    partialVsFull:
      classification === 'Partial Active Operational Legacy'
        ? 'First legacy step mutates without ACC pin; subsequent steps blocked by lifecycle/role'
        : classification,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote LOST_LEGACY_CHAIN_FINAL.json', classification);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
