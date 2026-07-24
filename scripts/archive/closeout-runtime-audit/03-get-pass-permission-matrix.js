'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { ScenarioReport } = require('./lib/scenario-report');
const { fetchGetPassEvidence, prisma } = require('./lib/evidence');

const ENDPOINT_SPECS = [
  { name: 'submit', method: 'POST', path: (id) => `/get-passes/${id}/submit`, requiredStatus: 'DRAFT', body: (v) => ({ concurrencyVersion: v }) },
  { name: 'approve', method: 'POST', path: (id) => `/get-passes/${id}/approve`, requiredStatus: 'PENDING_DEPT', body: () => ({ comment: FIXTURE_TAG }) },
  { name: 'reject', method: 'POST', path: (id) => `/get-passes/${id}/reject`, requiredStatus: 'PENDING_DEPT', body: () => ({ rejectionReason: FIXTURE_TAG }) },
];

const NEGATIVE_USERS = ['AUDITOR', 'NO_ASSIGN'];
const POSITIVE_USERS = ['DEPT_MANAGER_FB', 'FINANCE', 'COST_CONTROL', 'GM'];

function gpCreatePayload(stock, deptId) {
  return {
    transferType: 'PERMANENT',
    borrowingEntity: `${FIXTURE_TAG} perm`,
    departmentId: deptId,
    reason: FIXTURE_TAG,
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
  };
}

async function createDraftGetPass(creatorSession, stock, deptId) {
  const res = await apiRequest(API_BASE, 'POST', '/get-passes', gpCreatePayload(stock, deptId), creatorSession.token);
  return {
    id: res.data?.data?.id,
    concurrencyVersion: res.data?.data?.concurrencyVersion ?? 0,
    createHttp: res.status,
  };
}

