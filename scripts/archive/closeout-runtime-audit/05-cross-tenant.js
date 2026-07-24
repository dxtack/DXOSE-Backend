'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, HOTEL_B } = require('./lib/constants');
const { apiRequest, getSession, switchTenant } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { ScenarioReport } = require('./lib/scenario-report');
const { prisma } = require('./lib/evidence');

const RESOURCES = [
  { key: 'items', list: '/items', read: (id) => `/items/${id}`, mutate: null },
  { key: 'breakage', list: '/breakage', read: (id) => `/breakage/${id}`, mutate: (id) => ({ method: 'POST', path: `/breakage/${id}/approve`, body: { comment: 'xt' } }) },
  { key: 'getPass', list: '/get-passes', read: (id) => `/get-passes/${id}`, mutate: (id) => ({ method: 'POST', path: `/get-passes/${id}/submit`, body: { concurrencyVersion: 0 } }) },
  { key: 'grn', list: '/grn', read: (id) => `/grn/${id}`, mutate: null },
  { key: 'transfers', list: '/transfers', read: (id) => `/transfers/${id}`, mutate: null },
  { key: 'inventoryCount', list: '/inventory-count/sessions', read: (id) => `/inventory-count/sessions/${id}`, mutate: null },
  { key: 'audit', list: '/audit-log', read: null, mutate: null },
  { key: 'reports', list: '/reports/inventory/stock-summary', read: null, mutate: null },
  { key: 'dashboard', list: '/dashboard/summary', read: null, mutate: null },
];

async function sampleId(tenantId, key) {
  const map = {
    items: () => prisma.item.findFirst({ where: { tenantId }, select: { id: true } }),
    breakage: () => prisma.movementDocument.findFirst({ where: { tenantId, movementType: 'BREAKAGE' }, select: { id: true } }),
    getPass: () => prisma.getPass.findFirst({ where: { tenantId }, select: { id: true, concurrencyVersion: true } }),
    grn: () => prisma.grnImport.findFirst({ where: { tenantId }, select: { id: true } }),
    transfers: () => prisma.storeTransfer.findFirst({ where: { tenantId }, select: { id: true } }),
    inventoryCount: () => prisma.stockCountSession.findFirst({ where: { tenantId }, select: { id: true } }),
  };
  return map[key] ? map[key]() : null;
}

function classifyCross(http, direction) {
  if (http === 200 || http === 201) return { result: 'FAIL', leak: `P0_CROSS_TENANT_${direction}` };
  if ([401, 403, 404, 409, 422].includes(http)) return { result: 'PASS', leak: null };
  if (http === 500) return { result: 'FAIL', leak: 'UNEXPECTED_500' };
  return { result: 'NOT_APPLICABLE', leak: null };
}

async function main() {
  requireIdentitiesFile();
  const report = new ScenarioReport('05-cross-tenant');
  const results = [];

  const tokenA = await sessionForIdentityKey('FINANCE');
  const tokenB = await sessionForIdentityKey('FINANCE_B', HOTEL_B.slug);

  if (!tokenA.ok) {
    report.missingIdentities.push('FINANCE_A');
    report.blocked('XT-SETUP-A', { reason: 'finance_a_login' });
  }
  if (!tokenB.ok) {
    report.missingIdentities.push('FINANCE_B');
    report.blocked('XT-SETUP-B', { reason: 'finance_b_login' });
  }

  for (const res of RESOURCES) {
    const bSample = await sampleId(HOTEL_B.id, res.key);
    const aSample = await sampleId(HOTEL_A.id, res.key);

    if (tokenA.ok) {
      const listOwn = await apiRequest(API_BASE, 'GET', res.list, null, tokenA.token);
      results.push({ direction: 'A_token_A_list', resource: res.key, http: listOwn.status, ...classifyCross(listOwn.status, 'LIST') });
      report.add({
        id: `XT-A-LIST-${res.key}`,
        result: listOwn.status === 200 ? 'PASS' : listOwn.status === 404 && ['audit', 'reports'].includes(res.key) ? 'NOT_APPLICABLE' : listOwn.status === 500 ? 'FAIL' : 'FAIL',
        http: listOwn.status,
      });

      if (bSample?.id && res.read) {
        const readCross = await apiRequest(API_BASE, 'GET', res.read(bSample.id), null, tokenA.token);
        const verdict = classifyCross(readCross.status, 'READ');
        results.push({ direction: 'A_token_B_read', resource: res.key, targetId: bSample.id, http: readCross.status, ...verdict });
        report.add({ id: `XT-A-READ-B-${res.key}`, result: verdict.result, http: readCross.status, leak: verdict.leak });

        const wrongHeader = await apiRequest(API_BASE, 'GET', res.read(bSample.id), null, tokenA.token, { 'X-Tenant-Id': HOTEL_B.id });
        const vh = classifyCross(wrongHeader.status, 'WRONG_HEADER');
        results.push({ direction: 'A_token_wrong_X-Tenant-Id', resource: res.key, http: wrongHeader.status, ...vh });
        report.add({ id: `XT-A-WRONG-TENANT-${res.key}`, result: vh.result, http: wrongHeader.status });

        if (res.mutate) {
          const mut = res.mutate(bSample.id);
          if (bSample.concurrencyVersion != null) mut.body.concurrencyVersion = bSample.concurrencyVersion;
          const mutRes = await apiRequest(API_BASE, mut.method, mut.path, mut.body, tokenA.token);
          const vm = classifyCross(mutRes.status, 'MUTATE');
          results.push({ direction: 'A_token_B_mutate', resource: res.key, http: mutRes.status, ...vm });
          report.add({ id: `XT-A-MUT-B-${res.key}`, result: vm.result, http: mutRes.status, leak: vm.leak });
        }
      }
    }

    if (tokenB.ok && aSample?.id && res.read) {
      const readCross = await apiRequest(API_BASE, 'GET', res.read(aSample.id), null, tokenB.token);
      const verdict = classifyCross(readCross.status, 'READ_REVERSE');
      results.push({ direction: 'B_token_A_read', resource: res.key, targetId: aSample.id, http: readCross.status, ...verdict });
      report.add({ id: `XT-B-READ-A-${res.key}`, result: verdict.result, http: readCross.status, leak: verdict.leak });
    }
  }

  if (tokenA.ok && tokenB.ok) {
    const sw = await switchTenant(API_BASE, tokenB.token, HOTEL_A.slug);
    const stale = sw.status === 200 ? sw.data?.data?.accessToken : null;
    if (stale) {
      const bId = (await sampleId(HOTEL_B.id, 'items'))?.id;
      if (bId) {
        const afterSwitch = await apiRequest(API_BASE, 'GET', `/items/${bId}`, null, stale);
        const v = classifyCross(afterSwitch.status, 'STALE_AFTER_SWITCH');
        results.push({ direction: 'B_switched_to_A_then_B_resource', http: afterSwitch.status, ...v });
        report.add({ id: 'XT-STALE-TOKEN', result: v.result, http: afterSwitch.status });
      }
    }
  }

  const leaks = results.filter((r) => r.leak && r.leak.startsWith('P0'));
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_DIR, 'CROSS_TENANT_RESULTS.json'),
    JSON.stringify({ executedAt: new Date().toISOString(), operationCount: results.length, p0Leaks: leaks.length, results }, null, 2),
  );
  report.finish(path.join(REPORT_DIR, 'CROSS_TENANT_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
