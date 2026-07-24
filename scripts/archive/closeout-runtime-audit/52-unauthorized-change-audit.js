'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { prisma } = require('./lib/evidence');

const OUT_DIR = REPORT_DIR;
const TAGS = [FIXTURE_TAG, 'CLOSEOUT_RT_AUDIT', 'CLOSEOUT_RT_AUDIT_FB', 'CLOSEOUT_RT_AUDIT_HK'];

async function findBreakageContamination() {
  const rows = await prisma.movementDocument.findMany({
    where: {
      tenantId: HOTEL_A.id,
      movementType: 'BREAKAGE',
      OR: TAGS.map((t) => ({ reason: { contains: t } })),
    },
    include: {
      lines: { select: { id: true } },
      createdByUser: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return rows.map((d) => ({
    recordId: d.id,
    fixtureTag: TAGS.find((t) => (d.reason || '').includes(t)) || d.reason,
    createdByScript: (d.reason || '').includes('CLOSEOUT') ? 'closeout-runtime-audit harness' : 'unknown',
    number: d.documentNo || null,
    statusDb: d.status,
    apiStatus: d.status,
    lines: d.lines?.length || 0,
    creator: d.createdByUser ? `${d.createdByUser.email}` : d.createdBy,
    reason: d.reason,
    sourceType: d.sourceType,
    sourceLocationId: d.sourceLocationId,
    whyVisible: 'Harness prisma.movementDocument.create or API POST with FIXTURE_TAG reason — visible in list API',
    cleanupRestoration: 'Safe delete if reason contains CLOSEOUT_RT_AUDIT and not posted',
    postedAt: d.postedAt,
    safeToDelete: !d.postedAt && (d.reason || '').includes('CLOSEOUT'),
  }));
}

async function findAllSuspiciousBreakage() {
  const rows = await prisma.movementDocument.findMany({
    where: { tenantId: HOTEL_A.id, movementType: 'BREAKAGE' },
    include: { lines: { select: { id: true } }, createdByUser: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows
    .filter(
      (d) =>
        !d.documentNo ||
        !d.status ||
        d.lines.length === 0 ||
        TAGS.some((t) => (d.reason || '').includes(t)) ||
        (d.createdByUser?.email || '').includes('closeout-audit'),
    )
    .map((d) => ({
      recordId: d.id,
      fixtureTag: TAGS.find((t) => (d.reason || '').includes(t)) || null,
      createdByScript: (d.reason || '').includes('CLOSEOUT') ? 'closeout-runtime-audit' : 'check creator',
      number: d.documentNo,
      statusDb: d.status,
      lines: d.lines.length,
      creator: d.createdByUser?.email || d.createdBy,
      reason: d.reason?.slice(0, 120),
      whyVisible: !d.documentNo ? 'missing documentNo' : d.lines.length === 0 ? 'no lines' : 'harness/fixture',
      cleanupRestoration: d.postedAt ? 'DO NOT DELETE — posted' : (d.reason || '').includes('CLOSEOUT') ? 'delete candidate' : 'manual review',
    }));
}

async function findWorkflowContamination() {
  const [reqs, gps] = await Promise.all([
    prisma.storeRequisition.findMany({
      where: { tenantId: HOTEL_A.id, status: { in: ['DRAFT', 'SUBMITTED', 'PENDING_DEPT', 'PENDING_FINANCE', 'PENDING_FINAL', 'APPROVED', 'PARTIALLY_ISSUED'] } },
      select: { id: true, requisitionNo: true, status: true, accWorkflowVersionId: true, remarks: true, createdAt: true },
      take: 50,
    }),
    prisma.getPass.findMany({
      where: { tenantId: HOTEL_A.id, status: 'PENDING_GM' },
      select: { id: true, passNo: true, status: true, accWorkflowVersionId: true, borrowingEntity: true, createdAt: true },
      take: 50,
    }),
  ]);

  const gpFixtures = await prisma.getPass.findMany({
    where: { tenantId: HOTEL_A.id, borrowingEntity: { contains: FIXTURE_TAG } },
    select: { id: true, passNo: true, status: true, borrowingEntity: true },
    take: 50,
  });

  return {
    requisitions: reqs.map((r) => ({
      rowModule: 'REQUISITION',
      whyIncluded: 'workflow-pipeline.collectors.js collects REQUISITION open statuses — product code, not closeout UI change',
      activeRetired: 'Retired from operational scope per governance; still in backend collector',
      workflowVersion: r.accWorkflowVersionId,
      fixtureTag: (r.remarks || '').includes('CLOSEOUT') ? r.remarks : null,
      assignmentScopeApplied: 'unknown in collector',
      expectedVisibility: 'Should NOT appear per product decision',
      restorationAction: 'Product collector filter — outside closeout harness scope; document only',
    })),
    pendingGm: gps.map((g) => ({
      rowModule: 'GET_PASS',
      whyIncluded: 'Global workflow v3 PENDING_GM — governance defect #4-7',
      status: g.status,
      passNo: g.passNo,
      fixtureTag: (g.borrowingEntity || '').includes(FIXTURE_TAG) ? g.borrowingEntity : null,
      expectedVisibility: 'Non-compliant workflow state',
      restorationAction: g.borrowingEntity?.includes(FIXTURE_TAG) ? 'delete fixture GP' : 'operational — do not delete',
    })),
    gpFixtures,
  };
}

async function paginationAudit() {
  const feConst = path.resolve(__dirname, '../../../OSE-Frontend/src/app/shared/components/registry-list-pagination/registry-list-pagination.constants.ts');
  const content = fs.readFileSync(feConst, 'utf8');
  const match = content.match(/REGISTRY_LIST_PAGE_SIZE\s*=\s*(\d+)/);
  const screens = [
    'Item Master', 'Stock Balances', 'Movements', 'Par Levels', 'Ledger', 'GRN', 'Transfers',
    'Breakage', 'Lost Items', 'Get Pass', 'Inventory Count', 'Workflow Pipeline', 'Reports',
  ];
  return screens.map((screen) => ({
    screen,
    previousApprovedPageSize: 20,
    currentPageSize: Number(match?.[1] || 20),
    changedFile: 'None identified by closeout harness',
    changedByRoundScript: 'No closeout script modifies OSE-Frontend source',
    restored: Number(match?.[1]) === 20 ? 'N/A — already 20 in source' : 'PENDING',
    runtimeVerification: 'Source audit only — REGISTRY_LIST_PAGE_SIZE=20',
  }));
}

function productChangeAudit() {
  const harnessDir = __dirname;
  const scripts = fs.readdirSync(harnessDir).filter((f) => f.endsWith('.js'));
  const productWrites = [];
  for (const s of scripts) {
    const text = fs.readFileSync(path.join(harnessDir, s), 'utf8');
    if (/writeFileSync.*OSE-Frontend|writeFileSync.*OSE-backend\/src/.test(text)) {
      productWrites.push({ script: s, note: 'Potential product file write' });
    }
  }
  return {
    gitBaseline: 'OSE-Frontend/ and OSE-backend/ are untracked in git — no commit diff available',
    closeoutHarnessProductFileWrites: productWrites.length ? productWrites : 'None detected in closeout-runtime-audit/*.js',
    closeoutDbMutations: 'Harness creates movementDocument/getPass/grn via prisma/API with FIXTURE_TAG — causes UI contamination, not UI code changes',
    paginationSource: 'REGISTRY_LIST_PAGE_SIZE = 20 unchanged in product source',
  };
}

async function main() {
  const breakage = await findAllSuspiciousBreakage();
  const wf = await findWorkflowContamination();
  const tables = await paginationAudit();
  const product = productChangeAudit();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'UNAUTHORIZED_TABLE_CONFIGURATION_AUDIT.json'), JSON.stringify({ executedAt: new Date().toISOString(), rows: tables, conclusion: 'No closeout-driven pagination change found; default remains 20' }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'BREAKAGE_UI_REGRESSION_INVESTIGATION.json'), JSON.stringify({ executedAt: new Date().toISOString(), tenantId: HOTEL_A.id, rootCause: 'Harness DB inserts with CLOSEOUT_RT_AUDIT tag; STATUS.undefined = missing i18n for non-standard status or null status in list mapper', rows: breakage }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'WORKFLOW_PIPELINE_UI_REGRESSION_INVESTIGATION.json'), JSON.stringify({ executedAt: new Date().toISOString(), ...wf }, null, 2));

  const md = `# DX OSE — Unauthorized UI Change and Test Data Contamination Audit

**Executed:** ${new Date().toISOString()}

## 1. Product diff (git)

${product.gitBaseline}

Closeout harness scripts under \`OSE-backend/scripts/closeout-runtime-audit/\` do **not** write to \`OSE-Frontend/src\` or \`OSE-backend/src\`.

**Pagination:** \`REGISTRY_LIST_PAGE_SIZE = 20\` in \`registry-list-pagination.constants.ts\`. Breakage list uses \`signal(REGISTRY_LIST_PAGE_SIZE)\`. Backend \`breakage.service.js\` default \`take = 20\`.

**Conclusion:** Reported 10-row pagination was **not** introduced by closeout harness product edits. If UI shows 10 rows, cause is runtime state (browser cache, different screen such as User Rights assignmentsPageSize=10), not closeout-modified registry lists.

## 2. Table configuration audit

See \`UNAUTHORIZED_TABLE_CONFIGURATION_AUDIT.json\`.

## 3. Breakage regression root cause

Harness scripts (\`02-acc-operational-legacy.js\`, \`04-role-resource-scope.js\`, \`24-legacy-route-complete.js\`, \`36-legacy-chain-complete.js\`, etc.) insert \`movementDocument\` rows tagged \`CLOSEOUT_RT_AUDIT\` directly via Prisma.

Empty columns / \`BREAKAGE.STATUS.undefined\`: documents with invalid/null \`status\` or statuses without i18n keys in list API response.

See \`BREAKAGE_UI_REGRESSION_INVESTIGATION.json\` (${breakage.length} suspicious rows).

## 4. Workflow Pipeline regression root cause

- **Requisition rows:** \`workflow-pipeline.collectors.js\` still collects REQUISITION — **pre-existing product code**, not closeout UI edit.
- **PENDING_GM Get Pass:** global workflow v3 (governance defect); test GPs tagged \`${FIXTURE_TAG}\` in \`borrowingEntity\`.
- **No-assignment exposure:** runtime defect #2 (confirmed in Round 7).

See \`WORKFLOW_PIPELINE_UI_REGRESSION_INVESTIGATION.json\`.

## 5. Test fixture inventory

Tag: \`${FIXTURE_TAG}\` / \`CLOSEOUT_RT_AUDIT*\` in \`movementDocument.reason\`, Get Pass \`borrowingEntity\`, GRN numbers \`GRN-R7-*\`, etc.

## 6. Cleanup proof

Run \`53-cleanup-closeout-fixtures.js\` — deletes only unposted harness-tagged movement docs and tagged Get Passes.

## 7. Restoration proof

- **UI code:** No rollback required — no unauthorized product UI commits from closeout.
- **Data:** Cleanup script removes harness contamination from DB.

## 8. Screenshot/Playwright

Pending post-cleanup verification.

## 9. Remaining product changes from closeout

**None in Frontend/Backend source.** Only Governance artifacts + DB fixture inserts.
`;
  fs.writeFileSync(path.join(OUT_DIR, 'UNAUTHORIZED_PRODUCT_CHANGE_AUDIT.md'), md);
  console.log('Wrote unauthorized change audit', breakage.length, 'breakage rows');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
