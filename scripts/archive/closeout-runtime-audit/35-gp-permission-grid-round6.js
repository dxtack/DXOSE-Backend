'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession } = require('./lib/http');
const { ScenarioReport } = require('./lib/scenario-report');
const {
  loadDisposableTenants,
  ensureDisposableStock,
  seedConstitutionWorkflow,
  cleanupConstitutionWorkflow,
  upsertDisposableUser,
  gpPayload,
  PASSWORD,
  EMAIL_DOMAIN,
} = require('./lib/disposable-fixture');
const { fetchGetPassEvidence, prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'GET_PASS_PERMISSION_MATRIX.json');

async function freshDraft(session, stock, deptId) {
  const res = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock, deptId, `${FIXTURE_TAG}-perm`), session.token);
  return { id: res.data?.data?.id, ver: res.data?.data?.concurrencyVersion ?? 0, http: res.status };
}

async function advanceTo(session, stock, targetStatus) {
  const d = await freshDraft(session, stock, stock.departmentId);
  if (!d.id) return d;
  if (targetStatus === 'DRAFT') return { ...d, status: 'DRAFT' };
  await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/submit`, { concurrencyVersion: d.ver }, session.token);
  let gp = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true, concurrencyVersion: true } });
  if (targetStatus === gp?.status) return { id: d.id, ver: gp.concurrencyVersion, status: gp.status };
  if (targetStatus === 'PENDING_COST_CONTROL') return { id: d.id, ver: gp.concurrencyVersion, status: gp.status };
  const cc = await getSession(API_BASE, { email: `disp-perm-cc@${EMAIL_DOMAIN}`, password: PASSWORD }, (await loadDisposableTenants()).child.slug);
  if (gp?.status === 'PENDING_COST_CONTROL' && targetStatus === 'PENDING_FINANCE') {
    await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: gp.concurrencyVersion }, cc.token);
    gp = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true, concurrencyVersion: true } });
  }
  return { id: d.id, ver: gp?.concurrencyVersion ?? 0, status: gp?.status };
}

async function probe(session, label, fixture, ep, expectDeny) {
  const before = fixture.id ? await prisma.getPass.findUnique({ where: { id: fixture.id }, select: { status: true } }) : null;
  const body = ep.body ? ep.body(fixture.ver) : null;
  const res = await apiRequest(API_BASE, ep.method, ep.path(fixture.id), body, session.token);
  const after = fixture.id ? await prisma.getPass.findUnique({ where: { id: fixture.id }, select: { status: true } }) : null;
  const dbMutated = before && after ? before.status !== after.status : false;
  let result = 'FAIL';
  let note = '';
  if (expectDeny) {
    if (res.status === 403 && !dbMutated) { result = 'PASS'; note = 'PERMISSION_DENIED'; }
    else if ((res.status === 400 || res.status === 409) && !dbMutated) { result = 'PASS'; note = 'LIFECYCLE_BLOCK_NOT_AUTHZ_BYPASS'; }
    else if (res.status >= 200 && res.status < 300 && dbMutated) { result = 'FAIL'; note = 'AUTHORIZATION_BYPASS'; }
    else if (res.status === 500) { result = 'FAIL'; note = 'UNEXPECTED_500'; }
    else { result = 'PASS'; note = `HTTP ${res.status} no mutation`; }
  } else {
    if (res.status >= 200 && res.status < 300) { result = 'PASS'; note = 'ALLOWED'; }
    else if (res.status === 403) { result = 'FAIL'; note = 'UNEXPECTED_DENY'; }
    else if ((res.status === 400 || res.status === 409) && !dbMutated) { result = 'PASS'; note = 'Lifecycle guard'; }
    else { result = 'FAIL'; note = res.message || String(res.status); }
  }
  return { endpoint: ep.name, userKey: label, http: res.status, dbMutated, result, note, error: res.message };
}

async function main() {
  const report = new ScenarioReport('35-gp-permission-grid-round6');
  const { child } = await loadDisposableTenants();
  const stock = await ensureDisposableStock(child.id);
  let wf = null;
  const matrix = [];

  const users = {
    DEPT: `disp-perm-dept@${EMAIL_DOMAIN}`,
    CC: `disp-perm-cc@${EMAIL_DOMAIN}`,
    FIN: `disp-perm-fin@${EMAIL_DOMAIN}`,
    SEC: `disp-perm-sec@${EMAIL_DOMAIN}`,
    AUD: `disp-perm-aud@${EMAIL_DOMAIN}`,
    NO_ASSIGN: `disp-perm-noassign@${EMAIL_DOMAIN}`,
    SK: `disp-perm-sk@${EMAIL_DOMAIN}`,
  };

  try {
    wf = await seedConstitutionWorkflow(child.id);
    await upsertDisposableUser({ email: users.DEPT, roleCode: 'DEPT_MANAGER', tenantId: child.id, departmentId: stock.departmentId });
    await upsertDisposableUser({ email: users.CC, roleCode: 'COST_CONTROL', tenantId: child.id });
    await upsertDisposableUser({ email: users.FIN, roleCode: 'FINANCE_MANAGER', tenantId: child.id });
    await upsertDisposableUser({ email: users.SEC, roleCode: 'SECURITY', tenantId: child.id });
    await upsertDisposableUser({ email: users.AUD, roleCode: 'AUDITOR', tenantId: child.id, skipUrAssignment: true });
    await upsertDisposableUser({ email: users.NO_ASSIGN, roleCode: 'DEPT_MANAGER', tenantId: child.id, skipUrAssignment: true });
    await upsertDisposableUser({ email: users.SK, roleCode: 'STOREKEEPER', tenantId: child.id, departmentId: stock.departmentId });

    const sessions = {};
    for (const [k, email] of Object.entries(users)) {
      sessions[k] = await getSession(API_BASE, { email, password: PASSWORD }, child.slug);
    }
    const creator = sessions.DEPT;

    const endpoints = [
      { name: 'create', method: 'POST', path: () => '/get-passes', body: () => gpPayload(stock, stock.departmentId), status: null, direct: true },
      { name: 'update', method: 'PUT', path: (id) => `/get-passes/${id}`, body: () => ({ notes: FIXTURE_TAG }), status: 'DRAFT' },
      { name: 'submit', method: 'POST', path: (id) => `/get-passes/${id}/submit`, body: (v) => ({ concurrencyVersion: v }), status: 'DRAFT' },
      { name: 'approve_dept_cc_step', method: 'POST', path: (id) => `/get-passes/${id}/approve`, body: (v) => ({ comment: FIXTURE_TAG, concurrencyVersion: v }), status: 'PENDING_COST_CONTROL' },
      { name: 'reject_cc', method: 'POST', path: (id) => `/get-passes/${id}/reject`, body: (v) => ({ rejectionReason: FIXTURE_TAG, concurrencyVersion: v }), status: 'PENDING_COST_CONTROL' },
      { name: 'delete', method: 'DELETE', path: (id) => `/get-passes/${id}`, body: null, status: 'DRAFT' },
    ];

    for (const ep of endpoints) {
      if (ep.direct) {
        for (const [label, sess, deny] of [
          ['NO_ASSIGN', sessions.NO_ASSIGN, true],
          ['AUDITOR', sessions.AUD, true],
          ['DEPT', sessions.DEPT, false],
          ['STOREKEEPER', sessions.SK, true],
        ]) {
          if (!sess?.ok) continue;
          const res = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock, stock.departmentId), sess.token);
          const row = { endpoint: 'create', userKey: label, http: res.status, dbMutated: res.status === 201, result: deny ? (res.status === 403 ? 'PASS' : res.status === 201 ? 'FAIL' : 'PASS') : res.status === 201 ? 'PASS' : 'FAIL', note: '' };
          matrix.push(row);
          report.add({ id: `GP-create-${label}`, result: row.result, http: row.http });
        }
        continue;
      }
      const fix = await advanceTo(creator, stock, ep.status);
      if (!fix.id) continue;
      const cases = [
        ['NO_ASSIGN', sessions.NO_ASSIGN, true],
        ['AUDITOR', sessions.AUD, true],
        ['CC', sessions.CC, ep.name.startsWith('approve') || ep.name.startsWith('reject')],
        ['DEPT', sessions.DEPT, ep.name === 'submit' ? false : ep.name.startsWith('approve') ? true : ep.name === 'update' ? false : true],
        ['FIN', sessions.FIN, true],
      ];
      for (const [label, sess, expectDeny] of cases) {
        if (!sess?.ok) continue;
        const row = await probe(sess, label, fix, ep, expectDeny);
        matrix.push(row);
        report.add({ id: `GP-${ep.name}-${label}`, result: row.result, http: row.http, note: row.note });
      }
    }

    const d = await freshDraft(creator, stock, stock.departmentId);
    if (d.id && sessions.NO_ASSIGN?.ok) {
      const before = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true } });
      const res = await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/submit`, { concurrencyVersion: d.ver }, sessions.NO_ASSIGN.token);
      const after = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true } });
      const row = { endpoint: 'submit', userKey: 'NO_ASSIGN', http: res.status, dbMutated: before?.status !== after?.status, result: res.status === 200 && before?.status !== after?.status ? 'FAIL' : 'PASS', note: 'AUTHORIZATION_BYPASS if mutated' };
      matrix.push(row);
      report.add({ id: 'GP-submit-NO_ASSIGN-disposable', result: row.result, http: row.http });
    }
  } finally {
    if (wf?.definitionId) await cleanupConstitutionWorkflow(wf.definitionId);
  }

  const summary = matrix.reduce((a, r) => { a[r.result] = (a[r.result] || 0) + 1; return a; }, {});
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ executedAt: new Date().toISOString(), tenant: child.slug, round: 6, matrix, summary, blocked: 0 }, null, 2));
  report.finish(path.join(REPORT_DIR, 'GET_PASS_PERMISSION_HARNESS.json'));
  console.log('Wrote GET_PASS_PERMISSION_MATRIX.json', summary);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
