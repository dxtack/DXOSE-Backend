'use strict';

/** Mandatory clean-verification browser scenario IDs (addendum §5). */
const MANDATORY_CLEAN_BROWSER_IDS = [
  'P5-CLEAN-BR-TR-DEPT-APPROVE',
  'P5-CLEAN-BR-TR-FINANCE-POST',
  'P5-CLEAN-BR-TR-REJECT',
  'P5-CLEAN-BR-BRK-CC-APPROVE',
  'P5-CLEAN-BR-BRK-FIN-APPROVE',
  'P5-CLEAN-BR-BRK-GM-APPROVE',
  'P5-CLEAN-BR-BRK-VOID-DRAFT',
  'P5-CLEAN-BR-BRK-VOID-REJECTED',
  'P5-CLEAN-BR-BRK-REJECT',
  'P5-CLEAN-BR-LOST-EMPLOYEE',
  'P5-CLEAN-BR-LOST-HOTEL',
  'P5-CLEAN-BR-LOST-REJECT',
  'P5-CLEAN-BR-TR-DRAFT-TL-1920',
  'P5-CLEAN-BR-TR-DRAFT-TL-768',
  'P5-CLEAN-BR-NEG-TR-PEN-1920',
  'P5-CLEAN-BR-NEG-TR-PEN-768',
  'P5-CLEAN-BR-NEG-BRK-PEN-1920',
  'P5-CLEAN-BR-NEG-BRK-PEN-768',
  'P5-CLEAN-BR-NEG-LOST-PEN-1920',
  'P5-CLEAN-BR-NEG-LOST-PEN-768',
  'P5-CLEAN-BR-NEG-TR-POST-1920',
  'P5-CLEAN-BR-NEG-TR-POST-768',
  'P5-CLEAN-BR-NEG-BRK-APP-1920',
  'P5-CLEAN-BR-NEG-BRK-APP-768',
  'P5-CLEAN-BR-NEG-LOST-APP-1920',
  'P5-CLEAN-BR-NEG-LOST-APP-768',
  'P5-CLEAN-BR-NEG-LOST-REJ-1920',
  'P5-CLEAN-BR-NEG-LOST-REJ-768',
];

function parseRequestBody(request) {
  try {
    return request.postDataJSON() || {};
  } catch {
    try {
      const raw = request.postData();
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}

function missingFields(body, required) {
  return required.filter((f) => body[f] == null || body[f] === '');
}

function assertVoidTimelineEntries(entries) {
  const voidEntries = entries.filter(
    (e) => e.lifecycleEventType === 'VOID' || e.displayTitleKey === 'TIMELINE.LIFECYCLE.VOID',
  );
  const entry = voidEntries[0];
  const activeStageCount = entries.filter(
    (e) => e.entryType === 'APPROVAL_STEP_CURRENT' || e.status === 'IN_PROGRESS',
  ).length;
  const futurePendingStageCount = entries.filter(
    (e) =>
      e.entryType === 'APPROVAL_STEP_FUTURE' ||
      (e.status === 'PENDING' && e.entryType !== 'LIFECYCLE_EVENT' && e.entryType !== 'SYSTEM_EVENT'),
  ).length;
  return {
    voidEventCount: voidEntries.length,
    voidLabel: entry?.displayTitleKey === 'TIMELINE.LIFECYCLE.VOID' ? 'Voided' : null,
    voidActorPresent: !!entry?.actor?.name,
    voidTimestampPresent: !!entry?.actedAt,
    voidReasonPresent: !!(entry?.reason && String(entry.reason).trim()),
    activeStageCount,
    futurePendingStageCount,
    pass:
      voidEntries.length === 1 &&
      entry?.displayTitleKey === 'TIMELINE.LIFECYCLE.VOID' &&
      !!entry?.actor?.name &&
      !!entry?.actedAt &&
      !!(entry?.reason && String(entry.reason).trim()) &&
      activeStageCount === 0 &&
      futurePendingStageCount === 0,
  };
}

function lineUnitCost(line) {
  const uc = Number(line?.unitCost ?? 0);
  const qty = Number(line?.qtyInBaseUnit ?? line?.requestedQty ?? 1);
  const tv = Number(line?.totalValue ?? 0);
  return { unitCost: uc, totalValue: tv > 0 ? tv : uc * qty, qty };
}

module.exports = {
  MANDATORY_CLEAN_BROWSER_IDS,
  parseRequestBody,
  missingFields,
  assertVoidTimelineEntries,
  lineUnitCost,
};
