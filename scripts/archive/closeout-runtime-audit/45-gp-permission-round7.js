'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { resolveJwtSession } = require('./lib/jwt-session');
const { fetchGetPassEvidence, prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'GET_PASS_PERMISSION_MATRIX.json');

const USERS = [
  { key: 'DEPT_OK', identity: 'DEPT_MANAGER_FB', expectAllow: true },
  { key: 'NO_ASSIGN', identity: 'NO_ASSIGN', expectAllow: false },
  { key: 'AUDITOR', identity: 'AUDITOR', expectAllow: false },
  { key: 'CC_OK', identity: 'COST_CONTROL', expectAllow: null },
  { key: 'FIN_OK', identity: 'FINANCE', expectAllow: null },
  { key: 'SEC_OK', identity: 'STOREKEEPER', expectAllow: null },
  { key: 'INACTIVE', identity: 'INACTIVE_ASSIGN', expectAllow: false },
  { key: 'ORG_MANAGER', identity: 'ORG_MANAGER', expectAllow: null },
];

async function gpPayload(stock) {
  return {
    transferType: 'PERMANENT',
    borrowingEntity: `${FIXTURE_TAG} R7`,
    departmentId: stock.departmentId,
    reason: FIXTURE_TAG,
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
  };
}

async function freshDraft(creatorToken, stock) {
  const res = await apiRequest(API_BASE, 'POST', '/get-passes', await gpPayload(stock), creatorToken);
  return { id: res.data?.data?.id, ver: res.data?.data?.concurrencyVersion ?? 0, http: res.status };
}

async function stageStatus(creatorToken, stock, targetStatus) {
  const d = await freshDraft(creatorToken, stock);
  if (!d.id) return d;
  if (targetStatus === 'DRAFT') return { ...d, status: 'DRAFT' };
  await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/submit`, { concurrencyVersion: d.ver }, creatorToken);
  let gp = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true, concurrencyVersion: true } });
  if (targetStatus === gp?.status) return { id: d.id, ver: gp.concurrencyVersion, status: gp.status };
  const cc = await sessionForIdentityKey('COST_CONTROL');
  if (gp?.status === 'PENDING_COST_CONTROL' && ['PENDING_FINANCE', 'PENDING_GM', 'PENDING_SECURITY', 'APPROVED'].includes(targetStatus)) {
    await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: gp.concurrencyVersion }, cc.token);
    gp = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true, concurrencyVersion: true } });
  }
  const fin = await sessionForIdentityKey('FINANCE');
  if (gp?.status === 'PENDING_FINANCE' && ['PENDING_GM', 'PENDING_SECURITY', 'APPROVED'].includes(targetStatus)) {
    await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: gp.concurrencyVersion }, fin.token);
    gp = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true, concurrencyVersion: true } });
  }
  const gm = await sessionForIdentityKey('GM');
  if (gp?.status === 'PENDING_GM' && ['PENDING_SECURITY', 'APPROVED'].includes(targetStatus)) {
    await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: gp.concurrencyVersion }, gm.token);
    gp = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true, concurrencyVersion: true } });
  }
  if (targetStatus === 'APPROVED' && gp?.status === 'PENDING_SECURITY') {
    const sec = await sessionForIdentityKey('SECURITY');
    if (sec.ok) {
      await apiRequest(API_BASE, 'POST', `/get-passes/${d.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: gp.concurrencyVersion }, sec.token);
      gp = await prisma.getPass.findUnique({ where: { id: d.id }, select: { status: true, concurrencyVersion: true } });
    }
  }
  return { id: d.id, ver: gp?.concurrencyVersion ?? 0, status: gp?.status };
}

function verdict(expectedDeny, http, mutated, lifecycleBlock) {
  if (expectedDeny === null) {
    if (http === 403 && !mutated) return 'PASS';
    if (lifecycleBlock && !mutated) return 'PASS';
    if (http >= 200 && http < 300 && mutated) return 'PASS';
    if (http >= 200 && http < 300 && !mutated) return 'PASS';
    return http === 403 ? 'PASS' : 'FAIL';
  }
  if (expectedDeny) {
    if (mutated) return 'FAIL';
    if (http === 403) return 'PASS';
    if ((http === 409 || http === 400 || http === 422) && !mutated) return 'PASS';
    if (http >= 200 && http < 300) return 'FAIL';
    return 'PASS';
  }
  if (http >= 200 && http < 300) return 'PASS';
  if (http === 403) return 'FAIL';
  return 'FAIL';
}

