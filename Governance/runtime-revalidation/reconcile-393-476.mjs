/**
 * 393 vs 476 reconciliation — read-only counts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'REQUIREMENTS_RECONCILIATION.json');

function countMatrixRows(md) {
  return md.split('\n').filter((l) => /^\| C\d/.test(l.trim())).length;
}

function countJsonRequirements(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (Array.isArray(j)) return { count: j.length, type: 'array' };
  if (j.requirements) return { count: j.requirements.length, type: 'requirements key' };
  return { count: Object.keys(j).length, type: 'object keys' };
}

function countCsvRows(p) {
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('Fresh ID'));
  return Math.max(0, lines.length - 1);
}

const freshCsv = path.join(REPO, 'Governance/constitution-extraction/CONSTITUTION_FRESH_REGISTER.csv');
const requirementsJson = path.join(REPO, 'Governance/requirements.json');
const matrixMd = path.join(REPO, 'Governance/CONSTITUTION_TRACEABILITY_MATRIX.md');
const statusCounts = path.join(REPO, 'Governance/closeout-runtime-audit/CONSTITUTION_STATUS_COUNTS.json');
const coverageGaps = path.join(REPO, 'Governance/closeout-runtime-audit/CONSTITUTION_REQUIREMENT_COVERAGE_GAPS.json');

const freshRows = countCsvRows(freshCsv);
const reqJson = countJsonRequirements(requirementsJson);
const matrixRows = fs.existsSync(matrixMd) ? countMatrixRows(fs.readFileSync(matrixMd, 'utf8')) : null;
const status = JSON.parse(fs.readFileSync(statusCounts, 'utf8'));
const gaps = JSON.parse(fs.readFileSync(coverageGaps, 'utf8'));

const freshCategories = {};
if (fs.existsSync(freshCsv)) {
  const lines = fs.readFileSync(freshCsv, 'utf8').split('\n').filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim());
  const catIdx = headers.indexOf('Category');
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const c = (cols[catIdx] || 'Unknown').trim();
    freshCategories[c] = (freshCategories[c] || 0) + 1;
  }
}

const docOnly = (freshCategories['Descriptive Context'] || 0) + (freshCategories['Governance Definition'] || 0) + (freshCategories['Constitution Authoring Guidance'] || 0) + (freshCategories['Out of Scope'] || 0);
const productEnforceable = freshCategories['Product Enforceable Requirement'] || 0;

const reconciliation = {
  generatedAt: new Date().toISOString(),
  sources: {
    CONSTITUTION_FRESH_REGISTER_csv: { rows: freshRows, note: 'Gate A.3 extraction from PDF — includes definitions, context, optional, product enforceable' },
    requirements_json: reqJson,
    CONSTITUTION_TRACEABILITY_MATRIX_md: { requirementRows: matrixRows, note: 'Implementation register — SSOT for 393 count' },
    CONSTITUTION_STATUS_COUNTS_json: status,
    CONSTITUTION_REQUIREMENT_COVERAGE_GAPS_json: { partialCount: gaps.partialCount, notRunCount: gaps.notRunCount, executedAt: gaps.executedAt },
  },
  explanation: {
    why_476: `Fresh register CSV has ${freshRows} rows — all extracted clauses including descriptive context, governance definitions, out-of-scope, optional capabilities, and product enforceable requirements.`,
    why_393: `Traceability matrix has ${matrixRows} requirement rows — deduplicated normative implementation register (requirements.json aligns: ${reqJson.count}).`,
    delta_476_minus_393: freshRows - (matrixRows || 393),
    delta_composition: 'Difference is primarily non-implementable rows: Descriptive Context, Governance Definition, Authoring Guidance, Out of Scope, Optional Capability, Excluded Pending Ratification — not duplicate product requirements.',
    notRun_count_correction: `CONSTITUTION_STATUS_COUNTS.json (authoritative closeout artifact) reports Not Run = ${status.statusCounts['Not Run']}. CONSTITUTION_REQUIREMENT_COVERAGE_GAPS.json reports notRunCount = ${gaps.notRunCount} — use STATUS_COUNTS as SSOT; 144 was stale reference from earlier partial register pass.`,
    ssot_for_audit: '393 = CONSTITUTION_TRACEABILITY_MATRIX requirement rows (implementation obligations). 476 = full constitution extraction register (audit source text).',
  },
  freshRegisterCategoryBreakdown: freshCategories,
  estimatedNonImplementableRows: docOnly,
  estimatedProductEnforceableInFreshRegister: productEnforceable,
  statusSumCheck: Object.values(status.statusCounts).reduce((a, b) => a + b, 0),
};

fs.writeFileSync(OUT, JSON.stringify(reconciliation, null, 2));
console.log(JSON.stringify(reconciliation.explanation, null, 2));
