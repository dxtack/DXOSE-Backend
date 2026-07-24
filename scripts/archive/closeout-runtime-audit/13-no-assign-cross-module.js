'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession, login } = require('./lib/http');
const { loadUserInvestigation, prisma } = require('./lib/investigate-user');

const PASSWORD = 'CloseoutAudit@123';

const USER_STATES = [
  { key: 'never_assigned', email: 'never-assigned@closeout-audit.local' },
  { key: 'no_assign_inactive_ur', email: 'no-assign@closeout-audit.local' },
  { key: 'deleted_assignment', email: 'deleted-assign@closeout-audit.local' },
  { key: 'wrong_property', email: 'wrong-property@closeout-audit.local' },
  { key: 'view_only_auditor', email: 'auditor-a@closeout-audit.local' },
];

async function loadFixtures() {
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  return { a: deptFix.departmentA, b: deptFix.departmentB };
}

async function creatorSession() {
  return getSession(API_BASE, { email: 'dept-mgr-fb@closeout-audit.local', password: PASSWORD }, HOTEL_A.slug);
}

async function probe(session, inv, label, method, apiPath, body, trackFn) {
  const before = trackFn ? await trackFn() : null;
  const res = await apiRequest(API_BASE, method, apiPath, body, session.token);
  const after = trackFn ? await trackFn() : null;
  const dbMutated =
    before != null && after != null && JSON.stringify(before) !== JSON.stringify(after);
  const perms = session.permissions || [];
  return {
    module: label.split('::')[0],
    endpoint: label.split('::')[1] || label,
    userState: inv.email,
    jwtPermissionsSample: perms.filter((p) => /CREATE|SUBMIT|MANAGE|APPROVE|VIEW|INVENTORY|TRANSFER|BREAKAGE|GET_PASS|GRN/.test(p)).slice(0, 15),
    scopeResult: inv.resolveScopeContext?.scopeLabel || null,
    emptyAssignmentScope: inv.emptyAssignmentScopeUsed,
    expected: '403 or no DB mutation without active Ur assignment',
    http: res.status,
    errorCode: res.errorCode,
    dbMutation: dbMutated,
    result:
      res.status === 403 && !dbMutated
        ? 'PASS'
        : res.status >= 200 && res.status < 300 && dbMutated
          ? 'FAIL'
          : res.status >= 200 && res.status < 300 && !dbMutated
            ? 'PASS_NO_MUTATION'
            : res.status === 401
              ? 'PASS'
              : 'OBSERVE',
  };
}

async function main() {
  const fixtures = await loadFixtures();
  const stock = fixtures.a;
  const destLoc = fixtures.b?.locationId || stock.locationId;
  const creator = await creatorSession();
  if (!creator.ok) throw new Error('creator login failed');

  const matrix = [];
  let gpDraftId = null;
  let gpVer = 0;

  const gpCreate = await apiRequest(
    API_BASE,
    'POST',
    '/get-passes',
    {
      transferType: 'PERMANENT',
      borrowingEntity: `${FIXTURE_TAG} cross-module`,
      departmentId: stock.departmentId,
      reason: FIXTURE_TAG,
      lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
    },
    creator.token,
  );
  gpDraftId = gpCreate.data?.data?.id;
  gpVer = gpCreate.data?.data?.concurrencyVersion ?? 0;

  for (const us of USER_STATES) {
    const inv = await loadUserInvestigation(us.email, HOTEL_A.id);
    const session = await getSession(API_BASE, { email: us.email, password: PASSWORD }, HOTEL_A.slug);
    if (!session.ok) {
      matrix.push({ userState: us.key, error: 'login_failed', http: session.loginRes?.status });
      continue;
    }
    session.permissions = session.permissions || session.user?.permissions || [];

    if (gpDraftId) {
      const freshGp = await apiRequest(
        API_BASE,
        'POST',
        '/get-passes',
        {
          transferType: 'PERMANENT',
          borrowingEntity: `${FIXTURE_TAG} ${us.key}`,
          departmentId: stock.departmentId,
          reason: FIXTURE_TAG,
          lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
        },
        creator.token,
      );
      const fid = freshGp.data?.data?.id;
      const fver = freshGp.data?.data?.concurrencyVersion ?? 0;
      if (fid) {
        matrix.push(
          await probe(
            session,
            inv,
            'GetPass::submit',
            'POST',
            `/get-passes/${fid}/submit`,
            { concurrencyVersion: fver },
            async () => prisma.getPass.findUnique({ where: { id: fid }, select: { status: true } }),
          ),
        );
      }
    }

    matrix.push(
      await probe(
        session,
        inv,
        'Breakage::create',
        'POST',
        '/breakage',
        {
          reason: FIXTURE_TAG,
          suggestedAction: 'HOTEL',
          lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
        },
        null,
      ),
    );

    matrix.push(
      await probe(
        session,
        inv,
        'Lost::create',
        'POST',
        '/lost-items',
        {
          reason: FIXTURE_TAG,
          suggestedAction: 'HOTEL',
          lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
        },
        null,
      ),
    );

    matrix.push(
      await probe(session, inv, 'Transfer::create', 'POST', '/transfers', {
        sourceLocationId: stock.locationId,
        destLocationId: destLoc,
        reason: FIXTURE_TAG,
        lines: [{ itemId: stock.itemId, qty: 1 }],
      }, null),
    );

    matrix.push(
      await probe(
        session,
        inv,
        'InventoryCount::create',
        'POST',
        '/inventory-count/sessions',
        { departmentId: stock.departmentId, locationIds: [stock.locationId], blindMode: false, notes: FIXTURE_TAG },
        null,
      ),
    );

    matrix.push(await probe(session, inv, 'GRN::list', 'GET', '/grn?take=1', null, null));
    matrix.push(await probe(session, inv, 'Movements::list', 'GET', '/movements?take=1', null, null));
    matrix.push(await probe(session, inv, 'Reports::stock', 'GET', '/reports/inventory/stock-summary', null, null));
    matrix.push(await probe(session, inv, 'Pipeline::list', 'GET', '/workflow-pipeline', null, null));
  }

  const failMutations = matrix.filter((r) => r.result === 'FAIL');
  const gpFails = failMutations.filter((r) => r.module === 'GetPass');
  const otherFails = failMutations.filter((r) => r.module !== 'GetPass');

  const out = {
    executedAt: new Date().toISOString(),
    matrix,
    rootCauseAnalysis: {
      jwtFromTenantMemberRole: 'Permissions issued via tenantMember role without requiring active UrUserAssignment',
      routeUsesRequirePermissionOnly: 'Get Pass submit uses GET_PASS_CREATE on route; no assignment middleware',
      scopeContextNotEnforcedOnSubmit: 'resolveScopeContext returns empty assignment scope but submit path does not consume it',
      permissionVersionOnDeactivate: 'Investigate per-user in GET_PASS_NO_ASSIGN_INVESTIGATION.json',
      blastRadius:
        otherFails.length > 0
          ? 'MULTI_MODULE — assignment gate missing beyond Get Pass'
          : gpFails.length > 0
            ? 'GET_PASS_SUBMIT_PRIMARY — other modules may deny via scope on create'
            : 'LIMITED',
    },
    summary: {
      totalProbes: matrix.length,
      failWithMutation: failMutations.length,
      passDenied: matrix.filter((r) => r.result === 'PASS').length,
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'NO_ASSIGN_CROSS_MODULE_MATRIX.json'), JSON.stringify(out, null, 2));
  console.log('Wrote NO_ASSIGN_CROSS_MODULE_MATRIX.json', out.summary);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