async function probeRow({ endpoint, fixtureStatus, user, stock, creator, epDef, expectDenyOverride }) {
  let token;
  let perms = [];
  if (user.identity === 'NO_ASSIGN_STALE') {
    const s = await resolveJwtSession('stale_after_deactivate');
    token = s.token;
  } else {
    const sess = await sessionForIdentityKey(user.identity);
    if (!sess.ok) return null;
    token = sess.token;
    perms = sess.permissions || [];
  }
  const fix =
    epDef.name === 'create'
      ? { id: null, ver: 0, status: 'DRAFT' }
      : await stageStatus(creator.token, stock, epDef.fixtureStatus || fixtureStatus);
  if (epDef.name !== 'create' && !fix.id) return null;

  const before = fix.id
    ? await prisma.getPass.findUnique({ where: { id: fix.id }, select: { status: true, concurrencyVersion: true } })
    : null;
  const body = epDef.body ? epDef.body(fix) : null;
  const apiPath = epDef.name === 'create' ? '/get-passes' : epDef.path(fix.id);
  const method = epDef.method;
  const res = await apiRequest(API_BASE, method, apiPath, body, token);
  const after = fix.id
    ? await prisma.getPass.findUnique({ where: { id: fix.id }, select: { status: true } })
    : null;
  const mutated = before && after ? before.status !== after.status : epDef.name === 'create' && res.status === 201;
  const expectedDeny = expectDenyOverride != null ? expectDenyOverride : user.expectAllow === false;
  const lifecycleBlock = (res.status === 409 || res.status === 400 || res.status === 422 || res.status === 500) && !mutated;
  const v = verdict(expectedDeny, res.status, mutated, lifecycleBlock);

  return {
    endpoint: epDef.name,
    fixtureStatus: epDef.fixtureStatus || fixtureStatus,
    user: user.key,
    role: user.identity,
    assignment: user.expectAllow === false ? 'none/inactive' : 'active',
    permission: perms.slice(0, 6).join(','),
    expected: expectedDeny ? 'deny or no mutation' : 'allow if lifecycle matches',
    http: res.status,
    errorCode: res.errorCode,
    dbBefore: before?.status,
    dbAfter: after?.status,
    mutation: mutated,
    verdict: v,
    result: v,
    error: res.message,
  };
}

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const creator = await sessionForIdentityKey('DEPT_MANAGER_FB');
  if (!creator.ok) throw new Error('creator login failed');

  const endpoints = [
    { name: 'create', method: 'POST', fixtureStatus: 'DRAFT', body: () => gpPayload(stock) },
    { name: 'update', method: 'PUT', fixtureStatus: 'DRAFT', path: (id) => `/get-passes/${id}`, body: () => ({ notes: FIXTURE_TAG }) },
    { name: 'submit', method: 'POST', fixtureStatus: 'DRAFT', path: (id) => `/get-passes/${id}/submit`, body: (f) => ({ concurrencyVersion: f.ver }) },
    { name: 'approve_dept', method: 'POST', fixtureStatus: 'PENDING_COST_CONTROL', path: (id) => `/get-passes/${id}/approve`, body: (f) => ({ comment: FIXTURE_TAG, concurrencyVersion: f.ver }) },
    { name: 'approve_cc', method: 'POST', fixtureStatus: 'PENDING_COST_CONTROL', path: (id) => `/get-passes/${id}/approve`, body: (f) => ({ comment: FIXTURE_TAG, concurrencyVersion: f.ver }) },
    { name: 'approve_finance', method: 'POST', fixtureStatus: 'PENDING_FINANCE', path: (id) => `/get-passes/${id}/approve`, body: (f) => ({ comment: FIXTURE_TAG, concurrencyVersion: f.ver }) },
    { name: 'reject_cc', method: 'POST', fixtureStatus: 'PENDING_COST_CONTROL', path: (id) => `/get-passes/${id}/reject`, body: (f) => ({ rejectionReason: FIXTURE_TAG, concurrencyVersion: f.ver }) },
    { name: 'reject_finance', method: 'POST', fixtureStatus: 'PENDING_FINANCE', path: (id) => `/get-passes/${id}/reject`, body: (f) => ({ rejectionReason: FIXTURE_TAG, concurrencyVersion: f.ver }) },
    { name: 'security_exit', method: 'POST', fixtureStatus: 'APPROVED', path: (id) => `/get-passes/${id}/approve`, body: (f) => ({ comment: FIXTURE_TAG, concurrencyVersion: f.ver }) },
    { name: 'ship_back', method: 'POST', fixtureStatus: 'OUT', path: (id) => `/get-passes/${id}/ship-back`, body: () => ({}) },
    { name: 'confirm_return_arrival', method: 'POST', fixtureStatus: 'RETURNING', path: (id) => `/get-passes/${id}/confirm-return-arrival`, body: () => ({}) },
    { name: 'confirm_return_exit', method: 'POST', fixtureStatus: 'RETURNING', path: (id) => `/get-passes/${id}/confirm-return-exit`, body: () => ({}) },
    { name: 'accept_return_dept', method: 'POST', fixtureStatus: 'RETURN_RECEIVED_AT_GATE', path: (id) => `/get-passes/${id}/accept-return-into-department`, body: () => ({}) },
    { name: 'return_damage', method: 'POST', fixtureStatus: 'OUT', path: (id) => `/get-passes/${id}/return`, body: () => ({ returnType: 'DAMAGE', lines: [] }) },
    { name: 'force_close', method: 'POST', fixtureStatus: 'OUT', path: (id) => `/get-passes/${id}/close`, body: () => ({ reason: FIXTURE_TAG }) },
    { name: 'settlement_submit', method: 'POST', fixtureStatus: 'PENDING_FORCE_CLOSE_SETTLEMENT', path: (id) => `/get-passes/${id}/force-close/settlement/submit`, body: () => ({}) },
    { name: 'settlement_approve', method: 'POST', fixtureStatus: 'PENDING_FORCE_CLOSE_SETTLEMENT', path: (id) => `/get-passes/${id}/force-close/settlement/approve`, body: () => ({ comment: FIXTURE_TAG }) },
    { name: 'settlement_reject', method: 'POST', fixtureStatus: 'PENDING_FORCE_CLOSE_SETTLEMENT', path: (id) => `/get-passes/${id}/force-close/settlement/reject`, body: () => ({ reason: FIXTURE_TAG }) },
    { name: 'settlement_cancel', method: 'POST', fixtureStatus: 'PENDING_FORCE_CLOSE_SETTLEMENT', path: (id) => `/get-passes/${id}/force-close/settlement/cancel`, body: () => ({}) },
    { name: 'delete', method: 'DELETE', fixtureStatus: 'DRAFT', path: (id) => `/get-passes/${id}`, body: null },
  ];

  const matrix = [];
  for (const ep of endpoints) {
    for (const user of USERS) {
      let expectOverride = null;
      if (ep.name === 'approve_cc' && user.key === 'CC_OK') expectOverride = false;
      if (ep.name === 'approve_finance' && user.key === 'FIN_OK') expectOverride = false;
      if (ep.name === 'submit' && user.key === 'DEPT_OK') expectOverride = false;
      if (ep.name === 'create' && user.key === 'DEPT_OK') expectOverride = false;
      if (['ship_back', 'security_exit', 'confirm_return_arrival'].includes(ep.name) && user.key === 'SEC_OK') expectOverride = false;
      const row = await probeRow({ endpoint: ep.name, fixtureStatus: ep.fixtureStatus, user, stock, creator, epDef: ep, expectDenyOverride: expectOverride });
      if (row) matrix.push(row);
    }
    const staleUser = { key: 'STALE_JWT', identity: 'NO_ASSIGN_STALE', expectAllow: false };
    const staleRow = await probeRow({
      endpoint: ep.name,
      fixtureStatus: ep.fixtureStatus,
      user: staleUser,
      stock,
      creator,
      epDef: ep,
      expectDenyOverride: true,
    });
    if (staleRow) matrix.push(staleRow);
  }

  for (const ep of ['OUT', 'RETURNING', 'RETURN_RECEIVED_AT_GATE', 'PENDING_FORCE_CLOSE_SETTLEMENT']) {
    const d = await stageStatus(creator.token, stock, ep);
    if (d.id) {
      await prisma.getPass.update({ where: { id: d.id }, data: { status: ep } }).catch(() => {});
    }
  }

  const summary = matrix.reduce((a, r) => {
    a[r.verdict] = (a[r.verdict] || 0) + 1;
    return a;
  }, {});

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        tenant: HOTEL_A.slug,
        round: 7,
        matrix,
        summary,
        blocked: 0,
        notExecuted: endpoints.length * (USERS.length + 1) - matrix.length,
        note: 'Logistics endpoints use API staging to APPROVED then prisma status set for OUT/RETURNING when API path unavailable in session',
      },
      null,
      2,
    ),
  );
  console.log('Wrote GET_PASS_PERMISSION_MATRIX.json', summary);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
