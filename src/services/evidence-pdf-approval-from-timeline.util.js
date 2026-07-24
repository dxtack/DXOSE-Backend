'use strict';

/**
 * Map constitutional timeline entries → Official Evidence PDF approval workflow data.
 * Data-only: does not touch PDF draw/layout code.
 *
 * Label conventions match existing Official Evidence packs so documents without
 * lifecycle extras keep the same step titles (Received & validated / ACC labels /
 * Posted to inventory). Extra lifecycle steps (Resubmitted, Sent back, …) are
 * inserted in timeline order using the same slot shape the drawer already renders.
 */

const { buildTimelineEntries } = require('../platform/timeline/timelineEntry.merge');
const { ROLE_CODE_TO_STAGE_KEY } = require('../platform/timeline/approvalTimeline.builder');

const LIFECYCLE_PDF_LABELS = Object.freeze({
  RESUBMIT: 'Resubmitted',
  SEND_BACK: 'Sent back',
  REJECT: 'Rejected',
  RECOUNT: 'Recount requested',
  CANCEL: 'Cancelled',
});

/** Lifecycle types that belong in the PDF workflow strip (not the preparer bookend). */
const PDF_LIFECYCLE_TYPES = new Set(['RESUBMIT', 'SEND_BACK', 'REJECT', 'RECOUNT', 'CANCEL']);

/** Submit/create openers are already covered by Submitted by / Requested by / Received bookends. */
const SKIP_LIFECYCLE_TYPES = new Set(['SUBMIT_FOR_APPROVAL', 'SUBMIT']);

function sortEntries(entries = []) {
  return [...entries].sort((a, b) => {
    const ao = a.globalOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.globalOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return 0;
  });
}

function actorName(entry) {
  if (!entry?.actor) return null;
  if (typeof entry.actor === 'string') return entry.actor;
  return entry.actor.name || null;
}

function pdfStatusFromEntry(entry) {
  const status = String(entry?.status || '').toUpperCase();
  const type = String(entry?.entryType || '').toUpperCase();
  if (type === 'POSTING' || status === 'POSTED') return 'POSTED';
  if (status === 'REJECTED') return 'REJECTED';
  if (
    status === 'COMPLETED' ||
    status === 'APPROVED' ||
    type === 'APPROVAL_STEP_COMPLETED' ||
    type === 'MILESTONE_COMPLETED' ||
    type === 'LIFECYCLE_EVENT'
  ) {
    if (type === 'MILESTONE_COMPLETED' || type === 'LIFECYCLE_EVENT') return 'COMPLETED';
    return 'APPROVED';
  }
  return 'PENDING';
}

function accLabelForStage(accChainDef = [], stageKey, stepNumber) {
  if (stepNumber != null) {
    const byOrder = accChainDef.find((s) => Number(s.step) === Number(stepNumber));
    if (byOrder?.label) return byOrder.label;
  }
  const key = String(stageKey || '').toUpperCase();
  const byRole = accChainDef.find((s) => {
    const role = String(s.role || '').toUpperCase();
    return ROLE_CODE_TO_STAGE_KEY[role] === key || role === key;
  });
  return byRole?.label || null;
}

function accRoleForStage(accChainDef = [], stageKey, stepNumber) {
  if (stepNumber != null) {
    const byOrder = accChainDef.find((s) => Number(s.step) === Number(stepNumber));
    if (byOrder?.role) return byOrder.role;
  }
  const key = String(stageKey || '').toUpperCase();
  const byRole = accChainDef.find((s) => {
    const role = String(s.role || '').toUpperCase();
    return ROLE_CODE_TO_STAGE_KEY[role] === key || role === key;
  });
  return byRole?.role || stageKey || 'APPROVAL';
}

function shouldIncludeEntry(entry, { includeMilestones = true, includeCountSubmit = false } = {}) {
  if (!entry) return false;
  const type = String(entry.entryType || '').toUpperCase();
  const stage = String(entry.stageKey || '').toUpperCase();
  const life = String(entry.lifecycleEventType || '').toUpperCase();

  if (type === 'LIFECYCLE_EVENT') {
    if (SKIP_LIFECYCLE_TYPES.has(life)) return false;
    return PDF_LIFECYCLE_TYPES.has(life);
  }
  if (type === 'POSTING') return true;
  if (type === 'APPROVAL_STEP_COMPLETED' || type === 'APPROVAL_STEP_CURRENT' || type === 'APPROVAL_STEP_FUTURE') {
    return true;
  }
  if (type === 'MILESTONE_COMPLETED' || type === 'MILESTONE_CURRENT') {
    if (stage === 'COUNT_SUBMITTED' && !includeCountSubmit) return false;
    if (stage === 'RECEIVED_VALIDATED' || stage === 'VARIANCE_REVIEW') return includeMilestones;
    return includeMilestones;
  }
  return false;
}

