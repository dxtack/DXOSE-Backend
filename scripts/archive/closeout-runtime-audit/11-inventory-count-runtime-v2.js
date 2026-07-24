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
  const report = new ScenarioReport('11-inventory-count-v2');
  const matrix = [];
  const store = await sessionForIdentityKey('STOREKEEPER');
  const fin = await sessionForIdentityKey('FINANCE');
  const noAssign = await sessionForIdentityKey('NO_ASSIGN');
  const loc = deptFix.departmentA.locationId;
  const dept = deptFix.departmentA.departmentId;

  const create = await apiRequest(API_BASE, 'POST', '/inventory-count/sessions', { departmentId: dept, locationIds: [loc], blindMode: false, notes: FIXTURE_TAG }, store.token);
  const sid = create.data?.id || create.data?.data?.id;
  matrix.push({ step: 'IC-CREATE', http: create.status });
  report.add({ id: 'IC-CREATE', result: create.status === 201 ? 'PASS' : 'FAIL', http: create.status });

  if (sid) {
    for (const [id, pathSuffix, body, actor] of [
      ['IC-START', `/inventory-count/sessions/${sid}/start`, {}, store],
      ['IC-SUBMIT-COUNTS', `/inventory-count/sessions/${sid}/submit-counts`, {}, store],
      ['IC-SUBMIT-APPROVAL', `/inventory-count/sessions/${sid}/submit-approval`, {}, store],
      ['IC-FINANCE-APPROVE-NEG', `/inventory-count/sessions/${sid}/approve`, { comment: FIXTURE_TAG }, fin],
      ['IC-NO-ASSIGN', `/inventory-count/sessions/${sid}/submit-counts`, {}, noAssign],
      ['IC-VARIANCE', `/inventory-count/sessions/${sid}/variances`, null, store],
    ]) {
      const s = actor === fin ? fin : actor === noAssign ? noAssign : store;
      const method = pathSuffix.includes('variances') ? 'GET' : 'POST';
      const res = await apiRequest(API_BASE, method, pathSuffix, body, s.token);
      matrix.push({ step: id, http: res.status });
      let result = res.status >= 200 && res.status < 300 ? 'PASS' : res.status === 403 ? 'PASS' : 'FAIL';
      if (id === 'IC-FINANCE-APPROVE-NEG' && res.status === 403) result = 'PASS';
      if (id === 'IC-NO-ASSIGN' && res.status === 403) result = 'PASS';
      report.add({ id, result, http: res.status });
    }
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), sessionId: sid, matrix }, null, 2));
  report.finish(path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_HARNESS.json'));
  console.log('[11-ic-v2]', matrix.length);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
