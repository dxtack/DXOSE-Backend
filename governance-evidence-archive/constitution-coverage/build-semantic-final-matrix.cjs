'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  GOV,
  PATHS,
  loadJson,
  fileExists,
  firstExisting,
  SEND_BACK_PLATFORM_IDS,
  KEYBOARD_IDS,
  DISPLAY_CURRENCY_IDS,
  DISPLAY_CURRENCY_EVIDENCE,
  V3_CLASS_TO_MATRIX,
  stronger,
  parseTraceability,
  isPlatformWide,
  inferModules,
  needsRuntimeEvidence,
  isArtifactPresenceRequirement,
  buildV3Index,
} = require('./lib/matrix-evidence-lib.cjs');
const { loadDeliveredAllowlist, invertAllowlistMap, crossCuttingEntries } = require('./lib/load-allowlist.cjs');
const { enrichPartialRow } = require('./lib/partial-enrichment.cjs');
const { buildEvidenceRefs } = require('./lib/evidence-refs.cjs');

const OUT_MATRIX = path.join(GOV, 'constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_SEMANTIC_FINAL.json');
const V3_PATH = PATHS.v3;
const GATE_C = PATHS.gateCKb;

const SEND_BACK_SCENARIOS = [
  'V3-H-SB-GRN',
  'V3-H-SB-TRANSFER',
  'V3-H-SB-BREAKAGE',
  'V3-H-SB-LOST',
  'V3-H-SB-GETPASS',
  'V3-H-SB-IC',
];

const PARTIAL_OVERRIDE_IDS = new Set([
  'C04-4.2-001',
  'C05-5.2-002',
  'C07-7.2-001',
  'C08-8.6-003',
  'C15-15.3-001',
  'C22-22.2-001',
  'C02-2.7-003',
  'C03-3.4-007',
  'C03-3.4-008',
]);

const STATIC_VERIFIED_OVERRIDE = {
  'C04-4.2-001': {
    classification: 'Static Verified — Appropriate',
    detail: 'Route audit: evidence-package endpoints inherit module VIEW permissions (GRN/Transfer/Breakage/Lost/GetPass/IC routes)',
    why: 'All traced evidence-package routes use module VIEW not separate EVIDENCE_PACKAGE permission',
  },
};

const GOVERNANCE_CONFLICT_EVIDENCE = new Set([
  'V2-F-RPT-BRK-APPROVED-OUT',
  'V2-F-RPT-LOST-LEDGER-OUT',
  'V2-F-RPT-POSTED-IN',
  'V3-E-POSTING-BREAKAGE',
  'V3-E-POSTING-LOST',
  'V3-E-POSTING-REPORT-LINK',
]);

let allowlistMap = {};

function filterAllowedScenarios(reqId, scenarioIds) {
  return scenarioIds.filter((sid) => {
    const allowed = allowlistMap[sid];
    return allowed && allowed.includes(reqId);
  });
}

function attachRuntime(row, scenarioIds, v3ById) {
  const runtime = [];
  for (const sid of [...new Set(scenarioIds)]) {
    const s = v3ById[sid];
    if (!s) continue;
    runtime.push({
      scenarioId: sid,
      expected: s.expectedFromConstitution || s.expected,
      actual: s.actual,
      result: s.result,
      v3Classification: s.finalClassification,
    });
  }
  row.scenarioIds = runtime.map((r) => r.scenarioId);
  row.scenario = row.scenarioIds.join('; ') || null;
  row.runtimeEvidence = runtime;
  if (runtime.length) {
    row.evidenceType = 'Runtime';
    row.expected = runtime.map((r) => `${r.scenarioId}: ${r.expected}`).join(' | ');
    row.actual = runtime.map((r) => `${r.scenarioId}: ${r.actual} (${r.result})`).join(' | ');
    row.runtimeResult = runtime.some((r) => r.result === 'FAIL') ? 'FAIL' : 'PASS';
  }
  return row;
}

function classifyFromRuntime(row) {
  let classification = null;
  for (const r of row.runtimeEvidence || []) {
    const mapped = V3_CLASS_TO_MATRIX[r.v3Classification] || null;
    if (mapped) classification = stronger(classification, mapped);
  }
  return classification;
}

