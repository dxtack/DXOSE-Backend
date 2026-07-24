'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SUBMIT_COUNTS_NOTE = 'INVENTORY_COUNT_SUBMIT_COUNTS';

const { userDisplayName, toIso } = require('../utils/timeline-present.util');

/**
 * Audit rows for variance-review milestone (read-only presentation).
 */
async function fetchCountAuditRows(tenantId, sessionId) {
  return prisma.auditLog.findMany({
    where: {
      tenantId,
      entityType: 'STOCK_COUNT',
      entityId: String(sessionId),
      action: 'SUBMIT',
    },
    orderBy: { changedAt: 'asc' },
    include: {
      changedByUser: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

function findSubmitCountsAudit(auditRows = []) {
  return (
    auditRows.find((row) => String(row.note || '').includes(SUBMIT_COUNTS_NOTE)) || null
  );
}

function stageTitleForApprovalRole(roleCode) {
  switch (String(roleCode || '').toUpperCase()) {
    case 'FINANCE_MANAGER':
      return 'FINANCE APPROVED';
    case 'GENERAL_MANAGER':
      return 'GENERAL MANAGER APPROVED';
    default:
      return roleCode ? `${String(roleCode).replace(/_/g, ' ')} APPROVED` : 'APPROVED';
  }
}

function normalizeStepStatus(stepStatus) {
  const s = String(stepStatus || '').toUpperCase();
  if (s === 'APPROVED') return 'APPROVED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}

/**
 * Non-approval variance review milestone (Cost Control reviewer lane).
 */
function buildVarianceReviewSlot(session, auditRows = []) {
  const submitAudit = findSubmitCountsAudit(auditRows);
  const inReveal = session.status === 'REVEAL_REVIEW';
  const pastReveal = !['DRAFT', 'COUNTING', 'RECOUNTING'].includes(session.status);

  return {
    order: 1,
    kind: 'MILESTONE',
    stageTitle: 'VARIANCE REVIEW',
    roleLabel: 'Cost Control',
    actorName: null,
    actedAt: toIso(submitAudit?.changedAt),
    status: inReveal ? 'IN_PROGRESS' : pastReveal ? 'COMPLETED' : 'IN_PROGRESS',
  };
}

/**
 * Formal approval steps from existing approvalRequest (unchanged workflow data).
 */
function buildApprovalSlots(approvalRequest, startOrder = 2) {
  if (!approvalRequest?.steps?.length) return [];
  return [...approvalRequest.steps]
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((step, idx) => ({
      order: startOrder + idx,
      kind: 'APPROVAL',
      stageTitle: stageTitleForApprovalRole(step.requiredRole?.code),
      roleLabel: null,
      actorName: userDisplayName(step.actedByUser),
      actedAt: toIso(step.actedAt),
      status: normalizeStepStatus(step.status),
    }));
}

/**
 * Ledger posting evidence — separate from GM approval step.
 */
function buildPostedSlot(session, _approvalRequest, order) {
  if (session.status !== 'POSTED') return null;
  return {
    order,
    kind: 'POSTING',
    stageTitle: 'POSTED TO INVENTORY',
    roleLabel: null,
    actorName: 'Auto posted by DX',
    actedAt: toIso(session.postedAt),
    status: 'POSTED',
  };
}

/**
 * Canonical presentation timeline for Detail + Evidence PDF.
 */
function buildInventoryCountWorkflowTimeline(session, auditRows = []) {
  const slots = [buildVarianceReviewSlot(session, auditRows)];
  const approvals = buildApprovalSlots(session.approvalRequest, 2);
  slots.push(...approvals);
  const posted = buildPostedSlot(session, session.approvalRequest, slots.length + 1);
  if (posted) slots.push(posted);
  return slots;
}

/**
 * Map presentation slots to PDF approval workflow rows.
 */
function mapSlotsToPdfApprovalHistory(slots = []) {
  return slots.map((slot) => {
    let pdfStatus = slot.status;
    if (slot.kind === 'MILESTONE' && slot.status === 'COMPLETED') {
      pdfStatus = 'COMPLETED';
    }
    let actor = slot.actorName;
    if (!actor) {
      if (slot.kind === 'POSTING') {
        actor = null;
      } else if (slot.kind === 'MILESTONE' && slot.roleLabel) {
        actor = null;
      } else if (slot.status === 'PENDING' || slot.status === 'IN_PROGRESS') {
        actor = 'Pending';
      } else {
        actor = '—';
      }
    }
    return {
      step: slot.stageTitle,
      role: slot.roleLabel,
      actor,
      actedAt: slot.actedAt,
      status: pdfStatus,
      kind: slot.kind,
    };
  });
}

async function buildInventoryCountWorkflowTimelineForSession(tenantId, session) {
  const auditRows = await fetchCountAuditRows(tenantId, session.id);
  return buildInventoryCountWorkflowTimeline(session, auditRows);
}

module.exports = {
  fetchCountAuditRows,
  buildVarianceReviewSlot,
  buildApprovalSlots,
  buildPostedSlot,
  buildInventoryCountWorkflowTimeline,
  buildInventoryCountWorkflowTimelineForSession,
  mapSlotsToPdfApprovalHistory,
  stageTitleForApprovalRole,
  SUBMIT_COUNTS_NOTE,
};
