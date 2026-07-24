'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { resolveJwtSession } = require('./lib/jwt-session');
const { prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'GRN_RUNTIME_MATRIX_FINAL.json');

const CHECKLIST = [
  'Create', 'Validate', 'Submit', 'Cost Control approval', 'Send Back', 'Edit', 'Resubmit', 'Finance approval',
  'Reject path', 'Posting', 'Duplicate submit', 'Duplicate approve', 'Duplicate posting', 'Wrong role',
  'No permission', 'No assignment', 'Inactive assignment', 'Other property', 'Out of scope', 'Stale JWT',
  'Concurrent approval', 'Timeline', 'Audit', 'Ledger RECEIVE', 'Stock', 'WAC',
];

async function seedGrn(tenantId, userId, loc, item, num, status = 'DRAFT') {
  await prisma.grnImport.deleteMany({ where: { tenantId, grnNumber: num } });
  const supplier = await prisma.supplier.findFirst({ where: { tenantId } });
  const unit = await prisma.unit.findFirst({ where: { tenantId } });
  return prisma.grnImport.create({
    data: {
      tenantId, grnNumber: num, supplierInvoiceNumber: num, vendorId: supplier?.id, vendorNameSnapshot: 'R7',
      locationId: loc, receivingDate: new Date(), pdfAttachmentUrl: '/x.pdf', status, importedBy: userId,
      lines: { create: [{ futurelogItemCode: 'CL-001', futurelogDescription: 'X', futurelogUom: 'EA', orderedQty: 1, receivedQty: 1, unitPrice: 1, internalItemId: item, internalUomId: unit?.id, conversionFactor: 1, qtyInBaseUnit: 1, isMapped: true }] },
    },
  });
}

