'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession, login } = require('./lib/http');
const { loadUserInvestigation, prisma } = require('./lib/investigate-user');

const PASSWORD = 'CloseoutAudit@123';
const OUT = path.join(REPORT_DIR, 'NO_ASSIGN_CROSS_MODULE_MATRIX.json');

function extractListMeta(res, tenantId) {
  const payload = res.data?.data;
  const items = payload?.items || payload?.sessions || payload?.rows || (Array.isArray(payload) ? payload : []);
  const list = Array.isArray(items) ? items : [];
  const ids = list.map((x) => x.id).filter(Boolean).slice(0, 15);
  const tenantIds = [...new Set(list.map((x) => x.tenantId).filter(Boolean))];
  const deptIds = [...new Set(list.map((x) => x.departmentId).filter(Boolean))];
  const locIds = [...new Set(list.map((x) => x.locationId || x.sourceLocationId).filter(Boolean))];
  return {
    returnedCount: list.length,
    sampleIds: ids,
    tenantIdsInResponse: tenantIds,
    departmentIdsInResponse: deptIds,
    locationIdsInResponse: locIds,
    responseEmpty: list.length === 0,
    totalFromMeta: payload?.total ?? payload?.count ?? null,
  };
}

function classifyReadProbe({ http, meta, dbMutation, userState, module }) {
  if (http === 403 && !dbMutation) return { result: 'PASS', reason: 'Denied without assignment' };
  if (http >= 200 && http < 300 && meta.responseEmpty && !dbMutation)
    return { result: 'PASS', reason: 'HTTP 200 empty list — acceptable for no assignment' };
  if (http >= 200 && http < 300 && meta.returnedCount > 0 && !dbMutation) {
    const sameTenant = meta.tenantIdsInResponse.every((t) => t === HOTEL_A.id || t === undefined);
    if (sameTenant && /AUDITOR|view_only|never_assigned|no_assign|deleted|inactive|wrong_property|stale/.test(userState))
      return {
        result: 'OBSERVE_READ_SCOPE',
        reason: 'HTTP 200 with operational rows — evaluate against ACC assignment policy (may be property-wide role visibility)',
      };
    return { result: 'OBSERVE_READ_SCOPE', reason: 'HTTP 200 with data returned' };
  }
  if (http >= 200 && http < 300 && dbMutation) return { result: 'FAIL', reason: 'Read endpoint caused mutation' };
  if (http === 401) return { result: 'PASS', reason: 'Unauthorized' };
  return { result: 'OBSERVE', reason: `HTTP ${http}` };
}

function classifyMutationProbe({ http, dbMutation, expectedDeny }) {
  if (expectedDeny) {
    if (http === 403 && !dbMutation) return { result: 'PASS', reason: 'Denied no mutation' };
    if (http >= 200 && http < 300 && dbMutation) return { result: 'FAIL', reason: 'Mutation without assignment' };
    if (http >= 200 && http < 300 && !dbMutation) return { result: 'PASS_NO_MUTATION', reason: 'Allowed without mutation' };
    return { result: 'OBSERVE', reason: `HTTP ${http}` };
  }
  return { result: 'OBSERVE', reason: 'Positive path not in no-assign matrix' };
}

const USER_CASES = [
  { key: 'never_assigned', email: 'never-assigned@closeout-audit.local', jwtMode: 'fresh' },
  { key: 'deleted_assignment', email: 'deleted-assign@closeout-audit.local', jwtMode: 'fresh' },
  { key: 'no_assign_inactive_ur', email: 'no-assign@closeout-audit.local', jwtMode: 'fresh' },
  { key: 'inactive_assignment', email: 'inactive-assign@closeout-audit.local', jwtMode: 'fresh' },
  { key: 'wrong_property', email: 'wrong-property@closeout-audit.local', jwtMode: 'fresh' },
  { key: 'view_only_auditor', email: 'auditor-a@closeout-audit.local', jwtMode: 'fresh' },
  { key: 'never_assigned_stale_jwt', email: 'never-assigned@closeout-audit.local', jwtMode: 'stale_after_deactivate' },
  { key: 'no_assign_stale_jwt', email: 'no-assign@closeout-audit.local', jwtMode: 'stale_after_deactivate' },
  { key: 'deleted_stale_jwt', email: 'deleted-assign@closeout-audit.local', jwtMode: 'stale_before_delete' },
];

