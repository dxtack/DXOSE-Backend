'use strict';

/**
 * Phase 4 — Workflow Timeline & Lifecycle Labels Integrity gate (strict, no skipped passes).
 * Usage: node Governance/phase-4-workflow-timeline/phase-4-workflow-timeline-gate.cjs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GOV_DIR = __dirname;
const BACKEND = path.join(__dirname, '../../OSE-backend');
const API_BASE = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const CHILD_SLUG = 'closeout-audit-hotel-disposable';
const EMAIL = 'p4-org_manager@phase4-timeline-gate.local';
const PASSWORD = 'Phase4Gate@123';

const { apiRequest, getSession, switchTenant } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/http'));
const prisma = require(path.join(BACKEND, 'src/config/database'));
const {
  mapUserFacingState,
  isEditableUserState,
  SEND_BACK_NOTES_MARKER,
} = require(path.join(BACKEND, 'src/platform/lifecyclePresentation.service'));
const {
  buildApprovalStepsFromAccChain,
  buildGetPassTimelineRawEntries,
} = require(path.join(BACKEND, 'src/platform/timeline/getPassTimeline.builder'));
const { buildTimelineEntries } = require(path.join(BACKEND, 'src/platform/timeline/timelineEntry.merge'));
const {
  loadFixtures,
  countLifecycle,
  assertMonotonicOrder,
  assertExactNormalizedOrder,
  assertModuleTimeline,
  findSendBackEntry,
  findResubmitEntry,
  normalizeTimeline,
  timelineEntriesFromResponse,
} = require('./phase-4-timeline-assertions.lib.cjs');

const scenarios = [];
const regression = [];

function record(id, name, pass, detail = {}) {
  scenarios.push({ id, name, pass, skipped: false, ...detail });
  return pass;
}

function recordRegression(name, pass, detail = {}) {
  regression.push({ name, pass, ...detail });
  return pass;
}

function failRequired(id, name, reason, detail = {}) {
  return record(id, name, false, { reason, ...detail });
}

async function fetchTimeline(token, moduleKey, id) {
  return apiRequest(API_BASE, 'GET', `/constitution/timeline/${moduleKey}/${id}`, null, token);
}

function runInProcessScenarios() {
  record(
    'P4-LC-01',
    'Send Back GRN maps to Sent Back not Returned',
    mapUserFacingState('GRN', 'DRAFT', { notes: `${SEND_BACK_NOTES_MARKER} fix qty` }) === 'Sent Back',
  );
  record(
    'P4-LC-02',
    'Send Back Get Pass maps to Sent Back not Returned',
    mapUserFacingState('GET_PASS', 'DRAFT', { notes: `${SEND_BACK_NOTES_MARKER} reason` }) === 'Sent Back',
  );
  record(
    'P4-LC-03',
    'Get Pass physical RETURNED maps to Closed not Sent Back',
    mapUserFacingState('GET_PASS', 'RETURNED', { notes: '' }) === 'Closed',
  );
  record('P4-LC-04', 'Sent Back is editable user state', isEditableUserState('Sent Back') && !isEditableUserState('Returned'));
  record('P4-LC-05', 'Posted GRN remains Posted', mapUserFacingState('GRN', 'POSTED', {}) === 'Posted');

  const v4Steps = buildApprovalStepsFromAccChain([
    { stepOrder: 1, statusKey: 'PENDING_DEPT' },
    { stepOrder: 2, statusKey: 'PENDING_COST_CONTROL' },
    { stepOrder: 3, statusKey: 'PENDING_FINANCE' },
    { stepOrder: 4, statusKey: 'PENDING_SECURITY' },
  ]);
  record(
    'P4-GP-01',
    'Get Pass v4 ACC chain excludes GM step',
    v4Steps.length === 4 && !v4Steps.some((s) => s.stageKey === 'GENERAL_MANAGER'),
  );

  const gpV4 = {
    id: 'gp-v4',
    status: 'PENDING_SECURITY',
    deptApprovedAt: new Date('2026-06-01T10:00:00Z'),
    costControlApprovedAt: new Date('2026-06-01T11:00:00Z'),
    financeApprovedAt: new Date('2026-06-01T12:00:00Z'),
    deptApprover: { id: 'u1', firstName: 'A', lastName: 'B' },
    costControlApprover: { id: 'u2', firstName: 'C', lastName: 'D' },
    financeApprover: { id: 'u3', firstName: 'E', lastName: 'F' },
  };
  const v4Entries = buildTimelineEntries([buildGetPassTimelineRawEntries(gpV4, [], { approvalSteps: v4Steps })]);
  record('P4-GP-02', 'Get Pass v4 timeline has no GM approval step', !v4Entries.some((e) => e.stageKey === 'GENERAL_MANAGER'));

  const v3Steps = buildApprovalStepsFromAccChain([
    { stepOrder: 1, statusKey: 'PENDING_DEPT' },
    { stepOrder: 2, statusKey: 'PENDING_COST_CONTROL' },
    { stepOrder: 3, statusKey: 'PENDING_FINANCE' },
    { stepOrder: 4, statusKey: 'PENDING_GM' },
    { stepOrder: 5, statusKey: 'PENDING_SECURITY' },
  ]);
  const gpV3 = { ...gpV4, status: 'PENDING_GM', gmApprovedAt: null, financeApprovedAt: new Date('2026-06-01T12:00:00Z') };
  const v3Entries = buildTimelineEntries([buildGetPassTimelineRawEntries(gpV3, [], { approvalSteps: v3Steps })]);
  record('P4-GP-03', 'Historical Get Pass v3 timeline retains GM step', v3Entries.some((e) => e.stageKey === 'GENERAL_MANAGER'));

  const sendBackAudit = {
    id: 'sb1',
    action: 'SEND_BACK',
    changedAt: new Date('2026-06-02T10:00:00Z'),
    changedBy: 'u2',
    changedByUser: { firstName: 'Cost', lastName: 'User' },
    note: '[Send Back] | Fix lines',
  };
  const gpSendBack = buildTimelineEntries([
    buildGetPassTimelineRawEntries({ id: 'gp-sb', status: 'DRAFT', notes: '[Send Back] | Fix lines' }, [sendBackAudit], { approvalSteps: v4Steps }),
  ]);
  record(
    'P4-GP-04',
    'Get Pass Send Back lifecycle distinct from RETURN_PROCESSED',
    countLifecycle(gpSendBack, 'SEND_BACK') === 1 && !gpSendBack.some((e) => e.stageKey === 'RETURN_PROCESSED'),
  );

  const resubmitAudit = {
    id: 'rs1',
    action: 'SUBMIT',
    note: 'GET_PASS_RESUBMIT after send back',
    changedAt: new Date('2026-06-03T10:00:00Z'),
    changedBy: 'u1',
    changedByUser: { firstName: 'Creator', lastName: 'User' },
  };
  const initialSubmitAudit = {
    id: 'sb0',
    action: 'SUBMIT',
    changedAt: new Date('2026-06-01T09:00:00Z'),
    changedBy: 'u1',
    changedByUser: { firstName: 'Creator', lastName: 'User' },
  };
  const gpResubmit = buildTimelineEntries([
    buildGetPassTimelineRawEntries(
      { id: 'gp-rs', status: 'PENDING_DEPT', notes: '[Send Back] fixed' },
      [initialSubmitAudit, sendBackAudit, resubmitAudit],
      { approvalSteps: v4Steps },
    ),
  ]);
  record('P4-GP-05', 'Resubmitted lifecycle event present', countLifecycle(gpResubmit, 'RESUBMIT') === 1);
  record('P4-GP-06', 'Original submit preserved with resubmit', countLifecycle(gpResubmit, 'SUBMIT_FOR_APPROVAL') === 1);
  record('P4-GP-07', 'Reject terminal — no pending future steps', !buildTimelineEntries([
    buildGetPassTimelineRawEntries(
      { id: 'gp-rej', status: 'REJECTED', deptApprovedAt: new Date(), deptApprover: { id: 'u1', firstName: 'D', lastName: 'U' }, rejectionReason: 'No budget', updatedAt: new Date() },
      [{ id: 'rj', action: 'REJECT', changedAt: new Date(), changedBy: 'u2', changedByUser: { firstName: 'C', lastName: 'C' } }],
      { approvalSteps: v4Steps },
    ),
  ]).some((e) => e.entryType === 'APPROVAL_STEP_FUTURE'));
  record('P4-GP-08', 'Reject has exactly one REJECT lifecycle', countLifecycle(buildTimelineEntries([
    buildGetPassTimelineRawEntries(
      { id: 'gp-rej2', status: 'REJECTED', deptApprovedAt: new Date(), deptApprover: { id: 'u1', firstName: 'D', lastName: 'U' }, rejectionReason: 'No budget', updatedAt: new Date() },
      [{ id: 'rj2', action: 'REJECT', changedAt: new Date(), changedBy: 'u2', changedByUser: { firstName: 'C', lastName: 'C' } }],
      { approvalSteps: v4Steps },
    ),
  ]), 'REJECT') === 1);

  record('P4-NEG-01', 'Missing actor does not yield undefined in builder', gpSendBack.every((e) => e.actor?.name !== 'undefined'));
  record('P4-NEG-02', 'Lifecycle SEND_BACK displayTitleKey is i18n not raw', gpSendBack.find((e) => e.lifecycleEventType === 'SEND_BACK')?.displayTitleKey?.startsWith('TIMELINE.'));
  record('P4-NEG-03', 'Posted GRN not Sent Back', mapUserFacingState('GRN', 'POSTED', { notes: '[Send Back] old' }) === 'Posted');
  record('P4-NEG-04', 'Breakage void maps to Void', mapUserFacingState('BREAKAGE', 'VOID', {}) === 'Void');
  record('P4-NEG-05', 'Transfer posted label', mapUserFacingState('TRANSFER', 'POSTED', {}) === 'Posted');
  record('P4-NEG-06', 'IC cancelled maps Void', mapUserFacingState('INVENTORY_COUNT', 'CANCELLED', {}) === 'Void');
  record('P4-NEG-07', 'Editable Returned physical state not conflated', !isEditableUserState('Returned'));
  record('P4-NEG-08', 'Timeline entries sortable by globalOrder', assertMonotonicOrder(v4Entries.filter((e) => e.globalOrder != null)) || v4Entries.length <= 1);
}

async function runFixtureSeed() {
  try {
    execSync('node phase-4-timeline-fixture-seed.cjs', { cwd: GOV_DIR, stdio: 'pipe' });
    return record('P4-SEED', 'Deterministic timeline fixtures seeded', true);
  } catch (e) {
    return record('P4-SEED', 'Deterministic timeline fixtures seeded', false, {
      stderr: String(e.stderr || e.message).slice(0, 800),
    });
  }
}

async function getGateToken() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: CHILD_SLUG } });
  if (!tenant) return { token: null, tenant: null };
  const sess = await getSession(API_BASE, { email: EMAIL, password: PASSWORD }, CHILD_SLUG);
  return { token: sess?.token, tenant };
}

async function assertFixtureModule(token, id, moduleKey, fixture, extraExpectations = {}) {
  const tl = await fetchTimeline(token, moduleKey, id);
  const entries = timelineEntriesFromResponse(tl);
  const expectations = {
    minEntries: 1,
    normalizedOrder: fixture.normalizedTimeline,
    ...(fixture.expectations || {}),
    ...extraExpectations,
  };
  const result = assertModuleTimeline(moduleKey, entries, expectations);
  return { http: tl.status, entries, result };
}

async function runApiScenarios(token, fixtures) {
  let healthStatus = 0;
  try {
    const healthRes = await fetch(`${API_BASE.replace(/\/api$/, '')}/health`);
    healthStatus = healthRes.status;
  } catch {
    healthStatus = 0;
  }
  record('P4-API-00', 'Backend API reachable', healthStatus === 200, { status: healthStatus });
  if (healthStatus !== 200 || !token) return;

  if (!fixtures?.grn?.id) {
    failRequired('P4-API-GRN', 'GRN fixture present with non-empty timeline', 'missing_fixture');
  } else {
    const { entries, result, http } = await assertFixtureModule(token, fixtures.grn.id, 'GRN', fixtures.grn, { minEntries: 3 });
    record('P4-API-GRN', 'GRN timeline exact normalized entries', http === 200 && result.pass, { count: entries.length, issues: result.issues });
  }

  if (!fixtures?.transfer?.id) {
    failRequired('P4-API-TR', 'Transfer fixture present with non-empty timeline', 'missing_fixture');
  } else {
    const { entries, result, http } = await assertFixtureModule(token, fixtures.transfer.id, 'TRANSFER', fixtures.transfer, { minEntries: 2 });
    record('P4-API-TR', 'Transfer timeline exact normalized entries', http === 200 && result.pass, { count: entries.length, issues: result.issues });
  }

  if (!fixtures?.breakage?.id) {
    failRequired('P4-API-BRK', 'Breakage fixture present with non-empty timeline', 'missing_fixture');
  } else {
    const { entries, result, http } = await assertFixtureModule(token, fixtures.breakage.id, 'BREAKAGE', fixtures.breakage, { minEntries: 2 });
    record('P4-API-BRK', 'Breakage timeline exact normalized entries', http === 200 && result.pass, { count: entries.length, issues: result.issues });
  }

  if (!fixtures?.inventoryCount?.id) {
    failRequired('P4-API-IC', 'Inventory Count fixture present with non-empty timeline', 'missing_fixture');
  } else {
    const { entries, result, http } = await assertFixtureModule(token, fixtures.inventoryCount.id, 'INVENTORY_COUNT', fixtures.inventoryCount);
    record('P4-API-IC', 'Inventory Count timeline exact normalized entries', http === 200 && result.pass, { count: entries.length, issues: result.issues });
    record(
      'P4-API-IC-SEM',
      'Inventory Count no duplicate Submitted lifecycle',
      countLifecycle(entries, 'SUBMIT_FOR_APPROVAL') === 1,
      { submitCount: countLifecycle(entries, 'SUBMIT_FOR_APPROVAL') },
    );
  }

  const sbFixture = fixtures?.getPassSendBackResubmit;
  if (!sbFixture?.id) {
    failRequired('P4-API-GP-SB', 'Get Pass send-back fixture present', 'missing_fixture');
    failRequired('P4-API-GP-RS', 'Get Pass resubmit fixture present', 'missing_fixture');
  } else {
    const tl = await fetchTimeline(token, 'GET_PASS', sbFixture.id);
    const entries = timelineEntriesFromResponse(tl);
    const sb = findSendBackEntry(entries);
    const rs = findResubmitEntry(entries);
    const exp = sbFixture.expectations || {};
    const lifecycleOk =
      countLifecycle(entries, 'SEND_BACK') === (exp.lifecycleCounts?.SEND_BACK ?? 1) &&
      countLifecycle(entries, 'RESUBMIT') === (exp.lifecycleCounts?.RESUBMIT ?? 1) &&
      countLifecycle(entries, 'SUBMIT_FOR_APPROVAL') === (exp.lifecycleCounts?.SUBMIT_FOR_APPROVAL ?? 1);
    const noReturn = !entries.some((e) => e.lifecycleEventType === 'RETURN_PROCESSED' || (e.stageKey === 'RETURN_PROCESSED' && e.lifecycleEventType === 'SEND_BACK'));
    record('P4-API-GP-SB', 'Get Pass Sent Back exactly once with actor stage reason timestamp', tl.status === 200 && !!sb && lifecycleOk && noReturn, {
      sendBack: sb ? { stageKey: sb.stageKey, reason: sb.reason, actor: sb.actor?.name, actedAt: sb.actedAt } : null,
    });
    record('P4-API-GP-RS', 'Get Pass Resubmitted once; original Submitted preserved; no Returned lifecycle', tl.status === 200 && !!rs && lifecycleOk && !entries.some((e) => e.lifecycleEventType === 'RETURN_PROCESSED'), {
      resubmit: rs ? { lifecycleEventType: rs.lifecycleEventType, actedAt: rs.actedAt } : null,
    });
    const orderCheck = assertExactNormalizedOrder(entries, sbFixture.normalizedTimeline);
    record('P4-API-GP-SB-ORDER', 'Get Pass send-back/resubmit normalized order', orderCheck.pass, orderCheck.pass ? {} : orderCheck);
  }

  const retFixture = fixtures?.getPassPhysicalReturn;
  if (!retFixture?.id) {
    failRequired('P4-API-GP-RET', 'Get Pass physical return fixture present', 'missing_fixture');
  } else {
    const { entries, result, http } = await assertFixtureModule(token, retFixture.id, 'GET_PASS', retFixture);
    const hasOut = entries.some((e) => e.stageKey === 'SECURITY_OUT');
    const hasReturned = entries.some((e) => e.stageKey === 'RETURN_PROCESSED' && e.displayTitleKey === 'TIMELINE.STAGE.RETURN_PROCESSED_COMPLETED');
    const noSb = countLifecycle(entries, 'SEND_BACK') === 0;
    const noRs = countLifecycle(entries, 'RESUBMIT') === 0;
    record('P4-API-GP-RET', 'Get Pass physical return SECURITY_OUT + Returned; no Sent Back/Resubmitted', http === 200 && result.pass && hasOut && hasReturned && noSb && noRs, {
      status: retFixture.status,
      issues: result.issues,
    });
  }

  const v3Fixture = fixtures?.getPassV3Gm;
  if (!v3Fixture?.id || !v3Fixture.gmApprovedAt) {
    failRequired('P4-API-GP-V3-GM', 'Historical Get Pass v3 with GM stamp present', 'missing_stamped_v3');
  } else {
    let v3Token = token;
    if (v3Fixture.tenantId && v3Fixture.tenantId !== fixtures.tenantId) {
      const orgSlug = 'closeout-audit-org-disposable';
      let orgSess = await getSession(API_BASE, { email: EMAIL, password: PASSWORD }, orgSlug);
      const sw = await switchTenant(API_BASE, orgSess.token, CHILD_SLUG);
      if (sw.status === 200 && sw.data?.data?.accessToken) v3Token = sw.data.data.accessToken;
    }
    const tl = await fetchTimeline(v3Token, 'GET_PASS', v3Fixture.id);
    const entries = timelineEntriesFromResponse(tl);
    const gmEntry = entries.find((e) => e.stageKey === 'GENERAL_MANAGER' && e.entryType === 'APPROVAL_STEP_COMPLETED');
    const secAfterGm = entries.findIndex((e) => e.stageKey === 'SECURITY') > entries.findIndex((e) => e.stageKey === 'GENERAL_MANAGER');
    record('P4-API-GP-V3-GM', 'Historical v3 GM Approved with actor timestamp; Security follows GM', tl.status === 200 && !!gmEntry && !!gmEntry.actor?.name && !!gmEntry.actedAt && secAfterGm, {
      gmActor: gmEntry?.actor?.name,
      gmAt: gmEntry?.actedAt,
      versionNumber: v3Fixture.versionNumber,
      accWorkflowVersionId: v3Fixture.accWorkflowVersionId,
    });
    const orderCheck = assertExactNormalizedOrder(entries, v3Fixture.normalizedTimeline);
    record('P4-API-GP-V3-ORDER', 'Historical v3 normalized timeline order', orderCheck.pass, orderCheck.pass ? {} : orderCheck);
  }

  record(
    'P4-API-NEG-01',
    'Cross-tenant timeline inaccessible',
    (await fetchTimeline(token, 'GRN', '00000000-0000-0000-0000-000000000000')).status === 404,
  );
}

function runRegression() {
  const tests = [
    ['grnTimeline.builder.test.js', path.join(BACKEND, 'src/platform/timeline/grnTimeline.builder.test.js')],
    ['getPassTimeline.builder.test.js', path.join(BACKEND, 'scripts/getPassTimeline.builder.test.js')],
    ['approvalTimeline.builder.test.js', path.join(BACKEND, 'src/platform/timeline/approvalTimeline.builder.test.js')],
    ['timelineEntry.test.js', path.join(BACKEND, 'src/platform/timeline/timelineEntry.test.js')],
  ];
  for (const [name, file] of tests) {
    try {
      execSync(`node --test "${file}"`, { cwd: BACKEND, stdio: 'pipe' });
      recordRegression(name, true);
    } catch (e) {
      recordRegression(name, false, { stderr: String(e.stderr || e.message).slice(0, 500) });
    }
  }
  try {
    execSync('npm run build', { cwd: path.join(BACKEND, '../OSE-Frontend'), stdio: 'pipe' });
    recordRegression('frontend-build', true);
  } catch (e) {
    recordRegression('frontend-build', false, { stderr: String(e.stderr || e.message).slice(0, 500) });
  }
}

async function main() {
  runInProcessScenarios();
  await runFixtureSeed();

  const fixtures = loadFixtures();
  if (!fixtures) {
    failRequired('P4-FIXTURES', 'PHASE_4_TIMELINE_FIXTURES.json loaded', 'file_missing');
  } else {
    record('P4-FIXTURES', 'PHASE_4_TIMELINE_FIXTURES.json loaded', true, {
      modules: ['grn', 'transfer', 'breakage', 'getPassSendBackResubmit', 'getPassPhysicalReturn', 'getPassV3Gm', 'inventoryCount'].filter((k) => fixtures[k]?.id),
    });
  }

  const { token } = await getGateToken();
  if (!token) {
    failRequired('P4-API-SEED', 'Gate actor session', 'login_failed');
  }

  await runApiScenarios(token, fixtures);
  runRegression();

  const skipped = scenarios.filter((s) => s.skipped);
  const runtimePass = scenarios.filter((s) => s.pass).length;
  const runtimeFail = scenarios.filter((s) => !s.pass).length;
  const regPass = regression.filter((r) => r.pass).length;
  const regFail = regression.filter((r) => !r.pass).length;
  const phaseClosed = runtimeFail === 0 && regFail === 0 && skipped.length === 0;

  const out = {
    generatedAt: new Date().toISOString(),
    phase: 'phase-4-workflow-timeline',
    runtimePass,
    runtimeFail,
    regPass,
    regFail,
    skippedCount: skipped.length,
    phaseClosed,
    scenarios,
    regression,
    fixtures: fixtures
      ? {
          tenantId: fixtures.tenantId,
          grnId: fixtures.grn?.id,
          transferId: fixtures.transfer?.id,
          breakageId: fixtures.breakage?.id,
          getPassSendBackResubmitId: fixtures.getPassSendBackResubmit?.id,
          getPassPhysicalReturnId: fixtures.getPassPhysicalReturn?.id,
          getPassV3GmId: fixtures.getPassV3Gm?.id,
          inventoryCountId: fixtures.inventoryCount?.id,
        }
      : null,
  };

  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_4_RUNTIME_RESULTS.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ runtimePass, runtimeFail, regPass, regFail, skippedCount: skipped.length, phaseClosed }, null, 2));
  await prisma.$disconnect();
  process.exit(phaseClosed ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