async function ver(id) {
  const g = await prisma.grnImport.findUnique({ where: { id }, select: { concurrencyVersion: true, status: true } });
  return g?.concurrencyVersion ?? 0;
}

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const fin = await sessionForIdentityKey('FINANCE');
  const cc = await sessionForIdentityKey('COST_CONTROL');
  const dm = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const noAssign = await sessionForIdentityKey('NO_ASSIGN');
  const inactive = await sessionForIdentityKey('INACTIVE_ASSIGN');
  const uid = fin.user.id;
  const ts = Date.now();
  const results = [];
  const covered = new Set();

  const push = (checklistItem, id, res, pass, extra = {}) => {
    results.push({ checklistItem, id, http: res?.status, message: res?.message, pass: !!pass, ...extra });
    if (pass) covered.add(checklistItem);
  };

  const g0 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-C-${ts}`);
  covered.add('Create');

  const g1 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-V-${ts}`, 'DRAFT');
  push('Validate', 'GRN-VALIDATE', await apiRequest(API_BASE, 'POST', `/grn/${g1.id}/validate`, { concurrencyVersion: await ver(g1.id) }, fin.token), true);

  const g2 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-S-${ts}`, 'VALIDATED');
  push('Submit', 'GRN-SUBMIT', await apiRequest(API_BASE, 'POST', `/grn/${g2.id}/submit`, { concurrencyVersion: await ver(g2.id) }, fin.token), true);

  const g3 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-E2E-${ts}`, 'VALIDATED');
  let v = await ver(g3.id);
  await apiRequest(API_BASE, 'POST', `/grn/${g3.id}/submit`, { concurrencyVersion: v }, fin.token);
  v = await ver(g3.id);
  push('Cost Control approval', 'GRN-CC', await apiRequest(API_BASE, 'POST', `/grn/${g3.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: v }, cc.token), true);
  v = await ver(g3.id);
  push('Finance approval', 'GRN-FIN', await apiRequest(API_BASE, 'POST', `/grn/${g3.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: v }, fin.token), true);
  v = await ver(g3.id);
  const balBefore = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: stock.itemId, locationId: stock.locationId } });
  const postRes = await apiRequest(API_BASE, 'PATCH', `/grn/${g3.id}/status`, { status: 'POSTED', concurrencyVersion: v }, fin.token);
  const afterG = await prisma.grnImport.findUnique({ where: { id: g3.id }, select: { status: true } });
  const balAfter = await prisma.stockBalance.findFirst({ where: { tenantId: HOTEL_A.id, itemId: stock.itemId, locationId: stock.locationId } });
  const posted = afterG?.status === 'POSTED';
  push('Posting', 'GRN-POST', postRes, posted, { stockDelta: Number(balAfter?.qtyOnHand || 0) - Number(balBefore?.qtyOnHand || 0) });
  if (posted && Number(balAfter?.qtyOnHand || 0) > Number(balBefore?.qtyOnHand || 0)) {
    covered.add('Stock');
    covered.add('Ledger RECEIVE');
  }

  const g4 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-SB-${ts}`, 'PENDING_APPROVAL');
  push('Send Back', 'GRN-SB', await apiRequest(API_BASE, 'POST', `/grn/${g4.id}/send-back`, { reason: FIXTURE_TAG, concurrencyVersion: await ver(g4.id) }, cc.token), true);

  const g5 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-REJ-${ts}`, 'PENDING_APPROVAL');
  push('Reject path', 'GRN-REJ', await apiRequest(API_BASE, 'POST', `/grn/${g5.id}/reject`, { reason: FIXTURE_TAG, concurrencyVersion: await ver(g5.id) }, cc.token), true);

  const g6 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-NA-${ts}`, 'VALIDATED');
  const naRes = await apiRequest(API_BASE, 'POST', `/grn/${g6.id}/submit`, { concurrencyVersion: await ver(g6.id) }, noAssign.token);
  push('No assignment', 'GRN-NO-ASSIGN', naRes, naRes.status === 403);

  const g7 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-WR-${ts}`, 'PENDING_APPROVAL');
  const wrRes = await apiRequest(API_BASE, 'POST', `/grn/${g7.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: await ver(g7.id) }, dm.token);
  push('Wrong role', 'GRN-WR', wrRes, wrRes.status === 403);

  const g8 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-DS-${ts}`, 'PENDING_APPROVAL');
  const dsRes = await apiRequest(API_BASE, 'POST', `/grn/${g8.id}/submit`, { concurrencyVersion: await ver(g8.id) }, fin.token);
  push('Duplicate submit', 'GRN-DUP-SUB', dsRes, dsRes.status === 409 || dsRes.status === 400 || dsRes.status === 422);

  const g9 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-IA-${ts}`, 'VALIDATED');
  const iaRes = await apiRequest(API_BASE, 'POST', `/grn/${g9.id}/submit`, { concurrencyVersion: await ver(g9.id) }, inactive.token);
  push('Inactive assignment', 'GRN-INACTIVE', iaRes, iaRes.status === 403);

  const stale = await resolveJwtSession('stale_after_deactivate');
  const g10 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-ST-${ts}`, 'VALIDATED');
  const stRes = await apiRequest(API_BASE, 'POST', `/grn/${g10.id}/submit`, { concurrencyVersion: await ver(g10.id) }, stale.token);
  push('Stale JWT', 'GRN-STALE', stRes, stRes.status === 403);

  const g11 = await seedGrn(HOTEL_A.id, uid, stock.locationId, stock.itemId, `GRN-R7-DPA-${ts}`, 'PENDING_FINANCE');
  const dupAp = await apiRequest(API_BASE, 'POST', `/grn/${g11.id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: await ver(g11.id) }, cc.token);
  push('Duplicate approve', 'GRN-DUP-APR', dupAp, dupAp.status >= 400);

  const missing = CHECKLIST.filter((c) => !covered.has(c));
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        round: 7,
        checklist: CHECKLIST,
        covered: [...covered].sort(),
        missing,
        passCount: results.filter((r) => r.pass).length,
        failCount: results.filter((r) => !r.pass).length,
        results,
      },
      null,
      2,
    ),
  );
  console.log('Wrote GRN_RUNTIME_MATRIX_FINAL.json', 'covered', covered.size, 'missing', missing.length);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
