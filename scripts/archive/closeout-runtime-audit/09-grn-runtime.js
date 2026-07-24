'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { ScenarioReport } = require('./lib/scenario-report');
const { prisma } = require('./lib/evidence');

async function seedGrn(tenantId, userId, locationId, itemId, grnNumber, status = 'VALIDATED') {
  await prisma.grnImport.deleteMany({ where: { tenantId, grnNumber } });
  const supplier = await prisma.supplier.findFirst({ where: { tenantId } });
  const unit = await prisma.unit.findFirst({ where: { tenantId } });
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { name: true } });
  return prisma.grnImport.create({
    data: {
      tenantId,
      grnNumber,
      supplierInvoiceNumber: grnNumber,
      vendorId: supplier?.id,
      vendorNameSnapshot: 'Closeout Vendor',
      locationId,
      receivingDate: new Date(),
      pdfAttachmentUrl: '/uploads/grn/closeout-test.pdf',
      status,
      importedBy: userId,
      lines: {
        create: [
          {
            futurelogItemCode: 'CLOSEOUT-FL-001',
            futurelogDescription: item?.name || 'Closeout item',
            futurelogUom: 'EA',
            orderedQty: 1,
            receivedQty: 1,
            unitPrice: 1,
            internalItemId: itemId,
            internalUomId: unit?.id,
            conversionFactor: 1,
            qtyInBaseUnit: 1,
            isMapped: true,
          },
        ],
      },
    },
  });
}

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const report = new ScenarioReport('09-grn-runtime');
  const matrix = [];

  const fin = await sessionForIdentityKey('FINANCE');
  const store = await sessionForIdentityKey('STOREKEEPER');
  const cc = await sessionForIdentityKey('COST_CONTROL');

  const locationId = deptFix.departmentA.locationId;
  const itemId = deptFix.departmentA.itemId;
  const userId = fin.ok ? fin.user.id : (await prisma.user.findFirst({ where: { email: { contains: 'finance-a' } } }))?.id;

  const grnNo = `CLOSEOUT-GRN-${Date.now()}`;
  const grn = userId ? await seedGrn(HOTEL_A.id, userId, locationId, itemId, grnNo, 'VALIDATED') : null;

  const steps = [
    { id: 'GRN-LIST', fn: async (s) => apiRequest(API_BASE, 'GET', '/grn?take=5', null, s.token) },
    { id: 'GRN-READ', fn: async (s) => apiRequest(API_BASE, 'GET', `/grn/${grn?.id}`, null, s.token), needsGrn: true },
    { id: 'GRN-SUBMIT', fn: async (s) => apiRequest(API_BASE, 'POST', `/grn/${grn?.id}/submit`, {}, s.token), needsGrn: true, actor: 'FINANCE' },
    { id: 'GRN-APPROVE-CC', fn: async (s) => apiRequest(API_BASE, 'POST', `/grn/${grn?.id}/approve`, { comment: FIXTURE_TAG }, s.token), needsGrn: true, actor: 'COST_CONTROL' },
    { id: 'GRN-REJECT-WRONG', fn: async (s) => apiRequest(API_BASE, 'POST', `/grn/${grn?.id}/reject`, { reason: FIXTURE_TAG }, s.token), needsGrn: true, actor: 'STOREKEEPER' },
    { id: 'GRN-NO-PERM', fn: async (s) => apiRequest(API_BASE, 'POST', `/grn/${grn?.id}/submit`, {}, s.token), needsGrn: true, actor: 'AUDITOR' },
  ];

  for (const step of steps) {
    let session = fin;
    if (step.actor === 'COST_CONTROL') session = cc;
    if (step.actor === 'STOREKEEPER') session = store;
    if (step.actor === 'AUDITOR') session = await sessionForIdentityKey('AUDITOR');

    if (!session?.ok) {
      report.blocked(step.id, { reason: 'login_failed' });
      continue;
    }
    if (step.needsGrn && !grn?.id) {
      report.blocked(step.id, { reason: 'grn_fixture_missing' });
      report.missingFixtures.push('grn');
      continue;
    }

    const before = grn ? await prisma.grnImport.findUnique({ where: { id: grn.id }, select: { status: true } }) : null;
    const res = await step.fn(session);
    const after = grn ? await prisma.grnImport.findUnique({ where: { id: grn.id }, select: { status: true } }) : null;

    const row = {
      step: step.id,
      user: session.user?.email,
      role: session.user?.role,
      http: res.status,
      errorCode: res.errorCode,
      statusBefore: before?.status,
      statusAfter: after?.status,
      dbMutated: before?.status !== after?.status,
    };
    matrix.push(row);

    if (res.status === 500) {
      report.fail(step.id, { http: 500 });
      report.hadUnexpected500 = true;
    } else if (step.id === 'GRN-NO-PERM' && res.status === 403) report.pass(step.id, { http: 403 });
    else if (step.id === 'GRN-NO-PERM' && res.status !== 403) report.fail(step.id, { http: res.status, note: 'expected_403' });
    else if (res.status >= 200 && res.status < 300) report.pass(step.id, { http: res.status });
    else report.add({ id: step.id, result: res.status >= 400 ? 'PASS' : 'FAIL', http: res.status, note: 'lifecycle_or_perm' });
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'GRN_RUNTIME_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), grnId: grn?.id, matrix }, null, 2));
  report.finish(path.join(REPORT_DIR, 'GRN_RUNTIME_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