function applySendBackRule(row, v3ById) {
  if (!SEND_BACK_PLATFORM_IDS.has(row.requirementId)) return;
  const allowed = filterAllowedScenarios(row.requirementId, [
    ...SEND_BACK_SCENARIOS,
    'V2-D-GRN-SB',
    'V2-D-GRN-SUBMIT-AFTER-SB',
  ]);
  attachRuntime(row, allowed, v3ById);
  const fails = SEND_BACK_SCENARIOS.filter((s) => v3ById[s]?.result === 'FAIL');
  row.coverageStatement = `GRN Send Back PASS (V3-H-SB-GRN); Send Back HTTP 404 on: ${fails.filter((f) => f !== 'V3-H-SB-GRN').join(', ')}`;
  row.finalClassification = 'Failed Runtime';
  row.gap = 'Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3';
  row.evidenceType = 'Runtime';
  row.rootCauseGroup = 'SEND-BACK-PLATFORM-01';
}

function applyKeyboardRule(row) {
  if (!KEYBOARD_IDS.has(row.requirementId)) return;
  row.primaryEvidence = GATE_C.replace(/\\/g, '/').replace(/^.*?Governance/, 'Governance');
  row.evidenceDetail = 'GATE_C_BROWSER_RESULTS.json — enter/shift-enter/esc/tab/focus_visible on 7 create shells';
  row.finalClassification = 'Partial';
  row.rootCauseGroup = 'KEYBOARD-SCOPE-01';
}

function applyDisplayCurrencyRule(row) {
  if (!DISPLAY_CURRENCY_IDS.has(row.requirementId)) return;
  const spec = DISPLAY_CURRENCY_EVIDENCE[row.requirementId];
  if (!spec || !fileExists(spec.file)) {
    row.finalClassification = 'Partial';
    row.gap = 'Display currency evidence path missing';
    return;
  }
  row.primaryEvidence = spec.file;
  row.evidenceDetail = spec.detail;
  row.finalClassification = spec.classification;
  row.gap = spec.gap || null;
  row.staticWhyAppropriate =
    spec.classification === 'Static Verified — Appropriate'
      ? 'Display-currency layer is presentation-only; no ledger mutation in cited symbols'
      : null;
}

function applyDesktopOnlyRule(row) {
  if (row.requirementId !== 'C24-24.1-001') return;
  row.primaryEvidence = PATHS.constitution;
  row.evidenceDetail = 'constitution-base.md:1087 — Desktop only for v2.0 operational data entry';
  row.finalClassification = 'Static Verified — Appropriate';
  row.evidenceType = 'Static';
  row.staticWhyAppropriate = 'Constitution §24.1 platform policy — desktop-only operational data entry';
  row.naAuthority = null;
  row.gap = null;
}

function applyArtifactPresenceRule(row, trace) {
  if (!isArtifactPresenceRequirement(row.requirementId)) return;
  const t = trace[row.requirementId];
  const pf = t?.primaryFile || row.primaryEvidence;
  if (pf && fileExists(pf)) {
    row.primaryEvidence = pf;
    row.evidenceDetail = t?.methods?.[0] || 'Governance library artifact present per traceability register';
    row.finalClassification = 'Static Verified — Appropriate';
    row.evidenceType = 'Static';
    row.staticWhyAppropriate = `Artifact at ${pf} satisfies governance-library presence requirement; runtime not required`;
    row.gap = null;
    row.implementedPart = null;
    row.missingPart = null;
  }
}

function applyRejectPartialRule(row) {
  if (row.requirementId === 'C03-3.4-007') {
    row.finalClassification = 'Partial';
    row.implementedPart =
      'Reject PASS scenarios on Transfer/Breakage/Lost prove REJECTED terminal state; no v3 probe attempted edit-after-reject on Get Pass or IC';
    row.missingPart =
      'Get Pass and IC post-reject editability not tested; V3-H-REJECT-GETPASS/IC failed before reaching rejected-edit probe';
    row.gap = 'Reject-end proven on 3 modules; edit-block-after-reject not directly runtime-probed on GP/IC';
    row.evidenceScope = 'Runtime partial — Transfer/Breakage/Lost Reject PASS only; GP/IC Reject execution failed';
    row.recommendedRemediationFront = 'Reject flow hardening — GP rejectionReason validation + IC permission; then edit-after-reject matrix';
    row.rootCauseGroup = 'REJECT-FLOW-01';
  }
  if (row.requirementId === 'C03-3.4-008') {
    row.finalClassification = 'Partial';
    row.implementedPart =
      'V3-H-REJECT-GETPASS actual cites missing rejectionReason — partial reason validation signal only';
    row.missingPart =
      'No isolated runtime probe verifying reason required/persisted on Transfer/Breakage/Lost/IC successful Reject paths';
    row.gap = 'Reject reason enforcement observed only indirectly on failed GP Reject; not matrix-tested on all modules';
    row.evidenceScope = 'Runtime partial — Get Pass Reject failure message only';
    row.recommendedRemediationFront = 'Reject flow hardening — mandatory reason capture runtime matrix all modules';
    row.rootCauseGroup = 'REJECT-FLOW-01';
  }
}

