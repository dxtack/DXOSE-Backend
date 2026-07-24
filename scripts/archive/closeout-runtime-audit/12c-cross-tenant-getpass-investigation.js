'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, HOTEL_B } = require('./lib/constants');
const { apiRequest, getSession } = require('./lib/http');
const { prisma } = require('./lib/investigate-user');
const { ScenarioReport } = require('./lib/scenario-report');

async function main() {
  const report = new ScenarioReport('12c-cross-tenant-getpass');
  const tokenA = await getSession(
    API_BASE,
    { email: 'finance-a@closeout-audit.local', password: 'CloseoutAudit@123' },
    HOTEL_A.slug,
  );
  if (!tokenA.ok) throw new Error('Finance A login failed');

  const gpB = await prisma.getPass.findFirst({ where: { tenantId: HOTEL_B.id }, select: { id: true, passNo: true, status: true } });
  const gpA = await prisma.getPass.findFirst({ where: { tenantId: HOTEL_A.id }, select: { id: true, passNo: true, status: true } });

  const probes = [];
  if (gpB?.id) {
    const read = await apiRequest(API_BASE, 'GET', `/get-passes/${gpB.id}`, null, tokenA.token);
    probes.push({
      probe: 'A_token_read_B_getpass',
      tokenTenant: HOTEL_A.slug,
      targetTenant: HOTEL_B.slug,
      targetId: gpB.id,
      http: read.status,
      errorCode: read.errorCode,
      message: read.message,
      bodySnippet: typeof read.data === 'object' ? JSON.stringify(read.data).slice(0, 500) : String(read.data).slice(0, 500),
      leakedData: read.status === 200 && read.data?.data?.id === gpB.id,
    });
    report.add({
      id: 'XT-GP-READ-B',
      result: read.status === 404 || read.status === 403 ? 'PASS' : read.status === 500 ? 'FAIL' : read.status === 200 ? 'FAIL' : 'NOT_APPLICABLE',
      http: read.status,
    });

    const wrongHeader = await apiRequest(API_BASE, 'GET', `/get-passes/${gpB.id}`, null, tokenA.token, {
      'X-Tenant-Id': HOTEL_B.id,
    });
    probes.push({
      probe: 'A_token_wrong_header_read_B',
      http: wrongHeader.status,
      errorCode: wrongHeader.errorCode,
      bodySnippet: typeof wrongHeader.data === 'object' ? JSON.stringify(wrongHeader.data).slice(0, 400) : null,
    });
    report.add({ id: 'XT-GP-WRONG-HDR', result: wrongHeader.status === 404 || wrongHeader.status === 403 ? 'PASS' : 'FAIL', http: wrongHeader.status });
  }

  const tokenB = await getSession(
    API_BASE,
    { email: 'finance-b@closeout-audit.local', password: 'CloseoutAudit@123' },
    HOTEL_B.slug,
  );
  if (gpA?.id && tokenB.ok) {
    const read = await apiRequest(API_BASE, 'GET', `/get-passes/${gpA.id}`, null, tokenB.token);
    probes.push({ probe: 'B_token_read_A_getpass', targetId: gpA.id, http: read.status, errorCode: read.errorCode });
    report.add({ id: 'XT-GP-READ-A', result: read.status === 404 || read.status === 403 ? 'PASS' : 'FAIL', http: read.status });
  }

  let classification = 'Isolation Pass';
  const p0 = probes.find((p) => p.leakedData);
  const err500 = probes.filter((p) => p.http === 500);
  if (p0) classification = 'Confirmed Cross-Tenant Leak';
  else if (err500.length) classification = 'Isolation Pass + Error Handling Defect';

  const out = {
    executedAt: new Date().toISOString(),
    classification,
    expectedCrossTenant: '404 or 403 — no data — no stack in response',
    probes,
    auditEventsChecked: false,
    note: err500.length ? 'HTTP 500 on cross-tenant read — no data returned but error handling defect' : null,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'CROSS_TENANT_GETPASS_INVESTIGATION.json'), JSON.stringify(out, null, 2));
  report.finish(path.join(REPORT_DIR, 'CROSS_TENANT_GETPASS_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
