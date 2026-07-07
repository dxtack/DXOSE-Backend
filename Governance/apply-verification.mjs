#!/usr/bin/env node
/**
 * Merges evidence verification batches into evidence.json and rebuilds the register.
 * Usage: node Governance/apply-verification.mjs
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const REQ = path.join(ROOT, 'Governance/requirements.json');
const EVIDENCE = path.join(ROOT, 'Governance/evidence.json');
const TRANSCRIPT_DIR =
  'C:\\Users\\amrsa\\.cursor\\projects\\c-DX-OS-E\\agent-transcripts\\1bcc7efd-a7ee-412a-89e1-e6ff1edba1f9\\subagents';

const SCOPE_MAP = {
  'Platform-wide': 'Platform',
  'Document-specific': 'Operational',
  Financial: 'Financial',
  Governance: 'Governance',
  UX: 'UX',
  Security: 'Governance',
  Accessibility: 'UX',
  Inventory: 'Operational',
};

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

const SUBAGENT_FILES = [
  '35905c48-09ff-475b-922b-2cc2dd163a6f.jsonl', // ch 2-5
  '8bf83774-9296-4154-8565-495e2db3f210.jsonl', // ch 6-11
  '98416ef2-90b5-4f6d-9023-4e3d14dd5f71.jsonl', // ch 12-18
  '619d19ea-207e-4a49-96bf-4b29daa8557d.jsonl', // ch 19-29
];

function extractJsonArrayFromTranscript(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.includes('requirementId')) continue;
    try {
      const row = JSON.parse(trimmed);
      const parts = row?.message?.content ?? [];
      let text = '';
      for (const part of parts) {
        if (part.type === 'text' && part.text && !part.text.startsWith('[REDACTED]')) {
          text += part.text;
        }
      }
      if (!text.includes('requirementId')) {
        // fallback: any text block containing json fence
        for (const part of parts) {
          if (part.type === 'text' && part.text?.includes('```json')) {
            text = part.text;
            break;
          }
        }
      }
      if (!text.includes('requirementId')) continue;

      const fence = text.match(/```json\s*([\s\S]*?)```/);
      const payload = fence ? fence[1] : text;
      const start = payload.indexOf('[');
      const end = payload.lastIndexOf(']') + 1;
      if (start < 0 || end <= start) continue;
      return JSON.parse(payload.slice(start, end));
    } catch (e) {
      /* try next line */
    }
  }
  throw new Error(`No verification JSON in ${filePath}`);
}

function normalizeScope(scope) {
  const mapped = SCOPE_MAP[scope] ?? scope;
  if (!ALLOWED_SCOPES.has(mapped)) {
    throw new Error(`Invalid scope after map: ${scope} -> ${mapped}`);
  }
  return mapped;
}

function normalizeModules(modules) {
  if (Array.isArray(modules)) return modules;
  if (typeof modules === 'string') {
    if (modules === 'Requires Mapping' || modules === 'TBD') return modules;
    return modules.split(',').map((s) => s.trim());
  }
  return 'Requires Mapping';
}

function normalizeEntry(entry) {
  let implemented = entry.implemented ?? 'Not Verified';
  let verificationStatus = entry.verificationStatus ?? 'Pending Governance';
  if (verificationStatus === 'Not Verified') verificationStatus = 'Pending Governance';
  if (!ALLOWED_IMPLEMENTED.has(implemented)) {
    throw new Error(`Invalid implemented for ${entry.requirementId}: ${implemented}`);
  }
  if (!ALLOWED_VERIFICATION.has(verificationStatus)) {
    throw new Error(
      `Invalid verificationStatus for ${entry.requirementId}: ${verificationStatus}`,
    );
  }

  const where = entry.whereImplemented?.trim();
  const whereImplemented =
    !where || where === 'Not Verified' ? 'None' : where;

  const remainingWork = entry.remainingWork ?? 'Not Verified';
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : [];

  return {
    implemented,
    primaryScope: normalizeScope(entry.primaryScope),
    affectedModules: normalizeModules(entry.affectedModules),
    whereImplemented,
    remainingWork,
    verificationStatus,
    bdr: entry.bdr && entry.bdr !== 'None' ? entry.bdr : 'None',
    evidence,
  };
}

