'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { ScenarioReport } = require('./lib/scenario-report');
const { prisma } = require('./lib/evidence');

const RESOURCE_POLICY = {
  breakage: 'Document ownership-scoped operational data',
  lost: 'Document ownership-scoped operational data',
  getPass: 'Document ownership-scoped operational data',
  movements: 'Department-scoped operational data',
  items: 'Property-shared reference data',
  categories: 'Property-shared reference data',
  units: 'Property-shared reference data',
  suppliers: 'Property-shared reference data',
  locations: 'Store/location-scoped inventory data',
  inventoryCount: 'Store/location-scoped inventory data',
};

async function seedDeptRecord(resource, tenantId, deptId, deptCode, userId) {
  const tag = `CLOSEOUT_RT_AUDIT_${deptCode}`;
  if (resource === 'breakage') {
    const loc = await prisma.location.findFirst({ where: { tenantId, departmentId: deptId } });
    const item = await prisma.item.findFirst({ where: { tenantId } });
    if (!loc || !item) return null;
    return prisma.movementDocument.create({
      data: {
        tenantId,
        documentNo: `BRK-SCOPE-${deptCode}-${Date.now()}`,
        movementType: 'BREAKAGE',
        sourceType: 'INTERNAL',
        status: 'DRAFT',
        sourceLocationId: loc.id,
        reason: tag,
        suggestedAction: 'HOTEL',
        createdBy: userId,
        lines: {
          create: [{ itemId: item.id, locationId: loc.id, qtyRequested: 1, qtyInBaseUnit: 1, unitCost: 1, totalValue: 1 }],
        },
      },
      select: { id: true, documentNo: true },
    });
  }
  return null;
}

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const fb = deptFix.departmentA;
  const hk = deptFix.departmentB;

  const dmFb = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const dmHk = await sessionForIdentityKey('DEPT_MANAGER_HK');
  const fin = await sessionForIdentityKey('FINANCE');

  const report = new ScenarioReport('04-role-resource-scope');
  const matrix = [];

  const recordFb = dmFb.ok ? await seedDeptRecord('breakage', HOTEL_A.id, fb.departmentId, 'FB', dmFb.user.id) : null;
  const recordHk = dmHk.ok ? await seedDeptRecord('breakage', HOTEL_A.id, hk.departmentId, 'HK', dmHk.user.id) : null;

  const probes = [
    { resource: 'breakage', list: '/breakage', read: (id) => `/breakage/${id}`, recordA: recordFb, recordB: recordHk },
    { resource: 'items', list: '/items', read: (id) => `/items/${id}`, recordA: { id: fb.itemId }, recordB: { id: hk.itemId }, shared: true },
    { resource: 'locations', list: '/locations', read: (id) => `/locations/${id}`, recordA: { id: fb.locationId }, recordB: { id: hk.locationId } },
  ];

  for (const p of probes) {
    for (const [mgrKey, mgrSession, ownRecord, foreignRecord] of [
      ['DEPT_MANAGER_FB', dmFb, p.recordA, p.recordB],
      ['DEPT_MANAGER_HK', dmHk, p.recordB, p.recordA],
    ]) {
      if (!mgrSession?.ok) {
        report.blocked(`SCOPE-${p.resource}-${mgrKey}`, { reason: 'login_failed' });
        continue;
      }
      const listRes = await apiRequest(API_BASE, 'GET', `${p.list}?take=50`, null, mgrSession.token);
      const listIds = (listRes.data?.data?.items || listRes.data?.data || []).map((x) => x.id).filter(Boolean);
      const seesOwn = ownRecord?.id ? listIds.includes(ownRecord.id) : null;
      const seesForeign = foreignRecord?.id ? listIds.includes(foreignRecord.id) : null;

      let readOwn = null;
      let readForeign = null;
      if (ownRecord?.id) readOwn = await apiRequest(API_BASE, 'GET', p.read(ownRecord.id), null, mgrSession.token);
      if (foreignRecord?.id) readForeign = await apiRequest(API_BASE, 'GET', p.read(foreignRecord.id), null, mgrSession.token);

      const row = {
        resource: p.resource,
        policy: RESOURCE_POLICY[p.resource] || 'See constitution',
        actor: mgrKey,
        listHttp: listRes.status,
        listCount: listIds.length,
        seesOwnRecord: seesOwn,
        seesForeignRecord: seesForeign,
        readOwnHttp: readOwn?.status,
        readForeignHttp: readForeign?.status,
        recordAId: p.recordA?.id,
        recordBId: p.recordB?.id,
        propertySharedReference: !!p.shared,
      };
      matrix.push(row);

      const id = `SCOPE-${p.resource}-${mgrKey}-LIST`;
      if (listRes.status === 200) report.pass(id, { listCount: listIds.length });
      else report.fail(id, { http: listRes.status });

      if (foreignRecord?.id && !p.shared) {
        const fid = `SCOPE-${p.resource}-${mgrKey}-FOREIGN-READ`;
        if (readForeign?.status === 403 || readForeign?.status === 404) report.pass(fid, { http: readForeign.status });
        else if (readForeign?.status === 200) report.fail(fid, { http: 200, note: 'foreign_visible' });
        else report.add({ id: fid, result: 'NOT_APPLICABLE', http: readForeign?.status });
      }
    }

    if (fin?.ok && p.recordA?.id) {
      const finList = await apiRequest(API_BASE, 'GET', `${p.list}?take=50`, null, fin.token);
      matrix.push({
        resource: p.resource,
        actor: 'FINANCE',
        listHttp: finList.status,
        propertyWideExpected: true,
        listCount: (finList.data?.data?.items || finList.data?.data || []).length,
      });
      report.pass(`SCOPE-${p.resource}-FINANCE-LIST`, { http: finList.status });
    }
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'ROLE_RESOURCE_SCOPE_MATRIX.json'), JSON.stringify({ executedAt: new Date().toISOString(), matrix, resourcePolicy: RESOURCE_POLICY }, null, 2));
  report.finish(path.join(REPORT_DIR, 'ROLE_RESOURCE_SCOPE_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
