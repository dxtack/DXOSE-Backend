'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, HOTEL_B, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { resolveJwtSession } = require('./lib/jwt-session');
const { prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'TRANSFER_RUNTIME_MATRIX_FINAL.json');

const CHECKLIST = [
  'Create', 'Submit', 'Department approval', 'Finance approval', 'Posting', 'Reject', 'Same store', 'Insufficient stock',
  'Wrong role', 'No permission', 'No assignment', 'Inactive assignment', 'Wrong property', 'Out of scope',
  'Duplicate approval', 'Duplicate posting', 'Concurrent approval', 'Timeline', 'Audit',
  'Source balance deduction', 'Destination balance addition', 'Cost/WAC preservation',
];

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const dm = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const fin = await sessionForIdentityKey('FINANCE');
  const cc = await sessionForIdentityKey('COST_CONTROL');
  const noAssign = await sessionForIdentityKey('NO_ASSIGN');
  const inactive = await sessionForIdentityKey('INACTIVE_ASSIGN');
  const src = deptFix.departmentA;
  const dst = deptFix.departmentB;
  const results = [];
  const covered = new Set();

  const push = (item, id, res, pass, extra = {}) => {
    results.push({ checklistItem: item, id, http: res?.status, message: res?.message, pass: !!pass, ...extra });
    if (pass) covered.add(item);
  };

  const payload = (dest = dst.locationId, qty = 1) => ({
    sourceLocationId: src.locationId,
    destLocationId: dest,
    reason: FIXTURE_TAG,
    lines: [{ itemId: src.itemId, qty }],
  });

  const createRes = await apiRequest(API_BASE, 'POST', '/transfers', payload(), dm.token);
  push('Create', 'TR-CREATE', createRes, createRes.status >= 200 && createRes.status < 300);

  const na = await apiRequest(API_BASE, 'POST', '/transfers', payload(), noAssign.token);
  push('No assignment', 'TR-NO-ASSIGN', na, na.status === 403);

  const ia = await apiRequest(API_BASE, 'POST', '/transfers', payload(), inactive.token);
  push('Inactive assignment', 'TR-INACTIVE', ia, ia.status === 403);

  const same = await apiRequest(API_BASE, 'POST', '/transfers', payload(src.locationId), dm.token);
  push('Same store', 'TR-SAME-STORE', same, same.status >= 400);

  const insuf = await apiRequest(API_BASE, 'POST', '/transfers', payload(dst.locationId, 999999), dm.token);
  push('Insufficient stock', 'TR-INSUFFICIENT', insuf, insuf.status >= 400);

  const wr = await apiRequest(API_BASE, 'POST', '/transfers', payload(), fin.token);
  push('Wrong role', 'TR-WRONG-ROLE', wr, wr.status === 403 || (wr.status >= 200 && wr.status < 300 && false));

  const tid = createRes.data?.data?.id || createRes.data?.id;
  if (tid) {
    const srcBefore = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: src.itemId, locationId: src.locationId } });
    const dstBefore = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: src.itemId, locationId: dst.locationId } });

    const submit = await apiRequest(API_BASE, 'POST', `/transfers/${tid}/submit`, {}, dm.token);
    push('Submit', 'TR-SUBMIT', submit, submit.status >= 200 && submit.status < 300);

    const deptAp = await apiRequest(API_BASE, 'POST', `/transfers/${tid}/approve`, { comment: FIXTURE_TAG }, dm.token);
    push('Department approval', 'TR-DEPT-APPROVE', deptAp, deptAp.status >= 200 && deptAp.status < 300);

    const finAp = await apiRequest(API_BASE, 'POST', `/transfers/${tid}/approve`, { comment: FIXTURE_TAG }, fin.token);
    push('Finance approval', 'TR-FIN-APPROVE', finAp, finAp.status >= 200 && finAp.status < 300);

    const dup = await apiRequest(API_BASE, 'POST', `/transfers/${tid}/approve`, { comment: FIXTURE_TAG }, fin.token);
    push('Duplicate approval', 'TR-DUP-APPROVE', dup, dup.status === 409 || dup.status === 400 || dup.status === 403);

    const post = await apiRequest(API_BASE, 'POST', `/transfers/${tid}/post`, {}, fin.token);
    push('Posting', 'TR-POST', post, post.status >= 200 && post.status < 300);

    const srcAfter = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: src.itemId, locationId: src.locationId } });
    const dstAfter = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: src.itemId, locationId: dst.locationId } });
    if (Number(srcAfter?.qtyOnHand || 0) < Number(srcBefore?.qtyOnHand || 0)) covered.add('Source balance deduction');
    if (Number(dstAfter?.qtyOnHand || 0) > Number(dstBefore?.qtyOnHand || 0)) covered.add('Destination balance addition');
    results.push({ checklistItem: 'Source balance deduction', id: 'TR-SRC-DELTA', pass: covered.has('Source balance deduction'), srcBefore: srcBefore?.qtyOnHand, srcAfter: srcAfter?.qtyOnHand });
    results.push({ checklistItem: 'Destination balance addition', id: 'TR-DST-DELTA', pass: covered.has('Destination balance addition'), dstBefore: dstBefore?.qtyOnHand, dstAfter: dstAfter?.qtyOnHand });
  }

  const create2 = await apiRequest(API_BASE, 'POST', '/transfers', payload(), dm.token);
  const tid2 = create2.data?.data?.id || create2.data?.id;
  if (tid2) {
    await apiRequest(API_BASE, 'POST', `/transfers/${tid2}/submit`, {}, dm.token);
    const rej = await apiRequest(API_BASE, 'POST', `/transfers/${tid2}/reject`, { reason: FIXTURE_TAG }, fin.token);
    push('Reject', 'TR-REJECT', rej, rej.status >= 200 && rej.status < 300);
  }

  const stale = await resolveJwtSession('stale_after_deactivate');
  const st = await apiRequest(API_BASE, 'POST', '/transfers', payload(), stale.token);
  results.push({ checklistItem: 'Stale JWT', id: 'TR-STALE', http: st.status, pass: st.status === 403 });

  const missing = CHECKLIST.filter((c) => !covered.has(c));
  fs.writeFileSync(
    OUT,
    JSON.stringify({ executedAt: new Date().toISOString(), round: 7, checklist: CHECKLIST, covered: [...covered], missing, results }, null, 2),
  );
  console.log('Wrote TRANSFER_RUNTIME_MATRIX_FINAL.json missing', missing.length);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
