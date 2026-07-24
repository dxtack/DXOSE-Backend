'use strict';

const { stampEvidenceFooters } = require('./report-pdf-layout');
const { resolveEvidenceGoldenReportType } = require('./report-golden-rollout.registry');

/**
 * Golden identity adapter for portrait evidence / controlled packs (footer traceability only).
 * Does not replace pack body layout — analytics golden shell remains landscape grouped reports.
 */

function resolveEvidenceGoldenShellRev(packType) {
    if (packType === 'breakage') {
        return 'audit-v2.1-golden-literal-locked';
    }
    if (packType === 'lost' || packType === 'transfer' || packType === 'gate_pass' || packType === 'inventory_count') {
        return `golden-v2-closed-${packType}`;
    }
    const reportType = resolveEvidenceGoldenReportType(packType);
    if (!reportType) return `golden-v1-evidence-${packType}`;
    return `golden-v1-evidence-${reportType}`;
}

function stampGoldenEvidenceFooters(doc, layout, meta = {}, packType = 'breakage') {
    stampEvidenceFooters(doc, layout, {
        ...meta,
        goldenShellRev: meta.goldenShellRev || resolveEvidenceGoldenShellRev(packType),
    });
}

module.exports = {
    resolveEvidenceGoldenShellRev,
    stampGoldenEvidenceFooters,
};
