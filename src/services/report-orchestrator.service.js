'use strict';

const { resolveFamily, getGroupingSpec, supportsGrouping } = require('./report-family-registry');
const { buildGroupedReport } = require('./report-grouping.engine');

/**
 * Enriches a Phase 1 analytics payload with Phase 2 grouping metadata.
 * Non-breaking: clients that ignore `grouping` / `tree` continue to use `rows`.
 *
 * @param {object} payload - runAnalytics result
 * @param {string} cardId
 */
function enrichWithGrouping(payload, cardId) {
    const family = resolveFamily(cardId);
    const spec = getGroupingSpec(cardId);

    if (!payload?.rows?.length || !spec) {
        return {
            ...payload,
            family: family.familyId,
            variant: cardId,
            groupingEnabled: false,
        };
    }

    const grouped = buildGroupedReport(payload.rows, spec, family.familyId);

    return {
        ...payload,
        family: family.familyId,
        variant: cardId,
        groupingEnabled: true,
        dedicatedView: family.dedicatedView === true,
        shell: family.shell || 'analytics',
        tree: grouped.tree,
        flatRows: grouped.flatRows,
        grouping: {
            grandTotals: grouped.grandTotals,
            levels: spec.levels.map((l) => l.levelType),
        },
    };
}

module.exports = {
    enrichWithGrouping,
    supportsGrouping,
    resolveFamily,
};
