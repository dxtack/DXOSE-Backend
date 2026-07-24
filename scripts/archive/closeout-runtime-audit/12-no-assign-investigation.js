'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession, login } = require('./lib/http');
const { loadUserInvestigation, prisma } = require('./lib/investigate-user');
const { ScenarioReport } = require('./lib/scenario-report');

const PASSWORD = 'CloseoutAudit@123';

async function probeAction(label, session, method, apiPath, body) {
  const beforeStatus = body?._trackId
    ? await prisma.getPass.findUnique({ where: { id: body._trackId }, select: { status: true } }).catch(() => null)
    : null;
  const res = await apiRequest(API_BASE, method, apiPath, body, session.token);
  const afterStatus = body?._trackId
    ? await prisma.getPass.findUnique({ where: { id: body._trackId }, select: { status: true } }).catch(() => null)
    : null;
  return {
    label,
    http: res.status,
    errorCode: res.errorCode,
    message: res.message,
    dbMutated: beforeStatus && afterStatus ? beforeStatus.status !== afterStatus.status : null,
    responseSnippet: typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 300) : String(res.data).slice(0, 300),
  };
}

async function createDraftGetPass(creatorToken, stock, deptId) {
  const res = await apiRequest(
    API_BASE,
    'POST',
    '/get-passes',
    {
      transferType: 'PERMANENT',
      borrowingEntity: `${FIXTURE_TAG} no-assign probe`,
      departmentId: deptId,
      reason: FIXTURE_TAG,
      lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
    },
    creatorToken,
  );
  return {
    id: res.data?.data?.id,
    concurrencyVersion: res.data?.data?.concurrencyVersion ?? 0,
    createdBy: res.data?.data?.createdBy,
    http: res.status,
  };
}

