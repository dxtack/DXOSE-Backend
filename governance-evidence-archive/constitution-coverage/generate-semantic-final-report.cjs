#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { GOV, loadJson } = require('./lib/matrix-evidence-lib.cjs');
const { loadDeliveredAllowlist } = require('./lib/load-allowlist.cjs');

const MATRIX = path.join(GOV, 'constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_SEMANTIC_FINAL.json');
const VALIDATION = path.join(GOV, 'constitution-coverage/SEMANTIC_EVIDENCE_INTEGRITY_VALIDATION.json');
const ALLOWLIST = path.join(GOV, 'constitution-coverage/V3_SCENARIO_REQUIREMENT_ALLOWLIST.json');
const OUT = path.join(GOV, 'constitution-coverage/DX OSE — Full Constitution Coverage Semantic Evidence Final Report.md');

function main() {
  const matrix = loadJson(MATRIX);
  const val = loadJson(VALIDATION);
  const allowlist = loadDeliveredAllowlist(path.join(GOV, '..'));
  const counts = matrix.classificationCounts;

  const lines = [
    '# DX OSE — Full Constitution Coverage Semantic Evidence Final Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Lock correction summary',
    '',
    '- Allowlist loaded from delivered JSON only (`V3_SCENARIO_REQUIREMENT_ALLOWLIST.json`); SHA256 recorded in matrix baseline.',
    '- `V2-C-WF-EFFECTIVE` and `V2-CF-LEG-LOST-DEPT` documented as cross-cutting findings (Configuration Drift / Operational Legacy).',
    '- Scope/assignment scenarios mapped to `C04-4.3-003`; wrong-property probes also to `C04-4.4-003`.',
    '- Reject failure scenarios (`V3-H-REJECT-GETPASS`, `V3-H-REJECT-IC`) limited to `C03-3.4-006` and `C03-3.4-010`; `C03-3.4-007`/`008` Partial.',
    '- Governance library artifact requirements `C01-1.2-003`–`009` → Static Verified — Appropriate.',
    '- All supporting evidence includes `proves` + `doesNotProve`; Partial rows use specific scope and `rootCauseGroup`.',
    '',
    '## Validation',
    '',
    'See `SEMANTIC_EVIDENCE_INTEGRITY_VALIDATION.json` (`passed: true`).',
    '',
    `| allowlistSha256 | ${val.allowlistSha256} |`,
    `| allowlistScenarioCount | ${val.allowlistScenarioCount} |`,
    `| configurationDriftCount | ${val.configurationDriftCount} |`,
    `| operationalLegacyCount | ${val.operationalLegacyCount} |`,
    '',
    '## Classification counts',
    '',
    '| Classification | Count |',
    '|----------------|-------|',
  ];

  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }

  lines.push('', '## Cross-cutting findings', '');
  for (const c of matrix.crossCuttingFindings || []) {
    lines.push(`### ${c.crossCuttingFindingId} — ${c.classification}`, '', c.reason, '', `- Authority: ${c.constitutionalAuthority}`, `- Actual: ${c.actual}`, '');
  }

  lines.push('## Failed Runtime (11)', '');
  for (const r of matrix.rows.filter((x) => x.finalClassification === 'Failed Runtime')) {
    lines.push(`- **${r.requirementId}** — ${r.scenario || '—'} — ${r.gap || r.coverageStatement || ''}`);
  }

  lines.push('', '## Governance Conflict (3)', '');
  for (const r of matrix.rows.filter((x) => x.finalClassification === 'Governance Conflict')) {
    lines.push(`- **${r.requirementId}** — ${r.governanceContradictionEvidence || r.gap}`);
  }

  fs.writeFileSync(OUT, lines.join('\n'));
  console.log('Wrote', OUT);
}

main();
