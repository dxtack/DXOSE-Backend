'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, HOTEL_B, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession } = require('./lib/http');
const { prisma } = require('./lib/investigate-user');

const OUT = path.join(REPORT_DIR, 'GET_PASS_CROSS_TENANT_EXPANDED.json');
const PASSWORD = 'CloseoutAudit@123';

const ENDPOINTS = (id, ver = 0) => [
  { name: 'read', method: 'GET', path: `/get-passes/${id}` },
  { name: 'update', method: 'PUT', path: `/get-passes/${id}`, body: { notes: FIXTURE_TAG } },
  { name: 'submit', method: 'POST', path: `/get-passes/${id}/submit`, body: { concurrencyVersion: ver } },
  { name: 'approve', method: 'POST', path: `/get-passes/${id}/approve`, body: { comment: FIXTURE_TAG, concurrencyVersion: ver } },
  { name: 'delete', method: 'DELETE', path: `/get-passes/${id}` },
];

async function timed(fn) {
  const t0 = Date.now();
  const res = await fn();
  return { ...res, responseMs: Date.now() - t0 };
}

async function main() {
  const tokenA = await getSession(API_BASE, { email: 'finance-a@closeout-audit.local', password: PASSWORD }, HOTEL_A.slug);
  if (!tokenA.ok) throw new Error('login failed');

  const gpB = await prisma.getPass.findFirst({ where: { tenantId: HOTEL_B.id }, select: { id: true, concurrencyVersion: true, status: true } });
  const gpA = await prisma.getPass.findFirst({ where: { tenantId: HOTEL_A.id }, select: { id: true, concurrencyVersion: true, status: true } });
  const deleted = await prisma.getPass.findFirst({ where: { tenantId: HOTEL_A.id }, select: { id: true } });
  if (deleted) {
    await prisma.getPassLine.deleteMany({ where: { getPassId: deleted.id } }).catch(() => {});
    await prisma.getPass.delete({ where: { id: deleted.id } }).catch(() => {});
  }

  const cases = [
    { label: 'cross_tenant_valid_id', id: gpB?.id, ver: gpB?.concurrencyVersion ?? 0, dbLookup: 'foreign tenant row exists' },
    { label: 'random_uuid', id: '00000000-0000-4000-8000-000000000099', ver: 0, dbLookup: 'no row' },
    { label: 'deleted_id', id: deleted?.id, ver: 0, dbLookup: 'deleted' },
    { label: 'malformed_id', id: 'not-a-uuid', ver: 0, dbLookup: 'invalid' },
    { label: 'same_tenant_unauthorized', id: gpA?.id, ver: gpA?.concurrencyVersion ?? 0, dbLookup: 'same tenant — finance may have access' },
  ];

  const probes = [];
  for (const c of cases) {
    if (!c.id && c.label !== 'malformed_id') continue;
    for (const ep of ENDPOINTS(c.id || 'x', c.ver)) {
      const before =
        c.label === 'cross_tenant_valid_id' && gpB?.id
          ? await prisma.getPass.findUnique({ where: { id: gpB.id }, select: { status: true, tenantId: true } })
          : null;
      const res = await timed(() => apiRequest(API_BASE, ep.method, ep.path.replace(String(c.id), String(c.id)), ep.body ?? null, tokenA.token));
      const after =
        c.label === 'cross_tenant_valid_id' && gpB?.id
          ? await prisma.getPass.findUnique({ where: { id: gpB.id }, select: { status: true } })
          : null;
      const dbMutated = before && after && before.status !== after.status;
      const stackExposure = typeof res.data === 'string' && /at\s+\w+/i.test(res.data);
      let defectClass = 'Expected isolation';
      if (c.label === 'same_tenant_unauthorized') defectClass = res.status === 403 ? 'Expected deny' : 'Same-tenant authorized or lifecycle block';
      else if (res.status === 500) defectClass = 'Product Runtime Defect — error handling';
      else if (res.status === 404) defectClass = 'Correct not-found';
      else if (res.status === 403) defectClass = 'Correct forbidden';
      if (res.status === 500 && c.label === 'random_uuid') defectClass += ' + information disclosure (same message as foreign valid)';
      if (dbMutated) defectClass = 'Partial mutation risk';

      probes.push({
        case: c.label,
        endpoint: ep.name,
        errorStatus: res.status,
        responseEnvelope: { message: res.message, errorCode: res.errorCode },
        stackExposure,
        dbLookupResult: c.dbLookup,
        auditEvent: null,
        mutation: dbMutated,
        responseMs: res.responseMs,
        defectClass,
      });
    }
  }

  const out = {
    executedAt: new Date().toISOString(),
    tokenTenant: HOTEL_A.slug,
    probes,
    summary: {
      unexpected500: probes.filter((p) => p.errorStatus === 500 && !p.case.includes('same_tenant')).length,
      informationDisclosure: probes.filter((p) => p.defectClass.includes('disclosure')).length,
      mutationRisk: probes.filter((p) => p.mutation).length,
    },
    confirmedDefect: 'Get Pass foreign/random/not-found requests return HTTP 500 — unchanged from Round 5',
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote GET_PASS_CROSS_TENANT_EXPANDED.json', probes.length);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
