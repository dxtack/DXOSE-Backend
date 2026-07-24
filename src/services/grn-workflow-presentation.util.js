'use strict';

const { userDisplayName, toIso } = require('../utils/timeline-present.util');
const { resolveGrnCostApprovedAt } = require('./evidence-pdf-approval-from-timeline.util');

/**
 * Cost review timestamp: prefer GrnImport.approvedAt, else ApprovalStep.actedAt.
 */
function resolveCostApprovedAt(grn) {
  return resolveGrnCostApprovedAt(grn, toIso);
}

function buildReceivedValidatedSlot(grn) {
  return {
    order: 1,
    kind: 'MILESTONE',
    stageTitle: 'RECEIVED & VALIDATED',
    roleLabel: null,
    actorName: userDisplayName(grn.importedByUser),
    actedAt: toIso(grn.createdAt),
    status: grn.status === 'DRAFT' ? 'IN_PROGRESS' : 'COMPLETED',
  };
}

function buildCostControlApprovedSlot(grn) {
  let status = 'PENDING';
  if (grn.status === 'VALIDATED') status = 'IN_PROGRESS';
  if (grn.approvedBy && ['PENDING_FINANCE', 'POSTED'].includes(grn.status)) status = 'APPROVED';
  if (grn.status === 'REJECTED' && !grn.approvedBy) status = 'REJECTED';

  return {
    order: 2,
    kind: 'APPROVAL',
    stageTitle: 'COST CONTROL APPROVED',
    roleLabel: null,
    actorName: grn.approvedBy ? userDisplayName(grn.approvedByUser) : null,
    actedAt: resolveCostApprovedAt(grn),
    status,
  };
}

function buildFinanceApprovedSlot(grn) {
  let status = 'PENDING';
  if (grn.status === 'PENDING_FINANCE') status = 'IN_PROGRESS';
  if (grn.status === 'POSTED') status = 'APPROVED';
  if (grn.status === 'REJECTED' && grn.approvedBy) status = 'REJECTED';

  return {
    order: 3,
    kind: 'APPROVAL',
    stageTitle: 'FINANCE APPROVED',
    roleLabel: null,
    actorName: grn.status === 'POSTED' ? userDisplayName(grn.postedByUser) : null,
    actedAt: grn.status === 'POSTED' ? toIso(grn.postedAt) : null,
    status,
  };
}

function buildPostedToInventorySlot(grn) {
  if (grn.status !== 'POSTED') return null;
  return {
    order: 4,
    kind: 'POSTING',
    stageTitle: 'POSTED TO INVENTORY',
    roleLabel: null,
    actorName: null,
    actedAt: toIso(grn.postedAt),
    status: 'POSTED',
  };
}

/**
 * Canonical GRN presentation timeline for Detail + Evidence PDF.
 * Actors are always real system users — never hardcoded role names.
 */
function buildGrnWorkflowTimeline(grn) {
  const slots = [
    buildReceivedValidatedSlot(grn),
    buildCostControlApprovedSlot(grn),
    buildFinanceApprovedSlot(grn),
  ];
  const posted = buildPostedToInventorySlot(grn);
  if (posted) slots.push(posted);
  return slots;
}

function mapSlotsToPdfApprovalHistory(slots = []) {
  return slots.map((slot, idx) => {
    let pdfStatus = slot.status;
    if (slot.kind === 'MILESTONE' && slot.status === 'COMPLETED') {
      pdfStatus = 'COMPLETED';
    }
    let actor = slot.actorName;
    if (!actor) {
      if (slot.kind === 'POSTING') {
        actor = null;
      } else if (slot.status === 'PENDING' || slot.status === 'IN_PROGRESS') {
        actor = 'Pending';
      } else {
        actor = '—';
      }
    }
    return {
      stepNumber: idx + 1,
      step: slot.stageTitle,
      role: slot.roleLabel,
      label: slot.stageTitle,
      actor,
      actedBy: actor,
      actedAt: slot.actedAt,
      status: pdfStatus,
      kind: slot.kind,
    };
  });
}

module.exports = {
  buildGrnWorkflowTimeline,
  buildReceivedValidatedSlot,
  buildCostControlApprovedSlot,
  buildFinanceApprovedSlot,
  buildPostedToInventorySlot,
  mapSlotsToPdfApprovalHistory,
  resolveCostApprovedAt,
};
