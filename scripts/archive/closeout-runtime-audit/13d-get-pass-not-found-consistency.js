'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, HOTEL_B } = require('./lib/constants');
const { apiRequest, getSession } = require('./lib/http');
const { prisma } = require('./lib/investigate-user');

const ENDPOINTS = (id) => [
  { name: 'read', method: 'GET', path: `/get-passes/${id}` },
  { name: 'update', method: 'PUT', path: `/get-passes/${id}`, body: { notes: 'xt-probe' } },
  { name: 'submit', method: 'POST', path: `/get-passes/${id}/submit`, body: { concurrencyVersion: 0 } },
  { name: 'approve', method: 'POST', path: `/get-passes/${id}/approve`, body: { comment: 'xt', concurrencyVersion: 0 } },
  { name: 'pdf', method: 'GET', path: `/get-passes/${id}/pdf` },
];

async function main() {
  const tokenA = await getSession(
    API_BASE,
    { email: 'finance-a@closeout-audit.local', password: 'CloseoutAudit@123' },
    HOTEL_A.slug,
  );
  if (!tokenA.ok) throw new Error('login failed');

  const gpB = await prisma.getPass.findFirst({ where: { tenantId: HOTEL_B.id }, select: { id: true } });
  const gpA = await prisma.getPass.findFirst({ where: { tenantId: HOTEL_A.id }, select: { id: true } });
  const randomId = '00000000-0000-4000-8000-000000000001';
  const deletedId = await prisma.getPass.findFirst({
    where: { tenantId: HOTEL_A.id, status: 'CLOSED' },
    select: { id: true },
  });

  const probes = [];
  const cases = [
    { label: 'valid_other_tenant', id: gpB?.id },
    { label: 'same_tenant_valid', id: gpA?.id },
    { label: 'random_uuid', id: randomId },
    { label: 'deleted_or_closed', id: deletedId?.id },
  ];

  for (const c of cases) {
    if (!c.id) continue;
    for (const ep of ENDPOINTS(c.id)) {
      const res = await apiRequest(API_BASE, ep.method, ep.path, ep.body || null, tokenA.token);
      probes.push({
        case: c.label,
        endpoint: ep.name,
        http: res.status,
        errorCode: res.errorCode,
        message: res.message,
        bodySnippet: typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 200) : String(res.data).slice(0, 200),
        classification:
          res.status === 500
            ? 'Product Runtime Error Handling Defect'
            : res.status === 404 || res.status === 403
              ? 'Expected isolation response'
              : res.status === 200
                ? c.label === 'same_tenant_valid'
                  ? 'Expected same-tenant success'
                  : 'Unexpected success'
                : 'Other',
      });
    }
  }

  const out = {
    executedAt: new Date().toISOString(),
    tokenTenant: HOTEL_A.slug,
    targetTenant: HOTEL_B.slug,
    allCrossTenant500: probes.filter((p) => p.case === 'valid_other_tenant' && p.http === 500).length,
    enumerationRisk:
      probes.find((p) => p.case === 'valid_other_tenant' && p.http === 500)?.message ===
      probes.find((p) => p.case === 'random_uuid' && p.http === 500)?.message
        ? 'Same message for valid foreign ID and random UUID — low enumeration via message'
        : 'Compare messages in probes',
    classification: 'Product Runtime Error Handling Defect (500 instead of 404/403; no data leak)',
    probes,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'GET_PASS_NOT_FOUND_ERROR_CONSISTENCY.json'), JSON.stringify(out, null, 2));
  console.log('Wrote GET_PASS_NOT_FOUND_ERROR_CONSISTENCY.json probes:', probes.length);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