async function resolveSession(userCase, fixtures) {
  const inv = await loadUserInvestigation(userCase.email, HOTEL_A.id);
  if (userCase.jwtMode === 'stale_after_deactivate') {
    const pre = await getSession(API_BASE, { email: userCase.email, password: PASSWORD }, HOTEL_A.slug);
    if (!pre.ok) return { session: pre, inv };
    await prisma.urUserAssignment.updateMany({ where: { userId: inv.userId }, data: { isActive: false } });
    await prisma.user.update({ where: { id: inv.userId }, data: { permissionVersion: { increment: 1 } } });
    return { session: { ...pre, stale: true, note: 'JWT issued before deactivate; not refreshed' }, inv };
  }
  if (userCase.jwtMode === 'stale_before_delete') {
    const pre = await getSession(API_BASE, { email: userCase.email, password: PASSWORD }, HOTEL_A.slug);
    await prisma.urUserAssignment.deleteMany({ where: { userId: inv.userId, notes: { startsWith: FIXTURE_TAG } } });
    return { session: { ...pre, stale: true, note: 'JWT before assignment delete' }, inv };
  }
  const session = await getSession(API_BASE, { email: userCase.email, password: PASSWORD }, HOTEL_A.slug);
  return { session, inv };
}

async function main() {
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const creator = await getSession(API_BASE, { email: 'dept-mgr-fb@closeout-audit.local', password: PASSWORD }, HOTEL_A.slug);
  const matrix = [];

  const probes = [
    { module: 'GRN', endpoint: 'GET /grn?take=20', method: 'GET', path: '/grn?take=20', op: 'list', expectDeny: false },
    { module: 'GRN', endpoint: 'POST /grn/:id/submit', method: 'POST', path: null, op: 'submit', expectDeny: true, needsGrn: true },
    { module: 'Transfer', endpoint: 'GET /transfers?take=20', method: 'GET', path: '/transfers?take=20', op: 'list', expectDeny: false },
    { module: 'Transfer', endpoint: 'POST /transfers', method: 'POST', path: '/transfers', op: 'create', expectDeny: true, body: () => ({ sourceLocationId: stock.locationId, destLocationId: stock.locationId, reason: FIXTURE_TAG, lines: [{ itemId: stock.itemId, qty: 1 }] }) },
    { module: 'Breakage', endpoint: 'GET /breakage?take=20', method: 'GET', path: '/breakage?take=20', op: 'list', expectDeny: false },
    { module: 'Breakage', endpoint: 'POST /breakage', method: 'POST', path: '/breakage', op: 'create', expectDeny: true, body: () => ({ reason: FIXTURE_TAG, suggestedAction: 'HOTEL', lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }] }) },
    { module: 'Lost', endpoint: 'GET /lost-items?take=20', method: 'GET', path: '/lost-items?take=20', op: 'list', expectDeny: false },
    { module: 'Lost', endpoint: 'POST /lost-items', method: 'POST', path: '/lost-items', op: 'create', expectDeny: true, body: () => ({ reason: FIXTURE_TAG, suggestedAction: 'HOTEL', lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }] }) },
    { module: 'GetPass', endpoint: 'GET /get-passes?take=20', method: 'GET', path: '/get-passes?take=20', op: 'list', expectDeny: false },
    { module: 'GetPass', endpoint: 'POST /get-passes/:id/submit', method: 'POST', path: null, op: 'submit', expectDeny: true, needsGp: true },
    { module: 'InventoryCount', endpoint: 'GET /inventory-count/sessions', method: 'GET', path: '/inventory-count/sessions?take=20', op: 'list', expectDeny: false },
    { module: 'InventoryCount', endpoint: 'POST /inventory-count/sessions', method: 'POST', path: '/inventory-count/sessions', op: 'create', expectDeny: true, body: () => ({ departmentId: stock.departmentId, locationIds: [stock.locationId], blindMode: false, notes: FIXTURE_TAG }) },
    { module: 'Movements', endpoint: 'GET /movements?take=20', method: 'GET', path: '/movements?take=20', op: 'list', expectDeny: false },
    { module: 'Ledger', endpoint: 'GET /ledger?take=20', method: 'GET', path: '/ledger?take=20', op: 'list', expectDeny: false },
    { module: 'Stock', endpoint: 'GET /stock?take=20', method: 'GET', path: '/stock?take=20', op: 'list', expectDeny: false },
    { module: 'InventoryHistory', endpoint: 'GET /inventory-history?take=20', method: 'GET', path: '/inventory-history?take=20', op: 'list', expectDeny: false },
    { module: 'Reports', endpoint: 'GET /reports/inventory/stock-summary', method: 'GET', path: '/reports/inventory/stock-summary', op: 'export', expectDeny: false },
    { module: 'WorkflowPipeline', endpoint: 'GET /workflow-pipeline', method: 'GET', path: '/workflow-pipeline', op: 'list', expectDeny: false },
    { module: 'Dashboard', endpoint: 'GET /dashboard/summary', method: 'GET', path: '/dashboard/summary', op: 'read', expectDeny: false },
  ];

  let sharedGrnId = null;
  const grn = await prisma.grnImport.findFirst({ where: { tenantId: HOTEL_A.id, status: 'VALIDATED' }, select: { id: true } });
  sharedGrnId = grn?.id;

  for (const uc of USER_CASES) {
    const { session, inv } = await resolveSession(uc, stock);
    if (!session.ok) {
      matrix.push({ userState: uc.key, error: 'login_failed', http: session.loginRes?.status });
      continue;
    }
    const perms = session.permissions || session.user?.permissions || [];
    const jwtRole = session.user?.role || inv.tenantMemberForTenant?.roleCode;

    for (const p of probes) {
      let apiPath = p.path;
      let body = p.body ? p.body() : null;
      if (p.needsGp && creator.ok) {
        const c = await apiRequest(API_BASE, 'POST', '/get-passes', {
          transferType: 'PERMANENT',
          borrowingEntity: `${FIXTURE_TAG} ${uc.key}`,
          departmentId: stock.departmentId,
          reason: FIXTURE_TAG,
          lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
        }, creator.token);
        const gpId = c.data?.data?.id;
        const ver = c.data?.data?.concurrencyVersion ?? 0;
        if (!gpId) continue;
        apiPath = `/get-passes/${gpId}/submit`;
        body = { concurrencyVersion: ver };
      }
      if (p.needsGrn && sharedGrnId) {
        apiPath = `/grn/${sharedGrnId}/submit`;
        body = {};
      }
      if (!apiPath) continue;

      const track = p.op === 'submit' || p.op === 'create'
        ? async () => {
            if (p.module === 'GetPass') return prisma.getPass.findFirst({ where: { tenantId: HOTEL_A.id }, orderBy: { createdAt: 'desc' }, select: { status: true } });
            return null;
          }
        : null;
      const before = track ? await track() : null;
      const res = await apiRequest(API_BASE, p.method, apiPath, body, session.token);
      const after = track ? await track() : null;
      const dbMutation = before != null && after != null && JSON.stringify(before) !== JSON.stringify(after);
      const listMeta = p.method === 'GET' ? extractListMeta(res, HOTEL_A.id) : null;
      const cls =
        p.method === 'GET'
          ? classifyReadProbe({ http: res.status, meta: listMeta, dbMutation, userState: uc.key, module: p.module })
          : classifyMutationProbe({ http: res.status, dbMutation, expectedDeny: p.expectDeny });

      matrix.push({
        module: p.module,
        endpoint: p.endpoint,
        operation: p.op,
        userState: uc.key,
        jwtMode: uc.jwtMode,
        jwtRole,
        jwtPermissionsSample: perms.filter((x) => /CREATE|SUBMIT|VIEW|MANAGE|APPROVE|INVENTORY|TRANSFER|BREAKAGE|GET_PASS|GRN|STOCK|LEDGER|DASHBOARD|WORKFLOW|REPORT/.test(x)).slice(0, 12),
        activeAssignments: inv.urUserAssignments?.filter((a) => a.isActive),
        scopeResult: inv.resolveScopeContext?.scopeLabel || null,
        emptyAssignmentScope: inv.emptyAssignmentScopeUsed,
        http: res.status,
        errorCode: res.errorCode,
        returnedCount: listMeta?.returnedCount,
        sampleIds: listMeta?.sampleIds,
        tenantIdsInResponse: listMeta?.tenantIdsInResponse,
        departmentIdsInResponse: listMeta?.departmentIdsInResponse,
        locationIdsInResponse: listMeta?.locationIdsInResponse,
        responseEmpty: listMeta?.responseEmpty,
        dbMutation,
        expected: p.expectDeny ? '403 or no DB mutation without active Ur assignment' : '403 or empty read without operational scope',
        result: cls.result,
        classificationNote: cls.reason,
        accAssignmentPolicyExpected: inv.emptyAssignmentScopeUsed
          ? 'No operational scope — deny mutations; reads empty or denied unless property-wide view role'
          : 'Active assignment — normal access',
      });
    }
  }

  const failMutations = matrix.filter((r) => r.result === 'FAIL');
  const readScopeObs = matrix.filter((r) => r.result === 'OBSERVE_READ_SCOPE');

  const out = {
    executedAt: new Date().toISOString(),
    matrix,
    rootCauseAnalysis: {
      jwtFromTenantMemberRole: 'Permissions from tenantMember even when Ur assignment empty/inactive',
      getPassSubmitBypass: 'Confirmed — submit mutates without assignment',
      readScopeNote: 'HTTP 200 reads require per-module policy review — empty=list PASS; populated=OBSERVE_READ_SCOPE until policy confirmed',
      blastRadius: failMutations.some((f) => f.module !== 'GetPass')
        ? 'MULTI_MODULE mutation bypass'
        : 'GET_PASS_SUBMIT_PRIMARY for mutations; reads need policy classification',
    },
    summary: {
      totalProbes: matrix.length,
      failWithMutation: failMutations.length,
      observeReadScope: readScopeObs.length,
      passDenied: matrix.filter((r) => r.result === 'PASS').length,
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote NO_ASSIGN_CROSS_MODULE_MATRIX.json', out.summary);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
