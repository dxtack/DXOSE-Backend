'use strict';

const fs = require('fs');
const path = require('path');

const FIXTURES_PATH = path.join(__dirname, 'PHASE_4_TIMELINE_FIXTURES.json');

function timelineEntriesFromResponse(tl) {
  return tl?.data?.data?.timelineEntries || tl?.data?.timelineEntries || [];
}

function loadFixtures() {
  if (!fs.existsSync(FIXTURES_PATH)) return null;
  return JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
}

function countLifecycle(entries, type) {
  return entries.filter((e) => e.lifecycleEventType === type).length;
}

function countByStage(entries, stageKey) {
  return entries.filter((e) => e.stageKey === stageKey).length;
}

function assertMonotonicOrder(entries) {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].globalOrder <= entries[i - 1].globalOrder) return false;
  }
  return true;
}

/** Normalized shape for exact-order comparison (timestamps/actors as presence flags). */
function normalizeTimelineEntry(entry) {
  return {
    entryType: entry.entryType,
    lifecycleEventType: entry.lifecycleEventType ?? null,
    stageKey: entry.stageKey ?? null,
    displayTitleKey: entry.displayTitleKey ?? null,
    status: entry.status ?? null,
  };
}

function normalizeTimeline(entries) {
  return (entries || []).map(normalizeTimelineEntry);
}

function assertActorPresent(entry) {
  if (entry.entryType === 'APPROVAL_STEP_FUTURE') return true;
  if (entry.entryType === 'MILESTONE_CURRENT' || entry.entryType === 'APPROVAL_STEP_CURRENT') return true;
  if (entry.status === 'PENDING') return true;
  const name = entry.actor?.name;
  return typeof name === 'string' && name.trim().length > 0 && name !== 'undefined';
}

function assertTimestampPresent(entry) {
  if (entry.entryType === 'APPROVAL_STEP_FUTURE') return true;
  if (entry.entryType === 'APPROVAL_STEP_CURRENT' || entry.entryType === 'MILESTONE_CURRENT') {
    return entry.status === 'PENDING' || entry.status === 'IN_PROGRESS' || !!entry.actedAt;
  }
  return !!entry.actedAt;
}

function assertNoSemanticContradictions(entries, moduleKey = '') {
  const issues = [];
  const mod = String(moduleKey || '').toUpperCase();

  if (countLifecycle(entries, 'SUBMIT_FOR_APPROVAL') > 1) {
    issues.push('duplicate SUBMIT_FOR_APPROVAL lifecycle events');
  }

  for (const e of entries) {
    if (e.displayTitleKey?.includes('SEND_BACK') && e.entryType !== 'LIFECYCLE_EVENT') {
      issues.push(`raw SEND_BACK in displayTitleKey: ${e.displayTitleKey}`);
    }
    if (e.lifecycleEventType === 'SEND_BACK' && e.displayTitleKey?.includes('RETURN')) {
      issues.push('Sent Back displayed as Returned');
    }
    if (e.lifecycleEventType === 'RESUBMIT' && e.displayTitleKey?.includes('SUBMIT_FOR_APPROVAL')) {
      issues.push('Resubmitted collapsed into Submitted displayTitleKey');
    }
    if (e.entryType === 'POSTING' && e.displayTitleKey === 'TIMELINE.STATUS.COMPLETED') {
      issues.push('Posted displayed only as Completed');
    }
    if (!assertActorPresent(e)) {
      issues.push(`missing actor on ${e.entryType}/${e.stageKey}`);
    }
    if (!assertTimestampPresent(e)) {
      issues.push(`missing timestamp on ${e.entryType}/${e.stageKey}`);
    }
  }

  const countSubmitted = entries.filter(
    (e) => e.stageKey === 'COUNT_SUBMITTED' && e.displayTitleKey === 'TIMELINE.STAGE.COUNT_SUBMITTED_COMPLETED',
  );
  const submitLifecycle = entries.filter((e) => e.lifecycleEventType === 'SUBMIT_FOR_APPROVAL');
  if (mod === 'INVENTORY_COUNT' && submitLifecycle.length > 1) {
    issues.push('duplicate Submitted lifecycle on Inventory Count');
  }

  return issues;
}

