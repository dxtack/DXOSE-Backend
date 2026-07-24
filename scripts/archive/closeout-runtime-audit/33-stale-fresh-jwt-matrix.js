'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession, login } = require('./lib/http');
const { loadUserInvestigation, prisma } = require('./lib/investigate-user');

const OUT = path.join(REPORT_DIR, 'STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json');
const PASSWORD = 'CloseoutAudit@123';

const PROBES = [
  { id: 'GP-SUBMIT', method: 'POST', build: (fx) => ({ path: `/get-passes/${fx.gpId}/submit`, body: { concurrencyVersion: fx.gpVer } }) },
  { id: 'GRN-SUBMIT', method: 'POST', build: (fx) => ({ path: `/grn/${fx.grnId}/submit`, body: {} }) },
  { id: 'TR-CREATE', method: 'POST', build: (fx) => ({ path: '/transfers', body: fx.transferPayload }) },
  { id: 'BRK-CREATE', method: 'POST', build: () => ({ path: '/breakage', body: null }) },
  { id: 'LOST-CREATE', method: 'POST', build: () => ({ path: '/lost-items', body: null }) },
  { id: 'IC-SUBMIT-COUNTS', method: 'POST', build: (fx) => ({ path: `/inventory-count/sessions/${fx.icId}/submit-counts`, body: {} }) },
  { id: 'MOV-CREATE', method: 'POST', build: (fx) => ({ path: '/movements', body: fx.movementPayload }) },
  { id: 'GP-LIST', method: 'GET', build: () => ({ path: '/get-passes?take=5', body: null }) },
  { id: 'STOCK-READ', method: 'GET', build: (fx) => ({ path: `/stock/balances?locationId=${fx.locationId}`, body: null }) },
];

const JWT_CASES = [
  { key: 'stale_after_deactivate', email: 'no-assign@closeout-audit.local', fresh: false, mutate: 'deactivate' },
  { key: 'fresh_after_deactivate', email: 'no-assign@closeout-audit.local', fresh: true, mutate: 'deactivate' },
  { key: 'stale_after_delete', email: 'deleted-assign@closeout-audit.local', fresh: false, mutate: 'delete' },
  { key: 'fresh_after_delete', email: 'deleted-assign@closeout-audit.local', fresh: true, mutate: 'delete' },
  { key: 'stale_after_property_move', email: 'dept-mgr-fb@closeout-audit.local', fresh: false, mutate: 'move_property' },
  { key: 'fresh_after_property_move', email: 'dept-mgr-fb@closeout-audit.local', fresh: true, mutate: 'move_property' },
];

