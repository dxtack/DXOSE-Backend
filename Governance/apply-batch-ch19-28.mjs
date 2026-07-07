#!/usr/bin/env node
/**
 * Applies BATCH-CH19-28 evidence closures after code remediation.
 * Only marks Yes when requirement is fully satisfied — no false Yes.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE_PATH = path.join(ROOT, 'Governance/evidence.json');
const BATCH = 'BATCH-CH19-28';
const REMEDIATION_DATE = '2026-06-25';

const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));

/** Fully closed — verified compliant after minimal code remediation */
const CLOSURES = {
  'C19-19.3-005': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented:
      'errorHandler.js omits UUID field keys and existingTenantId from client validation/error JSON',
    evidenceAdd: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/middleware/errorHandler.js',
        method: 'sanitizeClientValidationErrors() + omitInternalClientFields()',
      },
    ],
  },
  'C23-23.3-002': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented:
      'item-search-rank.util.js: exact code → exact barcode → prefix → contains; applied in getItems() and receiving lookup',
    evidenceAdd: [
      { layer: 'Backend', file: 'OSE-backend/src/utils/item-search-rank.util.js', method: 'sortItemsBySearchRank()' },
      { layer: 'Backend', file: 'OSE-backend/src/services/item.service.js', method: 'ranked getItems() search results' },
      { layer: 'Backend', file: 'OSE-backend/src/services/location-item-resolution.service.js', method: 'ranked receiving lookup results' },
    ],
  },
  'C23-23.4-001': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented:
      'GRN custom dropdown ArrowUp/ArrowDown via lookup-dropdown-keyboard.util; nz-select surfaces inherit ng-zorro keyboard nav',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/utils/lookup-dropdown-keyboard.util.ts', method: 'handleLookupDropdownKeydown() ArrowUp/ArrowDown' },
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'onItemSearchKeydown() + itemHighlightIndex' },
    ],
  },
  'C23-23.4-002': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented: 'GRN custom dropdown Enter select / Esc dismiss / Tab close; nz-select Enter/Esc/Tab native',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/utils/lookup-dropdown-keyboard.util.ts', method: 'Enter/Esc/Tab contract' },
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'onItemSearchKeydown()' },
    ],
  },
  'C23-23.4-003': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented: 'GRN addItem() and keyboard select close dropdown; nz-select closes on pick',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'closeItemDropdown() on addItem/selectAt' },
    ],
  },
  'C23-23.4-004': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented: 'GRN document click listener dismisses custom dropdown outside search wrap',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'onDocumentClick() HostListener' },
    ],
  },
  'C23-23.4-005': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented: 'GRN item search input blur closes dropdown (mousedown guard preserves click-select)',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'onItemSearchBlur()' },
    ],
  },
  'C23-23.4-006': {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    whereImplemented: 'LookupOpenRegistryService closes prior custom dropdown when another opens',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/services/lookup-open-registry.service.ts', method: 'register() closes previous' },
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'openItemDropdown() registry' },
    ],
  },
};

/** Partial progress — documented, not Yes */
const IMPROVEMENTS = {
  'C19-19.2-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN submit uses inline nz-alert only; audit Transfer/Get Pass submit duplicate toast paths',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'submit() inline error.set without duplicate toast on validation paths' },
    ],
  },
  'C19-19.3-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: '404/500 sanitized; non-UUID field keys stripped from validation errors — audit remaining technical detail in messages',
    evidenceAdd: [
      { layer: 'Backend', file: 'OSE-backend/src/middleware/errorHandler.js', method: 'sanitizeClientValidationErrors() messages-only field policy' },
    ],
  },
  'C23-23.3-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork:
      'GRN item line uses InventoryService receiving lookup with code/name/barcode; migrate remaining party/location pickers from bulk client loads',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'inventoryApi.getItemsByLocation receiving mode' },
      { layer: 'Backend', file: 'OSE-backend/src/services/location-item-resolution.service.js', method: 'search OR name/code/barcode' },
    ],
  },
  'C23-23.3-003': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN item search debounceTime(300); extend debounce to all server-driven lookup HTTP calls platform-wide',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'search$.pipe(debounceTime(300))' },
    ],
  },
  'C21-21.1-004': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork:
      'Double-submit guards on Transfer save, Get Pass save/submit, Breakage submit; extend to Inventory Count keyboard-save path',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'submit() + keyboard-save loading guard' },
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts', method: 'save() if (saving()) return' },
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/get-pass/get-pass-form/get-pass-form.component.ts', method: 'saveDraft/submitForApproval saving guard' },
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/breakage/breakage-create-modal/breakage-create-modal.component.ts', method: 'submit() loading guard' },
    ],
  },
  'C23-23.4-007': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN focusLineQty() after item pick; extend qty focus to Transfer/Get Pass/Breakage nz-select line entry',
    evidenceAdd: [
      { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'focusLineQty() after addItem' },
    ],
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