function labelForEntry(entry, accChainDef = [], moduleKey = 'GRN') {
  const type = String(entry.entryType || '').toUpperCase();
  const stage = String(entry.stageKey || '').toUpperCase();
  const life = String(entry.lifecycleEventType || '').toUpperCase();

  if (type === 'LIFECYCLE_EVENT') {
    return LIFECYCLE_PDF_LABELS[life] || life.replace(/_/g, ' ');
  }
  if (type === 'POSTING' || stage === 'POSTED') {
    return 'Posted to inventory';
  }
  if (stage === 'RECEIVED_VALIDATED') {
    return 'Received & validated';
  }
  if (stage === 'VARIANCE_REVIEW') {
    // Match inventory-count-workflow-presentation.util stageTitle
    return 'VARIANCE REVIEW';
  }
  if (moduleKey === 'INVENTORY_COUNT') {
    if (type === 'POSTING' || stage === 'POSTED') return 'POSTED TO INVENTORY';
    if (stage === 'FINANCE') return 'FINANCE APPROVED';
    if (stage === 'GENERAL_MANAGER') return 'GENERAL MANAGER APPROVED';
    if (stage === 'COST_CONTROL') return 'COST CONTROL APPROVED';
    const acc = accLabelForStage(accChainDef, stage, entry.stepNumber);
    if (acc) return acc;
    return stage ? `${stage.replace(/_/g, ' ')} APPROVED` : 'APPROVED';
  }
  const acc = accLabelForStage(accChainDef, stage, entry.stepNumber);
  if (acc) return acc;
  if (stage === 'COST_CONTROL') return 'Cost Control review';
  if (stage === 'FINANCE') return 'Finance post approval';
  return stage.replace(/_/g, ' ');
}

function roleForEntry(entry, accChainDef = [], moduleKey = 'GRN') {
  const type = String(entry.entryType || '').toUpperCase();
  const stage = String(entry.stageKey || '').toUpperCase();
  if (type === 'LIFECYCLE_EVENT') return 'LIFECYCLE';
  if (type === 'POSTING' || stage === 'POSTED') return 'POSTING';
  if (stage === 'RECEIVED_VALIDATED') return 'MILESTONE';
  if (stage === 'VARIANCE_REVIEW') {
    return moduleKey === 'INVENTORY_COUNT' ? 'Cost Control' : 'MILESTONE';
  }
  return accRoleForStage(accChainDef, stage, entry.stepNumber);
}

function kindForEntry(entry) {
  const type = String(entry.entryType || '').toUpperCase();
  if (type === 'POSTING') return 'POSTING';
  if (type === 'LIFECYCLE_EVENT') return 'LIFECYCLE';
  if (type.startsWith('MILESTONE')) return 'MILESTONE';
  return 'APPROVAL';
}

/**
 * @param {object[]} rawOrOrderedEntries — raw builder output or already ordered entries
 * @param {object} options
 */
