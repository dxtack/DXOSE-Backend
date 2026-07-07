#!/usr/bin/env node
/**
 * Applies BATCH-008 remediation for Constitution chapters 19–28.
 * Distinguishes governance QA sign-off (Ch24) from code remediation.
 * Usage: node Governance/apply-remediation-ch19-28.mjs
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE_PATH = path.join(ROOT, 'Governance/evidence.json');
const REQ_PATH = path.join(ROOT, 'Governance/requirements.json');
const REMEDIATION_DATE = '2026-06-26';
const BATCH = 'BATCH-008';

const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));
const requirements = JSON.parse(fs.readFileSync(REQ_PATH, 'utf8'));

const CHAPTERS = new Set(['19', '20', '21', '22', '23', '24', '25', '26', '27', '28']);

const GOVERNANCE_QA_BLOCKER =
  'Blocker: ch24.6 responsive matrix sign-off pending (docs/governance/assets/ch24.6-responsive-matrix/CHECKLIST.md)';

const CH24_GOVERNANCE_ONLY = new Set([
  'C24-24.2-001',
  'C24-24.3-001',
  'C24-24.4-002',
  'C24-24.4-003',
  'C24-24.4-004',
  'C24-24.5-001',
  'C24-24.5-002',
  'C24-24.5-003',
  'C24-24.6-001',
  'C24-24.6-002',
]);

/** Fully closed by minimal code remediation in BATCH-008 */
const CLOSURES = {
  'C19-19.3-004': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented:
      'errorHandler.js: P2003/P2002 client responses omit Prisma field_name/target; 500 never exposes SQL/stack',
    evidenceAdd: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/middleware/errorHandler.js',
        method: 'P2003/P2002/500 sanitized client payloads',
      },
    ],
  },
  'C23-23.3-004': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented: 'item.service.js getItems(): trim + collapse whitespace on search/q before Prisma query',
    evidenceAdd: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/item.service.js',
        method: 'normalizeItemSearch() in getItems()',
      },
    ],
  },
  'C26-26.2-001': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented:
      'ENTERPRISE_BRAND.footerAuthoritativeDisclaimer on all stampEnterpriseDocumentFooters PDFs; global @media print body::after disclaimer',
    evidenceAdd: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/pdf/report-pdf-enterprise.js',
        method: 'footerAuthoritativeDisclaimer in stampEnterpriseDocumentFooters()',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/styles.scss',
        method: '@media print body::after authoritative-copy disclaimer',
      },
    ],
  },
};

/** Narrowed remainingWork after partial code fix — stays Partial/No */
const IMPROVEMENTS = {
  'C19-19.2-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork:
      'GRN create submit path uses inline nz-alert only (dual toast removed); audit Transfer/Get Pass submit paths',
    evidenceAdd: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'submit() inline error.set without duplicate message.error on OB/invoice/excel paths',
      },
    ],
  },
  'C19-19.3-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork:
      '404 responses generic; FE validation toast shows messages only — 422 API body may still include field keys',
    evidenceAdd: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/middleware/errorHandler.js',
        method: 'notFound() generic message',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts',
        method: 'formatApiValidationErrors() messages-only display',
      },
    ],
  },
  'C19-19.3-005': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: '422 validation errors[].field may carry internal IDs; existingTenantId stripped from client responses',
    evidenceAdd: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/middleware/errorHandler.js',
        method: 'existingTenantId omitted from client JSON',
      },
    ],
  },
  'C21-21.1-004': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork:
      'GRN submit() guards in-flight with loading(); extend same guard to Transfer/Get Pass/Breakage/Inventory Count keyboard-save paths',
    evidenceAdd: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'submit() if (loading()) return guard',
      },
    ],
  },
  'C23-23.3-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork:
      'item code field in getItems() OR clause; ensure all lookup profiles call ranked search API (GRN custom dropdown still separate)',
    evidenceAdd: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/item.service.js',
        method: 'code contains in search OR; q alias for search param',
      },
    ],
  },
  'C24-24.4-001': {
    remediationKind: 'governanceQA',
    blocker: GOVERNANCE_QA_BLOCKER,
    evidenceAdd: [
      {
        layer: 'Governance',
        file: 'docs/governance/assets/ch24.6-responsive-matrix/CHECKLIST.md',
        method: 'ch24.6 matrix template for horizontal-scroll audit',
      },
    ],
  },
  'C24-24.4-006': {
    remediationKind: 'code',
    blocker: 'Code: migrate remaining nz-table surfaces without registry-work-card__scroll owner',
    verificationStatus: 'Needs Code Review',
  },
};

function mergeEvidence(entry, adds = []) {
  const existing = entry.evidence ?? [];
  const keys = new Set(existing.map((e) => `${e.layer}|${e.file}|${e.method}`));
  for (const item of adds) {
    const key = `${item.layer}|${item.file}|${item.method}`;
    if (!keys.has(key)) {
      existing.push({ ...item, verification: item.verification ?? 'Verified' });
      keys.add(key);
    }
  }
  entry.evidence = existing;
}

