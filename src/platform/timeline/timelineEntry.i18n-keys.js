'use strict';

/**
 * Resolve i18n displayTitleKey from canonical stage + entry context.
 * Backend returns keys only — FE resolves translated text.
 *
 * @param {Object} p
 * @param {string} p.stageKey — e.g. COST_CONTROL, FINANCE, RECEIVED_VALIDATED
 * @param {string} p.entryType
 * @param {string} p.status
 * @param {string|null} [p.lifecycleEventType]
 * @returns {string}
 */
function resolveDisplayTitleKey({ stageKey, entryType, status, lifecycleEventType = null }) {
    const stage = String(stageKey || '').trim().toUpperCase();
    if (entryType === 'LIFECYCLE_EVENT' && lifecycleEventType) {
        return `TIMELINE.LIFECYCLE.${String(lifecycleEventType).toUpperCase()}`;
    }
    if (entryType === 'SYSTEM_EVENT') {
        return `TIMELINE.SYSTEM.${stage || 'EVENT'}`;
    }
    if (entryType === 'POSTING') {
        if (String(status || '').toUpperCase() === 'PENDING') {
            return 'TIMELINE.STAGE.POSTED_APPROVAL';
        }
        return 'TIMELINE.STAGE.POSTED_COMPLETED';
    }

    const isCompleted =
        status === 'COMPLETED' ||
        status === 'APPROVED' ||
        status === 'POSTED' ||
        entryType === 'APPROVAL_STEP_COMPLETED' ||
        entryType === 'MILESTONE_COMPLETED';

    const suffix = isCompleted ? 'COMPLETED' : 'APPROVAL';
    return `TIMELINE.STAGE.${stage}_${suffix}`;
}

module.exports = {
    resolveDisplayTitleKey,
};
