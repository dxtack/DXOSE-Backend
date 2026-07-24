'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { resolveJwtSession, verdictForRead, verdictForMutation } = require('./lib/jwt-session');
const { prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json');

const JWT_CASES = [
  { key: 'stale_after_deactivate', expectedDeny: true },
  { key: 'fresh_after_deactivate', expectedDeny: true },
  { key: 'stale_after_delete', expectedDeny: true },
  { key: 'fresh_after_delete', expectedDeny: true },
  { key: 'stale_after_property_move', expectedDeny: true },
  { key: 'fresh_after_property_move', expectedDeny: true },
  { key: 'refresh_after_bump', expectedDeny: true },
  { key: 'tenant_switch_after_removal', expectedDeny: true },
];

function extractPipeline(res) {
  const payload = res.data?.data;
  const items = payload?.items || (Array.isArray(payload) ? payload : []);
  const list = Array.isArray(items) ? items : [];
  return { returnedCount: list.length, sampleIds: list.slice(0, 5).map((x) => x.id || x.documentId) };
}

async function buildFixtures() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const creator = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const gp = await apiRequest(
    API_BASE,
    'POST',
    '/get-passes',
    {
      transferType: 'PERMANENT',
      borrowingEntity: FIXTURE_TAG,
      departmentId: stock.departmentId,
      reason: FIXTURE_TAG,
      lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
    },
    creator.token,
  );
  const gpId = gp.data?.data?.id;
  const gpVer = gp.data?.data?.concurrencyVersion ?? 0;
  const grn = await prisma.grnImport.create({
    data: {
      tenantId: HOTEL_A.id,
      grnNumber: `JWT-R7-${Date.now()}`,
      supplierInvoiceNumber: 'JWT',
      vendorNameSnapshot: 'JWT',
      locationId: stock.locationId,
      receivingDate: new Date(),
      pdfAttachmentUrl: '/x.pdf',
      status: 'VALIDATED',
      importedBy: creator.user.id,
      lines: {
        create: [{
          futurelogItemCode: 'J',
          futurelogDescription: 'J',
          futurelogUom: 'EA',
          orderedQty: 1,
          receivedQty: 1,
          unitPrice: 1,
          internalItemId: stock.itemId,
          conversionFactor: 1,
          qtyInBaseUnit: 1,
          isMapped: true,
        }],
      },
    },
  });
  let icId = null;
  const ic = await apiRequest(
    API_BASE,
    'POST',
    '/inventory-count/sessions',
    { departmentId: stock.departmentId, locationIds: [stock.locationId], blindMode: false, notes: FIXTURE_TAG },
    creator.token,
  );
  icId = ic.data?.id || ic.data?.data?.id;
  return { stock, gpId, gpVer, grnId: grn.id, icId, creatorToken: creator.token };
}

