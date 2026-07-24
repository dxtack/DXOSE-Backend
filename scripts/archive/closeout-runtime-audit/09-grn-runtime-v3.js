'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { ScenarioReport } = require('./lib/scenario-report');
const { prisma } = require('./lib/evidence');

async function seedGrn(tenantId, userId, locationId, itemId, grnNumber, status = 'DRAFT') {
  await prisma.grnImport.deleteMany({ where: { tenantId, grnNumber } });
  const supplier = await prisma.supplier.findFirst({ where: { tenantId } });
  const unit = await prisma.unit.findFirst({ where: { tenantId } });
  return prisma.grnImport.create({
    data: {
      tenantId,
      grnNumber,
      supplierInvoiceNumber: grnNumber,
      vendorId: supplier?.id,
      vendorNameSnapshot: 'Closeout',
      locationId,
      receivingDate: new Date(),
      pdfAttachmentUrl: '/uploads/grn/x.pdf',
      status,
      importedBy: userId,
      lines: {
        create: [{
          futurelogItemCode: 'CL-001',
          futurelogDescription: 'Item',
          futurelogUom: 'EA',
          orderedQty: 1,
          receivedQty: 1,
          unitPrice: 1,
          internalItemId: itemId,
          internalUomId: unit?.id,
          conversionFactor: 1,
          qtyInBaseUnit: 1,
          isMapped: true,
        }],
      },
    },
  });
}

async function withVersion(id) {
  const g = await prisma.grnImport.findUnique({ where: { id }, select: { concurrencyVersion: true, status: true } });
  return g?.concurrencyVersion ?? 0;
}

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const report = new ScenarioReport('09-grn-runtime-v3');
  const matrix = [];
  const fin = await sessionForIdentityKey('FINANCE');
  const cc = await sessionForIdentityKey('COST_CONTROL');
  const dm = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const noAssign = await sessionForIdentityKey('NO_ASSIGN');
  const loc = deptFix.departmentA.locationId;
  const item = deptFix.departmentA.itemId;
  const uid = fin.user?.id;
  const ts = Date.now();

  const push = (id, res, pass, extra = {}) => {
    matrix.push({ id, http: res.status, message: res.message, result: pass ? 'PASS' : 'FAIL', ...extra });
    report.add({ id, result: pass ? 'PASS' : 'FAIL', http: res.status });
  };

  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-V-${ts}`, 'DRAFT');
    const ver = await withVersion(g.id);
    const res = await apiRequest(API_BASE, 'POST', `/grn/${g.id}/validate`, { concurrencyVersion: ver }, fin.token);
    push('GRN-VALIDATE', res, res.status >= 200 && res.status < 300);
  }
  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-S-${ts}`, 'VALIDATED');
    const ver = await withVersion(g.id);
    const res = await apiRequest(API_BASE, 'POST', `/grn/${g.id}/submit`, { concurrencyVersion: ver }, fin.token);
    push('GRN-SUBMIT', res, res.status >= 200 && res.status < 300);
  }
  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-ACC-${ts}`, 'PENDING_APPROVAL');
    const ver = await withVersion(g.id);
    const res = await apiRequest(API_BASE, 'POST', `/grn/${g.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, cc.token);
    push('GRN-APPROVE-CC', res, res.status >= 200 && res.status < 300);
  }
  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-E2E-${ts}`, 'VALIDATED');
    let ver = await withVersion(g.id);
    await apiRequest(API_BASE, 'POST', `/grn/${g.id}/submit`, { concurrencyVersion: ver }, fin.token);
    ver = await withVersion(g.id);
    await apiRequest(API_BASE, 'POST', `/grn/${g.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, cc.token);
    ver = await withVersion(g.id);
    const res = await apiRequest(API_BASE, 'POST', `/grn/${g.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, fin.token);
    push('GRN-APPROVE-FINANCE', res, res.status >= 200 && res.status < 300);
  }
  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-POST-${ts}`, 'VALIDATED');
    let ver = await withVersion(g.id);
    await apiRequest(API_BASE, 'POST', `/grn/${g.id}/submit`, { concurrencyVersion: ver }, fin.token);
    ver = await withVersion(g.id);
    await apiRequest(API_BASE, 'POST', `/grn/${g.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, cc.token);
    ver = await withVersion(g.id);
    await apiRequest(API_BASE, 'POST', `/grn/${g.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, fin.token);
    ver = await withVersion(g.id);
    const before = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: item, locationId: loc } });
    const res = await apiRequest(API_BASE, 'PATCH', `/grn/${g.id}/status`, { status: 'POSTED', concurrencyVersion: ver }, fin.token);
    const after = await prisma.grnImport.findUnique({ where: { id: g.id }, select: { status: true } });
    const bal = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: item, locationId: loc } });
    push('GRN-POST', res, after?.status === 'POSTED', { stockDelta: Number(bal?.qtyOnHand || 0) - Number(before?.qtyOnHand || 0) });
  }
  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-SB-${ts}`, 'PENDING_APPROVAL');
    const ver = await withVersion(g.id);
    const res = await apiRequest(API_BASE, 'POST', `/grn/${g.id}/send-back`, { reason: FIXTURE_TAG, concurrencyVersion: ver }, cc.token);
    push('GRN-SEND-BACK', res, res.status >= 200 && res.status < 300);
  }
  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-REJ-${ts}`, 'PENDING_APPROVAL');
    const ver = await withVersion(g.id);
    const res = await apiRequest(API_BASE, 'POST', `/grn/${g.id}/reject`, { reason: FIXTURE_TAG, concurrencyVersion: ver }, cc.token);
    push('GRN-REJECT-CC', res, res.status >= 200 && res.status < 300);
  }
  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-NA-${ts}`, 'VALIDATED');
    const ver = await withVersion(g.id);
    const res = await apiRequest(API_BASE, 'POST', `/grn/${g.id}/submit`, { concurrencyVersion: ver }, noAssign.token);
    push('GRN-NO-ASSIGN', res, res.status === 403);
  }
  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-DS-${ts}`, 'PENDING_APPROVAL');
    const ver = await withVersion(g.id);
    const res = await apiRequest(API_BASE, 'POST', `/grn/${g.id}/submit`, { concurrencyVersion: ver }, fin.token);
    push('GRN-DUPLICATE-SUBMIT', res, res.status === 409 || res.status === 400 || res.status === 422);
  }
  {
    const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V3-WR-${ts}`, 'PENDING_APPROVAL');
    const ver = await withVersion(g.id);
    const res = await apiRequest(API_BASE, 'POST', `/grn/${g.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: ver }, dm.token);
    push('GRN-WRONG-ROLE', res, res.status === 403);
  }

  const fixtureFails = matrix.filter((m) => m.result === 'FAIL' && /Concurrency|enum|fixture/i.test(m.message || '')).length;
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'GRN_RUNTIME_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), round: 6, matrix, fixtureFailCount: fixtureFails }, null, 2));
  report.finish(path.join(REPORT_DIR, 'GRN_RUNTIME_HARNESS.json'));
  console.log('[09-grn-v3]', matrix.length, 'fixtureFails', fixtureFails);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
