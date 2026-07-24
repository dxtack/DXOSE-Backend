'use strict';

/**
 * Duration between consecutive timeline entries with actedAt (Ch.2.8).
 * @param {import('./timelineEntry.types').TimelineEntry[]} entries — must be globalOrder sorted
 * @returns {import('./timelineEntry.types').TimelineEntry[]}
 */
function enrichTimelineEntriesWithDuration(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return [];

    let prevActedAtMs = null;
    return entries.map((entry) => {
        const actedAtMs = entry?.actedAt ? new Date(entry.actedAt).getTime() : null;
        let durationMs = null;
        if (
            prevActedAtMs != null &&
            actedAtMs != null &&
            !Number.isNaN(actedAtMs) &&
            actedAtMs >= prevActedAtMs
        ) {
            durationMs = actedAtMs - prevActedAtMs;
        }
        if (actedAtMs != null && !Number.isNaN(actedAtMs)) {
            prevActedAtMs = actedAtMs;
        }
        return durationMs != null ? { ...entry, durationMs } : { ...entry };
    });
}

module.exports = {
    enrichTimelineEntriesWithDuration,
};