function mapTimelineEntriesToPdfApprovalWorkflow(rawOrOrderedEntries = [], options = {}) {
  const {
    accChainDef = [],
    moduleKey = 'GRN',
    ensurePostingSlot = true,
    includeCountSubmit = false,
    includeMilestones = true,
    postedAt = null,
    postedBy = null,
  } = options;

  const ordered = Array.isArray(rawOrOrderedEntries?.[0])
    ? buildTimelineEntries(rawOrOrderedEntries)
    : rawOrOrderedEntries.some((e) => e?.globalOrder != null)
      ? sortEntries(rawOrOrderedEntries)
      : buildTimelineEntries([rawOrOrderedEntries]);

  // Collapse duplicate lifecycle rows that share the same audit id (or same type+timestamp).
  const seenLifecycle = new Set();
  const deduped = ordered.filter((entry) => {
    if (String(entry?.entryType || '') !== 'LIFECYCLE_EVENT') return true;
    const life = String(entry.lifecycleEventType || '').toUpperCase();
    const key =
      entry.sourceRef?.auditLogId != null
        ? `audit:${entry.sourceRef.auditLogId}`
        : `${life}|${entry.actedAt || ''}|${entry.actor?.id || entry.actor?.name || ''}`;
    if (seenLifecycle.has(key)) return false;
    seenLifecycle.add(key);
    return true;
  });

  const included = deduped.filter((e) =>
    shouldIncludeEntry(e, { includeMilestones, includeCountSubmit }),
  );

  const approvalChainDefinition = [];
  const approvalHistory = [];

  included.forEach((entry, idx) => {
    const stepNumber = idx + 1;
    const label = labelForEntry(entry, accChainDef, moduleKey);
    const role = roleForEntry(entry, accChainDef, moduleKey);
    const status = pdfStatusFromEntry(entry);
    const kind = kindForEntry(entry);
    const actor = actorName(entry);
    const pending = status === 'PENDING';

    approvalChainDefinition.push({
      step: stepNumber,
      role,
      label,
    });

    let historyRole = role;
    if (role === 'LIFECYCLE' || role === 'MILESTONE' || role === 'POSTING') {
      historyRole = null;
    }
    // IC variance milestone keeps roleLabel "Cost Control" for PDF actor-line fallback.
    if (moduleKey === 'INVENTORY_COUNT' && role === 'Cost Control') {
      historyRole = 'Cost Control';
    }

    let historyActor = actor;
    if (!historyActor) {
      if (kind === 'POSTING') {
        historyActor = moduleKey === 'INVENTORY_COUNT' ? 'Auto posted by DX' : null;
      } else if (moduleKey === 'INVENTORY_COUNT' && kind === 'MILESTONE') {
        historyActor = null;
      } else if (pending) {
        historyActor = 'Pending';
      } else {
        historyActor = '—';
      }
    }

    approvalHistory.push({
      stepNumber,
      step: moduleKey === 'INVENTORY_COUNT' ? label : stepNumber,
      role: historyRole,
      label,
      actor: historyActor,
      actedBy: historyActor,
      actedAt: entry.actedAt || null,
      status,
      kind,
      comment: entry.note || entry.reason || null,
    });
  });

  const hasPosting = approvalChainDefinition.some((r) => r.role === 'POSTING');
  if (ensurePostingSlot && !hasPosting) {
    const stepNumber = approvalChainDefinition.length + 1;
    const posted = Boolean(postedAt);
    const postingLabel =
      moduleKey === 'INVENTORY_COUNT' ? 'POSTED TO INVENTORY' : 'Posted to inventory';
    approvalChainDefinition.push({
      step: stepNumber,
      role: 'POSTING',
      label: postingLabel,
    });
    approvalHistory.push({
      stepNumber,
      step: moduleKey === 'INVENTORY_COUNT' ? postingLabel : stepNumber,
      role: null,
      label: postingLabel,
      actor: posted
        ? postedBy || (moduleKey === 'INVENTORY_COUNT' ? 'Auto posted by DX' : null)
        : null,
      actedBy: posted
        ? postedBy || (moduleKey === 'INVENTORY_COUNT' ? 'Auto posted by DX' : null)
        : null,
      actedAt: posted ? postedAt : null,
      status: posted ? 'POSTED' : 'PENDING',
      kind: 'POSTING',
    });
  }

  return { approvalChainDefinition, approvalHistory, timelineEntryCount: included.length };
}

/**
 * Resolve Cost Control actedAt for GRN presentation (persisted preferred, else step).
 */
function resolveGrnCostApprovedAt(grn, toIso) {
  if (!grn?.approvedBy) return null;
  if (grn.approvedAt) return toIso(grn.approvedAt);

  const collectSteps = [];
  if (grn.approvalRequest?.steps?.length) collectSteps.push(...grn.approvalRequest.steps);
  for (const req of grn.approvalHistory || []) {
    if (req?.steps?.length) collectSteps.push(...req.steps);
  }

  const costSteps = collectSteps
    .filter((s) => Number(s.stepNumber) === 1 && String(s.status || '').toUpperCase() === 'APPROVED' && s.actedAt)
    .sort((a, b) => new Date(b.actedAt) - new Date(a.actedAt));
  if (costSteps[0]?.actedAt) return toIso(costSteps[0].actedAt);

  if (grn.status === 'PENDING_FINANCE') return toIso(grn.updatedAt);
  return null;
}

module.exports = {
  mapTimelineEntriesToPdfApprovalWorkflow,
  resolveGrnCostApprovedAt,
  LIFECYCLE_PDF_LABELS,
  PDF_LIFECYCLE_TYPES,
};
