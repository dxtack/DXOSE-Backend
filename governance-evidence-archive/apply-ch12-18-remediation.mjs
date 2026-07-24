#!/usr/bin/env node
/**
 * Ch12-18 remediation evidence closures — run after code fixes verified.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE = path.join(ROOT, 'governance-evidence-archive/evidence.json');
const REMEDIATION_DATE = '2026-06-25';
const BATCH = 'BATCH-CH12-18';

const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));

function patch(id, patchBody) {
  const prev = evidence[id] ?? {};
  evidence[id] = {
    ...prev,
    ...patchBody,
    remediationBatch: BATCH,
    remediatedAt: REMEDIATION_DATE,
    primaryScope: patchBody.primaryScope ?? prev.primaryScope ?? 'Operational',
  };
}

const yesClosures = {
  'C12-12.2-001': {
    implemented: 'Yes',
    whereImplemented:
      'document-page-header__slot--reserved in document-page shell; optional header slots documented in header-order registry',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/shared/styles/_document-page-shell.scss',
        method: '.document-page-header__slot--reserved',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/registries/document-header-order.registry.ts',
        method: 'DOCUMENT_HEADER_EXTENSION_SLOTS.reserved',
        verification: 'Verified',
      },
    ],
  },
  'C12-12.5-001': {
    implemented: 'Yes',
    whereImplemented:
      'GRN create, Transfer form, Movement form: confirmGovernedHeaderContextChange() before warehouse/source/location changes when lines exist',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'BDR-009',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/utils/document-header-context.util.ts',
        method: 'confirmGovernedHeaderContextChange()',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'onWarehouseChange() confirmation',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts',
        method: 'onSourceChange() confirmation',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.ts',
        method: 'onFieldChange() source/dest confirmation',
        verification: 'Verified',
      },
    ],
  },
  'C12-12.5-002': {
    implemented: 'Yes',
    whereImplemented:
      'Confirmed header context change clears lines (GRN/Transfer/Movement); backend transfer line location assertions',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'BDR-009',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'onWarehouseChange() clears lines after confirm',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/transfer.service.js',
        method: 'assertTransferLinesAtSource()',
        verification: 'Verified',
      },
    ],
  },
  'C12-12.6-001': {
    implemented: 'Yes',
    whereImplemented:
      'Backend header–line consistency guards on GRN, Transfer, Movement, Breakage, Get Pass save/update',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/getPass.service.js',
        method: 'assertGetPassLinesAtSourceLocations()',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/transfer.service.js',
        method: 'assertTransferLinesAtSource()',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/breakage.service.js',
        method: 'normalizedLines locationId validation',
        verification: 'Verified',
      },
    ],
  },
  'C12-12.7-001': {
    implemented: 'Yes',
    whereImplemented: 'document-header-order.registry.ts standard field order + extension slots for governed headers',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/registries/document-header-order.registry.ts',
        method: 'DOCUMENT_HEADER_ORDER',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/shared/styles/_document-page-shell.scss',
        method: '.document-page-header archetype',
        verification: 'Verified',
      },
    ],
  },
  'C13-13.6-001': {
    implemented: 'Yes',
    whereImplemented:
      'Backend lines validated against header context (location/source) on governed document families',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/getPass.service.js',
        method: 'assertGetPassLinesAtSourceLocations() on create/update',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/transfer.service.js',
        method: 'assertTransferLinesAtSource()',
        verification: 'Verified',
      },
    ],
  },
  'C15-15.2-003': {
    implemented: 'Yes',
    whereImplemented:
      'Inventory count draft cancel and Breakage void require reason; defined in WORKFLOW_MATRIX',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Governance',
        file: 'docs/governance/WORKFLOW_MATRIX.md',
        method: 'cancel/void reason required (Ch.15.2)',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/inventoryCount.service.js',
        method: 'cancelSession() COUNT_SESSION_CANCEL_REASON_REQUIRED',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/breakage.service.js',
        method: 'voidBreakage() reason required',
        verification: 'Verified',
      },
    ],
  },
  'C16-16.3-004': {
    implemented: 'Yes',
    whereImplemented: 'Platform uploadImage multer limit 1 MB via mediaPolicy.platform.js',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    primaryScope: 'Platform',
    evidence: [
      {
        layer: 'Governance',
        file: 'OSE-backend/src/platform/mediaPolicy.platform.js',
        method: 'ITEM_IMAGE_MAX_FILE_SIZE_BYTES = 1 MB',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/middleware/upload.middleware.js',
        method: 'uploadImage limits from mediaPolicy',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-001': {
    implemented: 'Yes',
    whereImplemented:
      'KeyboardNavigationDirective on GRN, Transfer, Movement, Breakage, Get Pass, Items governed workspaces',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
        method: 'appKeyboardNav Enter/Alt+S line-entry pattern',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.html',
        method: 'appKeyboardNav on transfer form',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/get-pass/get-pass-form/get-pass-form.component.html',
        method: 'appKeyboardNav on get-pass form',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-002': {
    implemented: 'Yes',
    whereImplemented: 'KeyboardNavigationDirective onEnter blocks implicit submit/post on Enter in line fields',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
        method: 'onEnter() skips buttons and data-keyboard-submit',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-003': {
    implemented: 'Yes',
    whereImplemented: 'Enter advances to next focusable field within document workspace host',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
        method: 'onEnter() focusableIn() next index',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-004': {
    implemented: 'Yes',
    whereImplemented: 'Shift+Enter moves to previous focusable field in KeyboardNavigationDirective',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
        method: 'onEnter() shiftKey previous focusable',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-008': {
    implemented: 'Yes',
    whereImplemented:
      'ValidationOrchestratorService.focusFirstIssue + runGovernedFormValidation on GRN create submit',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts',
        method: 'focusFirstIssue()',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/utils/document-form-validation.util.ts',
        method: 'runGovernedFormValidation()',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'validateHeader() uses runGovernedFormValidation',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-009': {
    implemented: 'Yes',
    whereImplemented: 'GRN addItem() focuses receivedQty on new line via data-line-field selector',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'addItem() queueMicrotask focus receivedQty',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html',
        method: 'data-line-field=receivedQty on qty input',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.3-001': {
    implemented: 'Yes',
    whereImplemented:
      'appKeyboardNav wired to Transfer, Movement, Breakage, Get Pass, Items and existing GRN document screens',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
        method: 'appKeyboardNav selector',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html',
        method: 'appKeyboardNav on movement form',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.html',
        method: 'appKeyboardNav on breakage detail',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.3-006': {
    implemented: 'Yes',
    whereImplemented: 'keyboard-shortcut.registry.ts GOVERNED_DOCUMENT_SHORTCUTS; consumed by KeyboardNavigationDirective',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/registries/keyboard-shortcut.registry.ts',
        method: 'GOVERNED_DOCUMENT_SHORTCUTS',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
        method: 'Alt+S dispatches dxose:keyboard-save',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.1-001': {
    implemented: 'Yes',
    whereImplemented: 'validation-channel.registry.ts maps validation codes to field/row/banner/toast channels',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/registries/validation-channel.registry.ts',
        method: 'VALIDATION_CHANNEL_BY_CODE + resolveValidationChannel()',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts',
        method: 'partitionByChannel()',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-002': {
    implemented: 'Yes',
    whereImplemented: 'runGovernedFormValidation + focusFirstIssue on failed GRN create header validation',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/utils/document-form-validation.util.ts',
        method: 'runGovernedFormValidation() focusFirstIssue',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-003': {
    implemented: 'Yes',
    whereImplemented: 'COMMON.VALIDATION_SUMMARY banner with error count on multi-error submit (GRN create)',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/public/i18n/en.json',
        method: 'COMMON.VALIDATION_SUMMARY',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'validateHeader() sets bannerMessage',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-014': {
    implemented: 'Yes',
    whereImplemented: 'ValidationOrchestratorService.sortByPresentationOrder header → lines → document',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    bdr: 'None',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts',
        method: 'sortByPresentationOrder()',
        verification: 'Verified',
      },
    ],
  },
};

const partialImprovements = {
  'C12-12.3-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'System header fields read-only on GRN/Movement/Transfer; verify Lost Items and Inventory Count detail headers',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html',
        method: 'documentNo/status display spans (non-input)',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html',
        method: 'documentNo in title; read-only register view',
        verification: 'Verified',
      },
    ],
  },
  'C12-12.4-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'lifecyclePresentation isEditableUserState + module readOnly; not centralized in one header component',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/lifecyclePresentation.service.js',
        method: 'isEditableUserState()',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.ts',
        method: 'registerView().readOnly',
        verification: 'Verified',
      },
    ],
  },
  'C13-13.4-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Posted line immutability verified on GRN/Movement/Breakage; audit Get Pass posted line edits',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/grn.service.js',
        method: 'updateGrn() POSTED blocks line changes',
        verification: 'Verified',
      },
    ],
  },
  'C13-13.4-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Corrections via governed transactions documented; verify reversal entry per family in UI',
    evidence: [
      {
        layer: 'Docs',
        file: 'docs/governance/POSTING_GOVERNANCE_ENFORCEMENT.md',
        method: 'corrections via governed transactions',
        verification: 'Verified',
      },
    ],
  },
  'C13-13.5-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Module-local line total recalculation (GRN/Movement); no shared recalculation engine',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'lineTotal() computed',
        verification: 'Verified',
      },
    ],
  },
  'C13-13.7-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN grand total display-only; Transfer/Breakage totals not exhaustively verified',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html',
        method: 'manualGrandTotal display binding',
        verification: 'Verified',
      },
    ],
  },
  'C13-13.7-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Line totals display-only on GRN/Transfer detail; not platform-wide input guard',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html',
        method: 'totalValue display column',
        verification: 'Verified',
      },
    ],
  },
  'C13-13.8-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN duplicate itemId guard on addItem(); duplicate rules not documented per family (BDR-003)',
    bdr: 'BDR-003',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'addItem() duplicate itemId guard',
        verification: 'Verified',
      },
    ],
  },
  'C13-13.9-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'auditGoverned facade exists; line-level change audit not verified on all modules',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/auditGoverned.service.js',
        method: 'logGovernedEvent()',
        verification: 'Verified',
      },
    ],
  },
  'C13-13.10-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork:
      'Line pagination on GRN/Transfer detail + Breakage/Movement read-only lines; Get Pass main lines grid not paginated',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/utils/document-line-pagination.util.ts',
        method: 'createDocumentLinePagination()',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/breakage/breakage-detail/breakage-detail.component.ts',
        method: 'pagedBreakageLines pagination',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.3-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'assertAttachmentMutable on Breakage/GRN draft; Movement/Get Pass attachments not verified',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/attachmentGovernance.service.js',
        method: 'assertAttachmentMutable()',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.3-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Explicit replace-path not verified separately on all attachment-bearing modules',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/breakage.service.js',
        method: 'addAttachment() append-only JSON array',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.3-003': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'No dedicated delete-attachment API audit across all modules',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/attachmentGovernance.service.js',
        method: 'posted attachment immutability',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.3-004': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN validate blocks missing invoice; other modules attachment-required-at-submit not verified',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/grn.service.js',
        method: 'validateGrn invoice required',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.4-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'attachmentPolicy.platform.js central types/size; GRN invoice route-local 20 MB exception',
    evidence: [
      {
        layer: 'Governance',
        file: 'OSE-backend/src/platform/attachmentPolicy.platform.js',
        method: 'ATTACHMENT_ALLOWED_EXTENSIONS',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.4-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN invoice upload still uses route-local 20 MB limit; align or register BDR exception',
    evidence: [
      {
        layer: 'Governance',
        file: 'OSE-backend/src/platform/attachmentPolicy.platform.js',
        method: 'GRN_INVOICE_MAX_FILE_SIZE_BYTES',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/controllers/grn.controller.js',
        method: 'invoiceUpload 20 MB local limit',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.4-003': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Max count enforced on Breakage addAttachment; GRN multi-attachment count not enforced',
    evidence: [
      {
        layer: 'Governance',
        file: 'OSE-backend/src/platform/attachmentPolicy.platform.js',
        method: 'ATTACHMENT_MAX_COUNT_PER_DOCUMENT',
        verification: 'Verified',
      },
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/breakage.service.js',
        method: 'addAttachment() max count guard',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.5-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Central upload filters + tenant-scoped storage keys; optional hardening out of scope',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/middleware/upload.middleware.js',
        method: 'tenant-scoped storage pipe + attachmentFilter',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.6-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Signed URL download auth; not proven equivalent to document-view permission on all endpoints',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/middleware/upload.middleware.js',
        method: '/api/files/signed-url tenant validation',
        verification: 'Verified',
      },
    ],
  },
  'C14-14.9-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Breakage addAttachment audited ATTACHMENT_ADD; GRN invoice upload/replace not audited',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/breakage.service.js',
        method: 'addAttachment() logAction ATTACHMENT_ADD',
        verification: 'Verified',
      },
    ],
  },
  'C15-15.3-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'User notes editable on drafts; no explicit immutability constraint on all note fields after post',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/grn.service.js',
        method: 'POSTED updateGrn blocks edits',
        verification: 'Verified',
      },
    ],
  },
  'C15-15.4-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Mixed user notes and system notes in document.notes fields across modules',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/services/inventoryCount.service.js',
        method: 'cancelSession auto note',
        verification: 'Verified',
      },
    ],
  },
  'C15-15.5-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork:
      'Movement form loads constitution audit timeline; GRN/Transfer/Breakage/Get Pass already have returns-workflow-timeline',
    evidence: [
      {
        layer: 'Backend',
        file: 'OSE-backend/src/platform/documentTimeline.service.js',
        method: 'getMovementTimeline()',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.ts',
        method: 'loadConstitutionTimeline(MOVEMENT)',
        verification: 'Verified',
      },
    ],
  },
  'C16-16.3-003': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN create shows line thumbnails; Transfer/Breakage/Get Pass line grids lack item thumbnails',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'lineImageSrc() / hydrateLineImageUrl()',
        verification: 'Verified',
      },
    ],
  },
  'C16-16.3-005': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'mediaPolicy recommends max dimension; no hard reject on upload dimensions',
    evidence: [
      {
        layer: 'Governance',
        file: 'OSE-backend/src/platform/mediaPolicy.platform.js',
        method: 'ITEM_IMAGE_RECOMMENDED_MAX_DIMENSION_PX',
        verification: 'Verified',
      },
    ],
  },
  'C16-16.3-006': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Absent-image fallback in some report/PDF paths; inventory-count exports not verified',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'lineImageSrc null fallback',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.2-006': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Document framework Esc via modals; explicit Esc contract when shared lookup overlay (Ch.23) lands',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/shared-lookup.service.ts',
        method: 'Ch.17 unified lookup (Esc pending Ch.23)',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.3-002': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Ant Design focus rings present; custom controls (thumb-button) not exhaustively audited',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
        method: 'focusableIn() skips hidden elements',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.3-003': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Keyboard nav skips disabled/hidden; no explicit skip-link policy document',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
        method: 'focusableIn filters aria-hidden',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.3-004': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'CSS-hidden elements filtered in focusableIn; full-page audit not run',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
        method: 'offsetParent !== null filter',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.3-005': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'NzModal default focus; no explicit primary-element focus contract on all app modals',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/app.config.ts',
        method: 'NzModalModule providers',
        verification: 'Verified',
      },
    ],
  },
  'C17-17.3-007': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Dashboard KPI row keydown.enter handlers not audited against central shortcut registry',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/registries/keyboard-shortcut.registry.ts',
        method: 'GOVERNED_DOCUMENT_SHORTCUTS registry published',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-001': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN create clears error on field change; auto-clear not shared across all governed forms',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'updateLine/clearLineValidationUi clears errors',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-004': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN data-field markers + invalidLineIndexes; Get Pass sparse role=alert only',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html',
        method: 'data-field attributes on header fields',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-005': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'collectRequiredFieldIssues uses i18n; legacy requireFields() still emits English literals',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts',
        method: 'collectRequiredFieldIssues() i18n messages',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-006': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'VAL_REQUIRED code on client issues; many backend throws still plain message strings',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts',
        method: 'ValidationIssue.code on collectRequiredFieldIssues',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-007': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'mapBackendCodeToMessage for CONCURRENCY_CONFLICT; most 400s still show raw server text',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/services/validation-orchestrator.service.ts',
        method: 'mapBackendCodeToMessage()',
        verification: 'Verified',
      },
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/interceptors/api-error.interceptor.ts',
        method: 'CONCURRENCY_CONFLICT i18n',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-009': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'runGovernedFormValidation on GRN create; Transfer/Get Pass/Breakage lack uniform pre-submit assist',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/utils/document-form-validation.util.ts',
        method: 'runGovernedFormValidation()',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-015': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'Ad hoc nz-alert warning vs error on GRN detail; no platform warning taxonomy registry',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/core/registries/validation-channel.registry.ts',
        method: 'validation channel map (error vs warning split pending)',
        verification: 'Verified',
      },
    ],
  },
  'C18-18.2-017': {
    implemented: 'Partial',
    verificationStatus: 'Needs Code Review',
    remainingWork: 'GRN create uses inline nz-alert for validation; interceptor may still toast duplicate 400s on API paths',
    evidence: [
      {
        layer: 'Frontend',
        file: 'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
        method: 'validateHeader banner only (no message.error on field validation)',
        verification: 'Verified',
      },
    ],
  },
};

for (const [id, body] of Object.entries(yesClosures)) {
  patch(id, body);
}

for (const [id, body] of Object.entries(partialImprovements)) {
  const prev = evidence[id] ?? {};
  const mergedEvidence = [...(prev.evidence ?? [])];
  for (const e of body.evidence ?? []) {
    if (!mergedEvidence.some((x) => x.file === e.file && x.method === e.method)) {
      mergedEvidence.push({ ...e, verification: e.verification ?? 'Verified' });
    }
  }
  patch(id, {
    ...body,
    evidence: mergedEvidence,
    whereImplemented: body.whereImplemented ?? prev.whereImplemented,
    bdr: body.bdr ?? prev.bdr ?? 'None',
  });
}

fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));

const yesCount = Object.keys(yesClosures).length;
const partialCount = Object.keys(partialImprovements).length;
console.log(`BATCH ${BATCH}: ${yesCount} Yes, ${partialCount} Partial updated`);

const build = spawnSync('node', ['build-register.mjs'], {
  cwd: path.join(ROOT, 'governance-evidence-archive'),
  stdio: 'inherit',
});
process.exit(build.status ?? 1);
