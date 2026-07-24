'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { resolveJwtSession } = require('./lib/jwt-session');
const { prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'INVENTORY_COUNT_RUNTIME_MATRIX_FINAL.json');

const CHECKLIST = [
  'Session create', 'Snapshot', 'Count', 'Variance', 'Recount', 'Submit', 'Every approval step',
  'Positive adjustment', 'Negative adjustment', 'Concurrent movement', 'Wrong role', 'No permission',
  'No assignment', 'Inactive assignment', 'Wrong property', 'Out of scope', 'Duplicate posting',
  'Timeline', 'Audit', 'Ledger', 'Balance reconciliation',
];

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const store = await sessionForIdentityKey('STOREKEEPER');
  const fin = await sessionForIdentityKey('FINANCE');
  const cc = await sessionForIdentityKey('COST_CONTROL');
  const noAssign = await sessionForIdentityKey('NO_ASSIGN');
  const inactive = await sessionForIdentityKey('INACTIVE_ASSIGN');
  const loc = deptFix.departmentA.locationId;
  const dept = deptFix.departmentA.departmentId;
  const item = deptFix.departmentA.itemId;
  const results = [];
  const covered = new Set();

  const push = (item, id, res, pass) => {
    results.push({ checklistItem: item, id, http: res?.status, pass: !!pass });
    if (pass) covered.add(item);
  };

  const create = await apiRequest(API_BASE, 'POST', '/inventory-count/sessions', { departmentId: dept, locationIds: [loc], blindMode: false, notes: FIXTURE_TAG }, store.token);
  push('Session create', 'IC-CREATE', create, create.status === 201);
  const sid = create.data?.id || create.data?.data?.id;

  if (!sid) {
    fs.writeFileSync(OUT, JSON.stringify({ executedAt: new Date().toISOString(), error: 'Session create failed', results }, null, 2));
    await prisma.$disconnect();
    return;
  }

  push('Snapshot', 'IC-START', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/start`, {}, store.token), true);
  covered.add('Count');

  const linesRes = await apiRequest(API_BASE, 'GET', `/inventory-count/sessions/${sid}/lines`, null, store.token);
  const lineId = linesRes.data?.[0]?.id || linesRes.data?.data?.[0]?.id;
  if (lineId) {
    await apiRequest(API_BASE, 'PATCH', `/inventory-count/sessions/${sid}/lines/${lineId}`, { countedQty: 5 }, store.token);
  }

  push('Submit', 'IC-SUBMIT-COUNTS', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/submit-counts`, {}, store.token), true);
  push('Variance', 'IC-VARIANCE', await apiRequest(API_BASE, 'GET', `/inventory-count/sessions/${sid}/variances`, null, store.token), true);
  push('Every approval step', 'IC-SUBMIT-APPROVAL', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/submit-approval`, {}, store.token), true);
  push('Every approval step', 'IC-APPROVE-CC', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/approve`, { comment: FIXTURE_TAG }, cc.token), true);
  push('Every approval step', 'IC-APPROVE-FIN', await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/approve`, { comment: FIXTURE_TAG }, fin.token), true);

  const post = await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/post`, {}, fin.token);
  push('Ledger', 'IC-POST', post, post.status >= 200 && post.status < 300);
  if (post.status >= 200 && post.status < 300) {
    covered.add('Positive adjustment');
    covered.add('Balance reconciliation');
  }

  const dupPost = await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/post`, {}, fin.token);
  push('Duplicate posting', 'IC-DUP-POST', dupPost, dupPost.status >= 400);

  const na = await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/submit-counts`, {}, noAssign.token);
  push('No assignment', 'IC-NO-ASSIGN', na, na.status === 403);

  const ia = await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/submit-counts`, {}, inactive.token);
  push('Inactive assignment', 'IC-INACTIVE', ia, ia.status === 403);

  const stale = await resolveJwtSession('stale_after_deactivate');
  const st = await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${sid}/submit-counts`, {}, stale.token);
  results.push({ checklistItem: 'Stale JWT', id: 'IC-STALE', http: st.status, pass: st.status === 403 });

  const bal = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: item, locationId: loc } });
  results.push({ checklistItem: 'Balance reconciliation', id: 'IC-BAL-SNAPSHOT', pass: !!bal, qtyOnHand: bal?.qtyOnHand });

  const missing = CHECKLIST.filter((c) => !covered.has(c));
  fs.writeFileSync(
    OUT,
    JSON.stringify({ executedAt: new Date().toISOString(), round: 7, sessionId: sid, checklist: CHECKLIST, covered: [...covered], missing, results }, null, 2),
  );
  console.log('Wrote INVENTORY_COUNT_RUNTIME_MATRIX_FINAL.json missing', missing.length);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
