'use strict';
/**
 * Gate C — runtime verification for FIND-002 / FIND-001.
 * Output: governance-evidence-archive/gate-c-remediation/GATE_C_RUNTIME_RESULTS.json
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { API_BASE, HOTEL_A, HOTEL_B, FIXTURE_TAG } = require('./closeout-runtime-audit/lib/constants');
const { apiRequest } = require('./closeout-runtime-audit/lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./closeout-runtime-audit/lib/session-resolver');
const prisma = require('../src/config/database');

const OUT = path.join(__dirname, '../governance-evidence-archive/gate-c-remediation/GATE_C_RUNTIME_RESULTS.json');
const SCENARIOS_CSV = path.join(__dirname, '../governance-evidence-archive/gate-c-remediation/GATE_C_RUNTIME_SCENARIOS.csv');
const executedAt = new Date().toISOString();
const scenarios = [];
const createdDocs = [];

function randomUuid() {
  return crypto.randomUUID();
}

function hasForeignPassFields(body) {
  if (!body || typeof body !== 'object') return false;
  const data = body.data ?? body;
  if (!data || typeof data !== 'object') return false;
  return Boolean(
    data.borrowingEntity ||
      data.transferType ||
      (Array.isArray(data.lines) && data.lines.length > 0) ||
      data.passNumber,
  );
}

function add(id, findingId, desc, result, detail) {
  scenarios.push({
    scenario_id: id,
    finding_id: findingId,
    description: desc,
    status: result,
    tenant: HOTEL_A.slug,
    detail,
    executed_at: executedAt,
  });
}

async function main() {
  requireIdentitiesFile();
  const finance = await sessionForIdentityKey('FINANCE');
  const dmFb = await sessionForIdentityKey('DEPT_MANAGER_FB');
  await sessionForIdentityKey('STOREKEEPER');

  let ownGpId = null;
  if (finance.ok || dmFb.ok) {
    const deptFixPath = path.join(__dirname, '../governance-evidence-archive/closeout-runtime-audit/DEPT_STOCK_FIXTURES.json');
    const stock = JSON.parse(fs.readFileSync(deptFixPath, 'utf8')).departmentA;
    const own = await prisma.getPass.findFirst({
      where: { tenantId: HOTEL_A.id },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    ownGpId = own?.id ?? null;
    if (!ownGpId && dmFb.ok) {
      const create = await apiRequest(
        API_BASE,
        'POST',
        '/get-passes',
        {
          transferType: 'PERMANENT',
          borrowingEntity: `${FIXTURE_TAG} gate-c`,
          departmentId: stock.departmentId,
          reason: FIXTURE_TAG,
          lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
        },
        dmFb.token,
      );
      ownGpId = create.data?.data?.id ?? null;
      if (ownGpId) createdDocs.push({ type: 'getPass', id: ownGpId, tag: FIXTURE_TAG });
    }
    if (ownGpId && finance.ok) {
      const read = await apiRequest(API_BASE, 'GET', `/get-passes/${ownGpId}`, null, finance.token);
      add(
        'GC-XT-001',
        'FIND-002',
        'Same tenant + authorized + valid Get Pass ID → success',
        read.status === 200 && read.data?.data?.id === ownGpId ? 'Passed' : 'Failed',
        {
          user: 'finance@grandhorizon.com',
          role: 'FINANCE_MANAGER',
          endpoint: `GET /get-passes/${ownGpId}`,
          http: read.status,
          hasData: Boolean(read.data?.data?.id),
        },
      );
    } else if (!ownGpId) {
      add('GC-XT-001', 'FIND-002', 'Same tenant authorized read', 'Blocked', { reason: 'no_getpass_in_hotel_a' });
    } else {
      add('GC-XT-001', 'FIND-002', 'Same tenant authorized read', 'Blocked', { reason: 'finance_login_failed' });
    }
  } else {
    add('GC-XT-001', 'FIND-002', 'Same tenant authorized read', 'Blocked', { reason: 'identity_login_failed' });
  }

  const foreignGp = await prisma.getPass.findFirst({
    where: { tenantId: HOTEL_B.id },
    select: { id: true },
  });
  const tokenA = finance.ok ? finance : dmFb;
  if (tokenA.ok && foreignGp) {
    const cross = await apiRequest(API_BASE, 'GET', `/get-passes/${foreignGp.id}`, null, tokenA.token);
    const safe = [403, 404, 422].includes(cross.status);
    add(
      'GC-XT-002',
      'FIND-002',
      'Foreign tenant + existing Get Pass ID → safe non-500 denial',
      cross.status === 500 ? 'Failed' : safe ? 'Passed' : 'Failed',
      {
        user: tokenA.email,
        currentTenant: HOTEL_A.slug,
        foreignTenant: HOTEL_B.slug,
        targetId: foreignGp.id,
        endpoint: `GET /get-passes/${foreignGp.id}`,
        http: cross.status,
        body: cross.data,
        foreignFieldsDisclosed: hasForeignPassFields(cross.data),
      },
    );
  } else {
    add('GC-XT-002', 'FIND-002', 'Foreign tenant existing ID', 'Blocked', {
      reason: foreignGp ? 'login_failed' : 'no_foreign_getpass',
    });
  }

  if (tokenA.ok) {
    const fakeId = randomUuid();
    const crossFake = await apiRequest(API_BASE, 'GET', `/get-passes/${fakeId}`, null, tokenA.token);
    const safeFake = [403, 404, 422].includes(crossFake.status);
    const xt002 = scenarios.find((s) => s.scenario_id === 'GC-XT-002');
    add(
      'GC-XT-003',
      'FIND-002',
      'Random nonexistent Get Pass ID → safe response (no 500)',
      crossFake.status === 500 ? 'Failed' : safeFake ? 'Passed' : 'Failed',
      {
        user: tokenA.email,
        targetId: fakeId,
        endpoint: `GET /get-passes/${fakeId}`,
        http: crossFake.status,
        body: crossFake.data,
        matchesExistingDenial: xt002?.detail?.http != null ? crossFake.status === xt002.detail.http : null,
      },
    );
  } else {
    add('GC-XT-003', 'FIND-002', 'Random Get Pass ID', 'Blocked', { reason: 'login_failed' });
  }

  if (ownGpId) {
    const unauth = await apiRequest(API_BASE, 'GET', `/get-passes/${ownGpId}`, null, null);
    add(
      'GC-XT-004',
      'FIND-002',
      'Unauthenticated Get Pass read → safe denial',
      [401, 403, 404].includes(unauth.status) ? 'Passed' : 'Failed',
      {
        user: 'unauthenticated',
        endpoint: `GET /get-passes/${ownGpId}`,
        http: unauth.status,
        body: unauth.data,
      },
    );
  } else {
    add('GC-XT-004', 'FIND-002', 'Unauthenticated denial', 'Blocked', { reason: 'no_own_getpass' });
  }

  const xt002 = scenarios.find((s) => s.scenario_id === 'GC-XT-002');
  if (xt002 && xt002.status !== 'Blocked') {
    add(
      'GC-XT-005',
      'FIND-002',
      'Cross-tenant response must not contain foreign document fields',
      xt002.detail.foreignFieldsDisclosed ? 'Failed' : 'Passed',
      {
        targetId: xt002.detail.targetId,
        http: xt002.detail.http,
        foreignFieldsDisclosed: xt002.detail.foreignFieldsDisclosed,
      },
    );
  } else {
    add('GC-XT-005', 'FIND-002', 'No foreign data disclosure', 'Blocked', { reason: 'GC-XT-002_blocked' });
  }

  if (finance.ok) {
    const lost = await apiRequest(API_BASE, 'GET', '/lost?limit=5', null, finance.token);
    const rows = lost.data?.data?.rows ?? lost.data?.data ?? lost.data?.rows ?? [];
    const sample = Array.isArray(rows) ? rows.slice(0, 5) : [];
    const allMapped = sample.length === 0 || sample.every((r) => r.userFacingState != null);
    add(
      'GC-LI-001',
      'FIND-001',
      'Lost Items list API exposes userFacingState for status presentation',
      lost.status === 200 && allMapped ? 'Passed' : 'Failed',
      {
        http: lost.status,
        sampleCount: sample.length,
        samples: sample.map((r) => ({ id: r.id, status: r.status, userFacingState: r.userFacingState })),
      },
    );
    if (sample[0]?.id) {
      const detail = await apiRequest(API_BASE, 'GET', `/lost/${sample[0].id}`, null, finance.token);
      const d = detail.data?.data ?? detail.data;
      add(
        'GC-LI-002',
        'FIND-001',
        'Lost Items detail API exposes userFacingState',
        detail.status === 200 && d?.userFacingState != null ? 'Passed' : 'Failed',
        {
          id: sample[0].id,
          http: detail.status,
          status: d?.status,
          userFacingState: d?.userFacingState,
        },
      );
    }
  } else {
    add('GC-LI-001', 'FIND-001', 'Lost Items list API', 'Blocked', { reason: 'finance_login_failed' });
  }

  const summary = {
    executedAt,
    gate: 'Gate C Remediation',
    tenant: HOTEL_A,
    createdDocs,
    cleanupNote: 'Documents tagged CLOSEOUT_RT_AUDIT / gate-c retained for audit trace',
    counts: { Passed: 0, Failed: 0, Blocked: 0 },
    scenarios,
  };
  summary.counts = {
    Passed: scenarios.filter((s) => s.status === 'Passed').length,
    Failed: scenarios.filter((s) => s.status === 'Failed').length,
    Blocked: scenarios.filter((s) => s.status === 'Blocked').length,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));

  const csvHeader = 'scenario_id,finding_id,description,status,expected,actual,detail\n';
  const csvRows = scenarios
    .map((s) => {
      const expected = s.finding_id === 'FIND-002'
        ? 'non-500 safe boundary or 200 authorized same-tenant'
        : 'userFacingState present';
      const actual = s.detail?.http != null ? `HTTP ${s.detail.http}` : s.status;
      return `"${s.scenario_id}","${s.finding_id}","${s.description.replace(/"/g, '""')}","${s.status}","${expected}","${actual}","${JSON.stringify(s.detail).replace(/"/g, '""')}"`;
    })
    .join('\n');
  fs.writeFileSync(SCENARIOS_CSV, csvHeader + csvRows + '\n');

  console.log('Wrote', OUT, summary.counts);
  await prisma.$disconnect();
  process.exit(summary.counts.Failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
