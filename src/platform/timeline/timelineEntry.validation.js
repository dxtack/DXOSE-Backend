'use strict';

const {
    TIMELINE_ENTRY_TYPES,
    TIMELINE_ENTRY_STATUSES,
    TIMELINE_LIFECYCLE_EVENT_TYPES,
} = require('./timelineEntry.types');

/**
 * @param {unknown} entry
 * @returns {string[]}
 */
function validateTimelineEntry(entry) {
    const errors = [];
    if (!entry || typeof entry !== 'object') {
        return ['Entry must be an object'];
    }
    const e = /** @type {Record<string, unknown>} */ (entry);

    if (!Number.isFinite(Number(e.cycleNumber)) || Number(e.cycleNumber) < 1) {
        errors.push('cycleNumber must be a positive number');
    }
    if (!TIMELINE_ENTRY_TYPES.includes(/** @type {string} */ (e.entryType))) {
        errors.push(`entryType must be one of: ${TIMELINE_ENTRY_TYPES.join(', ')}`);
    }
    if (typeof e.stageKey !== 'string' || !e.stageKey.trim()) {
        errors.push('stageKey is required');
    }
    if (typeof e.displayTitleKey !== 'string' || !e.displayTitleKey.trim()) {
        errors.push('displayTitleKey is required');
    }
    if (!TIMELINE_ENTRY_STATUSES.includes(/** @type {string} */ (e.status))) {
        errors.push(`status must be one of: ${TIMELINE_ENTRY_STATUSES.join(', ')}`);
    }
    if (e.lifecycleEventType != null && !TIMELINE_LIFECYCLE_EVENT_TYPES.includes(/** @type {string} */ (e.lifecycleEventType))) {
        errors.push(`lifecycleEventType must be one of: ${TIMELINE_LIFECYCLE_EVENT_TYPES.join(', ')}`);
    }
    if (e.actedAt != null && typeof e.actedAt !== 'string') {
        errors.push('actedAt must be an ISO string or null');
    }
    if (e.stepNumber != null && !Number.isFinite(Number(e.stepNumber))) {
        errors.push('stepNumber must be numeric when present');
    }

    return errors;
}

/**
 * @param {unknown[]} entries
 * @returns {string[]}
 */
function validateTimelineEntries(entries) {
    if (!Array.isArray(entries)) return ['entries must be an array'];
    const all = [];
    entries.forEach((entry, idx) => {
        const rowErrors = validateTimelineEntry(entry);
        rowErrors.forEach((msg) => all.push(`[${idx}] ${msg}`));
    });
    return all;
}

module.exports = {
    validateTimelineEntry,
    validateTimelineEntries,
};
