'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { ScenarioReport } = require('./lib/scenario-report');
const { fetchMovementDocumentEvidence, fetchGetPassEvidence, prisma } = require('./lib/evidence');

function brkBody(stock) {
  return {
    reason: `${FIXTURE_TAG} workflow matrix`,
    suggestedAction: 'HOTEL',
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
  };
}

function gpBody(stock, deptId) {
  return {
    transferType: 'PERMANENT',
    borrowingEntity: `${FIXTURE_TAG} wf`,
    departmentId: deptId,
    reason: FIXTURE_TAG,
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
  };
}

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const report = new ScenarioReport('06-workflow-runtime');
  const rows = [];

  const creator = await sessionForIdentityKey('DEPT_MANAGER_FB');
  if (!creator.ok) {
    report.blocked('WF-BRK-SETUP', { reason: creator.reason });
    report.finish(path.join(REPORT_DIR, 'WORKFLOW_RUNTIME_HARNESS.json'));
    return;
  }

  const create = await apiRequest(API_BASE, 'POST', '/breakage', brkBody(stock), creator.token);
  const id = create.data?.data?.id;
  rows.push({ module: 'Breakage', action: 'create', http: create.status, result: create.status === 201 ? 'PASS' : 'FAIL' });
  report.add({ id: 'WF-BRK-CREATE', result: create.status === 201 ? 'PASS' : 'FAIL', http: create.status });

  if (id) {
    const cc = await sessionForIdentityKey('COST_CONTROL');
    const sk = await sessionForIdentityKey('STOREKEEPER');
    const wrong = sk.ok
      ? await apiRequest(API_BASE, 'POST', `/breakage/${id}/approve`, { comment: FIXTURE_TAG }, sk.token)
      : { status: 0 };
    rows.push({ module: 'Breakage', action: 'approve_wrong_role', http: wrong.status });
    report.add({ id: 'WF-BRK-WRONG-ROLE', result: wrong.status === 403 ? 'PASS' : 'FAIL', http: wrong.status });

    if (cc.ok) {
      const appr = await apiRequest(API_BASE, 'POST', `/breakage/${id}/approve`, { comment: FIXTURE_TAG }, cc.token);
      const ev = await fetchMovementDocumentEvidence(id, HOTEL_A.id);
      rows.push({ module: 'Breakage', action: 'approve_cc', http: appr.status, status: ev?.status });
      report.add({ id: 'WF-BRK-CC-APPROVE', result: appr.status < 400 ? 'PASS' : 'FAIL', http: appr.status });
    }
  }

  const gpCreate = await apiRequest(
    API_BASE,
    'POST',
    '/get-passes',
    gpBody(stock, stock.departmentId),
    creator.token,
  );
  const gpId = gpCreate.data?.data?.id;
  const gpVer = gpCreate.data?.data?.concurrencyVersion;
  report.add({ id: 'WF-GP-CREATE', result: gpCreate.status === 201 ? 'PASS' : 'FAIL', http: gpCreate.status });

  if (gpId) {
    const submit = await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${gpId}/submit`,
      { concurrencyVersion: gpVer ?? 0 },
      creator.token,
    );
    const ev = await fetchGetPassEvidence(gpId, HOTEL_A.id);
    rows.push({ module: 'GetPass', action: 'submit', http: submit.status, status: ev?.status });
    report.add({ id: 'WF-GP-SUBMIT', result: submit.status === 200 ? 'PASS' : 'FAIL', http: submit.status });
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'WORKFLOW_RUNTIME_MATRIX.json'), JSON.stringify({ rows }, null, 2));
  report.finish(path.join(REPORT_DIR, 'WORKFLOW_RUNTIME_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
