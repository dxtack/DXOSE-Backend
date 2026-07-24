'use strict';

/**
 * Ch.2.8 — Elapsed time between consecutive timeline steps when both have actedAt.
 */
function enrichTimelineSlotsWithDuration(slots) {
    if (!Array.isArray(slots) || slots.length === 0) return slots;

    let prevActedAtMs = null;
    return slots.map((slot) => {
        const actedAtMs = slot?.actedAt ? new Date(slot.actedAt).getTime() : null;
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
        return durationMs != null ? { ...slot, durationMs } : { ...slot };
    });
}

module.exports = {
    enrichTimelineSlotsWithDuration,
};
