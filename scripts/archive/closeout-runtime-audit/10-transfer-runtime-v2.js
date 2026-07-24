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
  const report = new ScenarioReport('10-transfer-runtime-v2');
  const matrix = [];
  const dm = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const fin = await sessionForIdentityKey('FINANCE');
  const noAssign = await sessionForIdentityKey('NO_ASSIGN');
  const src = deptFix.departmentA;
  const dst = deptFix.departmentB;

  const payload = () => ({
    sourceLocationId: src.locationId,
    destLocationId: dst.locationId,
    reason: FIXTURE_TAG,
    lines: [{ itemId: src.itemId, qty: 1 }],
  });

  const scenarios = [
    { id: 'TR-LIST', fn: (s) => apiRequest(API_BASE, 'GET', '/transfers?take=5', null, s.token), actor: 'DEPT_MANAGER_FB' },
    { id: 'TR-CREATE', fn: (s) => apiRequest(API_BASE, 'POST', '/transfers', payload(), s.token), actor: 'DEPT_MANAGER_FB' },
    { id: 'TR-NO-ASSIGN', fn: (s) => apiRequest(API_BASE, 'POST', '/transfers', payload(), noAssign.token), actor: 'NO_ASSIGN' },
    { id: 'TR-SAME-STORE', fn: (s) => apiRequest(API_BASE, 'POST', '/transfers', { ...payload(), destLocationId: src.locationId }, s.token), actor: 'DEPT_MANAGER_FB' },
    { id: 'TR-INSUFFICIENT', fn: (s) => apiRequest(API_BASE, 'POST', '/transfers', { ...payload(), lines: [{ itemId: src.itemId, qty: 999999 }] }, s.token), actor: 'DEPT_MANAGER_FB' },
    { id: 'TR-FINANCE-LIST', fn: (s) => apiRequest(API_BASE, 'GET', '/transfers?take=5', null, s.token), actor: 'FINANCE' },
  ];

  for (const sc of scenarios) {
    const s = sc.actor === 'FINANCE' ? fin : sc.actor === 'NO_ASSIGN' ? noAssign : dm;
    if (!s?.ok) { report.blocked(sc.id, { reason: 'login' }); continue; }
    const res = await sc.fn(s);
    matrix.push({ id: sc.id, http: res.status, error: res.message });
    const pass = sc.id === 'TR-NO-ASSIGN' ? res.status === 403 : res.status !== 500;
    report.add({ id: sc.id, result: pass ? 'PASS' : 'FAIL', http: res.status });
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'TRANSFER_RUNTIME_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), matrix }, null, 2));
  report.finish(path.join(REPORT_DIR, 'TRANSFER_RUNTIME_HARNESS.json'));
  console.log('[10-transfer-v2]', matrix.length);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
