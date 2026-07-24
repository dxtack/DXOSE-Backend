'use strict';

const { CURRENT_ENTRY_TYPES, FUTURE_ENTRY_TYPES } = require('./timelineEntry.types');

/**
 * Constitutional Workflow Timeline order (platform SSOT — Get Pass is the reference).
 *
 * HISTORY (tier 0): chronological by actedAt —
 *   SUBMIT → APPROVAL_STEP_COMPLETED (step order) → SEND_BACK
 *   → RESUBMIT → APPROVAL_STEP_COMPLETED → …
 * CURRENT (tier 1): active-cycle current step / creator pending
 * FUTURE (tier 2): remaining pending chain by stepNumber
 *
 * Tie-break within equal timestamps: withinCycleSequenceWeight then stepNumber.
 * Module builders emit raw entries; this assigner is the only ordering authority.
 * Frontend must render by globalOrder (defensive sort only).
 *
 * @param {import('./timelineEntry.types').TimelineEntry} entry
 * @returns {number|null}
 */
function actedAtMs(entry) {
    if (!entry?.actedAt) return null;
    const ms = new Date(entry.actedAt).getTime();
    return Number.isNaN(ms) ? null : ms;
}

/**
 * Active cycle = highest cycle with a current step, else highest cycle number present.
 * @param {import('./timelineEntry.types').TimelineEntry[]} entries
 * @returns {number}
 */
function resolveActiveCycleNumber(entries) {
    let active = 0;
    for (const e of entries) {
        if (CURRENT_ENTRY_TYPES.has(e.entryType)) {
            active = Math.max(active, e.cycleNumber);
        }
    }
    if (active > 0) return active;
    let max = 1;
    for (const e of entries) {
        max = Math.max(max, e.cycleNumber);
    }
    return max;
}

/**
 * Sort tier for globalOrder:
 * 0 = historical completed / closed-cycle lifecycle
 * 1 = current step(s) of active cycle
 * 2 = future step(s) of active cycle
 * @param {import('./timelineEntry.types').TimelineEntry} entry
 * @param {number} activeCycle
 */
function globalSortTier(entry, activeCycle) {
    if (entry.cycleNumber === activeCycle && CURRENT_ENTRY_TYPES.has(entry.entryType)) {
        return 1;
    }
    if (entry.cycleNumber === activeCycle && FUTURE_ENTRY_TYPES.has(entry.entryType)) {
        return 2;
    }
    // Pending Posted must sit after remaining approval steps (not in history before them).
    if (
        entry.cycleNumber === activeCycle &&
        entry.entryType === 'POSTING' &&
        String(entry.status || '').toUpperCase() === 'PENDING'
    ) {
        return 2;
    }
    return 0;
}

/**
 * Within-cycle sequence weight before global merge.
 * @param {import('./timelineEntry.types').TimelineEntry} entry
 */
function withinCycleSequenceWeight(entry) {
    switch (entry.entryType) {
        case 'APPROVAL_STEP_COMPLETED':
        case 'MILESTONE_COMPLETED':
        case 'POSTING':
            return 10;
        case 'LIFECYCLE_EVENT':
            // Submit opens the cycle; approvals follow; send-back/reject close a segment.
            if (entry.lifecycleEventType === 'SUBMIT_FOR_APPROVAL') {
                return 5;
            }
            if (entry.lifecycleEventType === 'RESUBMIT') {
                return 8;
            }
            if (entry.lifecycleEventType === 'SEND_BACK' || entry.lifecycleEventType === 'REJECT' || entry.lifecycleEventType === 'CANCEL' || entry.lifecycleEventType === 'RECOUNT' || entry.lifecycleEventType === 'VOID') {
                return 20;
            }
            return 25;
        case 'SYSTEM_EVENT':
            return 15;
        case 'APPROVAL_STEP_CURRENT':
        case 'MILESTONE_CURRENT':
            return 40;
        case 'APPROVAL_STEP_FUTURE':
            return 50;
        default:
            return 99;
    }
}

/**
 * Assign deterministic globalOrder per unified timeline rules.
 * @param {import('./timelineEntry.types').TimelineEntry[]} entries
 * @returns {import('./timelineEntry.types').TimelineEntry[]}
 */
function assignGlobalOrder(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return [];

    const activeCycle = resolveActiveCycleNumber(entries);

    const indexed = entries.map((entry, sourceIndex) => ({
        entry: { ...entry },
        sourceIndex,
        tier: globalSortTier(entry, activeCycle),
        actedMs: actedAtMs(entry),
        withinWeight: withinCycleSequenceWeight(entry),
        stepNumber: entry.stepNumber ?? 0,
    }));

    indexed.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;

        if (a.tier === 0) {
            const aMs = a.actedMs ?? Number.MAX_SAFE_INTEGER;
            const bMs = b.actedMs ?? Number.MAX_SAFE_INTEGER;
            if (aMs !== bMs) return aMs - bMs;
            if (a.entry.cycleNumber !== b.entry.cycleNumber) return a.entry.cycleNumber - b.entry.cycleNumber;
            if (a.withinWeight !== b.withinWeight) return a.withinWeight - b.withinWeight;
            if (a.stepNumber !== b.stepNumber) return a.stepNumber - b.stepNumber;
            return a.sourceIndex - b.sourceIndex;
        }

        if (a.entry.cycleNumber !== b.entry.cycleNumber) return a.entry.cycleNumber - b.entry.cycleNumber;
        if (a.stepNumber !== b.stepNumber) return a.stepNumber - b.stepNumber;
        if (a.withinWeight !== b.withinWeight) return a.withinWeight - b.withinWeight;
        return a.sourceIndex - b.sourceIndex;
    });

    return indexed.map((row, idx) => ({
        ...row.entry,
        globalOrder: idx + 1,
    }));
}

module.exports = {
    actedAtMs,
    resolveActiveCycleNumber,
    assignGlobalOrder,
    globalSortTier,
    withinCycleSequenceWeight,
};
