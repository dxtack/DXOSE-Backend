'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, HOTEL_B } = require('./lib/constants');
const { apiRequest, getSession } = require('./lib/http');
const { prisma } = require('./lib/investigate-user');

const OUT = path.join(REPORT_DIR, 'GET_PASS_CROSS_TENANT_ACTION_MATRIX.json');
const PASSWORD = 'CloseoutAudit@123';

const ENDPOINTS = (id, ver = 0) => [
  { name: 'read', method: 'GET', path: `/get-passes/${id}` },
  { name: 'update', method: 'PUT', path: `/get-passes/${id}`, body: { notes: 'xt' } },
  { name: 'submit', method: 'POST', path: `/get-passes/${id}/submit`, body: { concurrencyVersion: ver } },
  { name: 'approve', method: 'POST', path: `/get-passes/${id}/approve`, body: { comment: 'xt', concurrencyVersion: ver } },
  { name: 'reject', method: 'POST', path: `/get-passes/${id}/reject`, body: { rejectionReason: 'xt', concurrencyVersion: ver } },
  { name: 'confirm_receipt', method: 'POST', path: `/get-passes/${id}/confirm-receipt`, body: {} },
  { name: 'ship_back', method: 'POST', path: `/get-passes/${id}/ship-back`, body: {} },
  { name: 'confirm_return_exit', method: 'POST', path: `/get-passes/${id}/confirm-return-exit`, body: {} },
  { name: 'confirm_return_arrival', method: 'POST', path: `/get-passes/${id}/confirm-return-arrival`, body: {} },
  { name: 'close', method: 'POST', path: `/get-passes/${id}/close`, body: { reason: 'xt' } },
  { name: 'settlement_submit', method: 'POST', path: `/get-passes/${id}/force-close/settlement/submit`, body: {} },
  { name: 'pdf', method: 'GET', path: `/get-passes/${id}/pdf` },
  { name: 'delete', method: 'DELETE', path: `/get-passes/${id}` },
];

async function main() {
  const tokenA = await getSession(
    API_BASE,
    { email: 'finance-a@closeout-audit.local', password: PASSWORD },
    HOTEL_A.slug,
  );
  if (!tokenA.ok) throw new Error('login failed');

  const gpB = await prisma.getPass.findFirst({ where: { tenantId: HOTEL_B.id }, select: { id: true, concurrencyVersion: true } });
  const gpA = await prisma.getPass.findFirst({ where: { tenantId: HOTEL_A.id, status: 'DRAFT' }, select: { id: true, concurrencyVersion: true } });
  const randomId = '00000000-0000-4000-8000-000000000099';

  const cases = [
    { label: 'foreign_valid', id: gpB?.id, ver: gpB?.concurrencyVersion ?? 0 },
    { label: 'random_uuid', id: randomId, ver: 0 },
    { label: 'same_tenant_valid', id: gpA?.id, ver: gpA?.concurrencyVersion ?? 0 },
  ];

  const probes = [];
  for (const c of cases) {
    if (!c.id) continue;
    for (const ep of ENDPOINTS(c.id, c.ver)) {
      const before = c.label === 'foreign_valid' ? await prisma.getPass.findUnique({ where: { id: c.id }, select: { status: true } }) : null;
      const res = await apiRequest(API_BASE, ep.method, ep.path, ep.body ?? null, tokenA.token);
      const after = c.label === 'foreign_valid' ? await prisma.getPass.findUnique({ where: { id: c.id }, select: { status: true } }) : null;
      const dbMutated = before && after && before.status !== after.status;
      probes.push({
        case: c.label,
        endpoint: ep.name,
        http: res.status,
        message: res.message,
        errorCode: res.errorCode,
        dbMutated: !!dbMutated,
        classification:
          c.label === 'same_tenant_valid' && res.status >= 200 && res.status < 300
            ? 'Expected same-tenant'
            : c.label !== 'same_tenant_valid' && res.status === 500
              ? 'Product Runtime Error Handling Defect'
              : c.label !== 'same_tenant_valid' && (res.status === 404 || res.status === 403)
                ? 'Expected isolation'
                : 'Other',
      });
    }
  }

  const foreign500 = probes.filter((p) => p.case === 'foreign_valid' && p.http === 500).length;
  const out = {
    executedAt: new Date().toISOString(),
    tokenTenant: HOTEL_A.slug,
    targetTenant: HOTEL_B.slug,
    allForeign500: foreign500 === probes.filter((p) => p.case === 'foreign_valid').length,
    enumerationRisk: 'Same message for foreign and random when 500',
    probes,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote GET_PASS_CROSS_TENANT_ACTION_MATRIX.json', probes.length, 'probes');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
