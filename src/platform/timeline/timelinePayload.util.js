'use strict';

const { buildTimelineEntries } = require('./timelineEntry.merge');

/**
 * Attach additive timelineEntries without mutating legacy payload fields.
 * @template T
 * @param {T & { workflowSlots?: unknown[]; auditEvents?: unknown[] }} payload
 * @param {import('./timelineEntry.types').TimelineEntry[]} [rawEntries]
 * @returns {T & { timelineEntries: import('./timelineEntry.types').TimelineEntry[] }}
 */
function attachTimelineEntries(payload, rawEntries = []) {
    const timelineEntries =
        Array.isArray(rawEntries) && rawEntries.length > 0
            ? buildTimelineEntries([rawEntries])
            : [];

    return {
        ...payload,
        timelineEntries,
    };
}

module.exports = {
    attachTimelineEntries,
};
