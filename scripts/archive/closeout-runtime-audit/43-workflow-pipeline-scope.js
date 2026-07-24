'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./lib/session-resolver');
const { resolveJwtSession } = require('./lib/jwt-session');
const { prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json');

const USER_KEYS = [
  'never_assigned',
  'deleted_assignment',
  'no_assign_inactive_ur',
  'inactive_assignment',
  'wrong_property',
  'dept_fb',
  'AUDITOR',
  'FINANCE',
  'COST_CONTROL',
  'STOREKEEPER',
  'DEPT_MANAGER_HK',
  'ORG_MANAGER',
];

const ENDPOINTS = [
  { name: 'list', path: '/workflow-pipeline' },
  { name: 'summary', path: '/workflow-pipeline/summary' },
  { name: 'alerts', path: '/workflow-pipeline/alerts' },
  { name: 'list_module_getpass', path: '/workflow-pipeline?module=GET_PASS' },
  { name: 'list_status_pending', path: '/workflow-pipeline?status=PENDING' },
  { name: 'list_take_10', path: '/workflow-pipeline?take=10' },
  { name: 'list_skip_10', path: '/workflow-pipeline?skip=10&take=10' },
];

function analyzeResponse(res, tenantId) {
  const payload = res.data?.data;
  const items = payload?.items || (Array.isArray(payload) ? payload : []);
  const list = Array.isArray(items) ? items : [];
  const tenantIds = [...new Set(list.map((x) => x.tenantId).filter(Boolean))];
  const deptIds = [...new Set(list.map((x) => x.departmentId).filter(Boolean))];
  const modules = [...new Set(list.map((x) => x.module || x.documentType).filter(Boolean))];
  const hasDetails = list.some((x) => x.title || x.description || x.amount != null);
  const total = payload?.total ?? payload?.count ?? list.length;
  return {
    returnedCount: list.length,
    totalMeta: total,
    sampleIds: list.slice(0, 10).map((x) => `${x.module || 'doc'}:${x.id || x.documentId}`),
    tenantIdsInResponse: tenantIds,
    departmentIdsInResponse: deptIds,
    modulesInResponse: modules,
    crossTenantIds: tenantIds.filter((t) => t !== tenantId),
    crossDepartmentExposure: deptIds.length > 1,
    dataDepth: hasDetails ? 'detail_fields' : list.length ? 'ids_and_metadata' : 'empty',
    scopeInterpretation:
      list.length === 0
        ? 'zero_scope'
        : tenantIds.length === 0
          ? 'property_wide_operational_list'
          : tenantIds.length === 1 && tenantIds[0] === tenantId
            ? 'single_property_operational'
            : 'cross_tenant_exposure',
  };
}

async function resolveUserSession(key) {
  if (['never_assigned', 'deleted_assignment', 'no_assign_inactive_ur', 'inactive_assignment', 'wrong_property', 'dept_fb'].includes(key)) {
    const map = {
      never_assigned: 'never_assigned',
      deleted_assignment: 'deleted_assignment',
      no_assign_inactive_ur: 'no_assign_inactive_ur',
      inactive_assignment: 'inactive_assignment',
      wrong_property: 'wrong_property',
      dept_fb: 'dept_fb',
    };
    const s = await resolveJwtSession(map[key] === 'dept_fb' ? 'fresh_after_deactivate' : map[key]);
    if (key === 'dept_fb') {
      return { ...(await sessionForIdentityKey('DEPT_MANAGER_FB')), userState: key, stale: false };
    }
    return { token: s.token, userState: key, stale: s.stale, assignments: s.activeAssignments };
  }
  if (key === 'stale_jwt') {
    const s = await resolveJwtSession('stale_after_delete');
    return { token: s.token, userState: key, stale: true };
  }
  if (key === 'fresh_jwt') {
    const s = await resolveJwtSession('fresh_after_delete');
    return { token: s.token, userState: key, stale: false };
  }
  const sess = await sessionForIdentityKey(key);
  return { token: sess.token, userState: key, role: key, ok: sess.ok };
}

function classify(row) {
  const hasGhAssignment = (row.activeAssignments || []).some((a) => a.isActive && (a.properties || []).includes('grand-horizon'));
  if (row.http === 403 || row.http === 401) return 'PASS';
  if (row.returnedCount === 0) return 'PASS';
  if (row.returnedCount > 0 && !hasGhAssignment && !row.userState?.includes('MANAGER') && row.userState !== 'AUDITOR') {
    return 'FAIL — Confirmed Read Scope Defect';
  }
  if (row.returnedCount > 0 && (row.userState === 'AUDITOR' || hasGhAssignment)) return 'PASS — authorized tenant-wide read';
  if (row.returnedCount > 0) return 'FAIL — Confirmed Read Scope Defect';
  return 'PASS';
}

async function main() {
  requireIdentitiesFile();
  const rows = [];
  const keys = [...USER_KEYS, 'stale_jwt', 'fresh_jwt'];

  for (const key of keys) {
    const sess = await resolveUserSession(key);
    if (!sess.token && key !== 'ORG_MANAGER') continue;
    let token = sess.token;
    if (key === 'ORG_MANAGER') {
      const org = await sessionForIdentityKey('ORG_MANAGER');
      if (!org.ok) continue;
      token = org.token;
    }
    for (const ep of ENDPOINTS) {
      const res = await apiRequest(API_BASE, 'GET', ep.path, null, token);
      const meta = analyzeResponse(res, HOTEL_A.id);
      const inv = sess.email ? null : null;
      rows.push({
        scenario: `${key}|${ep.name}`,
        endpoint: ep.path,
        userState: key,
        jwtMode: sess.stale ? 'stale' : 'fresh',
        http: res.status,
        ...meta,
        expected: '403 or empty without property assignment',
        finalClassification: classify({
          http: res.status,
          returnedCount: meta.returnedCount,
          userState: key,
          activeAssignments: sess.assignments,
        }),
      });
    }
  }

  const out = {
    executedAt: new Date().toISOString(),
    tenant: HOTEL_A.slug,
    blastRadius: {
      showsWholeProperty: rows.some((r) => r.scopeInterpretation === 'property_wide_operational_list' && r.returnedCount >= 10),
      showsOtherDepartments: rows.some((r) => r.crossDepartmentExposure),
      showsCrossTenant: rows.some((r) => r.crossTenantIds?.length > 0),
      exposesIdsOnly: rows.every((r) => r.dataDepth !== 'detail_fields' || r.returnedCount === 0),
    },
    rows,
    summary: {
      total: rows.length,
      fail: rows.filter((r) => r.finalClassification.startsWith('FAIL')).length,
      pass: rows.filter((r) => r.finalClassification.startsWith('PASS')).length,
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json', out.summary);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
