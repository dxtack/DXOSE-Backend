#!/usr/bin/env node
/**
 * Builds the single implementation register:
 *   OSE-backend/docs/governance/CONSTITUTION_TRACEABILITY_MATRIX.md
 * Inputs: requirements.json, evidence.json (evidence only — no assumptions for unlisted rows)
 */
import fs from 'fs';
import path from 'path';

const ROOT = import.meta.dirname; // OSE-backend/docs/governance
const OUT = path.join(ROOT, 'CONSTITUTION_TRACEABILITY_MATRIX.md');
const requirements = JSON.parse(fs.readFileSync(path.join(ROOT, 'requirements.json'), 'utf8'));
const evidenceMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence.json'), 'utf8'));

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Plain-language obligation from requirement text — not an implementation claim */
function whatItMeans(requirement) {
  return requirement
    .replace(/\bshall not\b/gi, 'must not')
    .replace(/\bshall\b/gi, 'must')
    .replace(/\bmust not\b/gi, 'must not');
}

function rowFromEvidence(req, e) {
  if (e.status === 'Needs Evidence' || !e.evidence?.trim()) {
    return rowDefault(req);
  }

  const gap = (e.gap ?? '').trim();
  const isComplete = gap === '' || gap === 'None' || gap === 'Complete';
  let implemented;
  if (e.status === 'Fully Compliant' && isComplete) implemented = 'Yes';
  else if (e.status === 'Fully Compliant' && !isComplete) implemented = 'Partial';
  else if (e.status === 'Partially Compliant') implemented = 'Partial';
  else if (e.status === 'Blocked (BDR)') implemented = 'No';
  else if (e.status === 'Deferred') implemented = 'N/A (Deferred)';
  else return rowDefault(req);

  const remaining =
    implemented === 'N/A (Deferred)'
      ? 'Complete'
      : isComplete
        ? 'Complete'
        : gap;

  const pct = implemented === 'Yes' && remaining === 'Complete' ? '100%' : '0%';
  const where = e.applied?.trim() || 'Not Verified';
  const evidence = e.evidence.trim();
  const bdr = e.bdr && e.bdr !== 'None' ? e.bdr : 'None';

  return {
    implemented,
    where,
    remaining,
    pct,
    evidence,
    bdr,
    scope: e.scope?.trim() || req.scope,
  };
}

function rowDefault(req) {
  return {
    implemented: 'Not Verified',
    where: 'Not Verified',
    remaining: 'Not Verified',
    pct: '0%',
    evidence: 'Not Verified',
    bdr: 'None',
    scope: req.scope,
  };
}

const lines = requirements.map((req) => {
  const e = evidenceMap[req.reqId];
  const r = e ? rowFromEvidence(req, e) : rowDefault(req);
  return `| ${req.chapter} | ${req.section} | ${esc(req.requirement)} | ${esc(whatItMeans(req.requirement))} | ${esc(r.scope)} | ${r.implemented} | ${esc(r.where)} | ${esc(r.remaining)} | ${r.pct} | ${esc(r.evidence)} | ${esc(r.bdr)} |`;
});

const body = `# Constitution Implementation Register

**Constitution (requirements):** \`docs/governance/scripts/constitution-base.md\` (v2.0 Final)

| Chapter | Clause | Constitution Requirement | What it means | Scope | Implemented? | Where implemented (Modules / Screens / APIs / Shared Components / Workflows) | Remaining Work | % Complete | Evidence | BDR / Constitution Change |
|--------:|--------|--------------------------|---------------|-------|-------------|-------------------------------------------------------------------------------|----------------|----------:|----------|---------------------------|
${lines.join('\n')}
`;

fs.writeFileSync(OUT, body);
console.log('Wrote', OUT, 'rows:', requirements.length);