async function main() {
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const report = new ScenarioReport('12-no-assign-investigation');

  const userStates = [
    { key: 'never_assigned', email: `never-assigned@closeout-audit.local`, expected: 403 },
    { key: 'no_assign_inactive_ur', email: `no-assign@closeout-audit.local`, expected: 403 },
    { key: 'inactive_assignment', email: `inactive-assign@closeout-audit.local`, expected: 403 },
    { key: 'deleted_assignment', email: `deleted-assign@closeout-audit.local`, expected: 403 },
    { key: 'wrong_property', email: `wrong-property@closeout-audit.local`, expected: 403 },
    { key: 'view_only_auditor', email: `auditor-a@closeout-audit.local`, expected: 403 },
  ];

  const investigations = {};
  const matrix = [];

  const creatorLogin = await getSession(
    API_BASE,
    { email: 'dept-mgr-fb@closeout-audit.local', password: PASSWORD },
    HOTEL_A.slug,
  );
  if (!creatorLogin.ok) throw new Error('Creator login failed');

  for (const state of userStates) {
    const inv = await loadUserInvestigation(state.email, HOTEL_A.id);
    investigations[state.key] = inv;

    const loginRes = await getSession(API_BASE, { email: state.email, password: PASSWORD }, HOTEL_A.slug);
    if (!loginRes.ok) {
      matrix.push({ userState: state.key, error: 'login_failed', http: loginRes.loginRes?.status });
      report.blocked(`NA-${state.key}-LOGIN`, { http: loginRes.loginRes?.status });
      continue;
    }

    const jwtPerms = loginRes.permissions || loginRes.user?.permissions || [];
    const scope = inv.resolveScopeContext;

    const draft = await createDraftGetPass(creatorLogin.token, stock, stock.departmentId);
    const submitRes = await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${draft.id}/submit`,
      { concurrencyVersion: draft.concurrencyVersion },
      loginRes.token,
    );
    const gpAfter = draft.id
      ? await prisma.getPass.findUnique({ where: { id: draft.id }, select: { status: true, createdBy: true } })
      : null;
    const dbMutated = gpAfter?.status !== 'DRAFT';

    const row = {
      userState: state.key,
      userId: inv.userId,
      jwtRole: loginRes.user?.role,
      jwtPermissions: jwtPerms,
      permissionVersion: inv.permissionVersion,
      scopeResult: scope,
      emptyAssignmentScopeUsed: inv.emptyAssignmentScopeUsed,
      documentCreatedBy: draft.createdBy,
      actorIsCreator: draft.createdBy === inv.userId,
      expected: `HTTP ${state.expected} + zero DB mutation for submit on foreign doc`,
      http: submitRes.status,
      errorCode: submitRes.errorCode,
      dbBefore: 'DRAFT',
      dbAfter: gpAfter?.status,
      dbMutated,
      result:
        submitRes.status === state.expected && !dbMutated
          ? 'PASS'
          : submitRes.status === 200 && dbMutated
            ? 'FAIL'
            : submitRes.status === 403 && !dbMutated
              ? 'PASS'
              : 'FAIL',
      classification:
        submitRes.status === 200 && dbMutated && !inv.urUserAssignments?.some((a) => a.isActive)
          ? 'Confirmed Product Runtime Authorization/Scope Defect'
          : null,
    };
    matrix.push(row);
    report.add({
      id: `NA-GP-SUBMIT-${state.key}`,
      result: row.result,
      http: submitRes.status,
      classification: row.classification,
    });

    const brk = await apiRequest(
      API_BASE,
      'POST',
      '/breakage',
      {
        reason: FIXTURE_TAG,
        suggestedAction: 'HOTEL',
        lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
      },
      loginRes.token,
    );
    matrix.push({
      userState: state.key,
      module: 'breakage_create',
      http: brk.status,
      errorCode: brk.errorCode,
      result: brk.status === 403 ? 'PASS' : brk.status === 201 ? 'OBSERVED_ALLOWED' : 'FAIL',
    });
    report.add({
      id: `NA-BRK-CREATE-${state.key}`,
      result: brk.status === 403 ? 'PASS' : brk.status === 201 ? 'FAIL' : 'NOT_APPLICABLE',
      http: brk.status,
    });
  }

  const staleTokenProbe = await loadUserInvestigation('no-assign@closeout-audit.local', HOTEL_A.id);
  const freshLogin = await login(API_BASE, 'no-assign@closeout-audit.local', PASSWORD, HOTEL_A.slug);
  let staleJwtTest = { note: 'not_run' };
  if (freshLogin.status === 200) {
    await prisma.urUserAssignment.updateMany({ where: { userId: staleTokenProbe.userId }, data: { isActive: false } });
    const draft2 = await createDraftGetPass(creatorLogin.token, stock, stock.departmentId);
    const staleSubmit = await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${draft2.id}/submit`,
      { concurrencyVersion: draft2.concurrencyVersion },
      freshLogin.data.data.accessToken,
    );
    const newLogin = await login(API_BASE, 'no-assign@closeout-audit.local', PASSWORD, HOTEL_A.slug);
    const draft3 = await createDraftGetPass(creatorLogin.token, stock, stock.departmentId);
    const newSubmit = newLogin.status === 200
      ? await apiRequest(
          API_BASE,
          'POST',
          `/get-passes/${draft3.id}/submit`,
          { concurrencyVersion: draft3.concurrencyVersion },
          newLogin.data.data.accessToken,
        )
      : { status: 0 };
    staleJwtTest = {
      staleTokenAfterDeactivateAssignment: { http: staleSubmit.status },
      freshTokenAfterReLogin: { http: newSubmit.status },
    };
    matrix.push({
      userState: 'stale_vs_fresh_jwt',
      ...staleJwtTest,
    });
  }

  const primary = matrix.find((r) => r.userState === 'no_assign_inactive_ur' && r.dbMutated);
  const out = {
    executedAt: new Date().toISOString(),
    tag: FIXTURE_TAG,
    routeUnderTest: 'POST /api/get-passes/:id/submit requires GET_PASS_CREATE only (no assignment middleware)',
    primaryFinding: primary?.classification || null,
    investigations,
    matrix,
    staleJwtTest,
    crossModuleSummary: {
      getPassSubmitBypassWithInactiveAssignment: matrix.some(
        (r) => r.userState === 'no_assign_inactive_ur' && r.classification?.includes('Defect'),
      ),
      breakageCreateAllowedWithoutAssignment: matrix.some(
        (r) => r.module === 'breakage_create' && r.result === 'OBSERVED_ALLOWED',
      ),
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'GET_PASS_NO_ASSIGN_INVESTIGATION.json'), JSON.stringify(out, null, 2));
  report.finish(path.join(REPORT_DIR, 'NO_ASSIGN_INVESTIGATION_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
