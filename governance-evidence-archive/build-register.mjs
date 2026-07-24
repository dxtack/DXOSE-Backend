#!/usr/bin/env node
/**
 * Builds Governance/CONSTITUTION_TRACEABILITY_MATRIX.md
 * Inputs: requirements.json (with permanent requirementId), evidence.json
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'governance-evidence-archive/CONSTITUTION_TRACEABILITY_MATRIX.md');
const requirements = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance-evidence-archive/requirements.json'), 'utf8'));
const evidenceMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'governance-evidence-archive/evidence.json'), 'utf8'));

const ALLOWED_SCOPES = new Set([
  'Platform',
  'Operational',
  'Financial',
  'Governance',
  'UX',
  'Shared Components',
]);

const ALLOWED_IMPLEMENTED = new Set(['Yes', 'Partial', 'No', 'Not Verified']);

const ALLOWED_VERIFICATION = new Set([
  'Verified',
  'Needs Code Review',
  'Needs Audit',
  'Pending Governance',
]);

const SCOPE_MAP = {
  'Platform-wide': 'Platform',
  'Document-specific': 'Operational',
  Financial: 'Financial',
  Governance: 'Governance',
  UX: 'UX',
  Inventory: 'Operational',
  Accessibility: 'UX',
  Security: 'Governance',
};

function assertEnum(value, allowed, label, requirementId) {
  if (!allowed.has(value)) {
    throw new Error(`Invalid ${label} "${value}" for ${requirementId}`);
  }
}

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function whatItMeans(requirement) {
  return requirement
    .replace(/\bshall not\b/gi, 'must not')
    .replace(/\bshall\b/gi, 'must')
    .replace(/\bmust not\b/gi, 'must not');
}

function normalizeScope(req, evidence) {
  let scope;
  if (evidence?.primaryScope) {
    scope = evidence.primaryScope;
  } else {
    scope = SCOPE_MAP[req.scope] ?? 'Operational';
  }
  assertEnum(scope, ALLOWED_SCOPES, 'Scope', req.requirementId);
  return scope;
}

function defaultAffectedModules(scope) {
  if (scope === 'Platform') return 'Platform';
  if (scope === 'Governance') return 'Governance';
  return 'Requires Mapping';
}

function formatEvidence(items) {
  if (!items?.length) return 'Not Verified';
  return items
    .map(
      (e) =>
        `Layer: ${e.layer}; File: ${e.file}; Method: ${e.method}; Verification: ${e.verification}`,
    )
    .join(' \\| ');
}

function remediationKind(req, e) {
  if (e?.implemented === 'Yes' && e?.remainingWork === 'Complete') return '—';
  if (e?.remediationKind) return e.remediationKind;
  if (req.chapter === '24' && (e?.verificationStatus === 'Pending Governance' || String(e?.remainingWork ?? '').includes('ch24.6'))) {
    return 'governanceQA';
  }
  if (['Partial', 'No'].includes(e?.implemented)) return 'code';
  return '—';
}

function pctComplete(implemented, remainingWork) {
  if (implemented === 'Yes' && remainingWork === 'Complete') return '100%';
  if (implemented === 'Partial') return 'Partial';
  if (implemented === 'No') return '0%';
  return '—';
}

function formatBlocker(e) {
  const b = e?.blocker;
  if (!b) return '—';
  return String(b).replace(/^Blocker:\s*/i, '');
}

