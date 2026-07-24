'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const {
  prisma,
  auditTenantGetPassWorkflow,
  getPublishedGetPassVersion,
  seedConstitutionWorkflow,
  cleanupConstitutionWorkflow,
  assertGrandHorizonUnchanged,
} = require('./lib/disposable-fixture');

const OUT = path.join(REPORT_DIR, 'GET_PASS_TEST_WORKFLOW_CLEANUP_PROOF.json');

async function main() {
  const ghBefore = await prisma.tenant.findUnique({
    where: { id: HOTEL_A.id },
    select: { id: true, slug: true, parentId: true, updatedAt: true },
  });
  const workflowBefore = await auditTenantGetPassWorkflow(HOTEL_A.id);
  const globalBefore = await getPublishedGetPassVersion(null);

  const testDefKey = 'closeout-constitution-get-pass';
  const existingTestDef = await prisma.accWorkflowDefinition.findFirst({
    where: { tenantId: HOTEL_A.id, key: testDefKey },
    include: { versions: true },
  });

  let testRun = null;
  if (!existingTestDef) {
    const wf = await seedConstitutionWorkflow(HOTEL_A.id, testDefKey);
    const docsBeforeCleanup = await prisma.getPass.findMany({
      where: { tenantId: HOTEL_A.id, accWorkflowVersionId: wf.versionId },
      select: { id: true, passNo: true, status: true, accWorkflowVersionId: true },
    });
    const cleanup = await cleanupConstitutionWorkflow(wf.definitionId);
    testRun = {
      simulatedRound4Pattern: true,
      testVersionId: wf.versionId,
      publishedAt: wf.publishedAt,
      documentsPinnedDuringTest: docsBeforeCleanup,
      cleanupAction: 'deleted definition + versions + associated get passes',
      cleanupResult: cleanup,
    };
  } else {
    testRun = {
      note: 'Test definition still present — executing cleanup now',
      testDefinitionId: existingTestDef.id,
      versions: existingTestDef.versions.map((v) => ({ id: v.id, status: v.status })),
    };
    const cleanup = await cleanupConstitutionWorkflow(existingTestDef.id);
    testRun.cleanupResult = cleanup;
  }

  const workflowAfter = await auditTenantGetPassWorkflow(HOTEL_A.id);
  const globalAfter = await getPublishedGetPassVersion(null);
  const ghAssert = await assertGrandHorizonUnchanged(ghBefore);

  const activePinnedToMissing = await prisma.getPass.findMany({
    where: {
      tenantId: HOTEL_A.id,
      accWorkflowVersionId: { not: null },
      NOT: { accWorkflowVersion: { status: 'PUBLISHED' } },
    },
    select: { id: true, passNo: true, accWorkflowVersionId: true, status: true },
    take: 50,
  });

  const proof = {
    executedAt: new Date().toISOString(),
    tag: FIXTURE_TAG,
    tenant: HOTEL_A.slug,
    policy: 'Operational hotel must not retain test-only published workflow; Round 5+ uses disposable tenant only',
    beforeTest: {
      grandHorizon: ghBefore,
      activePublishedGetPassVersion: workflowBefore.published
        ? {
            versionId: workflowBefore.published.id,
            versionNumber: workflowBefore.published.versionNumber,
            definitionKey: workflowBefore.published.definition?.key,
            definitionTenantScoped: workflowBefore.published.definition?.tenantId,
            orderedStatusKeys: workflowBefore.published.steps?.map((s) => s.statusKey),
          }
        : null,
      globalTemplate: globalBefore
        ? { versionId: globalBefore.id, versionNumber: globalBefore.versionNumber }
        : null,
      testDefinitionsOnTenant: workflowBefore.testDefinitions,
    },
    round4TestWorkflow: testRun,
    afterTest: {
      grandHorizon: ghAssert.after,
      parentIdUnchanged: ghAssert.parentIdUnchanged,
      activePublishedGetPassVersion: workflowAfter.published
        ? {
            versionId: workflowAfter.published.id,
            versionNumber: workflowAfter.published.versionNumber,
            definitionKey: workflowAfter.published.definition?.key,
            sameAsBefore:
              workflowBefore.published?.id === workflowAfter.published?.id,
          }
        : null,
      globalTemplateChanged: globalBefore?.id !== globalAfter?.id,
      testDefinitionsRemaining: workflowAfter.testDefinitions.length,
      activeDocsPinnedToTestVersion: workflowAfter.nonStandardPinnedDocs,
      orphanedVersionPins: activePinnedToMissing,
    },
    dbQueries: {
      before: `SELECT id, slug, "parentId" FROM tenants WHERE slug='grand-horizon'`,
      during: `SELECT * FROM acc_workflow_definitions WHERE tenant_id='${HOTEL_A.id}' AND key LIKE 'closeout%'`,
      after: `SELECT id, status, acc_workflow_version_id FROM get_passes WHERE tenant_id='${HOTEL_A.id}' AND acc_workflow_version_id IS NOT NULL LIMIT 50`,
    },
    cleanupExecuted: true,
    cleanupStatus:
      workflowAfter.testDefinitions.length === 0 && ghAssert.parentIdUnchanged
        ? 'RESTORED — no test workflow definitions on grand-horizon'
        : 'REVIEW — test artifacts or pins remain',
    validityAfterRestore: 'grand-horizon must not be used for workflow mutation tests going forward',
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(proof, null, 2));
  console.log('Wrote', OUT, proof.cleanupStatus);
  await prisma.$disconnect();
  if (proof.cleanupStatus.startsWith('REVIEW')) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
