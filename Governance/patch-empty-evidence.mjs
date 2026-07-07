#!/usr/bin/env node
/** Adds structured negative-search evidence for rows that had empty evidence arrays. */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE = path.join(ROOT, 'Governance/evidence.json');
const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));

const patches = {
  'C06-6.5-002': {
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/periodGuard.service.js',
        method: 'checkPeriodLock() — closed-period only; no future-posting-date rule',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src',
        method: 'repo grep: no future-posting-date restriction on postingDate',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.4-001': {
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/prisma/schema.prisma',
        method: 'grep: no draftOwner / draft_owner field on governed document models',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'saveGrnDraft() — importedBy only; no draft-owner policy',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.4-002': {
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src',
        method: 'grep: no draft access-rights policy service or schema',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.4-003': {
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src',
        method: 'grep: no draft ownership transfer rules',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.4-004': {
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src',
        method: 'grep: no inactive/departed-user draft handling',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-001': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no autoSave/autosave on business events platform-wide',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'saveGrnDraft() — explicit save only, not event-driven auto-save',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-002': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no auto-save on add/delete row',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-003': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no auto-save on quantity/price change',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-004': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no auto-save on supplier/warehouse change',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-005': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no auto-save on attachment change',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-006': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no auto-save on notes change',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.8-001': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no draft recovery flow with current-validation enforcement',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.8-002': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no restored-document revalidation gate',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.9-001': {
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/prisma/schema.prisma',
        method: 'grep: no per-family draft registry table/service',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.9-002': {
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src',
        method: 'grep: no 30-day draft retention policy implementation',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.9-003': {
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src',
        method: 'grep: no draft expiration (delete/archive/expired) policy',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.10-003': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/guards/document-draft-can-deactivate.guard.ts',
        method: 'confirmDeactivate() prompt only on GRN create route',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no beforeunload/tab-close protection platform-wide',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.10-005': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core',
        method: 'grep: no session-expiration unsaved-changes handler',
        verification: 'Verified',
      },
    ],
  },
  'C08-8.6-006': {
    implemented: 'Partial',
    remainingWork:
      'Cancel uses status guard (e.g. DRAFT-only) but no concurrencyVersion/idempotent cancel detection platform-wide',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/inventoryCount.service.js',
        method: 'cancelSession() rejects non-DRAFT (state guard only)',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src',
        method: 'grep: no cancel double-execution version detection',
        verification: 'Verified',
      },
    ],
  },
  'C08-8.7-001': {
    implemented: 'Partial',
    remainingWork:
      'concurrencyVersion on document updates (Transfer/Get Pass) but postingGovernedGrn lacks version check at post',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/transfer.service.js',
        method: 'assertConcurrencyVersion() on mutations',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/postingGovernedGrn.service.js',
        method: 'grep: no concurrencyVersion assert in post path',
        verification: 'Verified',
      },
    ],
  },
  'C11-11.4-004': {
    implemented: 'No',
    remainingWork: 'Report Excel export paths use hardcoded SAR column labels, not displayCurrency',
    verificationStatus: 'Pending Governance',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/reports/report-engine/report-views/detail-report-table.component.html',
        method: 'REPORTS.DETAIL.COL_VALUE_SAR hardcoded headers',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/reports/utils/report-format.util.ts',
        method: 'formatSarAmount() hardcoded SAR prefix',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/report.service.js',
        method: 'exportExcel() — no displayCurrency.service usage',
        verification: 'Verified',
      },
    ],
  },
  'C11-11.4-005': {
    implemented: 'No',
    remainingWork: 'Print/PDF report paths not verified to use property display currency',
    verificationStatus: 'Pending Governance',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/reports/report-engine/report-engine.component.ts',
        method: 'print() fetches official PDF; no displayCurrency coupling',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/reports/summary-inventory-report/summary-inventory-report.component.html',
        method: 'VALUES_SAR_CAPTION hardcoded',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-003': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/shared',
        method: 'grep: no row-end Enter navigation shared helper',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-004': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app',
        method: 'grep: no Shift+Enter previous-field navigation',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-006': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/shared',
        method: 'grep: no shared Esc-close for lookups/overlays',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-008': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/shared',
        method: 'grep: no invalid-field focus retention on validation failure',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-002': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app',
        method: 'grep: no focusFirstError / scrollToFirst validation helper',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-003': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app',
        method: 'grep: no multi-error summary banner with error count',
        verification: 'Verified',
      },
    ],
  },
  'C20-20.2-002': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app',
        method: 'grep: no notification deduplication layer',
        verification: 'Verified',
      },
    ],
  },
  'C21-21.3-001': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app',
        method: 'grep: no long-running operation continuation messaging',
        verification: 'Verified',
      },
    ],
  },
  'C23-23.4-006': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app',
        method: 'grep: no single-open lookup coordinator/registry',
        verification: 'Verified',
      },
    ],
  },
  'C23-23.5-002': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/public/i18n/en.json',
        method: 'per-screen empty strings (e.g. GRN.CREATE.NO_ITEMS) not shared lookup empty state',
        verification: 'Verified',
      },
    ],
  },
  'C24-24.4-002': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend',
        method: 'grep: no title-clip regression tests or CI checks',
        verification: 'Verified',
      },
    ],
  },
  'C24-24.4-003': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend',
        method: 'grep: no button-overlap regression suite',
        verification: 'Verified',
      },
    ],
  },
  'C24-24.5-002': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src',
        method: 'grep: no DPI/2K/4K-specific handling or test artifacts',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/shared/styles',
        method: 'standard responsive SCSS only',
        verification: 'Verified',
      },
    ],
  },
  'C24-24.5-003': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend',
        method: 'grep: no multi-monitor consistency tests',
        verification: 'Verified',
      },
    ],
  },
  'C28-28.1-003': {
    evidence: [
      {
        layer: 'Governance',
        file: 'OSE-Frontend',
        method: 'grep: no WCAG contrast test artifacts or CI token checks',
        verification: 'Verified',
      },
    ],
  },
  'C28-28.2-001': {
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend',
        method: 'grep: no screen-reader test matrix for governed interactions',
        verification: 'Verified',
      },
    ],
  },
};

for (const [id, patch] of Object.entries(patches)) {
  if (!evidence[id]) throw new Error(`Missing ${id}`);
  Object.assign(evidence[id], patch);
}

const stillEmpty = Object.entries(evidence).filter(([, v]) => !v.evidence?.length);
if (stillEmpty.length) {
  console.error(
    'Still empty:',
    stillEmpty.map(([k]) => k).join(', '),
  );
  process.exit(1);
}

fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log('Patched', Object.keys(patches).length, 'entries');

spawnSync('node', ['build-register.mjs'], {
  cwd: path.join(ROOT, 'Governance'),
  stdio: 'inherit',
});
