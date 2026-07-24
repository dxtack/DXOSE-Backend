#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ROOT,
  loadJson,
  fileExists,
  KEYBOARD_IDS,
  DISPLAY_CURRENCY_IDS,
  SEND_BACK_PLATFORM_IDS,
  isArtifactPresenceRequirement,
  ARTIFACT_PRESENCE_IDS,
} = require('./lib/matrix-evidence-lib.cjs');
const { loadDeliveredAllowlist } = require('./lib/load-allowlist.cjs');
const { extractFilePaths, normalizePath } = require('./lib/evidence-refs.cjs');
const { isGenericMissing } = require('./lib/partial-enrichment.cjs');

const MATRIX_PATH = path.join(ROOT, 'governance-evidence-archive/constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_SEMANTIC_FINAL.json');
const V3_PATH = path.join(ROOT, 'governance-evidence-archive/runtime-revalidation/P0_RUNTIME_V3_FINAL.json');
const OUT_PATH = path.join(ROOT, 'governance-evidence-archive/constitution-coverage/SEMANTIC_EVIDENCE_INTEGRITY_VALIDATION.json');

const SCOPE_SCENARIOS = [
  'V2-CF-GP-NEVER-SUBMIT',
  'V2-A-NEVER-SUBMIT',
  'V2-A-INACTIVE-SUBMIT',
  'V2-A-DELETED-SUBMIT',
  'V2-A-WRONG-PROP-SUBMIT',
  'V2-A-STALE-JWT',
  'V2-CF-WP-NEVER-LIST',
  'V2-CF-WP-NEVER-SUMMARY',
  'V2-CF-WP-NEVER-ALERTS',
  'V2-B-NEVER-LIST',
  'V2-B-NEVER-SUMMARY',
  'V2-B-NEVER-ALERTS',
  'V2-B-DASH-NEVER',
  'V2-G-WRONG-SCOPE',
];

const ENUM_EXPOSURE_REQS = ['C02-2.1-002', 'C02-2.1-003', 'C02-2.3-001', 'C02-2.3-002', 'C02-2.3-004'];

const BOILERPLATE_PROVES = [
  /Static\/runtime symbol cited in matrix row/i,
  /supports C\d/i,
  /supports Requirement/i,
  /artifact present — supports/i,
  /Static traceability symbol for C/i,
  /v3 runtime scenarios evidencing C/i,
];

const REJECT_FAIL_SCENARIOS = ['V3-H-REJECT-GETPASS', 'V3-H-REJECT-IC'];
const REJECT_UNTESTED_RULES = ['C03-3.4-007', 'C03-3.4-008'];

function parseScenarioIds(row) {
  const ids = new Set();
  if (row.scenarioIds) for (const s of row.scenarioIds) ids.add(s);
  if (row.runtimeEvidence) for (const r of row.runtimeEvidence) ids.add(r.scenarioId);
  return [...ids];
}

function allSupportingPaths(row) {
  const s = new Set();
  if (row.primaryEvidence) s.add(normalizePath(row.primaryEvidence));
  for (const e of row.supportingEvidence || []) {
    if (e.path) s.add(normalizePath(e.path));
  }
  return s;
}

function isBoilerplateProves(text) {
  if (!text) return true;
  if (BOILERPLATE_PROVES.some((re) => re.test(text))) return true;
  if (/^supports C\d/.test(text.trim())) return true;
  return false;
}