async function main() {
  const fx = await buildFixtures();
  const rows = [];
  const summary = [];

  const probes = [
    {
      id: 'WORKFLOW_PIPELINE_READ',
      type: 'read',
      run: async (token) => {
        const res = await apiRequest(API_BASE, 'GET', '/workflow-pipeline', null, token);
        const meta = extractPipeline(res);
        return { res, ...meta, mutation: false };
      },
    },
    {
      id: 'GP_SUBMIT',
      type: 'mutation',
      run: async (token) => {
        const d = await apiRequest(
          API_BASE,
          'POST',
          '/get-passes',
          {
            transferType: 'PERMANENT',
            borrowingEntity: FIXTURE_TAG,
            departmentId: fx.stock.departmentId,
            reason: FIXTURE_TAG,
            lines: [{ itemId: fx.stock.itemId, locationId: fx.stock.locationId, qty: 1, conditionOut: 'GOOD' }],
          },
          fx.creatorToken,
        );
        const id = d.data?.data?.id;
        const ver = d.data?.data?.concurrencyVersion ?? 0;
        const before = id ? await prisma.getPass.findUnique({ where: { id }, select: { status: true } }) : null;
        const res = await apiRequest(API_BASE, 'POST', `/get-passes/${id}/submit`, { concurrencyVersion: ver }, token);
        const after = id ? await prisma.getPass.findUnique({ where: { id }, select: { status: true } }) : null;
        return { res, returnedCount: 0, sampleIds: [], mutation: before?.status !== after?.status };
      },
    },
    {
      id: 'GP_APPROVE',
      type: 'mutation',
      run: async (token) => {
        if (!fx.gpId) return { res: { status: 0 }, mutation: false, returnedCount: 0, sampleIds: [] };
        const before = await prisma.getPass.findUnique({ where: { id: fx.gpId }, select: { status: true } });
        const res = await apiRequest(
          API_BASE,
          'POST',
          `/get-passes/${fx.gpId}/approve`,
          { comment: FIXTURE_TAG, concurrencyVersion: fx.gpVer },
          token,
        );
        const after = await prisma.getPass.findUnique({ where: { id: fx.gpId }, select: { status: true } });
        return { res, returnedCount: 0, sampleIds: [], mutation: before?.status !== after?.status };
      },
    },
    {
      id: 'GRN_SUBMIT',
      type: 'mutation',
      run: async (token) => {
        const g = await prisma.grnImport.findUnique({ where: { id: fx.grnId }, select: { concurrencyVersion: true, status: true } });
        const before = g?.status;
        const res = await apiRequest(API_BASE, 'POST', `/grn/${fx.grnId}/submit`, { concurrencyVersion: g?.concurrencyVersion ?? 0 }, token);
        const after = (await prisma.grnImport.findUnique({ where: { id: fx.grnId }, select: { status: true } }))?.status;
        return { res, returnedCount: 0, sampleIds: [], mutation: before !== after };
      },
    },
    {
      id: 'TRANSFER_CREATE',
      type: 'mutation',
      run: async (token) => {
        const res = await apiRequest(
          API_BASE,
          'POST',
          '/transfers',
          {
            sourceLocationId: fx.stock.locationId,
            destLocationId: fx.stock.locationId,
            reason: FIXTURE_TAG,
            lines: [{ itemId: fx.stock.itemId, qty: 1 }],
          },
          token,
        );
        return { res, returnedCount: 0, sampleIds: [], mutation: res.status >= 200 && res.status < 300 };
      },
    },
    {
      id: 'LOST_CREATE',
      type: 'mutation',
      run: async (token) => {
        const res = await apiRequest(
          API_BASE,
          'POST',
          '/lost-items',
          {
            reason: FIXTURE_TAG,
            suggestedAction: 'HOTEL',
            lines: [{ itemId: fx.stock.itemId, locationId: fx.stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
          },
          token,
        );
        return { res, returnedCount: 0, sampleIds: [], mutation: res.status === 201 };
      },
    },
    {
      id: 'BREAKAGE_CREATE',
      type: 'mutation',
      run: async (token) => {
        const res = await apiRequest(
          API_BASE,
          'POST',
          '/breakage',
          {
            reason: FIXTURE_TAG,
            suggestedAction: 'HOTEL',
            lines: [{ itemId: fx.stock.itemId, locationId: fx.stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
          },
          token,
        );
        return { res, returnedCount: 0, sampleIds: [], mutation: res.status === 201 };
      },
    },
    {
      id: 'IC_SUBMIT_COUNTS',
      type: 'mutation',
      run: async (token) => {
        if (!fx.icId) return { res: { status: 0 }, mutation: false, returnedCount: 0, sampleIds: [] };
        const res = await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${fx.icId}/submit-counts`, {}, token);
        return { res, returnedCount: 0, sampleIds: [], mutation: res.status >= 200 && res.status < 300 };
      },
    },
    {
      id: 'MOVEMENT_CREATE',
      type: 'mutation',
      run: async (token) => {
        const res = await apiRequest(
          API_BASE,
          'POST',
          '/movements',
          {
            movementType: 'ISSUE',
            sourceLocationId: fx.stock.locationId,
            departmentId: fx.stock.departmentId,
            reason: FIXTURE_TAG,
            lines: [{ itemId: fx.stock.itemId, qty: 1 }],
          },
          token,
        );
        return { res, returnedCount: 0, sampleIds: [], mutation: res.status >= 200 && res.status < 300 };
      },
    },
    {
      id: 'REPORT_STOCK_SUMMARY',
      type: 'read',
      run: async (token) => {
        const res = await apiRequest(API_BASE, 'GET', '/reports/inventory/stock-summary', null, token);
        const payload = res.data?.data;
        const rows = payload?.rows || payload?.items || (Array.isArray(payload) ? payload : []);
        const list = Array.isArray(rows) ? rows : [];
        return { res, returnedCount: list.length, sampleIds: [], mutation: false };
      },
    },
  ];

  for (const jc of JWT_CASES) {
    const sess = await resolveJwtSession(jc.key);
    for (const probe of probes) {
      const out = await probe.run(sess.token);
      const expected = jc.expectedDeny ? '403 or empty/no mutation' : 'authorized';
      const verdict =
        probe.type === 'read'
          ? verdictForRead({ http: out.res.status, returnedCount: out.returnedCount, mutation: out.mutation, expectedDeny: jc.expectedDeny })
          : verdictForMutation({ http: out.res.status, mutation: out.mutation, expectedDeny: jc.expectedDeny });

      const row = {
        scenario: `${jc.key}|${probe.id}`,
        jwtCase: jc.key,
        probe: probe.id,
        expected,
        actual: `HTTP ${out.res.status}${out.returnedCount ? ` rows=${out.returnedCount}` : ''}${out.mutation ? ' mutated' : ''}`,
        http: out.res.status,
        returnedRows: out.returnedCount,
        returnedIds: out.sampleIds,
        mutation: out.mutation,
        staleJwt: sess.stale,
        permissionVersionIncremented: sess.permissionVersionIncremented,
        refreshRejected: sess.refreshRejected,
        finalVerdict: verdict,
      };
      rows.push(row);
      summary.push({
        scenario: row.scenario,
        expected: row.expected,
        actual: row.actual,
        http: row.http,
        returnedRows: row.returnedRows,
        mutation: row.mutation,
        finalVerdict: row.finalVerdict,
      });
    }
  }

  const failCount = rows.filter((r) => r.finalVerdict === 'FAIL').length;
  const passCount = rows.filter((r) => r.finalVerdict === 'PASS').length;

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        round: 7,
        policy: 'Data exposure or unauthorized mutation after assignment loss/stale JWT = FAIL',
        rows,
        summaryTable: summary,
        totals: { pass: passCount, fail: failCount, total: rows.length },
        note: 'Stale pipeline reads with returnedRows>0 classified FAIL (read scope defect), not PASS',
      },
      null,
      2,
    ),
  );
  console.log('Wrote STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json', failCount, 'FAIL', passCount, 'PASS');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