function chapter1Verification() {
  const artifacts = {
    'C01-1.2-003': 'docs/governance/scripts/constitution-base.md',
    'C01-1.2-004': 'OSE-Frontend/docs/governance/DX_OSE_UX_CONSTITUTION_v1.md',
    'C01-1.2-005': 'docs/governance/EXCEPTION_REGISTER.md',
    'C01-1.2-006': 'docs/governance/WORKFLOW_MATRIX.md',
    'C01-1.2-007': 'OSE-backend/src/acc-authority/catalog.constitution.js',
    'C01-1.2-008': 'docs/governance/DX_OSE_ARCHITECTURE_IMPLEMENTATION_GUIDE.md',
    'C01-1.2-009': 'docs/governance/phase2/PHASE2_IMPLEMENTATION_NOTES.md',
  };

  const entries = {};
  for (const req of JSON.parse(fs.readFileSync(REQ, 'utf8')).filter((r) => r.chapter === '1')) {
    const id = req.requirementId;
    if (id === 'C01-1.2-004') {
      entries[id] = normalizeEntry({
        requirementId: id,
        primaryScope: 'Platform',
        affectedModules: ['Platform'],
        implemented: 'Partial',
        whereImplemented: 'Governance: UX Constitution maintained in repo',
        remainingWork: 'Subordinate UX conformance not verified platform-wide',
        verificationStatus: 'Needs Code Review',
        evidence: [
          {
            layer: 'Governance',
            file: artifacts[id],
            method: 'DX OSE UX Constitution v1 document',
            verification: 'Verified',
          },
        ],
      });
      continue;
    }
    if (artifacts[id]) {
      const exists = fs.existsSync(path.join(ROOT, artifacts[id]));
      entries[id] = normalizeEntry({
        requirementId: id,
        primaryScope: 'Platform',
        affectedModules: ['Governance'],
        implemented: exists ? 'Yes' : 'No',
        whereImplemented: exists ? `Governance library: ${artifacts[id]}` : 'None',
        remainingWork: exists ? 'Complete' : `Missing artifact: ${artifacts[id]}`,
        verificationStatus: exists ? 'Verified' : 'Pending Governance',
        evidence: exists
          ? [
              {
                layer: 'Governance',
                file: artifacts[id],
                method: 'artifact present in governance library',
                verification: 'Verified',
              },
            ]
          : [],
      });
      continue;
    }
    // 1.1, 1.2 normative / technology-neutral governance rules
    entries[id] = normalizeEntry({
      requirementId: id,
      primaryScope: 'Platform',
      affectedModules: ['Governance'],
      implemented: 'Partial',
      whereImplemented: 'Governance: Constitution SSOT + implementation register',
      remainingWork:
        id.startsWith('C01-1.1')
          ? 'Technology-neutral governance enforced via docs; runtime neutrality not exhaustively verified'
          : 'Normative stack precedence not enforced by automated gate',
      verificationStatus: 'Needs Code Review',
      evidence: [
        {
          layer: 'Governance',
          file: 'docs/governance/scripts/constitution-base.md',
          method: 'Chapter 1 authority requirements',
          verification: 'Verified',
        },
        {
          layer: 'Governance',
          file: 'Governance/CONSTITUTION_TRACEABILITY_MATRIX.md',
          method: 'implementation register SSOT',
          verification: 'Verified',
        },
      ],
    });
  }
  return entries;
}

// Load batches from subagent transcripts
const batches = [];
for (const f of SUBAGENT_FILES) {
  const arr = extractJsonArrayFromTranscript(path.join(TRANSCRIPT_DIR, f));
  batches.push(...arr);
  console.log('Loaded', arr.length, 'from', f);
}

const ch1 = chapter1Verification();
const evidence = { ...ch1 };

for (const entry of batches) {
  if (!entry.requirementId) continue;
  evidence[entry.requirementId] = normalizeEntry(entry);
}

const requirements = JSON.parse(fs.readFileSync(REQ, 'utf8'));
const missing = requirements.filter((r) => !evidence[r.requirementId]);
if (missing.length) {
  console.error(
    'Missing verification for:',
    missing.map((m) => m.requirementId).join(', '),
  );
  process.exit(1);
}

fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log('Wrote evidence entries:', Object.keys(evidence).length);

const build = spawnSync('node', ['build-register.mjs'], {
  cwd: path.join(ROOT, 'Governance'),
  stdio: 'inherit',
});
process.exit(build.status ?? 1);