function applySpecialStaticRules(row) {
  if (row.requirementId === 'C10-10.2-014') {
    row.primaryEvidence = 'OSE-backend/src/services/stock.service.js';
    row.evidenceDetail = 'Server-side stock validation authoritative';
    row.finalClassification = 'Static Verified — Appropriate';
    row.staticWhyAppropriate = 'Backend stock enforcement authoritative per architecture';
  }
  if (row.requirementId === 'C03-3.2-002') {
    row.primaryEvidence = PATHS.accCatalog;
    row.evidenceDetail = 'catalog.constitution.js — Cancel action label standard';
    row.finalClassification = 'Static Verified — Appropriate';
  }
  if (row.requirementId === 'C29-29.6-001') {
    row.primaryEvidence = 'Governance/CONSTITUTION_TRACEABILITY_MATRIX.md';
    row.finalClassification = 'Static Verified — Appropriate';
  }
}

function applyPartialOverrides(row) {
  const id = row.requirementId;
  if (id === 'C02-2.7-003') {
    row.finalClassification = 'Partial';
    return;
  }
  const sv = STATIC_VERIFIED_OVERRIDE[id];
  if (sv) {
    row.finalClassification = sv.classification;
    row.evidenceDetail = sv.detail;
    row.staticWhyAppropriate = sv.why;
    row.gap = null;
    return;
  }
  if (PARTIAL_OVERRIDE_IDS.has(id)) row.finalClassification = 'Partial';
}

function buildBaseRow(req, trace) {
  const t = trace[req.requirementId] || {};
  const primaryFile =
    t.primaryFile ||
    firstExisting(['Governance/CONSTITUTION_TRACEABILITY_MATRIX.md', 'docs/governance/scripts/constitution-base.md']);
  return {
    requirementId: req.requirementId,
    chapter: req.chapter,
    section: req.section,
    exactRequirement: req.requirement,
    applicableModules: inferModules(req),
    evidenceType: 'Static',
    scenarioIds: [],
    scenario: null,
    runtimeEvidence: [],
    primaryEvidence: primaryFile || 'Governance/CONSTITUTION_TRACEABILITY_MATRIX.md',
    supportingEvidence: [],
    evidenceFile: primaryFile || 'Governance/CONSTITUTION_TRACEABILITY_MATRIX.md',
    evidenceDetail: t.detail || 'Traceability register evidence',
    expected: req.requirement,
    actual: t.verification
      ? `Traceability verification: ${t.verification}; File: ${(t.files || []).slice(0, 2).join(', ')}; implemented=${t.implemented}`
      : t.detail,
    runtimeResult: null,
    finalClassification: 'Partial',
    gap: null,
    implementedPart: null,
    missingPart: null,
    evidenceScope: null,
    recommendedRemediationFront: null,
    rootCauseGroup: null,
    coverageStatement: null,
    naAuthority: null,
    staticWhyAppropriate: null,
    platformWide: isPlatformWide(req),
    needsRuntime: needsRuntimeEvidence(req),
    governanceContradictionEvidence: null,
  };
}