async function stageGetPassAtStatus(creatorSession, stock, deptId, targetStatus) {
  const draft = await createDraftGetPass(creatorSession, stock, deptId);
  if (!draft.id) return draft;

  if (targetStatus === 'DRAFT') return draft;

  let version = draft.concurrencyVersion;
  const submit = await apiRequest(
    API_BASE,
    'POST',
    `/get-passes/${draft.id}/submit`,
    { concurrencyVersion: version },
    creatorSession.token,
  );
  if (submit.status !== 200) return { ...draft, stageError: submit, targetStatus };

  const afterSubmit = await fetchGetPassEvidence(draft.id, HOTEL_A.id);
  version = (await prisma.getPass.findUnique({ where: { id: draft.id }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? version + 1;

  if (targetStatus === afterSubmit?.status || targetStatus === 'PENDING_DEPT') {
    return { id: draft.id, concurrencyVersion: version, status: afterSubmit?.status };
  }

  const approvers = ['COST_CONTROL', 'FINANCE', 'GM'];
  for (const key of approvers) {
    const ev = await fetchGetPassEvidence(draft.id, HOTEL_A.id);
    if (!ev || ev.status === targetStatus) break;
    const sess = await sessionForIdentityKey(key);
    if (!sess.ok) continue;
    const v = (await prisma.getPass.findUnique({ where: { id: draft.id }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0;
    await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${draft.id}/approve`,
      { comment: FIXTURE_TAG, concurrencyVersion: v },
      sess.token,
    );
    const now = await fetchGetPassEvidence(draft.id, HOTEL_A.id);
    if (now?.status === targetStatus) {
      const cv = (await prisma.getPass.findUnique({ where: { id: draft.id }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0;
      return { id: draft.id, concurrencyVersion: cv, status: now.status };
    }
  }

  const final = await fetchGetPassEvidence(draft.id, HOTEL_A.id);
  const cv = (await prisma.getPass.findUnique({ where: { id: draft.id }, select: { concurrencyVersion: true } }))?.concurrencyVersion ?? 0;
  return { id: draft.id, concurrencyVersion: cv, status: final?.status, targetStatus, staged: final?.status === targetStatus };
}

function classifyPermissionResult({ scenario, http, errorCode, dbChanged, expectedDeny }) {
  if (http === 500) return { result: 'FAIL', note: 'UNEXPECTED_500' };
  if (expectedDeny) {
    if (http === 403 && !dbChanged) return { result: 'PASS', note: 'PERMISSION_DENIED_NO_MUTATION' };
    if ((http === 409 || http === 400) && !dbChanged) return { result: 'FAIL', note: 'WRONG_LIFECYCLE_NOT_PERMISSION_PROOF' };
    if (http >= 200 && http < 300) return { result: 'FAIL', note: 'AUTHORIZATION_BYPASS' };
    return { result: 'FAIL', note: `UNEXPECTED_DENY_HTTP_${http}` };
  }
  if (http >= 200 && http < 300) return { result: 'PASS', note: 'ALLOWED' };
  if (http === 403) return { result: 'FAIL', note: 'UNEXPECTED_DENY' };
  return { result: 'FAIL', note: `HTTP_${http}` };
}

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const deptId = stock.departmentId;

  const creator = await sessionForIdentityKey('DEPT_MANAGER_FB');
  if (!creator.ok) throw new Error('DEPT_MANAGER_FB login failed — run seed');

  const report = new ScenarioReport('03-get-pass-permission-matrix');
  const matrix = [];

  for (const ep of ENDPOINT_SPECS) {
    for (const userKey of [...NEGATIVE_USERS, ...POSITIVE_USERS]) {
      const staged = await stageGetPassAtStatus(creator, stock, deptId, ep.requiredStatus);
      if (!staged.id) {
        report.blocked(`GP-PERM-${ep.name}-STAGE`, { reason: 'fixture_create_failed' });
        continue;
      }

      const sess = await sessionForIdentityKey(userKey);
      const rowId = `GP-PERM-${ep.name}-${userKey}`;
      if (!sess.ok) {
        report.blocked(rowId, { reason: sess.reason });
        matrix.push({ endpoint: ep.name, userKey, result: 'BLOCKED' });
        continue;
      }

      const before = await fetchGetPassEvidence(staged.id, HOTEL_A.id);
      const body = { ...ep.body(staged.concurrencyVersion), concurrencyVersion: staged.concurrencyVersion };
      const res = await apiRequest(API_BASE, ep.method, ep.path(staged.id), body, sess.token);
      const after = await fetchGetPassEvidence(staged.id, HOTEL_A.id);
      const dbChanged =
        before?.status !== after?.status ||
        before?.deptApprovedBy !== after?.deptApprovedBy ||
        before?.financeApprovedBy !== after?.financeApprovedBy;

      const expectedDeny = NEGATIVE_USERS.includes(userKey);
      const verdict = classifyPermissionResult({
        scenario: userKey,
        http: res.status,
        errorCode: res.errorCode,
        dbChanged,
        expectedDeny,
      });

      const row = {
        endpoint: ep.name,
        correctInitialStatus: before?.status,
        user: sess.user?.email,
        userKey,
        role: sess.user?.role,
        permissionSample: (sess.permissions || []).filter((p) => p.startsWith('GET_PASS')),
        expected: expectedDeny ? 'HTTP 403 + zero DB mutation' : 'HTTP 2xx if lifecycle permits',
        http: res.status,
        errorCode: res.errorCode,
        dbBefore: before?.status,
        dbAfter: after?.status,
        dbMutated: dbChanged,
        result: verdict.result,
        note: verdict.note,
      };
      matrix.push(row);
      report.add({ id: rowId, result: verdict.result, http: res.status, note: verdict.note });
      if (res.status === 500) report.hadUnexpected500 = true;
    }
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'GET_PASS_PERMISSION_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), matrix }, null, 2));
  report.finish(path.join(REPORT_DIR, 'GET_PASS_PERMISSION_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
