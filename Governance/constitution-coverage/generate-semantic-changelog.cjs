#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { GOV, loadJson } = require('./lib/matrix-evidence-lib.cjs');

const PRE_LOCK = path.join(GOV, 'constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_v2.json');
const NEW = path.join(GOV, 'constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_SEMANTIC_FINAL.json');
const OUT = path.join(GOV, 'constitution-coverage/SEMANTIC_EVIDENCE_CORRECTION_CHANGELOG.md');

function parseScenarios(row) {
  return new Set(row.scenarioIds || []);
}

function main() {
  const newRows = loadJson(NEW).rows;
  const newMatrix = loadJson(NEW);

  let oldRows = loadJson(PRE_LOCK).rows || [];

  const oldMap = Object.fromEntries(oldRows.map((r) => [r.requirementId, r]));
  const lines = [
    '# Semantic Evidence Correction Changelog',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Lock correction (latest)',
    '',
    '- Allowlist: scope scenarios → `C04-4.3-003`; removed `V2-C-WF-EFFECTIVE` from `C05-5.2-011`.',
    '- Cross-cutting: `V2-C-WF-EFFECTIVE` (Configuration Drift), `V2-CF-LEG-LOST-DEPT` (Operational Legacy).',
    '- Reject: removed `V3-H-REJECT-GETPASS`/`IC` from `C03-3.4-007`/`008`.',
    '- Artifacts: `C01-1.2-003`–`009` → Static Verified — Appropriate.',
    '- Evidence: all `supportingEvidence[]` now include `doesNotProve`.',
    '',
  ];

  let classChanges = 0;
  let scenarioRemovals = 0;
  let scenarioAdds = 0;

  for (const r of newRows) {
    const o = oldMap[r.requirementId];
    const oldClass = o?.finalClassification || '(none)';
    const newClass = r.finalClassification;
    const oldSc = o ? parseScenarios(o) : new Set();
    const newSc = parseScenarios(r);
    const removed = [...oldSc].filter((s) => !newSc.has(s));
    const added = [...newSc].filter((s) => !oldSc.has(s));
    scenarioRemovals += removed.length;
    scenarioAdds += added.length;

    const classChanged = oldClass !== newClass;
    const scChanged = removed.length || added.length;
    const evidenceChanged =
      r.primaryEvidence !== o?.primaryEvidence ||
      JSON.stringify(r.supportingEvidence) !== JSON.stringify(o?.supportingEvidence);
    const partialFields =
      r.finalClassification === 'Partial' &&
      (r.implementedPart !== o?.implementedPart || r.gap !== o?.gap || r.rootCauseGroup !== o?.rootCauseGroup);

    if (!classChanged && !scChanged && !evidenceChanged && !partialFields) continue;
    if (classChanged) classChanges++;

    lines.push(`## ${r.requirementId}`, '');
    if (classChanged) lines.push(`- **Classification:** ${oldClass} → **${newClass}**`);
    if (removed.length) lines.push(`- **Removed scenarios:** ${removed.join(', ')}`);
    if (added.length) lines.push(`- **Added scenarios:** ${added.join(', ')}`);
    if (r.primaryEvidence) lines.push(`- **Primary evidence:** \`${r.primaryEvidence}\``);
    if (r.implementedPart) lines.push(`- **Implemented part:** ${r.implementedPart}`);
    if (r.missingPart) lines.push(`- **Missing part:** ${r.missingPart}`);
    if (r.gap) lines.push(`- **Gap:** ${r.gap}`);
    if (r.evidenceScope) lines.push(`- **Evidence scope:** ${r.evidenceScope}`);
    if (r.rootCauseGroup) lines.push(`- **Root cause group:** ${r.rootCauseGroup}`);
    if (r.recommendedRemediationFront) lines.push(`- **Remediation front:** ${r.recommendedRemediationFront}`);
    lines.push('');
  }

  if (newMatrix.crossCuttingFindings?.length) {
    lines.push('## Cross-cutting findings', '');
    for (const c of newMatrix.crossCuttingFindings) {
      lines.push(`- **${c.crossCuttingFindingId}** — ${c.classification}: ${c.reason}`);
    }
    lines.push('');
  }

  lines.splice(4, 0, `**Classification changes:** ${classChanges}`, `**Scenario links removed:** ${scenarioRemovals}`, `**Scenario links added:** ${scenarioAdds}`, '');

  fs.writeFileSync(OUT, lines.join('\n'));
  console.log('Wrote', OUT, { classChanges, scenarioRemovals, scenarioAdds });
}

main();