function applyPatch(id, patch, pass) {
  const entry = evidence[id];
  if (!entry) throw new Error(`Missing evidence: ${id}`);
  if (patch.implemented) entry.implemented = patch.implemented;
  if (patch.remainingWork) entry.remainingWork = patch.remainingWork;
  if (patch.verificationStatus) entry.verificationStatus = patch.verificationStatus;
  if (patch.whereImplemented) entry.whereImplemented = patch.whereImplemented;
  entry.remediationKind = patch.remediationKind ?? 'code';
  entry.blocker = pass ? null : (patch.blocker ?? entry.blocker);
  entry.remediationBatch = BATCH;
  entry.remediatedAt = REMEDIATION_DATE;
  if (patch.evidenceAdd?.length) mergeEvidence(entry, patch.evidenceAdd);
  entry.postRemediationAudit = {
    passed: pass,
    auditedAt: REMEDIATION_DATE,
    ...(pass ? {} : { reason: patch.remainingWork ?? entry.remainingWork }),
  };
}

const CH24_GOV = new Set([
  'C24-24.2-001', 'C24-24.3-001', 'C24-24.4-001', 'C24-24.4-002', 'C24-24.4-003',
  'C24-24.4-004', 'C24-24.5-001', 'C24-24.5-002', 'C24-24.5-003', 'C24-24.6-001', 'C24-24.6-002',
]);
const GOV_BLOCKER =
  'Blocker: ch24.6 responsive matrix sign-off pending (docs/governance/assets/ch24.6-responsive-matrix/CHECKLIST.md)';

for (const [id, patch] of Object.entries(CLOSURES)) {
  applyPatch(id, patch, true);
}
for (const [id, patch] of Object.entries(IMPROVEMENTS)) {
  applyPatch(id, patch, false);
}

const requirements = JSON.parse(fs.readFileSync(path.join(ROOT, 'Governance/requirements.json'), 'utf8'));
for (const req of requirements) {
  const ch = +req.chapter;
  if (ch < 19 || ch > 28) continue;
  const entry = evidence[req.requirementId];
  if (!entry || CLOSURES[req.requirementId]) continue;
  if (entry.implemented === 'Yes') continue;
  if (!entry.remediationBatch) {
    entry.remediationBatch = BATCH;
    entry.remediatedAt = REMEDIATION_DATE;
  }
  if (CH24_GOV.has(req.requirementId)) {
    entry.remediationKind = 'governanceQA';
    entry.blocker = entry.blocker ?? GOV_BLOCKER;
  } else if (entry.implemented !== 'Yes') {
    entry.remediationKind = entry.remediationKind ?? 'code';
    entry.blocker = entry.blocker ?? `Code: ${entry.remainingWork}`;
  }
}

fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));

const scope = requirements.filter((r) => +r.chapter >= 19 && +r.chapter <= 28);
const openAfter = scope.filter((r) => evidence[r.requirementId]?.implemented !== 'Yes');
const closedAfter = scope.filter((r) => evidence[r.requirementId]?.implemented === 'Yes');
const summary = {
  batch: BATCH,
  remediatedAt: REMEDIATION_DATE,
  scope: 'chapters 19-28',
  totalInScope: scope.length,
  closedAfter: closedAfter.length,
  openAfter: openAfter.length,
  newlyClosed: Object.keys(CLOSURES),
  blockers: {
    governanceQA: openAfter.filter((r) => evidence[r.requirementId]?.remediationKind === 'governanceQA').map((r) => r.requirementId),
    code: openAfter.filter((r) => evidence[r.requirementId]?.remediationKind === 'code').map((r) => r.requirementId),
  },
};

fs.writeFileSync(path.join(ROOT, 'Governance/ch19-28-remediation-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

const build = spawnSync('node', ['build-register.mjs'], {
  cwd: path.join(ROOT, 'Governance'),
  stdio: 'inherit',
});
process.exit(build.status ?? 1);
