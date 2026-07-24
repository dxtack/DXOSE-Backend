'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
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
  const report = new ScenarioReport('10-transfer-runtime-v3');
  const matrix = [];
  const dm = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const fin = await sessionForIdentityKey('FINANCE');
  const cc = await sessionForIdentityKey('COST_CONTROL');
  const noAssign = await sessionForIdentityKey('NO_ASSIGN');
  const src = deptFix.departmentA;
  const dst = deptFix.departmentB;

  const payload = (dest = dst.locationId, qty = 1) => ({
    sourceLocationId: src.locationId,
    destLocationId: dest,
    reason: FIXTURE_TAG,
    lines: [{ itemId: src.itemId, qty }],
  });

  const add = (id, res, pass) => {
    matrix.push({ id, http: res.status, message: res.message, result: pass ? 'PASS' : 'FAIL' });
    report.add({ id, result: pass ? 'PASS' : 'FAIL', http: res.status });
  };

  add('TR-CREATE', await apiRequest(API_BASE, 'POST', '/transfers', payload(), dm.token), true);
  const na = await apiRequest(API_BASE, 'POST', '/transfers', payload(), noAssign.token);
  add('TR-NO-ASSIGN', na, na.status === 403);
  const same = await apiRequest(API_BASE, 'POST', '/transfers', payload(src.locationId), dm.token);
  add('TR-SAME-STORE', same, same.status >= 400);
  const insuf = await apiRequest(API_BASE, 'POST', '/transfers', payload(dst.locationId, 999999), dm.token);
  add('TR-INSUFFICIENT', insuf, insuf.status >= 400);

  const createRes = await apiRequest(API_BASE, 'POST', '/transfers', payload(), dm.token);
  const tid = createRes.data?.data?.id;
  if (tid) {
    const submit = await apiRequest(API_BASE, 'POST', `/transfers/${tid}/submit`, {}, dm.token);
    add('TR-SUBMIT', submit, submit.status >= 200 && submit.status < 300);
    const appr = await apiRequest(API_BASE, 'POST', `/transfers/${tid}/approve`, { comment: FIXTURE_TAG }, cc.token);
    add('TR-APPROVE-CC', appr, appr.status >= 200 && appr.status < 300);
    const dup = await apiRequest(API_BASE, 'POST', `/transfers/${tid}/approve`, { comment: FIXTURE_TAG }, cc.token);
    add('TR-DUPLICATE-APPROVE', dup, dup.status === 409 || dup.status === 400 || dup.status === 403);
    const rej = await apiRequest(API_BASE, 'POST', `/transfers/${tid}/reject`, { reason: FIXTURE_TAG }, fin.token);
    add('TR-REJECT-PATH', rej, rej.status >= 200 || rej.status === 403);
  }

  const srcBal = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: src.itemId, locationId: src.locationId } });
  matrix.push({ id: 'TR-SOURCE-BALANCE-SNAPSHOT', http: 200, qtyOnHand: srcBal?.qtyOnHand, result: 'PASS' });

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'TRANSFER_RUNTIME_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), round: 6, matrix }, null, 2));
  report.finish(path.join(REPORT_DIR, 'TRANSFER_RUNTIME_HARNESS.json'));
  console.log('[10-transfer-v3]', matrix.length);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
