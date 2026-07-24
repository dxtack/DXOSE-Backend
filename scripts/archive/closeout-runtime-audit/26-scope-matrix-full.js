'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'ROLE_RESOURCE_SCOPE_MATRIX.json');

const POLICIES = {
  items: 'Property-shared reference data',
  departments: 'Property reference',
  categories: 'Property reference',
  units: 'Property reference',
  suppliers: 'Property reference',
  locations: 'Store/location-scoped',
  movements: 'Department-scoped operational',
  inventoryCount: 'Store/location-scoped',
  grn: 'Document/location scoped',
  transfer: 'Document/location scoped',
  breakage: 'Document-owner-scoped',
  lost: 'Document-owner-scoped',
  getPass: 'Document-owner-scoped',
  ledger: 'Location scope for dept roles; property-wide for control roles',
  stock: 'Location scope for dept; property-wide for control',
  inventoryHistory: 'Derived from movement scope',
  reports: 'Derived scope — property-wide for control roles',
  workflowPipeline: 'Property-wide pipeline view',
  dashboard: 'Property-wide summary',
};

const RESOURCES = [
  { key: 'items', list: '/items?take=20', read: (id) => `/items/${id}` },
  { key: 'departments', list: '/departments?take=20', read: (id) => `/departments/${id}` },
  { key: 'categories', list: '/categories?take=20', read: (id) => `/categories/${id}` },
  { key: 'units', list: '/units?take=20', read: (id) => `/units/${id}` },
  { key: 'suppliers', list: '/suppliers?take=20', read: (id) => `/suppliers/${id}` },
  { key: 'locations', list: '/locations?take=20', read: (id) => `/locations/${id}` },
  { key: 'movements', list: '/movements?take=20', read: (id) => `/movements/${id}` },
  { key: 'inventoryCount', list: '/inventory-count/sessions?take=20', read: (id) => `/inventory-count/sessions/${id}` },
  { key: 'grn', list: '/grn?take=20', read: (id) => `/grn/${id}` },
  { key: 'transfer', list: '/transfers?take=20', read: (id) => `/transfers/${id}` },
  { key: 'breakage', list: '/breakage?take=20', read: (id) => `/breakage/${id}` },
  { key: 'lost', list: '/lost-items?take=20', read: (id) => `/lost-items/${id}` },
  { key: 'getPass', list: '/get-passes?take=20', read: (id) => `/get-passes/${id}` },
  { key: 'ledger', list: '/ledger?take=20', read: null },
  { key: 'stock', list: '/stock?take=20', read: null },
  { key: 'inventoryHistory', list: '/inventory-history?take=20', read: null },
  { key: 'reports', list: '/reports/inventory/stock-summary', read: null },
  { key: 'workflowPipeline', list: '/workflow-pipeline', read: null },
  { key: 'dashboard', list: '/dashboard/summary', read: null },
];

const ROLES = [
  'DEPT_MANAGER_FB',
  'DEPT_MANAGER_HK',
  'DEPT_CREATOR_FB',
  'STOREKEEPER',
  'FINANCE',
  'COST_CONTROL',
  'GM',
  'ORG_MANAGER',
  'AUDITOR',
  'NO_ASSIGN',
  'INACTIVE_ASSIGN',
];

async function main() {
  requireIdentitiesFile();
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const fb = deptFix.departmentA;
  const hk = deptFix.departmentB;
  const readIds = {
    items: { own: fb.itemId, foreign: hk.itemId },
    locations: { own: fb.locationId, foreign: hk.locationId },
    departments: { own: fb.departmentId, foreign: hk.departmentId },
  };
  const matrix = [];

  for (const roleKey of ROLES) {
    const session = await sessionForIdentityKey(roleKey === 'INACTIVE_ASSIGN' ? 'INACTIVE_ASSIGN' : roleKey);
    if (!session.ok && roleKey !== 'INACTIVE_ASSIGN') {
      matrix.push({ role: roleKey, error: 'login_failed' });
      continue;
    }
    const sess = roleKey === 'INACTIVE_ASSIGN' ? await sessionForIdentityKey('INACTIVE_ASSIGN') : session;
    if (!sess.ok) continue;

    for (const res of RESOURCES) {
      const listRes = await apiRequest(API_BASE, 'GET', res.list, null, sess.token);
      const listData = listRes.data?.data?.items || listRes.data?.data || [];
      const count = Array.isArray(listData) ? listData.length : 0;
      let readOwn = null;
      let readForeign = null;
      const ids = readIds[res.key];
      if (res.read && ids?.own) readOwn = await apiRequest(API_BASE, 'GET', res.read(ids.own), null, sess.token);
      if (res.read && ids?.foreign) readForeign = await apiRequest(API_BASE, 'GET', res.read(ids.foreign), null, sess.token);

      matrix.push({
        role: roleKey,
        resource: res.key,
        policy: POLICIES[res.key],
        operation: 'list',
        http: listRes.status,
        returnedCount: count,
        result: listRes.status === 403 ? 'DENIED' : listRes.status === 200 ? 'ALLOWED' : `HTTP_${listRes.status}`,
      });
      if (readOwn) {
        matrix.push({
          role: roleKey,
          resource: res.key,
          policy: POLICIES[res.key],
          operation: 'read_own_id',
          http: readOwn.status,
          result: readOwn.status === 200 ? 'ALLOWED' : readOwn.status === 403 ? 'DENIED' : `HTTP_${readOwn.status}`,
        });
      }
      if (readForeign) {
        matrix.push({
          role: roleKey,
          resource: res.key,
          policy: POLICIES[res.key],
          operation: 'read_foreign_dept_id',
          http: readForeign.status,
          result: readForeign.status === 200 ? 'ALLOWED_CROSS' : readForeign.status === 403 ? 'DENIED' : `HTTP_${readForeign.status}`,
        });
      }
    }
  }

  const byResource = {};
  for (const r of RESOURCES) byResource[r.key] = matrix.filter((m) => m.resource === r.key).length;

  const out = {
    executedAt: new Date().toISOString(),
    totalScenarios: matrix.length,
    scenariosPerResource: byResource,
    roles: ROLES.length,
    resources: RESOURCES.length,
    matrix,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, 'ROLE_RESOURCE_SCOPE_HARNESS.json'), JSON.stringify({ script: '26-scope-matrix-full', total: matrix.length, harnessExit: 0 }, null, 2));
  console.log('Wrote ROLE_RESOURCE_SCOPE_MATRIX.json', matrix.length, 'scenarios');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