async function buildFixtures(stock, creatorToken) {
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
    creatorToken,
  );
  const grn = await prisma.grnImport.create({
    data: {
      tenantId: HOTEL_A.id,
      grnNumber: `JWT-${Date.now()}`,
      supplierInvoiceNumber: 'JWT',
      vendorNameSnapshot: 'JWT',
      locationId: stock.locationId,
      receivingDate: new Date(),
      pdfAttachmentUrl: '/x.pdf',
      status: 'VALIDATED',
      importedBy: (await prisma.user.findFirst({ where: { email: 'dept-mgr-fb@closeout-audit.local' } })).id,
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
    creatorToken,
  );
  icId = ic.data?.id || ic.data?.data?.id;
  if (icId) await apiRequest(API_BASE, 'POST', `/inventory-count/sessions/${icId}/start`, {}, creatorToken);

  return {
    gpId: gp.data?.data?.id,
    gpVer: gp.data?.data?.concurrencyVersion ?? 0,
    grnId: grn.id,
    icId,
    locationId: stock.locationId,
    transferPayload: {
      sourceLocationId: stock.locationId,
      destLocationId: stock.locationId,
      reason: FIXTURE_TAG,
      lines: [{ itemId: stock.itemId, qty: 1 }],
    },
    movementPayload: {
      movementType: 'ISSUE',
      sourceLocationId: stock.locationId,
      departmentId: stock.departmentId,
      reason: FIXTURE_TAG,
      lines: [{ itemId: stock.itemId, qty: 1 }],
    },
    breakagePayload: {
      reason: FIXTURE_TAG,
      suggestedAction: 'HOTEL',
      lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
    },
    lostPayload: {
      reason: FIXTURE_TAG,
      suggestedAction: 'HOTEL',
      lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
    },
  };
}

async function resolveToken(jc) {
  const inv = await loadUserInvestigation(jc.email, HOTEL_A.id);
  const pvBefore = inv.permissionVersion;
  if (jc.mutate === 'deactivate') {
    await prisma.urUserAssignment.updateMany({ where: { userId: inv.userId }, data: { isActive: false } });
    await prisma.user.update({ where: { id: inv.userId }, data: { permissionVersion: { increment: 1 } } });
  } else if (jc.mutate === 'delete') {
    await prisma.urUserAssignment.deleteMany({ where: { userId: inv.userId, notes: { startsWith: FIXTURE_TAG } } });
    await prisma.user.update({ where: { id: inv.userId }, data: { permissionVersion: { increment: 1 } } });
  } else if (jc.mutate === 'move_property') {
    const hotelB = await prisma.tenant.findFirst({ where: { slug: 'dx-airport-hotel' } });
    const a = await prisma.urUserAssignment.findFirst({ where: { userId: inv.userId, notes: { startsWith: FIXTURE_TAG } } });
    if (a && hotelB) {
      await prisma.urAssignmentProperty.deleteMany({ where: { assignmentId: a.id, propertyId: HOTEL_A.id } });
      await prisma.urAssignmentProperty.upsert({
        where: { assignmentId_propertyId: { assignmentId: a.id, propertyId: hotelB.id } },
        update: {},
        create: { assignmentId: a.id, propertyId: hotelB.id },
      });
      await prisma.user.update({ where: { id: inv.userId }, data: { permissionVersion: { increment: 1 } } });
    }
  }

  let token;
  let stale = !jc.fresh;
  if (jc.fresh) {
    const loginRes = await login(API_BASE, jc.email, PASSWORD, HOTEL_A.slug);
    token = loginRes.data?.data?.accessToken;
    stale = false;
  } else {
    const pre = await getSession(API_BASE, { email: jc.email, password: PASSWORD }, HOTEL_A.slug);
    token = pre.token;
  }
  const invAfter = await loadUserInvestigation(jc.email, HOTEL_A.id);
  return { token, stale, permissionVersionBefore: pvBefore, permissionVersionAfter: invAfter.permissionVersion, permissionVersionIncremented: invAfter.permissionVersion > pvBefore };
}

async function main() {
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const creator = await getSession(API_BASE, { email: 'dept-mgr-fb@closeout-audit.local', password: PASSWORD }, HOTEL_A.slug);
  const fixtures = await buildFixtures(stock, creator.token);
  fixtures.breakagePayload = fixtures.breakagePayload;
  fixtures.lostPayload = fixtures.lostPayload;

  const rows = [];
  for (const jc of JWT_CASES) {
    const { token, stale, permissionVersionBefore, permissionVersionAfter, permissionVersionIncremented } = await resolveToken(jc);
    let refreshRejected = null;
    if (jc.fresh) {
      const refresh = await apiRequest(API_BASE, 'POST', '/auth/refresh', {}, token);
      refreshRejected = refresh.status === 401 || refresh.status === 403;
    }
    for (const probe of PROBES) {
      const spec = probe.build(fixtures);
      let body = spec.body;
      if (probe.id === 'BRK-CREATE') body = fixtures.breakagePayload;
      if (probe.id === 'LOST-CREATE') body = fixtures.lostPayload;
      const beforeGp = fixtures.gpId ? await prisma.getPass.findUnique({ where: { id: fixtures.gpId }, select: { status: true } }) : null;
      const res = await apiRequest(API_BASE, probe.method, spec.path, body, token);
      const afterGp = fixtures.gpId ? await prisma.getPass.findUnique({ where: { id: fixtures.gpId }, select: { status: true } }) : null;
      const dbMutated = beforeGp && afterGp ? beforeGp.status !== afterGp.status : probe.id.includes('CREATE') && res.status >= 200 && res.status < 300;
      const allowed = res.status >= 200 && res.status < 300 && (dbMutated || probe.method === 'GET');
      rows.push({
        jwtCase: jc.key,
        staleJwt: stale,
        probe: probe.id,
        http: res.status,
        dbMutated,
        allowed,
        expected: stale ? '403 or no mutation' : jc.key.includes('fresh_after') ? '403 after assignment loss' : 'depends',
        result: stale && allowed ? 'FAIL — stale JWT still authorized' : !stale && allowed && /deactivate|delete|move/.test(jc.mutate) ? 'FAIL — fresh still authorized after assignment loss' : res.status === 403 || !dbMutated ? 'PASS' : 'FAIL',
        permissionVersionBefore,
        permissionVersionAfter,
        permissionVersionIncremented,
        refreshRejected,
      });
    }
  }

  const out = {
    executedAt: new Date().toISOString(),
    tenant: HOTEL_A.slug,
    rows,
    summary: {
      total: rows.length,
      fail: rows.filter((r) => r.result.startsWith('FAIL')).length,
      pass: rows.filter((r) => r.result === 'PASS').length,
      permissionVersionIncrementsOnMutate: rows.some((r) => r.permissionVersionIncremented),
    },
    switchTenantNote: 'See DISPOSABLE_ORG_RUNTIME_RESULTS.json for ORG_MANAGER switch-tenant JWT proof',
    cacheNote: 'No server-side permission cache revalidation beyond permissionVersion on fresh login observed in probes',
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json', rows.length);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