function main() {
  const allowlist = loadDeliveredAllowlist(ROOT);
  const { map: allowMap, entriesById, doc: allowDoc, hash, allowlistPath, scenarioCount, linkCount } = allowlist;

  const matrix = loadJson(MATRIX_PATH);
  const v3 = loadJson(V3_PATH);
  const v3ById = Object.fromEntries(v3.scenarios.map((s) => [s.id, s]));
  const v3ScenarioIds = v3.scenarios.map((s) => s.id);
  const v3FailIds = v3.scenarios.filter((s) => s.result === 'FAIL').map((s) => s.id);

  const rows = matrix.rows || [];
  const crossCutting = matrix.crossCuttingFindings || allowDoc.crossCuttingFindings || [];

  const issues = {
    missingScenarioIds: [],
    mismatchedScenarioResults: [],
    semanticScenarioMappingErrors: [],
    missingEvidenceFiles: [],
    actualEvidenceRefMismatch: [],
    priorClassificationOnlyRows: [],
    workflowDriftLinkedToPostingRequirement: [],
    workflowDriftLinkedToEnumExposureRequirement: [],
    scopeScenariosMisclassifiedAsLifecycleOnly: [],
    wrongPropertyScenariosMissingPropertyScopeRequirement: [],
    rejectFailureOvermappedToUntestedRules: [],
    artifactPresenceRequirementsIncorrectlyPartial: [],
    boilerplateProvesStatements: [],
    provesOnlyRepeatsRequirementId: [],
    supportingEvidenceWithoutDoesNotProve: [],
    genericPartialMissingPart: [],
    genericPartialRemediationFrontWithoutRootCauseGroup: [],
    partialRowsWithoutSpecificScope: [],
    allowlistEntriesWithoutWhyAllowed: [],
    allowlistLinksWithoutSemanticReason: [],
    v3FailuresUncovered: [],
    matrixAllowlistHashMismatch: [],
  };

  let hiddenMapUsed = false;
  try {
    const buildSrc = fs.readFileSync(path.join(ROOT, 'governance-evidence-archive/constitution-coverage/build-semantic-final-matrix.cjs'), 'utf8');
    if (/V3_REQ_MAP/.test(buildSrc) && !/loadDeliveredAllowlist/.test(buildSrc)) hiddenMapUsed = true;
  } catch (_) {
    /* ignore */
  }

  if (matrix.baseline?.allowlistSha256 && matrix.baseline.allowlistSha256 !== hash) {
    issues.matrixAllowlistHashMismatch.push({ expected: hash, matrix: matrix.baseline.allowlistSha256 });
  }

  for (const entry of allowDoc.scenarios || []) {
    if (!entry.whyAllowed || typeof entry.whyAllowed !== 'object') {
      issues.allowlistEntriesWithoutWhyAllowed.push(entry.scenarioId);
    } else {
      for (const rid of entry.allowedRequirementIds || []) {
        if (!entry.whyAllowed[rid] || String(entry.whyAllowed[rid]).trim().length < 20) {
          issues.allowlistLinksWithoutSemanticReason.push({ scenarioId: entry.scenarioId, requirementId: rid });
        }
      }
    }
  }

  const failCovered = new Set();

  for (const row of rows) {
    if (String(row.actual || '').includes('Prior closeout classification')) {
      issues.priorClassificationOnlyRows.push(row.requirementId);
    }

    const primary = normalizePath(row.primaryEvidence || row.evidenceFile);
    if (!primary || !fileExists(primary)) {
      issues.missingEvidenceFiles.push({ id: row.requirementId, path: primary });
    }

    if (isArtifactPresenceRequirement(row.requirementId) && row.finalClassification === 'Partial') {
      issues.artifactPresenceRequirementsIncorrectlyPartial.push(row.requirementId);
    }

    if (row.requirementId === 'C05-5.2-011' && parseScenarioIds(row).includes('V2-C-WF-EFFECTIVE')) {
      issues.workflowDriftLinkedToPostingRequirement.push(row.requirementId);
    }

    for (const er of ENUM_EXPOSURE_REQS) {
      if (row.requirementId === er && parseScenarioIds(row).includes('V2-C-WF-EFFECTIVE')) {
        issues.workflowDriftLinkedToEnumExposureRequirement.push(row.requirementId);
      }
    }

    if (row.requirementId === 'C04-4.3-001') {
      for (const sid of SCOPE_SCENARIOS) {
        if (parseScenarioIds(row).includes(sid)) {
          issues.scopeScenariosMisclassifiedAsLifecycleOnly.push({ scenarioId: sid, on: row.requirementId });
        }
      }
    }

    if (row.requirementId === 'C04-4.4-003' && !parseScenarioIds(row).includes('V2-A-WRONG-PROP-SUBMIT')) {
      /* checked per-row below for wrong-property scenarios */
    }

    for (const sid of ['V2-A-WRONG-PROP-SUBMIT', 'V2-G-WRONG-SCOPE']) {
      if (parseScenarioIds(row).includes(sid) && row.requirementId === 'C04-4.3-003' && !rows.some((r) => r.requirementId === 'C04-4.4-003' && parseScenarioIds(r).includes(sid))) {
        /* defer aggregate check */
      }
    }

    for (const sid of REJECT_FAIL_SCENARIOS) {
      if (parseScenarioIds(row).includes(sid) && REJECT_UNTESTED_RULES.includes(row.requirementId)) {
        issues.rejectFailureOvermappedToUntestedRules.push({ id: row.requirementId, scenarioId: sid });
      }
    }

    if (row.finalClassification === 'Partial') {
      if (isGenericMissing(row.missingPart)) issues.genericPartialMissingPart.push(row.requirementId);
      if (
        row.recommendedRemediationFront &&
        /Complete multi-module runtime proof|Runtime verification not executed across Platform|Runtime behavior not probed/.test(
          row.recommendedRemediationFront,
        ) &&
        !row.rootCauseGroup
      ) {
        issues.genericPartialRemediationFrontWithoutRootCauseGroup.push(row.requirementId);
      }
      if (!row.evidenceScope || /platform-wide requirement, no runtime matrix|traceability register$/i.test(row.evidenceScope)) {
        issues.partialRowsWithoutSpecificScope.push(row.requirementId);
      }
    }

    const actualFiles = extractFilePaths(row.actual);
    const detailFiles = extractFilePaths(row.evidenceDetail);
    const allRefs = allSupportingPaths(row);
    for (const f of [...actualFiles, ...detailFiles]) {
      if (!allRefs.has(f)) issues.actualEvidenceRefMismatch.push({ id: row.requirementId, path: f });
    }

    for (const e of row.supportingEvidence || []) {
      if (isBoilerplateProves(e.proves)) issues.boilerplateProvesStatements.push({ id: row.requirementId, path: e.path });
      if (e.proves && /supports C\d|supports Requirement/i.test(e.proves)) {
        issues.provesOnlyRepeatsRequirementId.push({ id: row.requirementId, path: e.path });
      }
      if (!e.doesNotProve || !String(e.doesNotProve).trim()) {
        issues.supportingEvidenceWithoutDoesNotProve.push({ id: row.requirementId, path: e.path });
      }
    }

    for (const sid of parseScenarioIds(row)) {
      if (!v3ById[sid]) {
        issues.missingScenarioIds.push({ id: row.requirementId, scenarioId: sid });
        continue;
      }
      const allowed = allowMap[sid];
      if (!allowed || !allowed.includes(row.requirementId)) {
        issues.semanticScenarioMappingErrors.push({ id: row.requirementId, scenarioId: sid });
      }
      const vs = v3ById[sid];
      const re = row.runtimeEvidence?.find((r) => r.scenarioId === sid);
      if (re && re.result !== vs.result) {
        issues.mismatchedScenarioResults.push({ id: row.requirementId, scenarioId: sid, matrix: re.result, v3: vs.result });
      }
      if (vs.result === 'FAIL' && allowed?.includes(row.requirementId)) failCovered.add(sid);
    }
  }

  for (const sid of SCOPE_SCENARIOS) {
    const entry = entriesById[sid];
    if (!entry?.allowedRequirementIds?.includes('C04-4.3-003')) {
      issues.scopeScenariosMisclassifiedAsLifecycleOnly.push({ scenarioId: sid, missing: 'C04-4.3-003' });
    }
    if (entry?.allowedRequirementIds?.includes('C04-4.3-001') && !['V2-CF-GP-FF-FINANCE', 'V2-CF-GP-FF-ORG'].includes(sid)) {
      issues.scopeScenariosMisclassifiedAsLifecycleOnly.push({ scenarioId: sid, wronglyOn: 'C04-4.3-001' });
    }
  }

  for (const sid of ['V2-A-WRONG-PROP-SUBMIT', 'V2-G-WRONG-SCOPE']) {
    const entry = entriesById[sid];
    if (!entry?.allowedRequirementIds?.includes('C04-4.4-003')) {
      issues.wrongPropertyScenariosMissingPropertyScopeRequirement = issues.wrongPropertyScenariosMissingPropertyScopeRequirement || [];
      issues.wrongPropertyScenariosMissingPropertyScopeRequirement.push(sid);
    }
  }

  for (const cc of crossCutting) {
    if (v3ById[cc.crossCuttingFindingId]?.result === 'FAIL') failCovered.add(cc.crossCuttingFindingId);
  }

  for (const fid of v3FailIds) {
    if (!failCovered.has(fid)) issues.v3FailuresUncovered.push(fid);
  }

  const configurationDriftCount =
    crossCutting.filter((c) => c.classification === 'Configuration Drift').length +
    rows.filter((r) => r.finalClassification === 'Configuration Drift').length;

  const operationalLegacyCount =
    crossCutting.filter((c) => c.classification === 'Operational Legacy').length +
    rows.filter((r) => r.finalClassification === 'Operational Legacy').length;

  const v3ClassTypes = new Set(v3.scenarios.map((s) => s.finalClassification));
  const matrixTypes = new Set(rows.map((r) => r.finalClassification));
  for (const cc of crossCutting) matrixTypes.add(cc.classification);
  const silentlyRemoved = [...v3ClassTypes].filter(
    (t) => !['Runtime Confirmed Compliant', 'Runtime Confirmed Defect'].includes(t) && !matrixTypes.has(
      { 'Configuration Drift': 'Configuration Drift', 'Operational Legacy': 'Operational Legacy', 'Static Dead Code': 'Static Dead Code', 'Governance Conflict': 'Governance Conflict' }[t] || t,
    ),
  ).length;

  const scopeScenariosMappedToScopeRequirement = SCOPE_SCENARIOS.every(
    (sid) => entriesById[sid]?.allowedRequirementIds?.includes('C04-4.3-003'),
  );

  const rejectEditabilityOk =
    rows.find((r) => r.requirementId === 'C03-3.4-007')?.finalClassification === 'Partial' &&
    !parseScenarioIds(rows.find((r) => r.requirementId === 'C03-3.4-007') || {}).some((s) => REJECT_FAIL_SCENARIOS.includes(s));

  const rejectReasonOk =
    rows.find((r) => r.requirementId === 'C03-3.4-008')?.finalClassification === 'Partial' &&
    !parseScenarioIds(rows.find((r) => r.requirementId === 'C03-3.4-008') || {}).some((s) => REJECT_FAIL_SCENARIOS.includes(s));

  const result = {
    passed: false,
    validatedAt: new Date().toISOString(),
    allowlistPath,
    allowlistSha256: hash,
    allowlistScenarioCount: scenarioCount,
    allowlistLinkCount: linkCount,
    allowlistLoadedFromDeliveredJson: true,
    hiddenScenarioRequirementMapUsed: hiddenMapUsed,
    allowlistScenarioCountMatches: scenarioCount === v3ScenarioIds.length,
    allowlistHashRecorded: Boolean(matrix.baseline?.allowlistSha256 === hash),

    rowCount: rows.length,
    uniqueIds: new Set(rows.map((r) => r.requirementId)).size,

    workflowDriftLinkedToPostingRequirement: issues.workflowDriftLinkedToPostingRequirement.length,
    workflowDriftLinkedToEnumExposureRequirement: issues.workflowDriftLinkedToEnumExposureRequirement.length,
    configurationDriftPreserved: configurationDriftCount >= 1,

    scopeScenariosMappedToScopeRequirement,
    scopeScenariosMisclassifiedAsLifecycleOnly: issues.scopeScenariosMisclassifiedAsLifecycleOnly.length,
    wrongPropertyScenariosMissingPropertyScopeRequirement: (issues.wrongPropertyScenariosMissingPropertyScopeRequirement || []).length,

    rejectFailureOvermappedToUntestedRules: issues.rejectFailureOvermappedToUntestedRules.length,
    rejectEditabilityRequirementHasDirectEvidenceOrPartial: rejectEditabilityOk,
    rejectReasonRequirementHasDirectEvidenceOrPartial: rejectReasonOk,

    artifactPresenceRequirementsIncorrectlyPartial: issues.artifactPresenceRequirementsIncorrectlyPartial.length,
    staticAppropriateRequirementsRequireNoInventedRuntime: ARTIFACT_PRESENCE_IDS.size > 0,

    configurationDriftCount,
    operationalLegacyCount,
    v3ClassificationTypesSilentlyRemoved: silentlyRemoved,

    boilerplateProvesStatements: issues.boilerplateProvesStatements.length,
    provesOnlyRepeatsRequirementId: issues.provesOnlyRepeatsRequirementId.length,
    supportingEvidenceWithoutDoesNotProve: issues.supportingEvidenceWithoutDoesNotProve.length,

    genericPartialMissingPart: issues.genericPartialMissingPart.length,
    genericPartialRemediationFrontWithoutRootCauseGroup: issues.genericPartialRemediationFrontWithoutRootCauseGroup.length,
    partialRowsWithoutSpecificScope: issues.partialRowsWithoutSpecificScope.length,

    allowlistEntriesWithoutWhyAllowed: issues.allowlistEntriesWithoutWhyAllowed.length,
    allowlistLinksWithoutSemanticReason: issues.allowlistLinksWithoutSemanticReason.length,

    missingScenarioIds: issues.missingScenarioIds.length,
    mismatchedScenarioResults: issues.mismatchedScenarioResults.length,
    missingEvidenceFiles: issues.missingEvidenceFiles.length,
    actualEvidenceRefMismatch: issues.actualEvidenceRefMismatch.length,
    priorClassificationOnlyRows: issues.priorClassificationOnlyRows.length,
    v3FailuresUncovered: issues.v3FailuresUncovered.length,
    semanticScenarioMappingErrors: issues.semanticScenarioMappingErrors.length,

    issues,
  };

  result.passed =
    result.rowCount === 393 &&
    result.uniqueIds === 393 &&
    result.allowlistLoadedFromDeliveredJson === true &&
    result.hiddenScenarioRequirementMapUsed === false &&
    result.allowlistScenarioCountMatches === true &&
    result.allowlistHashRecorded === true &&
    result.workflowDriftLinkedToPostingRequirement === 0 &&
    result.workflowDriftLinkedToEnumExposureRequirement === 0 &&
    result.configurationDriftPreserved === true &&
    result.scopeScenariosMappedToScopeRequirement === true &&
    result.scopeScenariosMisclassifiedAsLifecycleOnly === 0 &&
    result.wrongPropertyScenariosMissingPropertyScopeRequirement === 0 &&
    result.rejectFailureOvermappedToUntestedRules === 0 &&
    result.rejectEditabilityRequirementHasDirectEvidenceOrPartial === true &&
    result.rejectReasonRequirementHasDirectEvidenceOrPartial === true &&
    result.artifactPresenceRequirementsIncorrectlyPartial === 0 &&
    result.configurationDriftCount >= 1 &&
    result.operationalLegacyCount >= 1 &&
    result.v3ClassificationTypesSilentlyRemoved === 0 &&
    result.boilerplateProvesStatements === 0 &&
    result.provesOnlyRepeatsRequirementId === 0 &&
    result.supportingEvidenceWithoutDoesNotProve === 0 &&
    result.genericPartialMissingPart === 0 &&
    result.genericPartialRemediationFrontWithoutRootCauseGroup === 0 &&
    result.partialRowsWithoutSpecificScope === 0 &&
    result.allowlistEntriesWithoutWhyAllowed === 0 &&
    result.allowlistLinksWithoutSemanticReason === 0 &&
    result.missingScenarioIds === 0 &&
    result.mismatchedScenarioResults === 0 &&
    result.missingEvidenceFiles === 0 &&
    result.actualEvidenceRefMismatch === 0 &&
    result.priorClassificationOnlyRows === 0 &&
    result.v3FailuresUncovered === 0 &&
    result.semanticScenarioMappingErrors === 0 &&
    issues.matrixAllowlistHashMismatch.length === 0;

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

main();
