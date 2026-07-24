'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession } = require('./lib/http');
const { fetchGetPassEvidence, prisma } = require('./lib/evidence');
const {
  loadDisposableTenants,
  ensureDisposableStock,
  seedConstitutionWorkflow,
  cleanupConstitutionWorkflow,
  upsertDisposableUser,
  gpPayload,
  PASSWORD,
  EMAIL_DOMAIN,
  CHAIN,
} = require('./lib/disposable-fixture');

const OUT = path.join(REPORT_DIR, 'GET_PASS_ALIGNED_WORKFLOW_ACTOR_MATRIX.json');

const ACTORS = [
  { key: 'dept_creator', role: 'DEPT_MANAGER', email: `disp-dept-creator@${EMAIL_DOMAIN}`, create: true, submit: true },
  { key: 'dept_manager', role: 'DEPT_MANAGER', email: `disp-dept-mgr@${EMAIL_DOMAIN}`, create: true, submit: true },
  { key: 'cost_control', role: 'COST_CONTROL', email: `disp-cost@${EMAIL_DOMAIN}`, create: true, submit: true },
  { key: 'finance', role: 'FINANCE_MANAGER', email: `disp-finance@${EMAIL_DOMAIN}`, create: true, submit: true },
  { key: 'gm', role: 'GENERAL_MANAGER', email: `disp-gm@${EMAIL_DOMAIN}`, create: false, submit: false },
  { key: 'storekeeper', role: 'STOREKEEPER', email: `disp-store@${EMAIL_DOMAIN}`, create: false, submit: false },
  { key: 'security', role: 'SECURITY', email: `disp-security@${EMAIL_DOMAIN}`, create: false, submit: false },
  { key: 'create_only', role: 'DEPT_MANAGER', email: `disp-create-only@${EMAIL_DOMAIN}`, create: true, submit: false, skipUr: true },
];

async function main() {
  const { child } = await loadDisposableTenants();
  const stock = await ensureDisposableStock(child.id);
  let wf = null;
  const rows = [];

  try {
    wf = await seedConstitutionWorkflow(child.id);
    for (const actor of ACTORS) {
      await upsertDisposableUser({
        email: actor.email,
        roleCode: actor.role,
        tenantId: child.id,
        departmentId: stock.departmentId,
        skipUrAssignment: actor.skipUr,
      });
      const session = await getSession(API_BASE, { email: actor.email, password: PASSWORD }, child.slug);
      if (!session.ok) {
        rows.push({ actor: actor.key, error: 'login_failed' });
        continue;
      }
      const createRes = await apiRequest(
        API_BASE,
        'POST',
        '/get-passes',
        gpPayload(stock, stock.departmentId, `${FIXTURE_TAG}-${actor.key}`),
        session.token,
      );
      const gpId = createRes.data?.data?.id;
      const ver = createRes.data?.data?.concurrencyVersion ?? 0;
      const createAllowed = createRes.status >= 200 && createRes.status < 300;
      let submitAllowed = null;
      let statusAfter = null;
      let evidence = null;
      if (gpId && actor.submit !== false) {
        const submitRes = await apiRequest(
          API_BASE,
          'POST',
          `/get-passes/${gpId}/submit`,
          { concurrencyVersion: ver },
          session.token,
        );
        submitAllowed = submitRes.status >= 200 && submitRes.status < 300;
        evidence = await fetchGetPassEvidence(gpId, child.id);
        statusAfter = evidence?.status;
      }
      const pinned = gpId
        ? await prisma.getPass.findUnique({
            where: { id: gpId },
            select: {
              accWorkflowVersionId: true,
              deptApprovedBy: true,
              costControlApprovedBy: true,
              financeApprovedBy: true,
              gmApprovedBy: true,
              securityApprovedBy: true,
              createdBy: true,
            },
          })
        : null;
      const firstExpected =
        actor.role === 'FINANCE_MANAGER'
          ? 'PENDING_FINANCE or fast-forward per creator role BDR'
          : actor.role === 'DEPT_MANAGER'
            ? 'PENDING_DEPT or skip if creator auto-advance'
            : 'PENDING_* per chain';
      rows.push({
        actor: actor.key,
        role: actor.role,
        createAllowed,
        createHttp: createRes.status,
        submitAllowed,
        firstExpectedStep: firstExpected,
        actualStatus: statusAfter,
        pinnedVersionId: pinned?.accWorkflowVersionId,
        usesFixture: pinned?.accWorkflowVersionId === wf.versionId,
        stepsStamped: {
          dept: !!pinned?.deptApprovedBy,
          costControl: !!pinned?.costControlApprovedBy,
          finance: !!pinned?.financeApprovedBy,
          gm: !!pinned?.gmApprovedBy,
          security: !!pinned?.securityApprovedBy,
        },
        actorsStamped: {
          dept: pinned?.deptApprovedBy,
          costControl: pinned?.costControlApprovedBy,
          finance: pinned?.financeApprovedBy,
          gm: pinned?.gmApprovedBy,
          security: pinned?.securityApprovedBy,
        },
        creatorIsSubmitter: pinned?.createdBy === session.user?.id,
        costControlSkipped: statusAfter && !['PENDING_DEPT', 'PENDING_COST_CONTROL'].includes(statusAfter) && !pinned?.costControlApprovedBy,
        deptSkipped: statusAfter && statusAfter !== 'PENDING_DEPT' && !pinned?.deptApprovedBy,
        financeSelfStampOnSubmit: pinned?.financeApprovedBy === session.user?.id && actor.role === 'FINANCE_MANAGER',
        auditActions: evidence?.audit?.map((a) => a.action) || [],
        constitutionResult:
          statusAfter === 'PENDING_GM'
            ? 'FAIL — GM not in fixture'
            : actor.role === 'FINANCE_MANAGER' && statusAfter === 'PENDING_SECURITY' && !pinned?.costControlApprovedBy
              ? 'OBSERVE — Finance creator fast-forward skipped CC/Dept stamps'
              : 'See stepsStamped',
      });
    }
  } finally {
    if (wf?.definitionId) await cleanupConstitutionWorkflow(wf.definitionId);
  }

  const financeRow = rows.find((r) => r.actor === 'finance');
  const out = {
    executedAt: new Date().toISOString(),
    tenant: child.slug,
    workflowChain: CHAIN.map((c) => c.statusKey),
    fixturePolicy: 'Disposable hotel only — cleanup in finally',
    rows,
    explicitAnswers: {
      q1_financeAllowedCreate: financeRow?.createAllowed ?? null,
      q2_financeStartingStep:
        financeRow?.actualStatus === 'PENDING_SECURITY'
          ? 'Fast-forward to PENDING_SECURITY — skipped visible CC/Dept queue'
          : financeRow?.actualStatus,
      q3_bdrFastForwardByCreatorRole: 'Submit uses getSubmitInitialWorkflowFromContext(user.role) — creator role determines initial status/stamps',
      q4_submitVsApproval: 'Submit applies workflow transition + may stamp creator on skipped steps — not merely queue send',
      q5_unexecutedStampsRecorded:
        financeRow?.costControlSkipped || financeRow?.deptSkipped
          ? 'YES — status advanced without costControl/dept stamp IDs'
          : 'Partial — inspect stepsStamped per actor',
    },
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote GET_PASS_ALIGNED_WORKFLOW_ACTOR_MATRIX.json');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
