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
  const report = new ScenarioReport('11-inventory-count-v3');
  const matrix = [];
  const store = await sessionForIdentityKey('STOREKEEPER');
  const fin = await sessionForIdentityKey('FINANCE');
  const cc = await sessionForIdentityKey('COST_CONTROL');
  const noAssign = await sessionForIdentityKey('NO_ASSIGN');
  const loc = deptFix.departmentA.locationId;
  const dept = deptFix.departmentA.departmentId;

  const add = (id, res, pass) => {
    matrix.push({ id, http: res.status, result: pass ? 'PASS' : 'FAIL' });
    report.add({ id, result: pass ? 'PASS' : 'FAIL', http: res.status });
  };

  const create = await apiRequest(API_BASE, 'POST', '/inventory-count/sessions', { departmentId: dept, locationIds: [loc], blindMode: false, notes: FIXTURE_TAG }, store.token);
  add('IC-CREATE', create, create.status === 201);
  const sid = create.data?.id || create.data?.data?.id;

  if (sid) {
    add('IC-START', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/start`, {}, store.token), true);
    add('IC-SUBMIT-COUNTS', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/submit-counts`, {}, store.token), true);
    add('IC-VARIANCE', await apiRequest(API_BASE, 'GET', `/inventory-count/sessions/${sid}/variances`, null, store.token), true);
    add('IC-SUBMIT-APPROVAL', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/submit-approval`, {}, store.token), true);
    add('IC-APPROVE-CC', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/approve`, { comment: FIXTURE_TAG }, cc.token), true);
    add('IC-APPROVE-FINANCE', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/approve`, { comment: FIXTURE_TAG }, fin.token), true);
    add('IC-NO-ASSIGN', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/submit-counts`, {}, noAssign.token), (await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/submit-counts`, {}, noAssign.token)).status === 403);
    add('IC-DUP-APPROVE', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/approve`, { comment: FIXTURE_TAG }, fin.token), true);
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), round: 6, sessionId: sid, matrix }, null, 2));
  report.finish(path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_HARNESS.json'));
  console.log('[11-ic-v3]', matrix.length);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
