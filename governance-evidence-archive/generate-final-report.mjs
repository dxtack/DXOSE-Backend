#!/usr/bin/env node
/**
 * Generates final Constitution remediation governance package.
 * Usage: node Governance/generate-final-report.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance-evidence-archive/evidence.json'), 'utf8'));
const requirements = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance-evidence-archive/requirements.json'), 'utf8'));

const counts = { Yes: 0, Partial: 0, No: 0, 'Not Verified': 0 };
for (const r of requirements) {
  const s = evidence[r.requirementId]?.implemented ?? 'Not Verified';
  counts[s] = (counts[s] || 0) + 1;
}

const outDir = path.join(ROOT, 'governance-evidence-archive/final-package');
fs.mkdirSync(outDir, { recursive: true });

const lines = [];
lines.push('# Constitution Remediation — Final Completion Report');
lines.push('');
lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
lines.push('');
lines.push('## Compliance Summary');
lines.push('');
lines.push(`| Metric | Count |`);
lines.push(`|--------|------:|`);
lines.push(`| Total Requirement IDs | ${requirements.length} |`);
lines.push(`| Yes | ${counts.Yes} |`);
lines.push(`| Partial | ${counts.Partial} |`);
lines.push(`| No | ${counts.No} |`);
lines.push(`| Not Verified | ${counts['Not Verified'] || 0} |`);
lines.push('');
lines.push('Target: 393 Yes · 0 Partial · 0 No');
lines.push('');

if (counts.Partial + counts.No > 0) {
  lines.push('## Open Requirement IDs');
  lines.push('');
  for (const r of requirements) {
    const e = evidence[r.requirementId];
    if (e?.implemented === 'Yes') continue;
    lines.push(`### ${r.requirementId}`);
    lines.push('');
    lines.push(`- **Status:** ${e?.implemented ?? 'Not Verified'}`);
    lines.push(`- **Requirement:** ${r.requirement}`);
    lines.push(`- **Remaining Work:** ${e?.remainingWork ?? 'Not Verified'}`);
    lines.push('');
  }
}

lines.push('## Per-Requirement Register');
lines.push('');

for (const r of requirements) {
  const e = evidence[r.requirementId] ?? {};
  lines.push(`### ${r.requirementId}`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Constitution Requirement | ${r.requirement.replace(/\|/g, '\\|')} |`);
  lines.push(`| Final Status | ${e.implemented ?? 'Not Verified'} |`);
  lines.push(`| Remaining Work | ${(e.remainingWork ?? '—').replace(/\|/g, '\\|')} |`);
  lines.push(`| Verification | ${e.verificationStatus ?? '—'} |`);
  if (e.remediationBatch) lines.push(`| Remediation Batch | ${e.remediationBatch} |`);
  lines.push('');
  if (e.affectedModules?.length) {
    lines.push(`**Affected Modules:** ${e.affectedModules.join(', ')}`);
    lines.push('');
  }
  if (e.evidence?.length) {
    lines.push('**Verification Evidence:**');
    lines.push('');
    for (const ev of e.evidence) {
      lines.push(`- ${ev.layer}: \`${ev.file}\` — ${ev.method} (${ev.verification})`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
}

fs.writeFileSync(path.join(outDir, 'FINAL_COMPLETION_REPORT.md'), lines.join('\n'));

const summary = {
  generatedAt: new Date().toISOString(),
  total: requirements.length,
  counts,
  complete: counts.Partial === 0 && counts.No === 0 && counts.Yes === requirements.length,
  openIds: requirements
    .filter((r) => evidence[r.requirementId]?.implemented !== 'Yes')
    .map((r) => r.requirementId),
};

fs.writeFileSync(path.join(outDir, 'compliance-summary.json'), JSON.stringify(summary, null, 2));
console.log('Wrote', path.join(outDir, 'FINAL_COMPLETION_REPORT.md'));
console.log('Summary:', counts);