function rowFromEvidence(req, e) {
  const scope = normalizeScope(req, e);
  const implemented = e.implemented ?? 'Not Verified';
  const verificationStatus = e.verificationStatus ?? 'Pending Governance';
  assertEnum(implemented, ALLOWED_IMPLEMENTED, 'Implemented?', req.requirementId);
  assertEnum(verificationStatus, ALLOWED_VERIFICATION, 'Verification Status', req.requirementId);

  const remainingWork = e.remainingWork ?? 'Not Verified';
  const affectedModules = Array.isArray(e.affectedModules)
    ? e.affectedModules.join(', ')
    : defaultAffectedModules(scope);
  const where = e.whereImplemented?.trim() ? e.whereImplemented.trim() : 'None';

  return {
    scope,
    affectedModules,
    implemented,
    where,
    remainingWork,
    pct: pctComplete(implemented, remainingWork),
    evidence: formatEvidence(e.evidence),
    verificationStatus,
    bdr: e.bdr && e.bdr !== 'None' ? e.bdr : 'None',
    kind: remediationKind(req, e),
    blocker: formatBlocker(e),
  };
}

function rowDefault(req) {
  const scope = normalizeScope(req, null);
  const implemented = 'Not Verified';
  const verificationStatus = 'Pending Governance';
  assertEnum(implemented, ALLOWED_IMPLEMENTED, 'Implemented?', req.requirementId);
  assertEnum(verificationStatus, ALLOWED_VERIFICATION, 'Verification Status', req.requirementId);

  return {
    scope,
    affectedModules: defaultAffectedModules(scope),
    implemented,
    where: 'None',
    remainingWork: 'Not Verified',
    pct: '—',
    evidence: 'Not Verified',
    verificationStatus,
    bdr: 'None',
    kind: '—',
    blocker: '—',
  };
}

for (const req of requirements) {
  if (!req.requirementId) {
    throw new Error(`Missing requirementId on ${req.reqId} — run Governance/assign-requirement-ids.mjs`);
  }
}

const lines = requirements.map((req) => {
  const e = evidenceMap[req.requirementId];
  const r = e ? rowFromEvidence(req, e) : rowDefault(req);
  return `| ${req.requirementId} | ${req.chapter} | ${req.section} | ${esc(req.requirement)} | ${esc(whatItMeans(req.requirement))} | ${r.scope} | ${esc(r.affectedModules)} | ${r.implemented} | ${esc(r.where)} | ${esc(r.remainingWork)} | ${r.pct} | ${esc(r.evidence)} | ${r.verificationStatus} | ${r.kind} | ${esc(r.blocker)} | ${esc(r.bdr)} |`;
});

const body = `# Constitution Implementation Register

**Constitution (requirements):** \`docs/governance/scripts/constitution-base.md\` (v2.0 Final)

**Requirement ID:** permanent reference (e.g. \`C02-2.3-001\`) — never reassign once published.

**Controlled vocabularies:** Scope, Implemented?, Verification Status, Remediation Kind (enforced at build)

**Remediation Kind:** \`code\` = engineering work; \`governanceQA\` = release/matrix sign-off (Ch24); em dash = closed or N/A

**% Complete:** 100% = Yes + Complete; Partial = partial implementation; 0% = No; em dash = Not Verified

**Last batch remediation:** \`BATCH-NO-CLOSURE\` (2026-06-25) — 16 code-backed closures (display currency, UX platform, lookup, audit, export mask, accessibility).

| Requirement ID | Chapter | Clause | Constitution Requirement | What it means | Scope | Affected Modules | Implemented? | Where implemented (Modules / Screens / APIs / Shared Components / Workflows) | Remaining Work | % Complete | Evidence | Verification Status | Remediation Kind | Blocker | BDR / Constitution Change |
|----------------|--------:|--------|--------------------------|---------------|-------|------------------|-------------|-------------------------------------------------------------------------------|----------------|----------:|----------|----------------------|-------------------|---------|---------------------------|
${lines.join('\n')}
`;

fs.writeFileSync(OUT, body);

const tally = { Yes: 0, Partial: 0, No: 0, 'Not Verified': 0 };
for (const req of requirements) {
  const impl = evidenceMap[req.requirementId]?.implemented ?? 'Not Verified';
  tally[impl] = (tally[impl] ?? 0) + 1;
}
console.log('Wrote', OUT, 'rows:', requirements.length);
console.log('Register tally:', JSON.stringify(tally));