function finalizeClassification(row, req) {
  applyPartialOverrides(row);
  applyRejectPartialRule(row);

  if (isArtifactPresenceRequirement(row.requirementId)) return;
  if (PARTIAL_OVERRIDE_IDS.has(row.requirementId) && ['C03-3.4-007', 'C03-3.4-008'].includes(row.requirementId)) return;
  if (PARTIAL_OVERRIDE_IDS.has(row.requirementId) || row.requirementId === 'C24-24.1-001') return;
  if (SEND_BACK_PLATFORM_IDS.has(row.requirementId)) return;
  if (KEYBOARD_IDS.has(row.requirementId)) return;
  if (DISPLAY_CURRENCY_IDS.has(row.requirementId)) return;

  const fromRuntime = classifyFromRuntime(row);
  if (fromRuntime) row.finalClassification = stronger(row.finalClassification || 'Partial', fromRuntime);

  const gcScenarios = (row.runtimeEvidence || []).filter((r) => GOVERNANCE_CONFLICT_EVIDENCE.has(r.scenarioId));
  if (gcScenarios.length) {
    row.finalClassification = 'Governance Conflict';
    row.governanceContradictionEvidence = gcScenarios.map((r) => `${r.scenarioId}: ${r.actual}`).join(' | ');
    row.rootCauseGroup = 'POSTING-LIFECYCLE-01';
  }

  if (row.runtimeEvidence?.length) {
    const allPass = row.runtimeEvidence.every((r) => r.result === 'PASS');
    const anyFail = row.runtimeEvidence.some((r) => r.result === 'FAIL');
    if (anyFail && row.finalClassification === 'Runtime Verified Complete') row.finalClassification = 'Failed Runtime';
    if (allPass && row.platformWide) {
      row.finalClassification = 'Partial';
      row.coverageStatement = `Runtime PASS (${row.scenarioIds.join(', ')}) — platform-wide scope; modules not fully probed`;
    }
    if (
      allPass &&
      !row.platformWide &&
      row.runtimeEvidence.length >= 1 &&
      !['Governance Conflict', 'Failed Runtime', 'Configuration Drift', 'Operational Legacy', 'Static Dead Code'].includes(
        row.finalClassification,
      )
    ) {
      row.finalClassification = 'Runtime Verified Complete';
    }
  } else if (row.needsRuntime && row.finalClassification === 'Static Verified — Appropriate' && !row.staticWhyAppropriate) {
    row.finalClassification = 'Partial';
  } else if (!row.needsRuntime && row.primaryEvidence && fileExists(row.primaryEvidence)) {
    if (!['Partial', 'Failed Runtime', 'Governance Conflict'].includes(row.finalClassification)) {
      row.finalClassification = 'Static Verified — Appropriate';
    }
  }

  if (row.requirementId === 'C04-4.3-003' && row.runtimeEvidence?.some((r) => r.result === 'FAIL')) {
    row.finalClassification = stronger(row.finalClassification, 'Failed Runtime');
    row.rootCauseGroup = 'SCOPE-ENFORCEMENT-01';
  }
}

function buildMatrix() {
  const allowlist = loadDeliveredAllowlist(ROOT);
  allowlistMap = allowlist.map;
  const inv = invertAllowlistMap(allowlistMap);
  const crossCutting = crossCuttingEntries(allowlist.doc);

  const requirements = loadJson(PATHS.requirements);
  const trace = parseTraceability(fs.readFileSync(PATHS.traceability, 'utf8'));
  const v3 = loadJson(V3_PATH);
  const v3ById = buildV3Index(v3);

  const rows = [];
  for (const req of requirements) {
    const row = buildBaseRow(req, trace);
    applyArtifactPresenceRule(row, trace);
    const scenarioIds = filterAllowedScenarios(req.requirementId, inv[req.requirementId] || []);
    if (scenarioIds.length) attachRuntime(row, scenarioIds, v3ById);

    applySendBackRule(row, v3ById);
    applyKeyboardRule(row);
    applyDisplayCurrencyRule(row);
    applyDesktopOnlyRule(row);
    applySpecialStaticRules(row);
    finalizeClassification(row, req);

    if (
      row.requirementId === 'C23-23.6-002' &&
      row.runtimeEvidence?.length === 1 &&
      row.runtimeEvidence[0].scenarioId === 'V2-CF-GP-XT-READ'
    ) {
      row.finalClassification = 'Partial';
      row.gap = 'Get Pass cross-tenant read PASS only; lookup-wide tenant isolation not probed on IC/Transfer/GRN lookups';
      row.rootCauseGroup = 'TENANT-SCOPE-01';
    }

    if (row.finalClassification === 'Partial' && !row.implementedPart) enrichPartialRow(row, req, trace);
    buildEvidenceRefs(row, req, trace);

    delete row.platformWide;
    delete row.needsRuntime;
    rows.push(row);
  }

  rows.sort((a, b) => a.requirementId.localeCompare(b.requirementId));
  return { rows, crossCutting, allowlistMeta: allowlist };
}

function main() {
  const { rows, crossCutting, allowlistMeta } = buildMatrix();
  const counts = {};
  for (const r of rows) counts[r.finalClassification] = (counts[r.finalClassification] || 0) + 1;

  const out = {
    generatedAt: new Date().toISOString(),
    version: 'semantic-lock-correction',
    title: 'Full Constitution Coverage 393 Matrix (Semantic Evidence Final)',
    baseline: {
      v3Register: 'Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json',
      allowlist: allowlistMeta.allowlistPath,
      allowlistSha256: allowlistMeta.hash,
    },
    totalRequirements: rows.length,
    classificationCounts: counts,
    crossCuttingFindings: crossCutting,
    rows,
  };

  fs.writeFileSync(OUT_MATRIX, JSON.stringify(out, null, 2));
  console.log('Wrote', OUT_MATRIX);
  console.log('Counts:', counts);
  console.log('Cross-cutting:', crossCutting.length);
}

main();
