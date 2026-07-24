'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey } = require('./lib/session-resolver');
const { fetchGetPassEvidence, prisma } = require('./lib/evidence');
const { ScenarioReport } = require('./lib/scenario-report');

const CHAIN = [
  { statusKey: 'PENDING_DEPT', role: 'DEPT_MANAGER' },
  { statusKey: 'PENDING_COST_CONTROL', role: 'COST_CONTROL' },
  { statusKey: 'PENDING_FINANCE', role: 'FINANCE_MANAGER' },
  { statusKey: 'PENDING_SECURITY', role: 'SECURITY' },
];

async function connectRole(code) {
  const r = await prisma.role.findUnique({ where: { code } });
  return r ? { connect: { id: r.id } } : undefined;
}

async function seedConstitutionWorkflow(tenantId) {
  const mod = await prisma.accModule.findFirst({ where: { key: 'GET_PASS' } });
  const defKey = 'closeout-constitution-get-pass';
  let def = await prisma.accWorkflowDefinition.findFirst({
    where: { moduleId: mod.id, tenantId, key: defKey },
  });
  if (!def) {
    def = await prisma.accWorkflowDefinition.create({
      data: { moduleId: mod.id, tenantId, key: defKey, name: `${FIXTURE_TAG} Constitution GP`, isActive: true },
    });
  }

  await prisma.accWorkflowVersion.updateMany({
    where: { definitionId: def.id, status: 'PUBLISHED' },
    data: { status: 'DRAFT' },
  });

  const ver = await prisma.accWorkflowVersion.create({
    data: {
      definitionId: def.id,
      versionNumber: 9000 + Math.floor(Math.random() * 999),
      status: 'PUBLISHED',
      publishedAt: new Date(),
      notes: FIXTURE_TAG,
      steps: {
        create: await Promise.all(
          CHAIN.map(async (c, i) => ({
            stepOrder: i + 1,
            label: c.statusKey,
            statusKey: c.statusKey,
            approverRole: await connectRole(c.role),
          })),
        ),
      },
    },
    include: { steps: true },
  });

  return { definitionId: def.id, versionId: ver.id, versionNumber: ver.versionNumber };
}

async function cleanupWorkflow(definitionId) {
  await prisma.accWorkflowVersion.deleteMany({ where: { definitionId } });
  await prisma.accWorkflowDefinition.delete({ where: { id: definitionId } }).catch(() => {});
}

function gpPayload(stock, deptId) {
  return {
    transferType: 'PERMANENT',
    borrowingEntity: `${FIXTURE_TAG} constitution wf`,
    departmentId: deptId,
    reason: FIXTURE_TAG,
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
  };
}

async function main() {
  const report = new ScenarioReport('14-constitution-aligned-gp');
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;

  const wf = await seedConstitutionWorkflow(HOTEL_A.id);
  const rows = [];

  const actors = ['DEPT_MANAGER_FB', 'FINANCE', 'ORG_MANAGER', 'SUPER_ADMIN_OP'];
  for (const key of actors) {
    const session = await sessionForIdentityKey(key);
    const id = `CA-GP-FF-${key}`;
    if (!session.ok) {
      report.blocked(id, { reason: session.reason });
      continue;
    }
    const createRes = await apiRequest(API_BASE, 'POST', '/get-passes', gpPayload(stock, stock.departmentId), session.token);
    const gpId = createRes.data?.data?.id;
    const ver = createRes.data?.data?.concurrencyVersion;
    if (!gpId) {
      if (createRes.status === 403) report.pass(id, { phase: 'create_denied', http: 403 });
      else report.fail(id, { phase: 'create', http: createRes.status });
      continue;
    }
    const submitRes = await apiRequest(
      API_BASE,
      'POST',
      `/get-passes/${gpId}/submit`,
      { concurrencyVersion: ver ?? 0 },
      session.token,
    );
    const after = await fetchGetPassEvidence(gpId, HOTEL_A.id);
    const pinned = await prisma.getPass.findUnique({ where: { id: gpId }, select: { accWorkflowVersionId: true, status: true } });
    rows.push({
      userKey: key,
      workflowFixtureVersionId: wf.versionId,
      pinnedVersionId: pinned?.accWorkflowVersionId,
      usesConstitutionFixture: pinned?.accWorkflowVersionId === wf.versionId,
      submitHttp: submitRes.status,
      statusAfter: after?.status,
      gmStamp: after?.gmApprovedBy,
      financeStamp: after?.financeApprovedBy,
      securityStamp: after?.securityApprovedBy,
      injectedPendingGm: after?.status === 'PENDING_GM' && !CHAIN.some((c) => c.statusKey === 'PENDING_GM'),
    });
    if (pinned?.accWorkflowVersionId !== wf.versionId) {
      report.fail(id, { reason: 'did_not_pin_constitution_fixture' });
    } else if (after?.status === 'PENDING_GM') {
      report.fail(id, { reason: 'code_injected_GM_not_in_fixture' });
    } else if (submitRes.status === 200) {
      report.pass(id, { statusAfter: after?.status });
    } else {
      report.fail(id, { http: submitRes.status });
    }
  }

  await cleanupWorkflow(wf.definitionId);

  const out = {
    executedAt: new Date().toISOString(),
    tenant: HOTEL_A.slug,
    fixtureWorkflow: wf,
    cleanup: 'definition and versions deleted after run',
    rows,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'GET_PASS_CONSTITUTION_ALIGNED_FAST_FORWARD.json'), JSON.stringify(out, null, 2));
  report.finish(path.join(REPORT_DIR, 'CONSTITUTION_ALIGNED_GP_HARNESS.json'));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
