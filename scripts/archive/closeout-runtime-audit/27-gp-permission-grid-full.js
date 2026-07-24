'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { ScenarioReport } = require('./lib/scenario-report');
const {
  loadDisposableTenants,
  ensureDisposableStock,
  seedConstitutionWorkflow,
  cleanupConstitutionWorkflow,
  gpPayload,
  upsertDisposableUser,
  PASSWORD,
  EMAIL_DOMAIN,
} = require('./lib/disposable-fixture');
const { fetchGetPassEvidence, prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'GET_PASS_PERMISSION_MATRIX.json');

async function createDraft(session, stock, tenantId) {
  const res = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock, stock.departmentId), session.token);
  return { id: res.data?.data?.id, ver: res.data?.data?.concurrencyVersion ?? 0, http: res.status };
}

async function probeNegative(session, fixture, ep, expectedDeny = true) {
  const before = await prisma.getPass.findUnique({ where: { id: fixture.id }, select: { status: true } });
  const body = ep.body ? ep.body(fixture.ver) : null;
  const res = await apiRequest(API_BASE, ep.method, ep.path(fixture.id), body, session.token);
  const after = await prisma.getPass.findUnique({ where: { id: fixture.id }, select: { status: true } });
  const dbMutated = before?.status !== after?.status;
  let result = 'OBSERVE';
  let note = '';
  if (expectedDeny) {
    if (res.status === 403 && !dbMutated) { result = 'PASS'; note = 'PERMISSION_DENIED'; }
    else if (res.status >= 200 && res.status < 300 && dbMutated) { result = 'FAIL'; note = 'AUTHORIZATION_BYPASS'; }
    else if ((res.status === 409 || res.status === 400) && !dbMutated) { result = 'LIFECYCLE_NOT_PERMISSION'; note = 'Wrong fixture status'; }
    else if (res.status === 500) { result = 'FAIL'; note = 'UNEXPECTED_500'; }
  } else if (res.status >= 200 && res.status < 300) { result = 'PASS'; note = 'ALLOWED'; }
  else if (res.status === 403) { result = 'FAIL'; note = 'UNEXPECTED_DENY'; }
  return { endpoint: ep.name, userKey: session.key || session.email, http: res.status, dbMutated, result, note, error: res.message };
}