function assertExactNormalizedOrder(actualEntries, expectedNormalized) {
  const actual = normalizeTimeline(actualEntries);
  if (actual.length !== expectedNormalized.length) {
    return {
      pass: false,
      reason: 'entry_count_mismatch',
      expectedCount: expectedNormalized.length,
      actualCount: actual.length,
      actual,
      expected: expectedNormalized,
    };
  }
  for (let i = 0; i < expectedNormalized.length; i++) {
    const exp = expectedNormalized[i];
    const got = actual[i];
    for (const key of Object.keys(exp)) {
      if (got[key] !== exp[key]) {
        return {
          pass: false,
          reason: 'order_or_shape_mismatch',
          index: i,
          field: key,
          expected: exp[key],
          actual: got[key],
          actualSlice: actual.slice(Math.max(0, i - 1), i + 2),
        };
      }
    }
  }
  return { pass: true };
}

function assertModuleTimeline(moduleKey, entries, expectations = {}) {
  const issues = [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return { pass: false, issues: ['empty_timeline_array'] };
  }
  if (!assertMonotonicOrder(entries)) {
    issues.push('globalOrder not monotonic');
  }
  issues.push(...assertNoSemanticContradictions(entries, moduleKey));

  if (expectations.minEntries && entries.length < expectations.minEntries) {
    issues.push(`entry count ${entries.length} < min ${expectations.minEntries}`);
  }
  if (expectations.lifecycleCounts) {
    for (const [type, count] of Object.entries(expectations.lifecycleCounts)) {
      const got = countLifecycle(entries, type);
      if (got !== count) issues.push(`${type} count ${got} !== ${count}`);
    }
  }
  if (expectations.stageCounts) {
    for (const [stage, count] of Object.entries(expectations.stageCounts)) {
      const got = countByStage(entries, stage);
      if (got !== count) issues.push(`${stage} count ${got} !== ${count}`);
    }
  }
  if (expectations.mustIncludeStageKeys) {
    for (const sk of expectations.mustIncludeStageKeys) {
      if (!entries.some((e) => e.stageKey === sk)) issues.push(`missing stageKey ${sk}`);
    }
  }
  if (expectations.mustExcludeLifecycle) {
    for (const lc of expectations.mustExcludeLifecycle) {
      if (countLifecycle(entries, lc) > 0) issues.push(`forbidden lifecycle ${lc} present`);
    }
  }
  if (expectations.normalizedOrder) {
    const orderCheck = assertExactNormalizedOrder(entries, expectations.normalizedOrder);
    if (!orderCheck.pass) {
      issues.push(`normalized_order: ${orderCheck.reason}`);
      return { pass: false, issues, orderCheck };
    }
  }
  if (expectations.finalEvent) {
    const last = entries[entries.length - 1];
    const fe = expectations.finalEvent;
    for (const key of Object.keys(fe)) {
      if ((last[key] ?? null) !== fe[key]) {
        issues.push(`final event ${key}: expected ${fe[key]}, got ${last[key]}`);
      }
    }
  }

  return { pass: issues.length === 0, issues };
}

function findSendBackEntry(entries) {
  return entries.find((e) => e.lifecycleEventType === 'SEND_BACK');
}

function findResubmitEntry(entries) {
  return entries.find((e) => e.lifecycleEventType === 'RESUBMIT');
}

module.exports = {
  FIXTURES_PATH,
  loadFixtures,
  timelineEntriesFromResponse,
  countLifecycle,
  countByStage,
  assertMonotonicOrder,
  normalizeTimelineEntry,
  normalizeTimeline,
  assertNoSemanticContradictions,
  assertExactNormalizedOrder,
  assertModuleTimeline,
  findSendBackEntry,
  findResubmitEntry,
};
