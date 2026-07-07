#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const GOV = path.join(__dirname, '..');
const MATRIX = path.join(GOV, 'constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_v2.json');
const VALIDATION = path.join(GOV, 'constitution-coverage/EVIDENCE_INTEGRITY_VALIDATION.json');
const OUT = path.join(GOV, 'constitution-coverage/DX OSE — Full Constitution Coverage Evidence-Corrected Report.md');

function load(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const matrix = load(MATRIX);
  const val = load(VALIDATION);
  const rows = matrix.rows;
  const counts = matrix.classificationCounts;

  const defects = rows.filter((r) =>
    ['Failed Runtime', 'Governance Conflict', 'Configuration Drift', 'Operational Legacy', 'Static Dead Code'].includes(
      r.finalClassification,
    ),
  );

  const matrixTable = rows
    .map(
      (r) =>
        `| ${r.requirementId} | ${r.chapter} | ${String(r.exactRequirement).replace(/\|/g, '/').slice(0, 70)} | ${r.applicableModules} | ${r.evidenceType} | ${String(r.scenario || r.evidenceFile || '').slice(0, 45)} | ${String(r.expected).replace(/\|/g, '/').slice(0, 45)} | ${String(r.actual).replace(/\|/g, '/').slice(0, 45)} | ${r.finalClassification} | ${String(r.gap || r.coverageStatement || '').replace(/\|/g, '/').slice(0, 40)} |`,
    )
    .join('\n');

  const countTable = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');

  const md = `# DX OSE — Full Constitution Coverage Evidence-Corrected Report

Generated: ${new Date().toISOString()}  
Matrix: \`Governance/constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_v2.json\`  
Validator: \`EVIDENCE_INTEGRITY_VALIDATION.json\` — **passed=${val.passed}**

---

## Evidence integrity validation

| Check | Value |
|-------|------:|
| rowCount | ${val.rowCount} |
| uniqueIds | ${val.uniqueIds} |
| missingScenarioIds | ${val.missingScenarioIds} |
| mismatchedScenarioResults | ${val.mismatchedScenarioResults} |
| missingEvidenceFiles | ${val.missingEvidenceFiles} |
| genericEvidenceDescriptions | ${val.genericEvidenceDescriptions} |
| priorClassificationOnlyRows | ${val.priorClassificationOnlyRows} |
| nAWithoutExplicitAuthority | ${val.nAWithoutExplicitAuthority} |
| v3FailuresMissingFromMatrix | ${val.v3FailuresMissingFromMatrix} |
| v3FailuresReclassifiedAsComplete | ${val.v3FailuresReclassifiedAsComplete} |
| platformRequirementsClosedBySingleModule | ${val.platformRequirementsClosedBySingleModule} |
| keyboardRequirementsOverclaimed | ${val.keyboardRequirementsOverclaimed} |
| displayCurrencyUnsupportedCompleteRows | ${val.displayCurrencyUnsupportedCompleteRows} |
| platformWideSendBackCompleteFromGrnOnly | ${val.platformWideSendBackCompleteFromGrnOnly} |
| sendBackRowsAlignedWithV3 | ${val.sendBackRowsAlignedWithV3} |

---

## v3 baseline (frozen — unchanged)

Reference: \`Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json\` (64 scenarios).  
Scenario IDs in this matrix match v3 register **literally** (e.g. \`V3-H-SB-TRANSFER\`, \`V3-H-REJECT-GETPASS\`, \`V2-B-DASH-NEVER\`).

---

## Corrections applied (summary)

1. **Scenario ID mapping** — all runtime references use exact v3 IDs; invalid aliases removed.
2. **Evidence paths** — every row has \`evidenceFile\` verified with \`fileExists()\`; no generic prose paths.
3. **Prior closeout inheritance removed** — zero rows with \`Prior closeout classification\` as actual.
4. **Send Back platform requirements** — \`Failed Runtime\` where GRN PASS + Transfer/Breakage/Lost/GetPass/IC HTTP 404 per v3.
5. **Keyboard Ch17** — all downgraded to \`Partial\` (Gate C = 7 create shells only).
6. **Display currency Ch11** — per-requirement file evidence; unsupported Complete → Partial.
7. **C24-24.1-001 desktop-only** — \`Static Verified — Appropriate\` per Constitution §24.1 (not N/A).
8. **v3 FAIL preservation** — all 33 v3 FAIL scenarios linked to ≥1 requirement.

---

## Final counts by classification

| Classification | Count |
${countTable}

**Total: 393**

---

## Defect / conflict register (${defects.length})

${defects
  .slice(0, 40)
  .map((r) => `- **${r.requirementId}** [${r.finalClassification}]: ${r.gap || r.actual?.slice(0, 100)}`)
  .join('\n')}
${defects.length > 40 ? `\n_… ${defects.length - 40} additional defect/conflict rows in matrix._` : ''}

---

## Full 393 Requirement Matrix

| Requirement ID | Chapter | Exact requirement | Modules | Evidence type | Scenario / file | Expected | Actual | Classification | Gap |
${matrixTable}

---

**No remediation executed. No product code modified. No v3 scenarios re-run.**
`;

  fs.writeFileSync(OUT, md);
  console.log('Wrote', OUT);
}

main();
