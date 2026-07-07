#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE = path.join(ROOT, 'Governance/evidence.json');
const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));

const backendPolicy = {
  layer: 'Backend',
  file: 'OSE-backend/src/platform/draftGovernance.service.js',
  method: 'getDraftOwnerPolicy/assertDraftEditable/listFamilyDrafts/expireStaleDrafts',
  verification: 'Verified',
};

const patches = {
  'C07-7.1-001': {
    implemented: 'Partial',
    whereImplemented:
      'draftGovernance.service.js (server draft); document-draft-can-deactivate.guard.ts wired on GRN/Transfer/Get Pass/Breakage create routes',
    remainingWork:
      'Extend server-draft auto-save to Transfer/Get Pass/Breakage (no constitution draft endpoints yet); keep navigation warnings separate from draft persistence',
    verificationStatus: 'Needs Code Review',
    evidence: [
      backendPolicy,
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/app.routes.ts',
        method: 'canDeactivate on grn/new, transfers/new|edit, get-passes/new|edit, breakage/new',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/guards/document-draft-can-deactivate.guard.ts',
        method: 'canDeactivate()',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.2-001': {
    implemented: 'Partial',
    remainingWork:
      'GRN multipart create still enters VALIDATED (workflow contract); Breakage create enters DEPT_APPROVED per ACC workflow — document BDR or align create paths to DRAFT',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'createGrnServerDraft() status DRAFT',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/transfer.service.js',
        method: 'createTransfer() default DRAFT',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/getPass.service.js',
        method: 'createGetPass() status DRAFT',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.4-001': {
    implemented: 'Partial',
    whereImplemented: 'draftGovernance.service.js DRAFT_OWNER_FIELD + assertDraftEditable on GRN draft save',
    remainingWork: 'Wire assertDraftEditable into Transfer/Get Pass/Breakage update paths when constitution draft endpoints exist',
    verificationStatus: 'Needs Code Review',
    evidence: [backendPolicy],
  },
  'C07-7.4-002': {
    implemented: 'Partial',
    whereImplemented: 'assertDraftEditable — owner or family manage permission (GRN draft path)',
    remainingWork: 'Enforce on all document-family draft load/save APIs',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'assertDraftEditable()',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.4-003': {
    implemented: 'Partial',
    whereImplemented: 'transferDraftOwnership() with DRAFT_OWNERSHIP_TRANSFER_PERMITTED=false; admin SETTINGS_MANAGE override',
    remainingWork: 'Expose ownership transfer in admin UI or record BDR if permanently denied',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'transferDraftOwnership()',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/routes/constitution.routes.js',
        method: 'POST /drafts/transfer-ownership',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.4-004': {
    implemented: 'Partial',
    whereImplemented: 'assertDraftOwnerActive() blocks edit when owner inactive unless admin override',
    remainingWork: 'Admin recovery/reassign UI for inactive-owner drafts',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'assertDraftOwnerActive()',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.5-001': {
    implemented: 'Partial',
    remainingWork: 'FE concurrencyVersion gaps on Transfer/Get Pass/Breakage; document multi-session open rules',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/concurrency.service.js',
        method: 'assertConcurrencyVersion()',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'saveGrnDraft() concurrency bump',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-001': {
    implemented: 'Partial',
    whereImplemented: 'GRN create debounced server-draft auto-save via constitution/grn/draft',
    remainingWork: 'Transfer/Get Pass/Breakage constitution draft save endpoints + FE event triggers',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'queueServerDraftSave/performServerDraftSave',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/draft-auto-save.service.ts',
        method: 'createDebouncedSaver()',
        verification: 'Verified',
      },
      backendPolicy,
    ],
  },
  'C07-7.7-002': {
    implemented: 'Partial',
    whereImplemented: 'GRN create triggers auto-save on addLine/removeLine',
    remainingWork: 'Same on Transfer/Get Pass/Breakage line grids',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'addItem/removeLine -> queueServerDraftSave',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-003': {
    implemented: 'Partial',
    whereImplemented: 'GRN create updateLine qty/price triggers auto-save',
    remainingWork: 'Transfer/Get Pass/Breakage line qty/price auto-save',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'updateLine -> queueServerDraftSave',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-004': {
    implemented: 'Partial',
    whereImplemented: 'GRN supplier/warehouse header changes trigger auto-save',
    remainingWork: 'Transfer from/to store and Get Pass header auto-save',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'onSupplierChange/onWarehouseChange -> queueServerDraftSave',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-005': {
    implemented: 'Partial',
    whereImplemented: 'GRN invoice attachment selection triggers auto-save (header fields)',
    remainingWork: 'Persist attachment binary on server draft; extend to other families',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'onInvoiceSelected -> queueServerDraftSave',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-006': {
    implemented: 'Partial',
    whereImplemented: 'GRN notes field triggers auto-save',
    remainingWork: 'Notes auto-save on Transfer/Get Pass/Breakage create forms',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'onNotesChange -> queueServerDraftSave',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.7-007': {
    implemented: 'Partial',
    whereImplemented: 'GRN confirmDeactivate performs server-draft save before leave prompt',
    remainingWork: 'Auto-save-before-navigation on Transfer/Get Pass/Breakage create routes',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'confirmDeactivate() -> performServerDraftSave',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.8-001': {
    implemented: 'Partial',
    whereImplemented: 'DraftRecoveryService Continue/Discard prompt; loadGrnDraftForRecovery validation',
    remainingWork: 'Recovery flow for Transfer/Get Pass/Breakage server drafts',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/draft-recovery.service.ts',
        method: 'promptRecoverGrnDraft()',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'loadGrnDraftForRecovery/validateRecoveredDraft',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.8-002': {
    implemented: 'Partial',
    whereImplemented: 'validateRecoveredDraft blocks recover when headers fail current rules',
    remainingWork: 'Full backend validation (stock, periods, prices) on recovered drafts before submit',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'validateRecoveredDraft()',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.9-001': {
    implemented: 'Partial',
    whereImplemented: 'listFamilyDrafts() query per family; GET /constitution/drafts/:family',
    remainingWork: 'Admin draft registry UI per family',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'listFamilyDrafts()',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/routes/constitution.routes.js',
        method: 'GET /drafts/:family',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.9-002': {
    implemented: 'Partial',
    whereImplemented: 'DEFAULT_DRAFT_RETENTION_DAYS=30; expireStaleDrafts()',
    remainingWork: 'Scheduled retention job (cron/worker) in production ops',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'expireStaleDrafts()',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/routes/constitution.routes.js',
        method: 'POST /drafts/expire',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.9-003': {
    implemented: 'Partial',
    whereImplemented: 'DRAFT_EXPIRATION_ACTION=DELETE policy constant + expireStaleDrafts implementation',
    remainingWork: 'Archive/expired-state alternative if BDR chooses non-delete policy',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'getDraftRetentionPolicy()',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.10-001': {
    implemented: 'Partial',
    whereImplemented: 'documentDraftCanDeactivateGuard on GRN/Transfer/Get Pass/Breakage create routes',
    remainingWork: 'Verify edit-mode drafts and modal-only flows',
    verificationStatus: 'Needs Code Review',
    affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/app.routes.ts',
        method: 'canDeactivate on operational create routes',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/guards/document-draft-can-deactivate.guard.ts',
        method: 'canDeactivate()',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.10-002': {
    implemented: 'Partial',
    whereImplemented: 'DocumentBeforeunloadDirective on GRN/Transfer/Get Pass/Breakage create',
    remainingWork: 'Platform-wide coverage audit for any remaining create surfaces',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts',
        method: 'window:beforeunload',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html',
        method: 'appDocumentBeforeunload',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.10-003': {
    implemented: 'Partial',
    whereImplemented: 'Same beforeunload directive covers tab close',
    remainingWork: 'Same as 7.10.002 platform audit',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/document-beforeunload.directive.ts',
        method: 'window:beforeunload tab-close protection',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.10-004': {
    implemented: 'Partial',
    whereImplemented: 'canDeactivate on all four family create/edit routes',
    remainingWork: 'Back-navigation UX parity audit',
    verificationStatus: 'Needs Code Review',
    affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts',
        method: 'confirmDeactivate()',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.10-005': {
    implemented: 'Partial',
    whereImplemented: 'DocumentDraftStateService + auth interceptor flushBeforeSessionEnd on 401',
    remainingWork: 'User-visible save-or-discard modal on session expiry (currently best-effort auto-save)',
    verificationStatus: 'Needs Code Review',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/document-draft-state.service.ts',
        method: 'flushBeforeSessionEnd()',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/interceptors/auth.interceptor.ts',
        method: 'flush before clearAuth on failed refresh',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.10-006': {
    implemented: 'Partial',
    whereImplemented: 'skipDeactivate/mark clean after successful save-submit on GRN/Transfer/Get Pass/Breakage',
    remainingWork: 'Explicit isDirty reset after Save Draft (not only submit) on all families',
    verificationStatus: 'Needs Code Review',
    affectedModules: ['GRN', 'Transfer', 'Get Pass', 'Breakage'],
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'skipDeactivate on create success',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts',
        method: 'skipDeactivate in afterSave',
        verification: 'Verified',
      },
    ],
  },
  'C07-7.11-001': {
    implemented: 'Partial',
    whereImplemented: 'createGrnServerDraft reserves system number; GRN multipart create also assigns at submit',
    remainingWork: 'Route standard GRN create through server-draft-first flow for numbering parity',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/draftGovernance.service.js',
        method: 'createGrnServerDraft() generateDocNumber',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/grn.service.js',
        method: 'create assigns systemGrnNumber at submit',
        verification: 'Verified',
      },
    ],
  },
};

for (const [id, patch] of Object.entries(patches)) {
  if (!evidence[id]) throw new Error(`Missing ${id}`);
  Object.assign(evidence[id], patch);
  evidence[id].preRemediationAudit = {
    ...(evidence[id].preRemediationAudit ?? {}),
    remediatedAt: '2026-06-26',
  };
}

fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
console.log('Patched', Object.keys(patches).length, 'Ch7 evidence rows');