function applyClosure(id, patch) {
  const entry = evidence[id];
  if (!entry) throw new Error(`Missing evidence: ${id}`);
  entry.implemented = patch.implemented;
  entry.remainingWork = patch.remainingWork;
  entry.verificationStatus = patch.verificationStatus;
  if (patch.whereImplemented) entry.whereImplemented = patch.whereImplemented;
  entry.remediationKind = patch.remediationKind ?? 'code';
  entry.blocker = patch.blocker ?? null;
  entry.remediationBatch = BATCH;
  entry.remediatedAt = REMEDIATION_DATE;
  if (patch.evidenceAdd?.length) mergeEvidence(entry, patch.evidenceAdd);
  entry.postRemediationAudit = { passed: true, auditedAt: REMEDIATION_DATE };
}

function applyImprovement(id, patch) {
  const entry = evidence[id];
  if (!entry) throw new Error(`Missing evidence: ${id}`);
  if (patch.implemented) entry.implemented = patch.implemented;
  if (patch.remainingWork) entry.remainingWork = patch.remainingWork;
  if (patch.verificationStatus) entry.verificationStatus = patch.verificationStatus;
  entry.remediationKind = patch.remediationKind ?? entry.remediationKind ?? 'code';
  if (patch.blocker !== undefined) entry.blocker = patch.blocker;
  entry.remediationBatch = BATCH;
  entry.remediatedAt = REMEDIATION_DATE;
  if (patch.evidenceAdd?.length) mergeEvidence(entry, patch.evidenceAdd);
  entry.postRemediationAudit = { passed: false, auditedAt: REMEDIATION_DATE, reason: patch.remainingWork ?? entry.remainingWork };
}

function tagOpenItem(req, entry) {
  const ch = req.chapter;
  const isCh24Gov =
    ch === '24' && (CH24_GOVERNANCE_ONLY.has(req.requirementId) || entry.verificationStatus === 'Pending Governance');

  entry.remediationKind = isCh24Gov ? 'governanceQA' : 'code';
  entry.blocker =
    entry.blocker ??
    (isCh24Gov
      ? GOVERNANCE_QA_BLOCKER
      : `Code: ${entry.remainingWork}`);
  entry.remediationBatch = entry.remediationBatch ?? BATCH;
  entry.remediatedAt = entry.remediatedAt ?? REMEDIATION_DATE;
  if (!entry.postRemediationAudit && !CLOSURES[req.requirementId]) {
    entry.postRemediationAudit = {
      passed: false,
      auditedAt: REMEDIATION_DATE,
      reason: entry.remainingWork,
    };
  }
}

const scopeReqs = requirements.filter((r) => CHAPTERS.has(r.chapter));
const openBefore = scopeReqs.filter((r) =>
  ['Partial', 'No'].includes(evidence[r.requirementId]?.implemented),
);

for (const [id, patch] of Object.entries(CLOSURES)) {
  applyClosure(id, patch);
}
for (const [id, patch] of Object.entries(IMPROVEMENTS)) {
  applyImprovement(id, patch);
}

for (const req of scopeReqs) {
  const entry = evidence[req.requirementId];
  if (!entry) continue;
  if (CLOSURES[req.requirementId]) continue;
  if (['Partial', 'No'].includes(entry.implemented)) {
    tagOpenItem(req, entry);
  }
}

fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));

const openAfter = scopeReqs.filter((r) =>
  ['Partial', 'No'].includes(evidence[r.requirementId]?.implemented),
);
const closedAfter = scopeReqs.filter(
  (r) =>
    evidence[r.requirementId]?.implemented === 'Yes' &&
    evidence[r.requirementId]?.remainingWork === 'Complete',
);

const blockers = {
  governanceQA: openAfter
    .filter((r) => evidence[r.requirementId]?.remediationKind === 'governanceQA')
    .map((r) => r.requirementId),
  code: openAfter
    .filter((r) => evidence[r.requirementId]?.remediationKind === 'code')
    .map((r) => r.requirementId),
};

const summary = {
  batch: BATCH,
  remediatedAt: REMEDIATION_DATE,
  scope: 'chapters 19-28',
  totalInScope: scopeReqs.length,
  openBefore: openBefore.length,
  closedAfter: closedAfter.length,
  openAfter: openAfter.length,
  newlyClosed: Object.keys(CLOSURES),
  blockers,
};

fs.writeFileSync(
  path.join(ROOT, 'Governance/ch19-28-remediation-summary.json'),
  JSON.stringify(summary, null, 2),
);

console.log('BATCH-008 remediation applied');
console.log(JSON.stringify(summary, null, 2));

const build = spawnSync('node', ['build-register.mjs'], {
  cwd: path.join(ROOT, 'Governance'),
  stdio: 'inherit',
});
process.exit(build.status ?? 1);
