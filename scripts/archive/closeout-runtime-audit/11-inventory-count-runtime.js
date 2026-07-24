'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { ScenarioReport } = require('./lib/scenario-report');
const { prisma } = require('./lib/evidence');

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const report = new ScenarioReport('11-inventory-count-runtime');
  const matrix = [];

  const store = await sessionForIdentityKey('STOREKEEPER');
  const fin = await sessionForIdentityKey('FINANCE');

  if (!store.ok) {
    report.blocked('IC-SETUP', { reason: 'storekeeper_login' });
    report.finish(path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_HARNESS.json'));
    return;
  }

  const locationId = deptFix.departmentA.locationId;
  const departmentId = deptFix.departmentA.departmentId;

  const createRes = await apiRequest(
    API_BASE,
    'POST',
    '/inventory-count/sessions',
    {
      departmentId,
      locationIds: [locationId],
      blindMode: false,
      notes: FIXTURE_TAG,
    },
    store.token,
  );
  const sessionId = createRes.data?.id || createRes.data?.data?.id;
  matrix.push({ step: 'IC-CREATE', http: createRes.status, sessionId });
  report.add({ id: 'IC-CREATE', result: createRes.status === 201 ? 'PASS' : 'FAIL', http: createRes.status });

  if (!sessionId) {
    report.missingFixtures.push('inventory_count_session');
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_MATRIX.json'), JSON.stringify({ matrix }, null, 2));
    report.finish(path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_HARNESS.json'));
    await prisma.$disconnect();
    return;
  }

  const startRes = await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sessionId}/start`, {}, store.token);
  matrix.push({ step: 'IC-START-SNAPSHOT', http: startRes.status });
  report.add({ id: 'IC-START', result: startRes.status === 200 ? 'PASS' : 'FAIL', http: startRes.status });

  const lines = await prisma.stockBalance.findMany({
    where: { tenantId: HOTEL_A.id, locationId },
    take: 3,
    select: { itemId: true, qtyOnHand: true },
  });
  for (const line of lines) {
    const upd = await apiRequest(
      API_BASE,
      'PUT',
      `/inventory-count/sessions/${sessionId}/sheets/${locationId}/items/${line.itemId}`,
      { countedQty: Number(line.qtyOnHand) },
      store.token,
    );
    matrix.push({ step: 'IC-COUNT-LINE', itemId: line.itemId, http: upd.status });
  }
  report.pass('IC-COUNT-LINES', { lines: lines.length });

  const submitCounts = await apiRequest(
    API_BASE,
    'POST',
    `/inventory-count/sessions/${sessionId}/submit-counts`,
    {},
    store.token,
  );
  matrix.push({ step: 'IC-SUBMIT-COUNTS', http: submitCounts.status });
  report.add({ id: 'IC-SUBMIT-COUNTS', result: submitCounts.status === 200 ? 'PASS' : 'FAIL', http: submitCounts.status });

  const submitAppr = await apiRequest(
    API_BASE,
    'POST',
    `/inventory-count/sessions/${sessionId}/submit-approval`,
    {},
    store.token,
  );
  matrix.push({ step: 'IC-SUBMIT-APPROVAL', http: submitAppr.status });
  report.add({ id: 'IC-SUBMIT-APPROVAL', result: submitAppr.status === 200 ? 'PASS' : 'FAIL', http: submitAppr.status });

  if (fin?.ok) {
    const appr = await apiRequest(
      API_BASE,
      'POST',
      `/inventory-count/sessions/${sessionId}/approve`,
      { comment: FIXTURE_TAG },
      fin.token,
    );
    matrix.push({ step: 'IC-FINANCE-APPROVE', http: appr.status });
    report.add({ id: 'IC-FINANCE-APPROVE', result: appr.status === 200 ? 'PASS' : 'NOT_APPLICABLE', http: appr.status });
  }

  const before = await prisma.stockCountSession.findUnique({ where: { id: sessionId }, select: { status: true } });
  const auditor = await sessionForIdentityKey('AUDITOR');
  if (auditor.ok) {
    const deny = await apiRequest(
      API_BASE,
      'POST',
      `/inventory-count/sessions/${sessionId}/approve`,
      {},
      auditor.token,
    );
    const after = await prisma.stockCountSession.findUnique({ where: { id: sessionId }, select: { status: true } });
    matrix.push({ step: 'IC-NO-PERM', http: deny.status, dbMutated: before?.status !== after?.status });
    report.add({
      id: 'IC-NO-PERM',
      result: deny.status === 403 && before?.status === after?.status ? 'PASS' : 'FAIL',
      http: deny.status,
    });
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_MATRIX.json'),
    JSON.stringify({ executedAt: new Date().toISOString(), sessionId, matrix }, null, 2),
  );
  report.finish(path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
