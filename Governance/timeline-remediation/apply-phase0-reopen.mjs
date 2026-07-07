#!/usr/bin/env node
/**
 * Phase 0 — Reopen timeline-related Constitution requirements (evidence-based).
 * Run: node Governance/timeline-remediation/apply-phase0-reopen.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const EVIDENCE_PATH = path.join(ROOT, 'Governance/evidence.json');
const AUDIT_DATE = '2026-06-26';
const BLOCKER = 'TIMELINE-UNIFIED-REMEDIATION';
const BATCH = 'TIMELINE-UNIFIED-REMEDIATION';

const REOPEN = {
  'C22-22.3-001': {
    affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass', 'Inventory Count'],
    remainingWork:
      'Implement unified timelineEntries[] chronological contract; migrate in-scope detail views; legacy workflowSlots+auditEvents unchanged until Phase 9.',
    preReason:
      'documentTimeline.service.js returns separate workflowSlots and auditEvents; returns-workflow-timeline renders slots then audits — not a single chronological timeline (cross-module audit 2026-06-26).',
    failureEvidence: {
      layer: 'Governance',
      file: 'Governance/timeline-remediation/PHASE0_REOPEN_EVIDENCE.md',
      method: 'Cross-module timeline audit §C22-22.3-001',
      verification: 'Failed',
    },
  },
  'C15-15.5-001': {
    affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Get Pass', 'Inventory Count'],
    remainingWork:
      'Merge lifecycle reasons/comments into timelineEntries in chronological order; GRN Send Back must not appear after future pending steps.',
    preReason:
      'GRN: SEND_BACK audit appended after state-projection slots; notes/reasons not in unified chronological order (2026-06-26). Movement excluded — regression only, no direct violation evidenced.',
    failureEvidence: {
      layer: 'Governance',
      file: 'Governance/timeline-remediation/PHASE0_REOPEN_EVIDENCE.md',
      method: 'Cross-module timeline audit §C15-15.5-001',
      verification: 'Failed',
    },
  },
  'C02-2.8-001': {
    affectedModules: ['GRN', 'Get Pass', 'Inventory Count'],
    remainingWork:
      'Timeline must reflect accurate current state after Send Back / projection reset; replace state-projection with history-aware entries.',
    preReason:
      'GRN buildGrnWorkflowTimeline derives current state only; Get Pass client-side projection; Inventory Count hybrid state (2026-06-26).',
    failureEvidence: {
      layer: 'Backend',
      file: 'OSE-backend/src/services/grn-workflow-presentation.util.js',
      method: 'buildGrnWorkflowTimeline() current-state projection',
      verification: 'Failed',
    },
  },
  'C02-2.8-002': {
    affectedModules: ['GRN', 'Inventory Count'],
    remainingWork:
      'Show full workflow steps including prior approval cycles (GRN) and recount rounds (Inventory Count).',
    preReason:
      'GRN loses prior cycle steps after Send Back; Inventory Count recount rounds not in timeline builder (2026-06-26).',
    failureEvidence: {
      layer: 'Backend',
      file: 'OSE-backend/src/services/grn-workflow-presentation.util.js',
      method: 'buildGrnWorkflowTimeline() fixed 3 slots',
      verification: 'Failed',
    },
  },
  'C02-2.8-003': {
    affectedModules: ['GRN'],
    remainingWork: 'Preserve and display actor for every completed approval cycle after Send Back / resubmit.',
    preReason:
      'sendBackGrn clears approvedBy and unlinks ApprovalRequest; prior-cycle actors not shown in timeline (2026-06-26).',
    failureEvidence: {
      layer: 'Backend',
      file: 'OSE-backend/src/services/grn.service.js',
      method: 'sendBackGrn() approvedBy null + approvalRequestId null',
      verification: 'Failed',
    },
  },
  'C02-2.8-004': {
    affectedModules: ['GRN'],
    remainingWork: 'Preserve and display actedAt for every completed approval cycle after Send Back / resubmit.',
    preReason:
      'Prior-cycle approval timestamps lost when state projection resets after Send Back (2026-06-26).',
    failureEvidence: {
      layer: 'Backend',
      file: 'OSE-backend/src/services/grn.service.js',
      method: 'sendBackGrn() state wipe',
      verification: 'Failed',
    },
  },
  'C02-2.8-005': {
    affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items', 'Inventory Count'],
    remainingWork:
      'Mandatory Send Back / Reject reasons must appear on timeline lifecycle entries, not only document header or raw audit row.',
    preReason:
      'GRN SEND_BACK shown as raw audit; Transfer/Breakage/Lost/InvCount reject reason not in presentation slots (2026-06-26).',
    failureEvidence: {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.ts',
      method: 'auditActionLabel() raw action strings',
      verification: 'Failed',
    },
  },
  'C02-2.8-006': {
    affectedModules: ['GRN', 'Transfer', 'Breakage', 'Lost Items'],
    remainingWork: 'Surface workflow step comments on unified timeline entries where applicable.',
    preReason:
      'approvalStepsToSlots omits step.comment; presentation timeline does not show approval comments (2026-06-26).',
    failureEvidence: {
      layer: 'Backend',
      file: 'OSE-backend/src/platform/documentTimeline.service.js',
      method: 'approvalStepsToSlots() no comment field',
      verification: 'Failed',
    },
  },
  'C02-2.8-007': {
    affectedModules: ['GRN', 'Get Pass'],
    remainingWork:
      'Lifecycle/system events as typed timeline entries with i18n; Get Pass must integrate constitution timeline audit.',
    preReason:
      'GRN SEND BACK raw in audit block; Get Pass detail uses client projection without auditEvents (2026-06-26).',
    failureEvidence: {
      layer: 'Frontend',
      file: 'OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.ts',
      method: 'buildGetPassWorkflowPresentationSlots() no constitution API',
      verification: 'Failed',
    },
  },
  'C02-2.8-008': {
    affectedModules: ['GRN'],
    remainingWork:
      'Duration and ordering must reflect full multi-cycle history; fix after unified timelineEntries merge.',
    preReason:
      'GRN cycle reset breaks duration continuity across Send Back/resubmit (2026-06-26).',
    failureEvidence: {
      layer: 'Backend',
      file: 'OSE-backend/src/platform/timelineDuration.util.js',
      method: 'enrichTimelineSlotsWithDuration() on reset projection',
      verification: 'Failed',
    },
  },
};

const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));

const before = {
  needsAudit: 0,
  complete: 0,
  verified: 0,
};
for (const id of Object.keys(REOPEN)) {
  const e = evidence[id];
  if (!e) throw new Error(`Missing evidence key ${id}`);
  if (e.verificationStatus === 'Needs Audit') before.needsAudit++;
  if (e.remainingWork === 'Complete') before.complete++;
  if (e.verificationStatus === 'Verified') before.verified++;
}

for (const [id, patch] of Object.entries(REOPEN)) {
  const e = evidence[id];
  e.implemented = 'Partial';
  e.affectedModules = patch.affectedModules;
  e.remainingWork = patch.remainingWork;
  e.verificationStatus = 'Needs Audit';
  e.blocker = BLOCKER;
  e.remediationBatch = BATCH;
  e.remediatedAt = null;
  e.preRemediationAudit = {
    passed: false,
    auditedAt: AUDIT_DATE,
    failedChecks: ['timeline-unified-audit'],
    reason: patch.preReason,
  };
  e.postRemediationAudit = {
    passed: false,
    auditedAt: AUDIT_DATE,
    reason: 'Open — pending TIMELINE-UNIFIED-REMEDIATION Phases 1–9',
  };
  const hasFailure = e.evidence.some(
    (row) => row.file === patch.failureEvidence.file && row.method === patch.failureEvidence.method,
  );
  if (!hasFailure) {
    e.evidence = [...e.evidence, patch.failureEvidence];
  }
}

fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

const after = { needsAudit: 0, complete: 0, verified: 0 };
for (const id of Object.keys(REOPEN)) {
  const e = evidence[id];
  if (e.verificationStatus === 'Needs Audit') after.needsAudit++;
  if (e.remainingWork === 'Complete') after.complete++;
  if (e.verificationStatus === 'Verified') after.verified++;
}

console.log(JSON.stringify({ updated: Object.keys(REOPEN).length, before, after }, null, 2));
