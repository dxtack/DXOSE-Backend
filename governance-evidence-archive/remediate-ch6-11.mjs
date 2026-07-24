/**
 * HISTORICAL ONLY — SUPERSEDED BY CHAPTER 6 D1–D12 AMENDMENT
 * Do not run against amended Chapter 6 requirements (CH6-D1-D12-2026-07-05).
 */
#!/usr/bin/env node
/**
 * Applies verified ch6-11 evidence closures after code remediation (BATCH-CH6-11).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE = path.join(ROOT, 'governance-evidence-archive/evidence.json');
const BATCH = path.join(ROOT, 'governance-evidence-archive/ch6-11-verification-batch.json');
const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
const batchHints = Object.fromEntries(
  JSON.parse(fs.readFileSync(BATCH, 'utf8')).map((r) => [r.requirementId, r]),
);

function yes(id, patch = {}) {
  const hint = batchHints[id] ?? {};
  evidence[id] = {
    ...evidence[id],
    ...hint,
    ...patch,
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    remediationBatch: 'BATCH-CH6-11',
    remediatedAt: '2026-06-25',
  };
}

function partial(id, patch) {
  evidence[id] = {
    ...evidence[id],
    implemented: 'Partial',
    verificationStatus: patch.verificationStatus ?? 'Needs Code Review',
    remediationBatch: 'BATCH-CH6-11',
    remediatedAt: '2026-06-25',
    ...patch,
  };
}

function no(id, patch) {
  evidence[id] = {
    ...evidence[id],
    implemented: 'No',
    remediationBatch: 'BATCH-CH6-11',
    remediatedAt: '2026-06-25',
    ...patch,
  };
}

// ── Ch.6 ────────────────────────────────────────────────────────────────────
yes('C06-6.3-001', {
  whereImplemented: 'DB: permanent document-date fields per governed family',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass', 'Movement', 'Lost Items', 'Inventory Count'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/prisma/schema.prisma', method: 'GrnImport.receivingDate; StoreTransfer.transferDate; MovementDocument.documentDate; StockCountSession.countDate', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/lostItems.service.js', method: 'documentDate on create/post', verification: 'Verified' },
  ],
});

yes('C06-6.3-002', {
  whereImplemented: 'Workflow: posting engines set postingDate at commit',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGrn.service.js', method: 'postGrnInTransaction() sets postingDate', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/posting.service.js', method: 'movement/OB post sets postingDate', verification: 'Verified' },
  ],
});

yes('C06-6.3-003', {
  whereImplemented: 'Shared: resolvePostingPeriod() at post',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/postingPeriod.util.js', method: 'resolvePostingPeriod()', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedTransfer.service.js', method: 'assignedPostingPeriod at post', verification: 'Verified' },
  ],
});

yes('C06-6.3-004', {
  whereImplemented: 'API: document date vs posting date stored separately; period lock uses document date',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/prisma/schema.prisma', method: 'receivingDate/documentDate vs postingDate columns', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/periodGuard.service.js', method: 'checkPeriodLock(tenantId, documentDate)', verification: 'Verified' },
  ],
});

yes('C06-6.5-005', {
  whereImplemented: 'DB: PeriodClose @@unique(tenantId,year,month) prevents overlapping period rows',
  affectedModules: ['Period Close'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/prisma/schema.prisma', method: 'PeriodClose @@unique([tenantId, year, month])', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/periodClose.service.js', method: 'closePeriod() upsert by tenantId_year_month', verification: 'Verified' },
  ],
});

yes('C06-6.5-007', {
  whereImplemented: 'Shared: periodGuard.service.js is sole period-lock entry for posting',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass', 'Movement', 'Lost Items'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/periodGuard.service.js', method: 'checkPeriodLock() / validatePostingDate()', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGrn.service.js', method: 'delegates to periodGuard before post', verification: 'Verified' },
  ],
});

partial('C06-6.6-001', {
  whereImplemented: 'API: monthEndChecklist returned from closePeriod; UI shows closing spinner only',
  affectedModules: ['Period Close'],
  remainingWork: 'No centralized validation progress checklist UI on period-close page during Close Period',
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/periodClose.service.js', method: 'monthEndChecklist in close response', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/period-close/period-close-page/period-close-page.component.ts', method: 'closing spinner only', verification: 'Verified' },
  ],
});

partial('C06-6.6-002', {
  whereImplemented: 'UI: period resolution workspace tables; API: getPeriodResolution',
  affectedModules: ['Period Close'],
  remainingWork: 'Revalidate & Close action and per-document resolution shortcuts not wired',
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/periodResolution.service.js', method: 'getPeriodResolutionWorkspace()', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/period-close/period-close-page/period-close-page.component.html', method: 'blockedDocuments / closedPeriods tables', verification: 'Verified' },
  ],
});

// ── Ch.7 ────────────────────────────────────────────────────────────────────
yes('C07-7.1-001', {
  whereImplemented: 'draftGovernance.service.js (server draft) separate from document-draft-can-deactivate guard (navigation dirty-state)',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'saveGrnDraft / listFamilyDrafts', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/guards/document-draft-can-deactivate.guard.ts', method: 'confirmDeactivate() route guard', verification: 'Verified' },
  ],
});

yes('C07-7.2-001', {
  whereImplemented: 'Governed creates enter DRAFT (or server-draft path) unless workflow auto-approve',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'createGrnServerDraft status DRAFT', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'StoreTransfer default DRAFT', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/getPass.service.js', method: 'createGetPass status DRAFT', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/breakage.service.js', method: 'createBreakage status DRAFT (non-auto-approve)', verification: 'Verified' },
  ],
});

yes('C07-7.4-001', {
  whereImplemented: 'draftGovernance DRAFT_OWNER_FIELD per family; owner set at create',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'DRAFT_OWNER_FIELD + resolveDraftOwnerId()', verification: 'Verified' },
  ],
});

yes('C07-7.4-002', {
  whereImplemented: 'assertDraftEditable on GRN draft save and Transfer/Get Pass DRAFT updates',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'assertDraftEditable() OWNER_OR_FAMILY_MANAGE_PERMISSION', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'assertDraftEditable on updateTransfer', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/getPass.service.js', method: 'assertDraftEditable on updateGetPass', verification: 'Verified' },
  ],
});

yes('C07-7.4-003', {
  whereImplemented: 'transferDraftOwnership with platform policy denial by default',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'transferDraftOwnership() + DRAFT_OWNERSHIP_TRANSFER_PERMITTED', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/controllers/constitution.controller.js', method: 'POST /draft/transfer-ownership', verification: 'Verified' },
  ],
});

yes('C07-7.4-004', {
  whereImplemented: 'assertDraftOwnerActive blocks edit when owner inactive unless admin override',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'assertDraftOwnerActive() DRAFT_OWNER_INACTIVE', verification: 'Verified' },
  ],
});

partial('C07-7.5-001', {
  whereImplemented: 'Backend required concurrencyVersion on governed mutations; FE sends version on GRN/Transfer/Get Pass/Breakage actions',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  remainingWork: 'Multi-session draft open policy not documented as explicit platform contract',
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/concurrency.service.js', method: 'assertConcurrencyVersion({ required: true })', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts', method: 'concurrencyVersion on auto-save update', verification: 'Verified' },
  ],
});

partial('C07-7.7-001', {
  whereImplemented: 'DraftAutoSaveService on GRN/Transfer/Get Pass create forms',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  remainingWork: 'Breakage create lacks server-draft auto-save endpoint in draftGovernance',
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/services/draft-auto-save.service.ts', method: 'createDebouncedSaver()', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts', method: 'performAutoSave()', verification: 'Verified' },
  ],
});

partial('C07-7.7-002', {
  whereImplemented: 'Auto-save on line add/delete — GRN/Transfer/Get Pass',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  remainingWork: 'Breakage create has no debounced server-draft save on line changes',
  evidence: [{ layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'addItem/removeLine -> queueServerDraftSave', verification: 'Verified' }],
});

partial('C07-7.7-003', {
  whereImplemented: 'Auto-save on qty/price changes — GRN/Transfer/Get Pass line grids',
  affectedModules: ['GRN', 'Transfer', 'Get Pass'],
  remainingWork: 'Breakage create not wired',
  evidence: [{ layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'updateLine -> queueServerDraftSave', verification: 'Verified' }],
});

partial('C07-7.7-004', {
  whereImplemented: 'Auto-save on supplier/warehouse/header changes',
  affectedModules: ['GRN', 'Transfer', 'Get Pass'],
  remainingWork: 'Breakage create not wired',
  evidence: [{ layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'onSupplierChange/onWarehouseChange', verification: 'Verified' }],
});

partial('C07-7.7-005', {
  whereImplemented: 'Auto-save on attachment change — GRN invoice only',
  affectedModules: ['GRN'],
  remainingWork: 'Transfer/Get Pass/Breakage attachment auto-save not implemented',
  evidence: [{ layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'onInvoiceSelected', verification: 'Verified' }],
});

partial('C07-7.7-006', {
  whereImplemented: 'Auto-save on notes changes — GRN/Transfer/Get Pass',
  affectedModules: ['GRN', 'Transfer', 'Get Pass'],
  remainingWork: 'Breakage create not wired',
  evidence: [{ layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'onNotesChange', verification: 'Verified' }],
});

yes('C07-7.7-007', {
  whereImplemented: 'confirmDeactivate auto-saves before route leave on GRN/Transfer/Get Pass',
  affectedModules: ['GRN', 'Transfer', 'Get Pass'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts', method: 'confirmDeactivate -> performServerDraftSave', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts', method: 'confirmDeactivate -> performAutoSave', verification: 'Verified' },
  ],
});

yes('C07-7.8-001', {
  whereImplemented: 'DraftRecoveryService Continue/Discard + loadGrnDraftForRecovery validation gate',
  affectedModules: ['GRN'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/services/draft-recovery.service.ts', method: 'promptRecoverGrnDraft()', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'validateRecoveredDraft() + loadGrnDraftForRecovery()', verification: 'Verified' },
  ],
});

yes('C07-7.8-002', {
  whereImplemented: 'validateRecoveredDraft throws before continue; submit paths revalidate',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'validateRecoveredDraft() DRAFT_RECOVERY_VALIDATION_FAILED', verification: 'Verified' },
  ],
});

yes('C07-7.9-001', {
  whereImplemented: 'listFamilyDrafts per DRAFT_FAMILIES via constitution API',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'listFamilyDrafts()', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/controllers/constitution.controller.js', method: 'GET /drafts/:family', verification: 'Verified' },
  ],
});

yes('C07-7.9-002', {
  whereImplemented: 'DEFAULT_DRAFT_RETENTION_DAYS = 30; expireStaleDrafts job',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'DEFAULT_DRAFT_RETENTION_DAYS + expireStaleDrafts()', verification: 'Verified' },
  ],
});

yes('C07-7.9-003', {
  whereImplemented: 'DRAFT_EXPIRATION_ACTION = DELETE platform policy',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'getDraftRetentionPolicy() expirationAction', verification: 'Verified' },
  ],
});

yes('C07-7.10-001', {
  whereImplemented: 'documentDraftCanDeactivateGuard on GRN, Transfer, Get Pass, Breakage create/edit routes',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/app.routes.ts', method: 'canDeactivate on governed create/edit routes', verification: 'Verified' },
  ],
});

yes('C07-7.10-002', {
  whereImplemented: 'DocumentBeforeunloadDirective on governed create forms',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts', method: 'window:beforeunload HostListener', verification: 'Verified' },
  ],
});

yes('C07-7.10-003', {
  whereImplemented: 'Same beforeunload directive covers tab/browser close',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts', method: 'beforeunload on dirty forms', verification: 'Verified' },
  ],
});

yes('C07-7.10-004', {
  whereImplemented: 'canDeactivate on all governed create/edit routes including back navigation',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/utils/document-draft-leave.util.ts', method: 'confirmDocumentDeactivate()', verification: 'Verified' },
  ],
});

yes('C07-7.10-005', {
  whereImplemented: 'auth interceptor flushBeforeSessionEnd + DocumentDraftStateService flush handlers',
  affectedModules: ['GRN', 'Transfer', 'Get Pass'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/interceptors/auth.interceptor.ts', method: 'flushBeforeSessionEnd on 401 refresh failure', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/services/document-draft-state.service.ts', method: 'registerDirtyCheck(check, flush)', verification: 'Verified' },
  ],
});

yes('C07-7.10-006', {
  whereImplemented: 'skipDeactivate cleared after successful Save/Submit on create forms',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts', method: 'afterSave sets skipDeactivate', verification: 'Verified' },
  ],
});

yes('C07-7.11-001', {
  whereImplemented: 'System number allocated at first server persist (draft create)',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/draftGovernance.service.js', method: 'createGrnServerDraft -> generateDocNumber', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'generateTransferNo at create', verification: 'Verified' },
  ],
});

// ── Ch.8 ────────────────────────────────────────────────────────────────────
yes('C08-8.10-001', {
  whereImplemented: 'concurrency conflict logged via auditTrail on version mismatch',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/concurrency.service.js', method: 'assertConcurrencyVersion() audit CONCURRENCY_CONFLICT', verification: 'Verified' },
  ],
});

yes('C08-8.2-001', {
  whereImplemented: 'required concurrencyVersion on governed mutations; FE sends version on detail actions',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/platform/concurrency.service.js', method: 'assertConcurrencyVersion({ required: true })', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.ts', method: 'withConcurrency() on approve/reject', verification: 'Verified' },
  ],
});

partial('C08-8.3-001', { remainingWork: 'Field-level-only concurrency not ruled out on all master-data screens', whereImplemented: 'Operational document mutations require concurrencyVersion' });
partial('C08-8.4-001', { remainingWork: 'Optional version (null skips check) on legacy endpoints outside governed docs', whereImplemented: 'Governed doc paths require version' });
partial('C08-8.4-002', { remainingWork: 'Last-write-wins when client omits version on non-governed endpoints', whereImplemented: 'Governed paths reject missing version' });
partial('C08-8.4-003', { remainingWork: 'Coverage incomplete when version omitted on non-governed writes', whereImplemented: 'GRN/Transfer/GetPass/Breakage governed writes' });
partial('C08-8.4-004', { remainingWork: 'Automatic reload UX not uniform after conflict', whereImplemented: 'Backend returns CONCURRENCY_CONFLICT' });
partial('C08-8.5-001', { remainingWork: 'Not verified on all operational modules (Issue, Lost Items)', whereImplemented: 'GRN/Transfer/GetPass/Breakage/Movement drafts' });
partial('C08-8.6-001', { remainingWork: 'Save-draft idempotency not verified all modules', whereImplemented: 'concurrencyVersion bump on governed saves' });
partial('C08-8.6-002', { remainingWork: 'Not all submit endpoints require concurrencyVersion', whereImplemented: 'Transfer/GetPass/Breakage submit require version' });
partial('C08-8.6-003', { remainingWork: 'Approve double-execution guards not exhaustively verified', whereImplemented: 'version gate + status checks on approve' });
partial('C08-8.6-004', { remainingWork: 'Reject double-execution via version not verified all modules', whereImplemented: 'Breakage reject sends concurrencyVersion' });
partial('C08-8.6-005', { remainingWork: 'Other modules send-back not verified', whereImplemented: 'GRN send-back to DRAFT' });
partial('C08-8.6-006', { remainingWork: 'Cancel idempotent detection not platform-wide', whereImplemented: 'DRAFT-only cancel guards' });
partial('C08-8.6-007', { remainingWork: 'Post-on-same-version check not uniform (Movement OB)', whereImplemented: 'GRN finance post asserts version' });
partial('C08-8.7-001', { remainingWork: 'Movement OB post lacks explicit version gate', whereImplemented: 'GRN post path asserts concurrencyVersion' });
partial('C08-8.8-001', { remainingWork: 'Optional version weakens guarantee on non-governed endpoints', whereImplemented: 'Governed mutations require version' });
partial('C08-8.8-002', { remainingWork: 'Overwrite possible when version omitted', whereImplemented: 'Governed paths reject' });
partial('C08-8.8-003', { remainingWork: 'No automatic reload after conflict; user must refresh', whereImplemented: 'Conflict error surfaced to UI' });

// ── Ch.9 ────────────────────────────────────────────────────────────────────
yes('C09-9.3-007', {
  whereImplemented: 'movement drafts use docNumbering prefixFromMovementType',
  affectedModules: ['Movement', 'GRN', 'Transfer', 'Breakage', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/docNumbering.service.js', method: 'DocPrefix + prefixFromMovementType()', verification: 'Verified' },
  ],
});

yes('C09-9.3-010', {
  whereImplemented: 'CREATE audit afterValue includes allocated system number',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: 'logGovernedEvent CREATE afterValue.grnNumber', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'logAction CREATE afterValue.transferNo', verification: 'Verified' },
  ],
});

partial('C09-9.2-004', {
  remainingWork: 'Dedicated constitution draft-save endpoints only for GRN; Transfer/GetPass use family create/update',
  whereImplemented: 'First persist assigns number via docNumbering at create',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
});

partial('C09-9.3-002', {
  remainingWork: 'Sequence gaps on failed draft save not exhaustively tested all families',
  whereImplemented: 'Number retained after successful server draft save/create',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
});

partial('C09-9.3-009', {
  remainingWork: 'Explicit immutability enforcement not verified all models',
  whereImplemented: 'documentNo set at create; posting period fields immutable helper',
  affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
});

// ── Ch.10 ───────────────────────────────────────────────────────────────────
partial('C10-10.2-003', {
  whereImplemented: 'qty>0 on GRN create, Transfer/Breakage/Get Pass lines, Movement draft',
  remainingWork: 'Issue draft path not exhaustively verified',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Movement', 'Get Pass'],
});
partial('C10-10.2-004', { whereImplemented: 'assertPositiveLineQty blocks qty<=0', remainingWork: 'Issue module zero-qty at draft not verified', affectedModules: ['GRN', 'Transfer', 'Breakage', 'Movement'] });
partial('C10-10.2-005', { remainingWork: 'Platform settings-driven precision validation not verified', whereImplemented: 'Decimal schema + positive qty guards' });
partial('C10-10.2-007', { remainingWork: 'All inventory calculations base-unit-only not exhaustively verified', whereImplemented: 'Movement lines store qtyInBaseUnitSnapshot' });
partial('C10-10.2-008', { remainingWork: 'Get Pass checkout/dispatch stock guards not fully covered', whereImplemented: 'postingEngine postGetPassCheckoutInTransaction' });
partial('C10-10.2-010', { remainingWork: 'Posted ledger row edit prevention not fully verified', whereImplemented: 'status guards on posted documents' });
partial('C10-10.2-011', { remainingWork: 'Governed reversal entry points beyond movementRegister not fully documented', whereImplemented: 'movement reversal paths exist' });
partial('C10-10.2-014', { remainingWork: 'Backend authoritative negative-stock block not uniform all modules', whereImplemented: 'assertLinesHaveStockAtLocation on breakage create' });
partial('C10-10.2-015', { remainingWork: 'resolveUnitCost/WAC at post not verified all post engines', whereImplemented: 'GRN/Transfer posting services use valuation helpers' });

// ── Ch.11 ───────────────────────────────────────────────────────────────────
yes('C11-11.3-001', {
  whereImplemented: 'ConstitutionPlatformService.formatAmount / displayCurrency pipe',
  primaryScope: 'Platform',
  affectedModules: ['Platform'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/core/services/constitution-platform.service.ts', method: 'formatAmount()', verification: 'Verified' },
  ],
});

yes('C11-11.4-003', {
  whereImplemented: 'Dashboard uses ConstitutionPlatformService.formatAmount',
  affectedModules: ['Dashboard'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/dashboard/dashboard.component.ts', method: 'fmtSAR -> platform.formatAmount', verification: 'Verified' },
  ],
});

partial('C11-11.4-001', {
  remainingWork: 'Stock balances page still uses COMMON.CURRENCY_SAR hardcoded labels',
  whereImplemented: 'Dashboard KPI values use formatAmount',
  affectedModules: ['Dashboard', 'Stock'],
});

no('C11-11.4-002', {
  remainingWork: 'Report engine still uses hardcoded SAR headers/presentation',
  whereImplemented: 'None',
  affectedModules: ['Reports'],
});

no('C11-11.4-004', {
  remainingWork: 'Report Excel export paths use hardcoded SAR column labels',
  whereImplemented: 'None',
  affectedModules: ['Reports'],
});

no('C11-11.4-005', {
  remainingWork: 'PDF generators under OSE-backend/src/services/pdf/ not wired to displayCurrency.service',
  whereImplemented: 'None',
  affectedModules: ['Reports', 'PDF'],
});

partial('C11-11.4-006', {
  remainingWork: 'Reports/PDF channels not on property display currency standard',
  whereImplemented: 'Dashboard operational KPIs on displayCurrency',
  affectedModules: ['Dashboard', 'Reports'],
});

fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));

const ch = ['6', '7', '8', '9', '10', '11'];
const req = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance-evidence-archive/requirements.json'), 'utf8'));
const scoped = req.filter((r) => ch.includes(r.chapter));
let yesCount = 0;
let openCount = 0;
const blockers = [];
for (const r of scoped) {
  const e = evidence[r.requirementId];
  if (e?.implemented === 'Yes' && e?.remainingWork === 'Complete') yesCount++;
  else {
    openCount++;
    if (e?.implemented === 'No') blockers.push(r.requirementId);
  }
}
console.log('Updated evidence.json');
console.log('Ch6-11 Yes/Complete:', yesCount);
console.log('Ch6-11 open (Partial/No):', openCount);
console.log('Blockers (No):', blockers.join(', ') || '(none)');

const build = spawnSync('node', ['build-register.mjs'], {
  cwd: path.join(ROOT, 'governance-evidence-archive'),
  stdio: 'inherit',
});
process.exit(build.status ?? 1);
