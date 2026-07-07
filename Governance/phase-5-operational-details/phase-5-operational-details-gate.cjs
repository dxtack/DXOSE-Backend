'use strict';

/**
 * Phase 5 — Transfer / Breakage / Lost operational details gate (strict reopen).
 * Usage: node Governance/phase-5-operational-details/phase-5-operational-details-gate.cjs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GOV_DIR = __dirname;
const BACKEND = path.join(__dirname, '../../OSE-backend');
const API_BASE = process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`;
const CHILD_SLUG = 'closeout-audit-hotel-disposable';
const PASSWORD = 'Phase5Gate@123';
const FIXTURE_TAG = 'PHASE5_DETAIL_GATE';

const { apiRequest, getSession } = require(path.join(BACKEND, 'scripts/closeout-runtime-audit/lib/http'));
const prisma = require(path.join(BACKEND, 'src/config/database'));
const { mapUserFacingState } = require(path.join(BACKEND, 'src/platform/lifecyclePresentation.service'));
const { loadFixtures } = require('./phase-5-detail-assertions.lib.cjs');
const {
  runFullListDetailReconciliation,
  runExactPostingReconciliation,
  runMutationNegatives,
  runActionFlows,
  runActionMatrixRuntime,
  runDraftTimelineAssertion,
} = require('./phase-5-runtime-scenarios.lib.cjs');
const { validateActionMatrixBindings, computePhaseClosed } = require('./phase-5-closure.lib.cjs');
const { MANDATORY_CLEAN_BROWSER_IDS } = require('./phase-5-browser-clean.lib.cjs');

const ACTION_MATRIX = JSON.parse(fs.readFileSync(path.join(GOV_DIR, 'PHASE_5_ACTION_MATRIX.json'), 'utf8'));

const scenarios = [];
const regression = [];

function record(id, name, pass, detail = {}) {
  scenarios.push({ id, name, pass, skipped: false, vacuous: false, ...detail });
  return pass;
}

function runRegression(apiToken) {
  const tests = [
    { id: 'P5-REG-TIMELINE-BUILDER', command: 'node --test src/platform/timeline/approvalTimeline.builder.test.js' },
    { id: 'P5-REG-TIMELINE-ENTRY', command: 'node --test src/platform/timeline/timelineEntry.test.js' },
    { id: 'P5-REG-LOST-WF', command: 'node --test scripts/lost-approval-workflow.test.js' },
    { id: 'P5-REG-POSTING', command: 'node --test src/services/posting.service.test.js' },
    { id: 'P5-REG-MVREG-SMOKE', command: 'node scripts/smoke-movement-register-governed.js' },
  ];
  for (const t of tests) {
    try {
      execSync(t.command, { cwd: BACKEND, stdio: 'pipe', timeout: 120000 });
      recordRegression(t.id, true, { command: t.command, exitCode: 0 });
    } catch (e) {
      recordRegression(t.id, false, { command: t.command, exitCode: e.status || 1, stderr: String(e.stderr || e.message).slice(0, 500) });
    }
  }

  try {
    execSync('npm run build', { cwd: path.join(BACKEND, '../OSE-Frontend'), stdio: 'pipe', timeout: 300000 });
    recordRegression('P5-REG-FRONTEND-BUILD', true, { command: 'npm run build', exitCode: 0 });
  } catch (e) {
    recordRegression('P5-REG-FRONTEND-BUILD', false, { command: 'npm run build', exitCode: e.status || 1, stderr: String(e.stderr || e.message).slice(0, 500) });
  }
}

function recordRegression(id, pass, detail = {}) {
  regression.push({ id, pass, ...detail });
  return pass;
}

function failRequired(id, name, reason, detail = {}) {
  return record(id, name, false, { reason, ...detail });
}

async function actorToken(email) {
  const sess = await getSession(API_BASE, { email, password: PASSWORD }, CHILD_SLUG);
  return sess?.token;
}

async function buildTokens(fixtures) {
  const actors = fixtures.actors || {};
  const keys = [
    'orgManager',
    'storekeeper',
    'deptManager',
    'costControl',
    'financeManager',
    'generalManager',
    'noAssign',
    'viewOnly',
    'inactiveAssign',
    'wrongProperty',
    'deletedAssign',
  ];
  const tokens = {};
  for (const k of keys) {
    if (actors[k]) tokens[k] = await actorToken(actors[k]);
  }
  if (fixtures.outOfScope?.scopedUserEmail) {
    tokens.scopedDept = await actorToken(fixtures.outOfScope.scopedUserEmail);
  }
  return tokens;
}

function verifyActionMatrixLoaded() {
  const actions = ACTION_MATRIX?.actions || [];
  const missingAllow = actions.filter((a) => !a.runtimeAllow?.testId).length;
  const missingDeny = actions.filter((a) => !a.runtimeDeny?.testId).length;
  const ok = actions.length >= 12 && missingAllow === 0 && missingDeny === 0;
  record('P5-MATRIX-LOAD', 'Action matrix loaded with runtime allow/deny bindings', ok, {
    total: actions.length,
    missingAllowBindingCount: missingAllow,
    missingDenyBindingCount: missingDeny,
  });
}

function runInProcessChecks() {
  record('P5-LC-01', 'Transfer POSTED maps to Posted', mapUserFacingState('TRANSFER', 'POSTED', {}) === 'Posted');
  record('P5-LC-02', 'Breakage VOID maps to Void', mapUserFacingState('BREAKAGE', 'VOID', {}) === 'Void');
  record('P5-LC-03', 'Lost REJECTED maps to Rejected', mapUserFacingState('LOST', 'REJECTED', {}) === 'Rejected');
  record('P5-LC-04', 'Transfer has no Sent Back state', mapUserFacingState('TRANSFER', 'DRAFT', { notes: '[Send Back] x' }) !== 'Sent Back');
}

async function runFixtureSeed() {
  try {
    execSync('node phase-5-fixture-seed.cjs', { cwd: GOV_DIR, stdio: 'pipe', timeout: 120000 });
    return record('P5-SEED', 'Deterministic detail fixtures seeded', true);
  } catch (e) {
    return record('P5-SEED', 'Deterministic detail fixtures seeded', false, {
      stderr: String(e.stderr || e.message).slice(0, 1200),
    });
  }
}

async function main() {
  verifyActionMatrixLoaded();
  runInProcessChecks();
  await runFixtureSeed();

  const fixtures = loadFixtures();
  if (!fixtures) {
    failRequired('P5-FIXTURES', 'PHASE_5_FIXTURES.json loaded', 'file_missing');
  } else {
    record('P5-FIXTURES', 'PHASE_5_FIXTURES.json loaded', true, {
      hasBrowserFlows: !!fixtures.browserFlows,
      hasNegativeActors: !!fixtures.negativeActors,
    });
  }

  let healthStatus = 0;
  try {
    const healthRes = await fetch(`${API_BASE.replace(/\/api$/, '')}/health`);
    healthStatus = healthRes.status;
  } catch {
    healthStatus = 0;
  }
  record('P5-API-00', 'Backend API reachable', healthStatus === 200, { status: healthStatus });

  let apiToken = null;

  if (fixtures && healthStatus === 200) {
    const stockRow = await prisma.stockBalance.findFirst({
      where: { tenantId: fixtures.tenantId },
      select: { locationId: true, itemId: true },
    });
    const destLoc = await prisma.location.findFirst({
      where: { tenantId: fixtures.tenantId, id: { not: stockRow?.locationId } },
      select: { id: true },
    });
    const unit = await prisma.unit.findFirst({ where: { tenantId: fixtures.tenantId, isActive: true }, select: { id: true } });
    fixtures._stock = {
      itemId: stockRow?.itemId,
      sourceLocationId: stockRow?.locationId,
      destLocationId: destLoc?.id,
      unitId: unit?.id,
      locationId: stockRow?.locationId,
    };

    const tokens = await buildTokens(fixtures);
    apiToken = tokens.orgManager;
    if (!tokens.orgManager) {
      failRequired('P5-API-SEED', 'Gate actor session', 'login_failed');
    } else {
      const ctx = {
        record,
        fixtures,
        token: tokens.orgManager,
        tokens,
        apiRequest,
        API_BASE,
        prisma,
        ACTION_MATRIX,
        FIXTURE_TAG,
      };

      await runDraftTimelineAssertion(ctx);
      await runFullListDetailReconciliation(ctx);
      await runExactPostingReconciliation(ctx);
      await runMutationNegatives(ctx);
      await runActionFlows(ctx);
      await runActionMatrixRuntime(ctx);

      for (const [id, label, route] of [
        ['P5-REG-LIST-TRANSFER', 'Transfer list', '/transfers?take=5'],
        ['P5-REG-LIST-BREAKAGE', 'Breakage list', '/breakage?take=5'],
        ['P5-REG-LIST-LOST', 'Lost list', '/lost?take=5'],
        ['P5-REG-STOCK', 'Stock Balances', '/stock-balances?limit=3'],
        ['P5-REG-LEDGER', 'Inventory Ledger', '/ledger?limit=3'],
        ['P5-REG-MVREG', 'Movement Register', '/movements?limit=3'],
        ['P5-REG-PIPE', 'Workflow Pipeline', '/workflow-pipeline?limit=3'],
        ['P5-REG-DASH', 'Dashboard metrics', '/dashboard/summary'],
      ]) {
        const res = await apiRequest(API_BASE, 'GET', route, null, tokens.orgManager);
        record(id, `${label} authorized`, res.status === 200, { http: res.status });
      }

      try {
        const member = await prisma.tenantMember.findFirst({
          where: { user: { email: fixtures.actors.orgManager }, tenant: { slug: { not: CHILD_SLUG } } },
          include: { tenant: { select: { slug: true } } },
        });
        if (member?.tenant?.slug) {
          const sw = await getSession(API_BASE, { email: fixtures.actors.orgManager, password: PASSWORD }, member.tenant.slug);
          record('P5-REG-TENANT-SWITCH', 'Tenant switch session', !!sw?.token, { tenant: member.tenant.slug });
        } else {
          record('P5-REG-TENANT-SWITCH', 'Tenant switch session', true, { note: 'single_tenant_member_skip' });
        }
      } catch (e) {
        record('P5-REG-TENANT-SWITCH', 'Tenant switch session', false, { error: String(e.message).slice(0, 200) });
      }
    }
  }

  runRegression(apiToken);

  const skipped = scenarios.filter((s) => s.skipped);
  const vacuous = scenarios.filter((s) => s.vacuous);
  const passCount = scenarios.filter((s) => s.pass).length;
  const failCount = scenarios.filter((s) => !s.pass).length;
  const regPass = regression.filter((r) => r.pass).length;
  const regFail = regression.filter((r) => !r.pass).length;
  const matrixBinding = validateActionMatrixBindings(ACTION_MATRIX, scenarios.map((s) => s.id));
  let ledgerFieldMismatchCount = 0;
  for (const s of scenarios) {
    if (s.ledgerIssues?.length) ledgerFieldMismatchCount += s.ledgerIssues.length;
  }
  let browserResults = {};
  try {
    browserResults = JSON.parse(fs.readFileSync(path.join(GOV_DIR, 'PHASE_5_BROWSER_RESULTS.json'), 'utf8'));
  } catch {
    browserResults = {};
  }
  const browserScenarioIds = new Set((browserResults.scenarios || []).map((s) => s.id));
  const missingScenarioIdCount = MANDATORY_CLEAN_BROWSER_IDS.filter((id) => !browserScenarioIds.has(id)).length;

  const counters = {
    passCount,
    failCount,
    runtimeFailCount: failCount,
    browserFailCount: browserResults.failCount ?? browserResults.runtimeFail ?? 0,
    regressionFailCount: regFail,
    skippedCount: skipped.length,
    vacuousCount: vacuous.length,
    requestRewriteCount: browserResults.requestRewriteCount ?? 0,
    missingAllowBindingCount: matrixBinding.missingAllowBindingCount,
    missingDenyBindingCount: matrixBinding.missingDenyBindingCount,
    unexecutedActionBindingCount: matrixBinding.unexecutedActionBindingCount,
    ledgerFieldMismatchCount: ledgerFieldMismatchCount + (browserResults.ledgerFieldMismatchCount ?? 0),
    missingVoidTimelineCount: browserResults.missingVoidTimelineCount ?? 0,
    unauthorizedVisibleMutationButtonCount: browserResults.unauthorizedVisibleMutationButtonCount ?? 0,
    missingScenarioIdCount,
    frontendProductionBuildPass: regression.some((r) => r.id === 'P5-REG-FRONTEND-BUILD' && r.pass),
  };
  const phaseClosed = computePhaseClosed(counters);

  const out = {
    generatedAt: new Date().toISOString(),
    phase: 'phase-5-operational-details',
    runtimePass: passCount,
    runtimeFail: failCount,
    regPass,
    regFail,
    ...counters,
    phaseClosed,
    scenarios,
    regression,
  };

  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_5_RUNTIME_RESULTS.json'), JSON.stringify(out, null, 2));
  generateManifest(out, browserResults);
  console.log(JSON.stringify({ ...counters, phaseClosed }, null, 2));
  await prisma.$disconnect();
  process.exit(phaseClosed ? 0 : 1);
}

function generateManifest(runtimeOut, browserOut) {
  const entries = [];
  for (const s of [...(runtimeOut.scenarios || []), ...(browserOut.scenarios || [])]) {
    entries.push({
      scenarioId: s.id,
      resultFile: (runtimeOut.scenarios || []).some((x) => x.id === s.id) ? 'PHASE_5_RUNTIME_RESULTS.json' : 'PHASE_5_BROWSER_RESULTS.json',
      fixtureId: s.fixtureId || null,
      actor: s.actor || null,
      route: s.route || null,
      expectedResult: s.expected || s.expectedStatus || null,
      actualResult: s.status || s.afterStatus || (s.pass ? 'PASS' : 'FAIL'),
      evidenceStatus: s.pass ? 'PASS' : 'FAIL',
    });
  }
  fs.writeFileSync(
    path.join(GOV_DIR, 'PHASE_5_CLEAN_VERIFICATION_MANIFEST.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), phaseClosed: runtimeOut.phaseClosed, entries }, null, 2),
  );
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
