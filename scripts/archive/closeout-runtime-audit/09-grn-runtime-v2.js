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

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const report = new ScenarioReport('09-grn-runtime-v2');
  const matrix = [];
  const fin = await sessionForIdentityKey('FINANCE');
  const cc = await sessionForIdentityKey('COST_CONTROL');
  const aud = await sessionForIdentityKey('AUDITOR');
  const noAssign = await sessionForIdentityKey('NO_ASSIGN');
  const loc = deptFix.departmentA.locationId;
  const item = deptFix.departmentA.itemId;
  const uid = fin.user?.id;

  const scenarios = [
    { id: 'GRN-LIST', fn: (s) => apiRequest(API_BASE, 'GET', '/grn?take=5', null, s.token), actor: 'FINANCE' },
    { id: 'GRN-CREATE-VALIDATE', fn: async (s) => { const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-V2-${Date.now()}`, 'DRAFT'); return apiRequest(API_BASE, 'POST', `/grn/${g.id}/validate`, {}, s.token); }, actor: 'FINANCE' },
    { id: 'GRN-SUBMIT', fn: async (s) => { const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-SUB-${Date.now()}`, 'VALIDATED'); return apiRequest(API_BASE, 'POST', `/grn/${g.id}/submit`, {}, s.token); }, actor: 'FINANCE' },
    { id: 'GRN-APPROVE-CC', fn: async (s) => { const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-ACC-${Date.now()}`, 'PENDING_APPROVAL'); return apiRequest(API_BASE, 'POST', `/grn/${g.id}/approve`, { comment: FIXTURE_TAG }, s.token); }, actor: 'COST_CONTROL' },
    { id: 'GRN-REJECT-WRONG', fn: async (s) => { const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-REJ-${Date.now()}`, 'PENDING_APPROVAL'); return apiRequest(API_BASE, 'POST', `/grn/${g.id}/reject`, { reason: FIXTURE_TAG }, s.token); }, actor: 'AUDITOR' },
    { id: 'GRN-NO-ASSIGN', fn: async () => { const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-NA-${Date.now()}`, 'VALIDATED'); return apiRequest(API_BASE, 'POST', `/grn/${g.id}/submit`, {}, noAssign.token); }, actor: 'NO_ASSIGN' },
    { id: 'GRN-DOUBLE-SUBMIT', fn: async (s) => { const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-DS-${Date.now()}`, 'PENDING_APPROVAL'); return apiRequest(API_BASE, 'POST', `/grn/${g.id}/submit`, {}, s.token); }, actor: 'FINANCE' },
    { id: 'GRN-SEND-BACK', fn: async (s) => { const g = await seedGrn(HOTEL_A.id, uid, loc, item, `GRN-SB-${Date.now()}`, 'PENDING_APPROVAL'); return apiRequest(API_BASE, 'POST', `/grn/${g.id}/send-back`, { reason: FIXTURE_TAG }, s.token); }, actor: 'COST_CONTROL' },
  ];

  for (const sc of scenarios) {
    const actorMap = { FINANCE: fin, COST_CONTROL: cc, AUDITOR: aud, NO_ASSIGN: noAssign };
    const s = actorMap[sc.actor];
    if (!s?.ok) { report.blocked(sc.id, { reason: 'login' }); continue; }
    const res = await sc.fn(s);
    matrix.push({ id: sc.id, http: res.status, actor: sc.actor });
    const pass = res.status === 403 && sc.id.includes('NO-ASSIGN') ? true : res.status >= 200 && res.status < 400;
    report.add({ id: sc.id, result: pass ? 'PASS' : 'FAIL', http: res.status });
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'GRN_RUNTIME_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), matrix, note: 'Round 5 expanded — not full posting/WAC proof' }, null, 2));
  report.finish(path.join(REPORT_DIR, 'GRN_RUNTIME_HARNESS.json'));
  console.log('[09-grn-v2]', matrix.length, 'scenarios');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
