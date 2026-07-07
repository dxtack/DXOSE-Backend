#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  loadJson,
  fileExists,
  V3_REQ_MAP,
  KEYBOARD_IDS,
  DISPLAY_CURRENCY_IDS,
  SEND_BACK_PLATFORM_IDS,
  V3_CLASS_TO_MATRIX,
  isPlatformWide,
} = require('./lib/matrix-evidence-lib.cjs');

const MATRIX_PATH = path.join(ROOT, 'Governance/constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_v2.json');
const V3_PATH = path.join(ROOT, 'Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json');
const OUT_PATH = path.join(ROOT, 'Governance/constitution-coverage/EVIDENCE_INTEGRITY_VALIDATION.json');

function isGenericEvidencePath(text) {
  if (!text) return true;
  const t = String(text).split('#')[0].trim();
  if (/\.(json|md|js|ts|tsx|html|csv|mjs|cjs|jsx|vue|scss|css|sql|prisma)$/i.test(t)) return false;
  if (/^(Governance|OSE-Frontend|OSE-backend|docs)\//.test(t)) return false;
  return (
    /notification\/toast services/i.test(t) ||
    /Gate B \+/i.test(t) ||
    /shared loading/i.test(t) ||
    /PDF generation services$/i.test(t) ||
    /partial a11y probes$/i.test(t) ||
    /document-page\/archetype/i.test(t) ||
    (!t.includes('/') && !t.includes('\\'))
  );
}

function parseScenarioIds(row) {
  const ids = new Set();
  if (row.scenarioIds) for (const s of row.scenarioIds) ids.add(s);
  if (row.scenario) {
    for (const part of String(row.scenario).split(/[;,]/)) {
      const t = part.trim();
      if (/^(V2|V3)-/.test(t)) ids.add(t.split(/\s/)[0]);
    }
  }
  if (row.runtimeEvidence) for (const r of row.runtimeEvidence) ids.add(r.scenarioId);
  return [...ids];
}

function v3ResultToMatrixClass(v3Class, result) {
  if (result === 'FAIL') {
    return V3_CLASS_TO_MATRIX[v3Class] || 'Failed Runtime';
  }
  if (result === 'PASS') return 'Runtime Verified Complete';
  return null;
}

function main() {
  const matrix = loadJson(MATRIX_PATH);
  const v3 = loadJson(V3_PATH);
  const v3ById = Object.fromEntries(v3.scenarios.map((s) => [s.id, s]));
  const v3FailIds = v3.scenarios.filter((s) => s.result === 'FAIL').map((s) => s.id);

  const rows = matrix.rows || [];
  const issues = {
    missingScenarioIds: [],
    mismatchedScenarioResults: [],
    missingEvidenceFiles: [],
    genericEvidenceDescriptions: [],
    priorClassificationOnlyRows: [],
    nAWithoutExplicitAuthority: [],
    v3FailuresMissingFromMatrix: [],
    v3FailuresReclassifiedAsComplete: [],
    platformRequirementsClosedBySingleModule: [],
    keyboardRequirementsOverclaimed: [],
    displayCurrencyUnsupportedCompleteRows: [],
    platformWideSendBackCompleteFromGrnOnly: [],
    sendBackRowsNotAligned: [],
    runtimeCompleteWithoutScenario: [],
    staticVerifiedRuntimeRequired: [],
  };

  const linkedV3Fails = new Set();
  const counts = {};

  for (const row of rows) {
    counts[row.finalClassification] = (counts[row.finalClassification] || 0) + 1;

    if (String(row.actual || '').includes('Prior closeout classification')) {
      issues.priorClassificationOnlyRows.push(row.requirementId);
    }

    const evPath = row.evidenceFile;
    if (!evPath || !fileExists(evPath)) {
      issues.missingEvidenceFiles.push({ id: row.requirementId, path: evPath });
    }
    if (isGenericEvidencePath(evPath)) {
      issues.genericEvidenceDescriptions.push(row.requirementId);
    }

    if (row.finalClassification === 'Not Applicable by Explicit Approved Decision') {
      if (!row.naAuthority || !/Constitution|BDR|Workflow Contract|ACC|§/.test(row.naAuthority)) {
        issues.nAWithoutExplicitAuthority.push(row.requirementId);
      }
    }
    if (row.requirementId === 'C24-24.1-001' && row.finalClassification === 'Not Applicable by Explicit Approved Decision') {
      issues.desktopOnlyIncorrectNA = (issues.desktopOnlyIncorrectNA || 0) + 1;
    }

    const sids = parseScenarioIds(row);
    if (row.finalClassification === 'Runtime Verified Complete' && sids.length === 0) {
      issues.runtimeCompleteWithoutScenario.push(row.requirementId);
    }

    for (const sid of sids) {
      if (!v3ById[sid]) {
        issues.missingScenarioIds.push({ id: row.requirementId, scenarioId: sid });
        continue;
      }
      const vs = v3ById[sid];
      if (row.runtimeEvidence) {
        const re = row.runtimeEvidence.find((r) => r.scenarioId === sid);
        if (re && re.result !== vs.result) {
          issues.mismatchedScenarioResults.push({ id: row.requirementId, scenarioId: sid, matrix: re.result, v3: vs.result });
        }
      }
      if (vs.result === 'FAIL') linkedV3Fails.add(sid);

      const expectedClass = v3ResultToMatrixClass(vs.finalClassification, vs.result);
      if (
        vs.result === 'FAIL' &&
        row.finalClassification === 'Runtime Verified Complete' &&
        !['C02-2.4.2-001'].includes(row.requirementId)
      ) {
        issues.v3FailuresReclassifiedAsComplete.push({ id: row.requirementId, scenarioId: sid });
      }
      if (
        vs.result === 'FAIL' &&
        expectedClass &&
        !['Partial', 'Failed Runtime', 'Governance Conflict', 'Configuration Drift', 'Operational Legacy', 'Static Dead Code'].includes(
          row.finalClassification,
        )
      ) {
        issues.mismatchedScenarioResults.push({
          id: row.requirementId,
          scenarioId: sid,
          matrixClass: row.finalClassification,
          expectedClass,
        });
      }
    }

    if (KEYBOARD_IDS.has(row.requirementId) && row.finalClassification === 'Runtime Verified Complete') {
      issues.keyboardRequirementsOverclaimed.push(row.requirementId);
    }

    if (DISPLAY_CURRENCY_IDS.has(row.requirementId) && row.finalClassification === 'Static Verified — Appropriate') {
      const allowedStatic = [
        'C11-11.3-002',
        'C11-11.3-003',
        'C11-11.3-007',
        'C11-11.6-002',
      ];
      if (!allowedStatic.includes(row.requirementId)) {
        issues.displayCurrencyUnsupportedCompleteRows.push(row.requirementId);
      }
    }

    if (SEND_BACK_PLATFORM_IDS.has(row.requirementId)) {
      if (row.finalClassification === 'Runtime Verified Complete') {
        issues.platformWideSendBackCompleteFromGrnOnly.push(row.requirementId);
      }
      if (row.finalClassification !== 'Failed Runtime' && row.finalClassification !== 'Partial') {
        issues.sendBackRowsNotAligned.push(row.requirementId);
      }
    }

    const req = { requirement: row.exactRequirement, scope: row.applicableModules };
    if (
      isPlatformWide(req) &&
      row.finalClassification === 'Runtime Verified Complete' &&
      sids.length <= 2 &&
      !row.coverageStatement
    ) {
      issues.platformRequirementsClosedBySingleModule.push(row.requirementId);
    }
  }

  for (const fid of v3FailIds) {
    if (!linkedV3Fails.has(fid)) issues.v3FailuresMissingFromMatrix.push(fid);
  }

  const ids = rows.map((r) => r.requirementId);
  const uniqueIds = new Set(ids);
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);

  const result = {
    passed: false,
    validatedAt: new Date().toISOString(),
    matrixPath: 'Governance/constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_v2.json',
    rowCount: rows.length,
    uniqueIds: uniqueIds.size,
    classificationSum: sum,
    missingScenarioIds: issues.missingScenarioIds.length,
    mismatchedScenarioResults: issues.mismatchedScenarioResults.length,
    missingEvidenceFiles: issues.missingEvidenceFiles.length,
    genericEvidenceDescriptions: issues.genericEvidenceDescriptions.length,
    priorClassificationOnlyRows: issues.priorClassificationOnlyRows.length,
    nAWithoutExplicitAuthority: issues.nAWithoutExplicitAuthority.length,
    desktopOnlyIncorrectNA: issues.desktopOnlyIncorrectNA || 0,
    v3FailuresMissingFromMatrix: issues.v3FailuresMissingFromMatrix.length,
    v3FailuresReclassifiedAsComplete: issues.v3FailuresReclassifiedAsComplete.length,
    platformRequirementsClosedBySingleModule: issues.platformRequirementsClosedBySingleModule.length,
    keyboardRequirementsOverclaimed: issues.keyboardRequirementsOverclaimed.length,
    displayCurrencyUnsupportedCompleteRows: issues.displayCurrencyUnsupportedCompleteRows.length,
    platformWideSendBackCompleteFromGrnOnly: issues.platformWideSendBackCompleteFromGrnOnly.length,
    sendBackRowsAlignedWithV3: issues.sendBackRowsNotAligned.length === 0,
    issues,
  };

  result.passed =
    result.rowCount === 393 &&
    result.uniqueIds === 393 &&
    result.classificationSum === 393 &&
    result.missingScenarioIds === 0 &&
    result.mismatchedScenarioResults === 0 &&
    result.missingEvidenceFiles === 0 &&
    result.genericEvidenceDescriptions === 0 &&
    result.priorClassificationOnlyRows === 0 &&
    result.nAWithoutExplicitAuthority === 0 &&
    result.desktopOnlyIncorrectNA === 0 &&
    result.v3FailuresMissingFromMatrix === 0 &&
    result.v3FailuresReclassifiedAsComplete === 0 &&
    result.platformRequirementsClosedBySingleModule === 0 &&
    result.keyboardRequirementsOverclaimed === 0 &&
    result.displayCurrencyUnsupportedCompleteRows === 0 &&
    result.platformWideSendBackCompleteFromGrnOnly === 0 &&
    result.sendBackRowsAlignedWithV3 === true;

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

main();
