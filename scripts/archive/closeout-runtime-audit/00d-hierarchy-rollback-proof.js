'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const prisma = require('../../src/config/database');

const PROOF_FILE = path.join(REPORT_DIR, 'ORG_HIERARCHY_FIXTURE_EXECUTION_PROOF.json');
const ROLLBACK_FILE = path.join(REPORT_DIR, 'ORG_HIERARCHY_FIXTURE_ROLLBACK.json');

async function main() {
  const org = await prisma.tenant.findFirst({ where: { slug: 'dx-hospitality-group' }, select: { id: true, slug: true } });
  const ghBefore = await prisma.tenant.findUnique({
    where: { id: HOTEL_A.id },
    select: { id: true, slug: true, parentId: true, updatedAt: true },
  });

  let rollbackRecord = null;
  if (fs.existsSync(ROLLBACK_FILE)) {
    rollbackRecord = JSON.parse(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
  }

  const previousParentId = rollbackRecord?.previousParentId ?? null;
  let rollbackAction = 'none';
  let rollbackExecuted = false;

  if (ghBefore?.parentId === org?.id && previousParentId !== org?.id) {
    await prisma.tenant.update({
      where: { id: HOTEL_A.id },
      data: { parentId: previousParentId },
    });
    rollbackAction = 'restored_previousParentId';
    rollbackExecuted = true;
  } else if (ghBefore?.parentId === org?.id) {
    await prisma.tenant.update({
      where: { id: HOTEL_A.id },
      data: { parentId: null },
    });
    rollbackAction = 'restored_null_parentId';
    rollbackExecuted = true;
  } else {
    rollbackAction = 'no_change_needed';
  }

  const ghAfter = await prisma.tenant.findUnique({
    where: { id: HOTEL_A.id },
    select: { id: true, slug: true, parentId: true, updatedAt: true },
  });

  const proof = {
    executedAt: new Date().toISOString(),
    tag: FIXTURE_TAG,
    tenant: HOTEL_A.slug,
    tenantId: HOTEL_A.id,
    beforeTestRound4: ghBefore,
    rollbackRecordOnDisk: rollbackRecord,
    rollbackExecuted,
    rollbackAction,
    afterRollback: ghAfter,
    dbQueryAfterRollback: {
      sql: `SELECT id, slug, "parentId" FROM tenants WHERE slug = 'grand-horizon'`,
      result: ghAfter,
    },
    contaminationStatus:
      ghAfter?.parentId === org?.id
        ? 'DATA_FIXTURE_CONTAMINATION — parentId still linked to org'
        : 'RESTORED — grand-horizon parentId no longer artificially linked',
    resultsRunDuringHierarchyChange: [
      '02-acc-operational-legacy.js (Round 3) — ORG legacy routes used org switch',
      '06-workflow-runtime.js partial',
    ],
    validityAfterRestore:
      'ACC legacy ORG scenarios require disposable test org hierarchy; results from Round 3 ORG paths under modified hierarchy are INVALID for production claims',
    policyGoingForward:
      'Do not modify grand-horizon.parentId. Use test-only org/child tenants in 00e-disposable-org-fixture.js',
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PROOF_FILE, JSON.stringify(proof, null, 2));
  console.log('Hierarchy rollback proof:', proof.contaminationStatus);
  console.log('parentId after:', ghAfter?.parentId);
  await prisma.$disconnect();
  if (proof.contaminationStatus.startsWith('DATA_FIXTURE')) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
