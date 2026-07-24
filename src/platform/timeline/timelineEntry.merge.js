'use strict';

const { validateTimelineEntries } = require('./timelineEntry.validation');
const { assignGlobalOrder } = require('./timelineEntry.sort');
const { enrichTimelineEntriesWithDuration } = require('./timelineEntry.duration');

/**
 * Stable dedupe key for timelineEntries only (never mutates legacy arrays).
 * @param {import('./timelineEntry.types').TimelineEntry} entry
 */
function timelineEntryDedupeKey(entry) {
    const ref = entry.sourceRef;
    if (ref?.approvalStepId) {
        return `step:${ref.approvalStepId}:${entry.entryType}:${entry.lifecycleEventType ?? ''}`;
    }
    if (ref?.auditLogId) {
        return `audit:${ref.auditLogId}:${entry.lifecycleEventType ?? entry.entryType}`;
    }
    const actorId = entry.actor?.id ?? entry.actor?.name ?? '';
    return [
        entry.cycleNumber,
        entry.entryType,
        entry.stageKey,
        entry.status,
        entry.lifecycleEventType ?? '',
        entry.actedAt ?? '',
        entry.stepNumber ?? '',
        actorId,
        entry.reason ?? '',
    ].join('|');
}

/**
 * @param {import('./timelineEntry.types').TimelineEntry[]} entries
 * @returns {import('./timelineEntry.types').TimelineEntry[]}
 */
function dedupeTimelineEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const seen = new Set();
    const out = [];
    for (const entry of entries) {
        const key = timelineEntryDedupeKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...entry });
    }
    return out;
}

/**
 * Merge raw entry lists, dedupe, validate, sort, enrich duration.
 * @param {import('./timelineEntry.types').TimelineEntry[][]} groups
 * @returns {import('./timelineEntry.types').TimelineEntry[]}
 */
function buildTimelineEntries(groups) {
    const flat = (groups ?? []).flat().filter(Boolean).map((e) => ({ ...e }));
    const deduped = dedupeTimelineEntries(flat);
    const errors = validateTimelineEntries(deduped);
    if (errors.length) {
        throw Object.assign(new Error(`Invalid timeline entries: ${errors.join('; ')}`), { details: errors });
    }
    const ordered = assignGlobalOrder(deduped);
    return enrichTimelineEntriesWithDuration(ordered);
}

module.exports = {
    timelineEntryDedupeKey,
    dedupeTimelineEntries,
    buildTimelineEntries,
};
