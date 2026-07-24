#!/usr/bin/env node
/**
 * Applies pre-remediation audit corrections to evidence.json and marks audit status.
 * Usage: node Governance/apply-pre-audit.mjs
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE_PATH = path.join(ROOT, 'governance-evidence-archive/evidence.json');
const REQ_PATH = path.join(ROOT, 'governance-evidence-archive/requirements.json');
const CORRECTIONS_PATH = path.join(ROOT, 'governance-evidence-archive/pre-audit-corrections.json');

const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));
const requirements = JSON.parse(fs.readFileSync(REQ_PATH, 'utf8'));
const corrections = JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf8'));

const AUDIT_DATE = '2026-06-25';
const partialNoIds = requirements
  .filter((r) => ['Partial', 'No'].includes(evidence[r.requirementId]?.implemented))
  .map((r) => r.requirementId);

for (const id of partialNoIds) {
  if (!evidence[id].preRemediationAudit) {
    evidence[id].preRemediationAudit = { passed: true, auditedAt: AUDIT_DATE };
  }
}

let applied = 0;
for (const c of corrections) {
  const id = c.requirementId || c.id;
  if (!evidence[id]) {
    console.error('Unknown requirementId:', id);
    process.exit(1);
  }
  const entry = evidence[id];
  const updates = c.updates ?? c;

  if (updates.implemented) entry.implemented = updates.implemented;
  if (updates.primaryScope) entry.primaryScope = updates.primaryScope;
  if (updates.affectedModules) entry.affectedModules = updates.affectedModules;
  if (updates.whereImplemented !== undefined) entry.whereImplemented = updates.whereImplemented;
  if (updates.remainingWork !== undefined) entry.remainingWork = updates.remainingWork;
  if (updates.verificationStatus) entry.verificationStatus = updates.verificationStatus;
  if (updates.bdr) entry.bdr = updates.bdr;

  if (updates.evidence) {
    entry.evidence = updates.evidence;
  } else if (c.evidenceAdd?.length) {
    entry.evidence = [...(entry.evidence ?? []), ...c.evidenceAdd.map((e) => ({
      ...e,
      verification: e.verification ?? 'Verified',
    }))];
  }

  entry.preRemediationAudit = {
    passed: false,
    auditedAt: AUDIT_DATE,
    failedChecks: c.failedChecks ?? [],
    reason: c.reason ?? c.notes ?? '',
  };
  applied++;
}

fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
console.log('Partial/No IDs:', partialNoIds.length);
console.log('Corrections applied:', applied);
console.log(
  'Passed without correction:',
  partialNoIds.length - applied,
);

spawnSync('node', ['build-register.mjs'], {
  cwd: path.join(ROOT, 'governance-evidence-archive'),
  stdio: 'inherit',
});
