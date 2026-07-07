#!/usr/bin/env node
/**
 * Ch3–5 Constitution remediation — evidence closures after code fixes (BATCH-CH3-5).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE = path.join(ROOT, 'Governance/evidence.json');
const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));

const BATCH = 'BATCH-CH3-5';
const REMEDIATED_AT = '2026-06-25';

function patch(id, patchBody) {
  evidence[id] = {
    ...evidence[id],
    remediationBatch: BATCH,
    remediatedAt: REMEDIATED_AT,
    ...patchBody,
  };
}

function yes(id, body) {
  patch(id, {
    implemented: 'Yes',
    remainingWork: 'Complete',
    verificationStatus: 'Verified',
    blocker: null,
    ...body,
  });
}

function partial(id, body) {
  patch(id, {
    implemented: 'Partial',
    verificationStatus: body.verificationStatus ?? 'Needs Code Review',
    blocker: body.blocker ?? body.remainingWork ?? evidence[id]?.remainingWork,
    ...body,
  });
}

// ── Closed to Yes ───────────────────────────────────────────────────────────

yes('C03-3.1-001', {
  whereImplemented:
    'FE detail surfaces gate actions by permission + document status/userFacingState on all operational modules including Movement (MOVEMENT_CREATE + registerView.readOnly) and Inventory Count (canManage/canActOnApprovalStep)',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass', 'Movement', 'Inventory Count'],
  evidence: [
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html',
      method: '*appHasPermission MOVEMENT_CREATE + registerView().readOnly',
      verification: 'Verified',
    },
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts',
      method: 'canManage() / canActOnApprovalStep()',
      verification: 'Verified',
    },
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts',
      method: 'showFinanceApprovalBar / showSubmitForApproval',
      verification: 'Verified',
    },
  ],
});

yes('C03-3.1-003', {
  whereImplemented:
    'GRN draft submit uses COMMON.SUBMIT_ACTION; finance post uses GRN.DETAIL.POST; FINANCE_APPROVE_POST aligned to constitution Approve & post label',
  affectedModules: ['GRN', 'Transfer'],
  evidence: [
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html',
      method: 'COMMON.SUBMIT_ACTION on draft validate',
      verification: 'Verified',
    },
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/public/i18n/en.json',
      method: 'GRN.DETAIL.VALIDATE→Submit; FINANCE_APPROVE_POST standard label',
      verification: 'Verified',
    },
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html',
      method: 'TRANSFER standard Submit/Reject/Approve labels',
      verification: 'Verified',
    },
  ],
});

yes('C03-3.2-002', {
  whereImplemented: 'User-rights unsaved-changes dialog uses Leave without saving — not Discard/Abort/Cancel Document',
  affectedModules: ['Platform'],
  evidence: [
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/admin/user-rights/user-rights.component.ts',
      method: 'confirmDirtyNavigation footer Leave without saving',
      verification: 'Verified',
    },
  ],
});

yes('C03-3.3-001', {
  whereImplemented:
    'GRN reviewer bars gated by canUserActOnGrnApprovalStep (current approval step role); backend _assertGrnDualGate on approve',
  affectedModules: ['GRN'],
  evidence: [
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/grn/utils/grn-workflow.helpers.ts',
      method: 'canUserActOnGrnApprovalStep()',
      verification: 'Verified',
    },
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts',
      method: 'canActOnGrnReviewerStep / showValidatedReviewBar',
      verification: 'Verified',
    },
    {
      layer: 'Backend',
      file: 'OSE-backend/src/services/grn.service.js',
      method: 'getGrn approvalRequest + _assertGrnDualGate()',
      verification: 'Verified',
    },
  ],
});

yes('C03-3.6-001', {
  whereImplemented: 'Transfer detail action bar: Primary (Submit/Approve) before Secondary/Neutral, then Danger (Delete/Reject)',
  affectedModules: ['Transfer'],
  evidence: [
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html',
      method: 'DRAFT Submit primary before Delete danger; approve before reject',
      verification: 'Verified',
    },
  ],
});

yes('C04-4.1-003', {
  whereImplemented:
    'Lifecycle guards: assertDocumentEditableByLifecycle on Get Pass update, Movement update, Breakage submit/void, Lost approval; transfer/grn assertStatus/LOCKED patterns',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass', 'Lost Items', 'Movement'],
  evidence: [
    {
      layer: 'Backend',
      file: 'OSE-backend/src/platform/lifecyclePresentation.service.js',
      method: 'assertDocumentEditableByLifecycle()',
      verification: 'Verified',
    },
    {
      layer: 'Backend',
      file: 'OSE-backend/src/services/movement.service.js',
      method: 'updateMovementDraft lifecycle guard',
      verification: 'Verified',
    },
    {
      layer: 'Backend',
      file: 'OSE-backend/src/services/breakage.service.js',
      method: 'submitBreakage/voidBreakage lifecycle guard',
      verification: 'Verified',
    },
    {
      layer: 'Backend',
      file: 'OSE-backend/src/services/getPass.service.js',
      method: 'updateGetPass assertDocumentEditableByLifecycle',
      verification: 'Verified',
    },
    {
      layer: 'Backend',
      file: 'OSE-backend/src/services/lostItems.service.js',
      method: 'processLostApprovalStep lifecycle guard',
      verification: 'Verified',
    },
  ],
});

yes('C04-4.2-001', {
  whereImplemented:
    'Evidence pack download routes use module VIEW/READ permissions — no separate EVIDENCE_PACKAGE permission in ACC',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass', 'Inventory Count'],
  evidence: [
    {
      layer: 'Backend',
      file: 'OSE-backend/src/routes/grn.routes.js',
      method: 'GET /:id/evidence/pdf requirePermission GRN_VIEW',
      verification: 'Verified',
    },
    {
      layer: 'Backend',
      file: 'OSE-backend/src/routes/transfer.routes.js',
      method: 'GET /:id/evidence requirePermission INVENTORY_VIEW',
      verification: 'Verified',
    },
    {
      layer: 'Backend',
      file: 'OSE-backend/src/routes/breakage.routes.js',
      method: 'GET /:id/evidence requireAnyPermission VIEW_INVENTORY/BREAKAGE_VIEW',
      verification: 'Verified',
    },
    {
      layer: 'Backend',
      file: 'OSE-backend/src/routes/lostItems.routes.js',
      method: 'GET /:id/evidence requireAnyPermission LOST_ITEMS_VIEW',
      verification: 'Verified',
    },
  ],
});

yes('C03-3.4-006', {
  whereImplemented: 'Reject sets terminal REJECTED on GRN, Transfer, Breakage, Lost Items, Get Pass',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: '_rejectGrnApproval()', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'rejectTransfer()', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/breakage.service.js', method: 'processApprovalStep REJECT', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/lostItems.service.js', method: 'processLostApprovalStep REJECT', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/getPass.service.js', method: 'rejectGetPass()', verification: 'Verified' },
  ],
});

yes('C03-3.4-009', {
  whereImplemented:
    'Rejected documents read-only with Ch.2.7 hint to create new document (transfer assertLocked, breakage/lost/grn terminal messages)',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'assertLocked REJECTED message', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html', method: 'REJECTED_TERMINAL_HINT', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html', method: 'REJECTED_TERMINAL_HINT', verification: 'Verified' },
  ],
});

yes('C03-3.4-010', {
  whereImplemented: 'REJECTED/terminal status ends workflow; no further approve/post paths on rejected documents',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/breakage.service.js', method: 'REJECTED lock on processApprovalStep', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/getPass.service.js', method: 'rejectGetPass status REJECTED', verification: 'Verified' },
  ],
});

yes('C05-5.1-001', {
  whereImplemented:
    'postingEngine.service.js is SSOT for ledger/stock commit; movementRegisterGuard blocks governed types from register post',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingEngine.service.js', method: 'delegates to postingGoverned*', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/movementRegisterGuard.service.js', method: 'assertMovementRegisterMutable post forbidden', verification: 'Verified' },
  ],
});

yes('C05-5.1-002', {
  whereImplemented:
    'Domain services delegate stock/ledger effects to postingEngine; posting.service postDocument limited to non-governed movement drafts (OB/ADJ)',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: 'postingEngine.postGrnInTransaction', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'postingEngine.postTransferInTransaction', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/breakage.service.js', method: 'postingEngine.postBreakageMovementInTransaction', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/posting.service.js', method: 'assertMovementRegisterMutable before post', verification: 'Verified' },
  ],
});

yes('C05-5.1-003', {
  whereImplemented:
    'POSTED/APPROVED documents locked; governed reversal/adjustment via formal workflows (get-pass return, count adjustment, reversal governance)',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass', 'Inventory Count'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/breakage.service.js', method: 'APPROVED immutable lock', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: 'updateGrn LOCKED statuses', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/getPass.service.js', method: 'governed return/checkout reversal paths', verification: 'Verified' },
  ],
});

yes('C05-5.2-001', {
  whereImplemented: 'Post routes require module permissions (GRN_MANAGE, TRANSFER_APPROVE, MOVEMENT_CREATE, APPROVE_LOST) plus step gates',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/routes/grn.routes.js', method: 'approval routes requirePermission GRN_MANAGE', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/routes/movement.routes.js', method: 'post requirePermission MOVEMENT_CREATE', verification: 'Verified' },
  ],
});

yes('C05-5.2-002', {
  whereImplemented: 'Governed post only from valid workflow terminal states (PENDING_FINANCE/APPROVED/final step)',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: '_advanceGrnApprovalStep isFinal post', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'approveTransfer assertStatus PENDING_*', verification: 'Verified' },
  ],
});

yes('C05-5.2-003', {
  whereImplemented: 'validatePostingDate(tenantId, postingDate) on all postingGoverned* commit paths',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Movement', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGrn.service.js', method: 'validatePostingDate before post', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedTransfer.service.js', method: 'validatePostingDate before post', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/posting.service.js', method: 'validatePostingDate on movement post', verification: 'Verified' },
  ],
});

yes('C05-5.2-004', {
  whereImplemented: 'Full line/qty/stock revalidation inside postingGoverned* immediately before ledger writes',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGrn.service.js', method: 'line mapping/qty checks in postGrnInTransaction', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedTransfer.service.js', method: 'Insufficient source stock at posting time', verification: 'Verified' },
  ],
});

yes('C05-5.2-005', {
  whereImplemented: 'Outbound transfer post verifies source stock at commit; inbound GRN post N/A by design',
  affectedModules: ['Transfer', 'GRN', 'Get Pass', 'Breakage'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedTransfer.service.js', method: 'source stock check per line', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGetPass.service.js', method: 'checkout stock validation', verification: 'Verified' },
  ],
});

yes('C05-5.2-006', {
  whereImplemented: 'Posting services re-validate document/lines/stock regardless of prior workflow validation',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGrn.service.js', method: 'pre-post line validation loop', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/posting.service.js', method: 'OB zero-cost guard at post', verification: 'Verified' },
  ],
});

yes('C05-5.2-008', {
  whereImplemented: 'Single prisma.$transaction per post; all lines in one atomic commit or full rollback',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Movement', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/posting.service.js', method: 'postDocument single transactionWork', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'approveTransfer $transaction post', verification: 'Verified' },
  ],
});

yes('C05-5.2-009', {
  whereImplemented: 'Prisma transaction boundary — posting failure rolls back all ledger/stock/document updates',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Movement', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGrn.service.js', method: 'postGrnInTransaction in parent $transaction', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/posting.service.js', method: 'db.$transaction wrapper', verification: 'Verified' },
  ],
});

yes('C05-5.2-010', {
  whereImplemented: 'assertNoDuplicate* ledger guards return 409 on repeat post (GRN, Transfer, Breakage, Get Pass)',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGrn.service.js', method: 'assertNoDuplicateGrnPost', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedTransfer.service.js', method: 'assertNoDuplicateTransferPost', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedMovement.service.js', method: 'assertNoDuplicateLedgerPost', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/postingGovernedGetPass.service.js', method: 'assertNoDuplicateGetPassCheckout', verification: 'Verified' },
  ],
});

yes('C05-5.2-011', {
  whereImplemented: 'Final workflow approval auto-invokes post in GRN, Transfer, Breakage final step, Get Pass checkout',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: '_advanceGrnApprovalStep isFinal post', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/transfer.service.js', method: 'needsPosting postTransferInTransaction', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/breakage.service.js', method: 'isLastStep _postBreakageInTransaction', verification: 'Verified' },
  ],
});

yes('C05-5.2-012', {
  whereImplemented: 'Final approval action equals post authorization — no separate post permission after final approve',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Inventory Count'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts', method: 'approveFinanceAndPost()', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.ts', method: 'canPostOnApprove POST label', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts', method: 'APPROVE_AND_POST label', verification: 'Verified' },
  ],
});

yes('C05-5.2-013', {
  whereImplemented: 'Default final approve posts without extra confirmation (GRN finance bar, Transfer PENDING_FINANCE approve, Inventory Count final step)',
  affectedModules: ['GRN', 'Transfer', 'Inventory Count'],
  evidence: [
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.ts', method: 'approveFinanceAndPost single action', verification: 'Verified' },
    { layer: 'Frontend', file: 'OSE-Frontend/src/app/features/transfers/transfer-detail/transfer-detail.component.html', method: 'single Approve/Post button', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/src/services/grn.service.js', method: 'postGrn() manual path disabled', verification: 'Verified' },
  ],
});

yes('C05-5.2-014', {
  whereImplemented: 'Idempotent posting guards + deterministic postingEngine paths platform-wide',
  affectedModules: ['GRN', 'Transfer', 'Breakage', 'Get Pass', 'Movement'],
  evidence: [
    { layer: 'Backend', file: 'OSE-backend/src/services/postingEngine.service.js', method: 'single delegation surface', verification: 'Verified' },
    { layer: 'Backend', file: 'OSE-backend/scripts/smoke-posting-governance-enforcement.js', method: 'governance smoke assertions', verification: 'Verified' },
  ],
});

// ── Remain Partial (blockers documented) ────────────────────────────────────

partial('C03-3.1-002', {
  remainingWork: 'GRN multi-bar action model differs from Transfer/Get Pass shared returns-workflow pattern — needs UX unification BDR',
  verificationStatus: 'Pending Governance',
  blocker: 'BDR: Unify GRN action bar with shared returns-workflow action model across modules',
  evidence: [
    ...(evidence['C03-3.1-002']?.evidence ?? []),
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html',
      method: 'module-specific multi-bar layout retained',
      verification: 'Verified',
    },
  ],
});

partial('C03-3.2-001', {
  remainingWork: 'User-facing Cancel on breakage draft; internal VOID status and inventory-count VOID session label remain',
  verificationStatus: 'Needs Code Review',
  blocker: 'Code: Rename internal VOID status to CANCELLED on breakage/inventory-count backend (breaking schema/API)',
  evidence: [
    ...(evidence['C03-3.2-001']?.evidence ?? []),
    {
      layer: 'Frontend',
      file: 'OSE-Frontend/public/i18n/en.json',
      method: 'BREAKAGE.DETAIL CONFIRM_VOID_* → Cancel copy',
      verification: 'Verified',
    },
  ],
});

partial('C03-3.4-002', {
  remainingWork: 'Send Back allows header/notes edit on GRN Returned; full line edit after submission not restored platform-wide',
  verificationStatus: 'Needs Code Review',
  blocker: 'Code: Restore governed line edit on Returned/Send Back path for Transfer/Breakage/Get Pass',
  evidence: evidence['C03-3.4-002']?.evidence ?? [],
});

partial('C03-3.4-004', {
  remainingWork: 'GRN Returned path uses validate+submit; intermediate Validate step on other modules not verified',
  verificationStatus: 'Needs Code Review',
  blocker: 'Code: Verify Edit→Submit sequence on all modules with Send Back',
  evidence: evidence['C03-3.4-004']?.evidence ?? [],
});

partial('C03-3.4-005', {
  remainingWork: 'Send Back implemented on GRN only; not on Transfer/Breakage/Get Pass',
  verificationStatus: 'Pending Governance',
  blocker: 'BDR: Roll out Send Back workflow action to Transfer, Breakage, Get Pass document families',
  evidence: evidence['C03-3.4-005']?.evidence ?? [],
});

partial('C03-3.5-001', {
  remainingWork: 'GRN can show multiple contextual action regions; not exhaustively verified one-primary-action per state platform-wide',
  verificationStatus: 'Needs Code Review',
  blocker: 'Code: Consolidate GRN detail to single primary action per document state',
  evidence: evidence['C03-3.5-001']?.evidence ?? [],
});

partial('C04-4.1-001', {
  remainingWork: 'No automated proof that permissions alone never execute business effects — pattern exists service-by-service',
  verificationStatus: 'Pending Governance',
  blocker: 'Governance: Platform-wide permission-vs-execution audit harness',
  evidence: evidence['C04-4.1-001']?.evidence ?? [],
});

partial('C04-4.1-002', {
  remainingWork: 'Workflow validation enforced in services but not centrally documented as non-bypassable invariant',
  verificationStatus: 'Pending Governance',
  blocker: 'Governance: Central workflow-validation enforcement contract + smoke matrix',
  evidence: evidence['C04-4.1-002']?.evidence ?? [],
});

partial('C04-4.1-004', {
  remainingWork: 'Business-rule validation proven on governed post paths; not exhaustively mapped for every mutation endpoint',
  verificationStatus: 'Needs Audit',
  blocker: 'Audit: Complete mutation-endpoint business-rule coverage matrix',
  evidence: evidence['C04-4.1-004']?.evidence ?? [],
});

fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);

const build = spawnSync('node', ['build-register.mjs'], {
  cwd: path.join(ROOT, 'Governance'),
  stdio: 'inherit',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const closed = [
  'C03-3.1-001', 'C03-3.1-003', 'C03-3.2-002', 'C03-3.3-001', 'C03-3.6-001',
  'C03-3.4-006', 'C03-3.4-009', 'C03-3.4-010',
  'C04-4.1-003', 'C04-4.2-001',
  'C05-5.1-001', 'C05-5.1-002', 'C05-5.1-003',
  'C05-5.2-001', 'C05-5.2-002', 'C05-5.2-003', 'C05-5.2-004', 'C05-5.2-005',
  'C05-5.2-006', 'C05-5.2-008', 'C05-5.2-009', 'C05-5.2-010', 'C05-5.2-011',
  'C05-5.2-012', 'C05-5.2-013', 'C05-5.2-014',
];
const open = [
  'C03-3.1-002', 'C03-3.2-001', 'C03-3.4-002', 'C03-3.4-004', 'C03-3.4-005', 'C03-3.5-001',
  'C04-4.1-001', 'C04-4.1-002', 'C04-4.1-004',
];

console.log(`\nBATCH-CH3-5 complete: ${closed.length} closed to Yes, ${open.length} remain Partial.`);
