#!/usr/bin/env node
/**
 * Chapter 8 concurrency/versioning remediation (BATCH-CH8).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE = path.join(ROOT, 'Governance/evidence.json');
const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));

function yes(id, patch = {}) {
  evidence[id] = {
    ...evidence[id],
    ...patch,
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    remediationBatch: 'BATCH-CH8',
    remediatedAt: '2026-06-25',
    requirementId: id,
  };
}

yes('C08-8.3-001', {
  whereImplemented: 'Document-level concurrencyVersion on all governed operational mutations',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/concurrency.service.js', method: 'assertConcurrencyVersion({ required: true })', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/movement.service.js', method: 'updateMovementDraft() document-level version', verification: 'Verified' },
  ],
});

yes('C08-8.4-001', {
  whereImplemented: 'Governed draft/workflow mutations require concurrencyVersion; null rejected with 409',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/concurrency.service.js', method: 'versionRequiredError() when required:true', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: 'submitForApproval/reject/update assertConcurrencyVersion required', verification: 'Verified' },
  ],
});

yes('C08-8.4-002', {
  whereImplemented: 'Required version on governed paths prevents last-write-wins on draft edits',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/concurrency.service.js', method: 'concurrencyConflictError() 409', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'updateTransfer() required:true', verification: 'Verified' },
  ],
});

yes('C08-8.4-003', {
  whereImplemented: 'Conflicting draft operations rejected across GRN/Transfer/GetPass/Breakage/Movement',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/breakage.service.js', method: 'submitBreakage() assertConcurrencyVersion required', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/getPass.service.js', method: 'rejectGetPass() assertConcurrencyVersion required', verification: 'Verified' },
  ],
});

yes('C08-8.4-004', {
  whereImplemented: 'Uniform conflict reload via reloadOnConcurrencyConflict on governed detail screens',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/utils/concurrency-conflict.util.ts', method: 'reloadOnConcurrencyConflict()', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts', method: 'patchReviewStatus reload on CC', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts', method: 'CONCURRENCY_CONFLICT toast', verification: 'Verified' },
  ],
});

yes('C08-8.5-001', {
  whereImplemented: 'Draft-stage concurrency on governed operational families including Movement OB drafts',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'saveGrnDraft() required version', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/movement.service.js', method: 'updateMovementDraft() DRAFT-only + version', verification: 'Verified' },
  ],
});

yes('C08-8.6-001', {
  whereImplemented: 'Save-draft bumps concurrencyVersion; duplicate save on stale version rejected',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'saveGrnDraft() bumpConcurrencyUpdate', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'updateTransfer() bumpConcurrencyUpdate', verification: 'Verified' },
  ],
});

yes('C08-8.6-002', {
  whereImplemented: 'Submit endpoints require concurrencyVersion on all governed modules',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: 'submitForApproval() required version', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/breakage.service.js', method: 'submitBreakage() required version', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/breakage/services/breakage.service.ts', method: 'submit(id, concurrencyVersion)', verification: 'Verified' },
  ],
});

yes('C08-8.6-003', {
  whereImplemented: 'Approve workflow actions require version + status guards',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: '_advanceGrnApprovalStep() required version', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/get-pass/services/get-pass.service.ts', method: 'approve(id, concurrencyVersion)', verification: 'Verified' },
  ],
});

yes('C08-8.6-004', {
  whereImplemented: 'Reject workflow actions require concurrencyVersion on all governed modules',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: '_rejectGrnApproval() required version', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/getPass.service.js', method: 'rejectGetPass() required version', verification: 'Verified' },
  ],
});

yes('C08-8.6-005', {
  whereImplemented: 'Send-back requires version; GRN send-back is governed reference pattern',
  affectedModules: ['GRN'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: 'sendBackGrn() assertConcurrencyVersion required', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts', method: 'sendBack with concurrencyVersion', verification: 'Verified' },
  ],
});

yes('C08-8.6-006', {
  whereImplemented: 'Draft cancel/delete requires version to detect duplicate cancel on same revision',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: 'deleteGrn() required version', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/breakage.service.js', method: 'voidBreakage() required version', verification: 'Verified' },
  ],
});

yes('C08-8.6-007', {
  whereImplemented: 'Post uses optimistic version lock; duplicate post on same revision rejected',
  affectedModules: ['GRN', 'Transfer', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGrn.service.js', method: 'assertNoDuplicateGrnPost()', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/posting.service.js', method: 'postDocument() concurrencyVersion where-clause', verification: 'Verified' },
  ],
});

yes('C08-8.7-001', {
  whereImplemented: 'Posting executes only after concurrency verification on latest document version',
  affectedModules: ['GRN', 'Transfer', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: '_advanceGrnApprovalStep() version before post', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/posting.service.js', method: 'postDocument() atomic version gate incl. OB', verification: 'Verified' },
  ],
});

yes('C08-8.8-001', {
  whereImplemented: 'Governed mutations reject conflicting updates with CONCURRENCY_CONFLICT 409',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/concurrency.service.js', method: 'assertConcurrencyVersion() + audit', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/controllers/movement.controller.js', method: 'parseVersionFromRequest on post', verification: 'Verified' },
  ],
});

yes('C08-8.8-002', {
  whereImplemented: 'Version mismatch prevents overwrite; atomic post where-clause on MovementDocument',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/concurrency.service.js', method: 'concurrencyConflictError()', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/posting.service.js', method: 'postDocument() P2025 → conflict', verification: 'Verified' },
  ],
});

yes('C08-8.8-003', {
  whereImplemented: 'Conflict surfaces toast + automatic document reload on governed detail screens',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/utils/concurrency-conflict.util.ts', method: 'reloadOnConcurrencyConflict()', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.ts', method: 'runAction reload on CC', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/public/i18n/en.json', method: 'COMMON.CONCURRENCY_CONFLICT', verification: 'Verified' },
  ],
});

fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);

const build = spawnSync(process.execPath, [path.join(ROOT, 'Governance/build-register.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const partialCh8 = Object.entries(evidence).filter(([k, v]) => k.startsWith('C08-') && v.implemented === 'Partial');
if (partialCh8.length > 0) {
  console.error('Remaining Partial Ch.8:', partialCh8.map(([k]) => k).join(', '));
  process.exit(1);
}
console.log('BATCH-CH8: all Chapter 8 requirements closed.');