async function main() {
  requireIdentitiesFile();
  const report = new ScenarioReport('27-gp-permission-grid');
  const { child } = await loadDisposableTenants();
  const stock = await ensureDisposableStock(child.id);
  let wf = null;
  const matrix = [];

  try {
    wf = await seedConstitutionWorkflow(child.id);
    await upsertDisposableUser({ email: `disp-perm-dept@${EMAIL_DOMAIN}`, roleCode: 'DEPT_MANAGER', tenantId: child.id, departmentId: stock.departmentId });
    await upsertDisposableUser({ email: `disp-perm-cc@${EMAIL_DOMAIN}`, roleCode: 'COST_CONTROL', tenantId: child.id });
    await upsertDisposableUser({ email: `disp-perm-aud@${EMAIL_DOMAIN}`, roleCode: 'AUDITOR', tenantId: child.id, skipUrAssignment: true });
    await upsertDisposableUser({ email: `disp-perm-noassign@${EMAIL_DOMAIN}`, roleCode: 'DEPT_MANAGER', tenantId: child.id, skipUrAssignment: true });

    const creator = await getSession(API_BASE, { email: `disp-perm-dept@${EMAIL_DOMAIN}`, password: PASSWORD }, child.slug);
    const cc = await getSession(API_BASE, { email: `disp-perm-cc@${EMAIL_DOMAIN}`, password: PASSWORD }, child.slug);
    const noAssign = await getSession(API_BASE, { email: `disp-perm-noassign@${EMAIL_DOMAIN}`, password: PASSWORD }, child.slug);
    const aud = await getSession(API_BASE, { email: `disp-perm-aud@${EMAIL_DOMAIN}`, password: PASSWORD }, child.slug);

    const stageAt = async (session, targetStatus) => {
      const d = await createDraft(session, stock, child.id);
      if (!d.id) return d;
      if (targetStatus === 'DRAFT') return { ...d, status: 'DRAFT' };
      await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/submit`, { concurrencyVersion: d.ver }, session.token);
      if (targetStatus === 'PENDING_COST_CONTROL') {
        const v = (await prisma.getPass.findUnique({ where: { id: d.id }, select: { concurrencyVersion: true, status: true } })) || {};
        return { id: d.id, ver: v.concurrencyVersion ?? 0, status: v.status };
      }
      return stageAt(session, 'PENDING_COST_CONTROL');
    };

    const endpoints = [
      { name: 'submit', method: 'POST', path: (id) => `/get-passes/${id}/submit`, body: (v) => ({ concurrencyVersion: v }), status: 'DRAFT' },
      { name: 'approve_cc', method: 'POST', path: (id) => `/get-passes/${id}/approve`, body: (v) => ({ comment: FIXTURE_TAG, concurrencyVersion: v }), status: 'PENDING_COST_CONTROL' },
      { name: 'reject_cc', method: 'POST', path: (id) => `/get-passes/${id}/reject`, body: (v) => ({ rejectionReason: FIXTURE_TAG, concurrencyVersion: v }), status: 'PENDING_COST_CONTROL' },
      { name: 'update', method: 'PUT', path: (id) => `/get-passes/${id}`, body: () => ({ notes: FIXTURE_TAG }), status: 'DRAFT' },
      { name: 'delete', method: 'DELETE', path: (id) => `/get-passes/${id}`, body: null, status: 'DRAFT' },
    ];

    for (const ep of endpoints) {
      const fix = await stageAt(creator, ep.status);
      if (!fix.id) continue;
      for (const [label, sess, expectDeny] of [
        ['NO_ASSIGN', noAssign, true],
        ['AUDITOR', aud, true],
        ['COST_CONTROL', cc, ep.name.startsWith('approve') || ep.name.startsWith('reject') ? false : true],
        ['DEPT_MANAGER', creator, ep.name === 'submit' ? false : ep.name.startsWith('approve') ? true : false],
      ]) {
        if (!sess?.ok) continue;
        const row = await probeNegative({ ...sess, key: label }, fix, ep, expectDeny);
        matrix.push(row);
        report.add({ id: `GP-${ep.name}-${label}`, result: row.result === 'PASS' || row.result === 'FAIL' ? row.result : 'BLOCKED', http: row.http, note: row.note });
      }
    }

    if (noAssign.ok && creator.ok) {
      const d = await createDraft(creator, stock, child.id);
      const before = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true } });
      const res = await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/submit`, { concurrencyVersion: d.ver }, noAssign.token);
      const after = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true } });
      const row = {
        endpoint: 'submit',
        userKey: 'NO_ASSIGN',
        tenant: child.slug,
        http: res.status,
        dbMutated: before?.status !== after?.status,
        result: res.status === 200 && before?.status !== after?.status ? 'FAIL' : res.status === 403 ? 'PASS' : 'OBSERVE',
        note: 'AUTHORIZATION_BYPASS if mutated',
      };
      matrix.push(row);
      report.add({ id: 'GP-submit-NO_ASSIGN-disposable', result: row.result === 'FAIL' ? 'FAIL' : row.result === 'PASS' ? 'PASS' : 'BLOCKED', http: row.http });
    }
  } finally {
    if (wf?.definitionId) await cleanupConstitutionWorkflow(wf.definitionId);
  }

  const out = { executedAt: new Date().toISOString(), tenant: child.slug, matrix, summary: { pass: matrix.filter((m) => m.result === 'PASS').length, fail: matrix.filter((m) => m.result === 'FAIL').length } };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  report.finish(path.join(REPORT_DIR, 'GET_PASS_PERMISSION_HARNESS.json'));
  console.log('Wrote GET_PASS_PERMISSION_MATRIX.json', out.summary);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
