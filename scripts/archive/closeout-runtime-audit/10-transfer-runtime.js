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
  const report = new ScenarioReport('10-transfer-runtime');
  const matrix = [];

  const store = await sessionForIdentityKey('STOREKEEPER');
  const fin = await sessionForIdentityKey('FINANCE');
  const dm = await sessionForIdentityKey('DEPT_MANAGER_FB');

  const srcLoc = deptFix.departmentA.locationId;
  const dstLoc = deptFix.departmentB?.locationId || srcLoc;
  const itemId = deptFix.departmentA.itemId;

  const steps = [];

  if (store.ok) {
    const unit = await prisma.unit.findFirst({ where: { tenantId: HOTEL_A.id } });
    steps.push({
      id: 'TR-CREATE',
      run: async () =>
        apiRequest(
          API_BASE,
          'POST',
          '/transfers',
          {
            sourceLocationId: srcLoc,
            destLocationId: dstLoc,
            reason: FIXTURE_TAG,
            lines: [{ itemId, uomId: unit?.id, requestedQty: 1 }],
          },
          store.token,
        ),
    });
  }

  let transferId = null;
  for (const step of steps) {
    const res = await step.run();
    transferId = res.data?.data?.id || transferId;
    matrix.push({ step: step.id, http: res.status, errorCode: res.errorCode, transferId });
    report.add({ id: step.id, result: res.status === 201 ? 'PASS' : 'FAIL', http: res.status });
  }

  if (transferId && store?.ok) {
    const fresh = await prisma.storeTransfer.findUnique({
      where: { id: transferId },
      select: { concurrencyVersion: true },
    });
    const submit = await apiRequest(
      API_BASE,
      'POST',
      `/transfers/${transferId}/submit`,
      { concurrencyVersion: fresh?.concurrencyVersion ?? 0 },
      store.token,
    );
    matrix.push({ step: 'TR-SUBMIT', http: submit.status, statusAfter: submit.data?.data?.status });
    report.add({ id: 'TR-SUBMIT', result: submit.status === 200 ? 'PASS' : 'FAIL', http: submit.status });

    if (dm?.ok) {
      const v = (await prisma.storeTransfer.findUnique({ where: { id: transferId }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0;
      const appr = await apiRequest(
        API_BASE,
        'POST',
        `/transfers/${transferId}/approve`,
        { comment: FIXTURE_TAG, concurrencyVersion: v },
        dm.token,
      );
      matrix.push({ step: 'TR-DEPT-APPROVE', http: appr.status });
      report.add({ id: 'TR-DEPT-APPROVE', result: appr.status === 200 ? 'PASS' : 'NOT_APPLICABLE', http: appr.status });
    }

    if (fin?.ok) {
      const v = (await prisma.storeTransfer.findUnique({ where: { id: transferId }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0;
      const finAp = await apiRequest(
        API_BASE,
        'POST',
        `/transfers/${transferId}/approve`,
        { comment: FIXTURE_TAG, concurrencyVersion: v },
        fin.token,
      );
      matrix.push({ step: 'TR-FINANCE-APPROVE', http: finAp.status });
      report.add({ id: 'TR-FINANCE-APPROVE', result: finAp.status === 200 ? 'PASS' : 'NOT_APPLICABLE', http: finAp.status });
    }

    const auditor = await sessionForIdentityKey('AUDITOR');
    if (auditor.ok) {
      const deny = await apiRequest(API_BASE, 'POST', `/transfers/${transferId}/approve`, { comment: FIXTURE_TAG }, auditor.token);
      matrix.push({ step: 'TR-NO-PERM', http: deny.status, expected: 403 });
      report.add({ id: 'TR-NO-PERM', result: deny.status === 403 ? 'PASS' : 'FAIL', http: deny.status });
    }
  } else {
    report.blocked('TR-WORKFLOW', { reason: transferId ? 'missing_sessions' : 'create_failed' });
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'TRANSFER_RUNTIME_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), transferId, matrix }, null, 2));
  report.finish(path.join(REPORT_DIR, 'TRANSFER_RUNTIME_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
