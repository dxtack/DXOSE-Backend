#!/usr/bin/env node
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
  V3_REQ_MAP,
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
  buildV3Index,
  invertV3Map,
} = require('./lib/matrix-evidence-lib.cjs');

const OUT_MATRIX = path.join(GOV, 'constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX_v2.json');
const OUT_CHANGELOG = path.join(GOV, 'constitution-coverage/EVIDENCE_CORRECTION_CHANGELOG.md');
const OLD_MATRIX = path.join(GOV, 'constitution-coverage/FULL_CONSTITUTION_COVERAGE_393_MATRIX.json');

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

const GOV_CONFLICT_IDS = new Set(
  loadJson(PATHS.govConflict).ids.map((x) => x.requirementId),
);
const FAILED_RT_IDS = new Set(
  loadJson(PATHS.failedRt).ids.map((x) => x.requirementId),
);

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
    row.evidenceFile = V3_PATH.replace(/\\/g, '/').replace(/^.*?Governance/, 'Governance');
    row.expected = runtime.map((r) => `${r.scenarioId}: ${r.expected}`).join(' | ');
    row.actual = runtime.map((r) => `${r.scenarioId}: ${r.actual} (${r.result})`).join(' | ');
    row.runtimeResult = runtime.some((r) => r.result === 'FAIL') ? 'FAIL' : 'PASS';
  }
  return row;
}

function classifyFromRuntime(row, v3ById) {
  let classification = null;
  for (const r of row.runtimeEvidence || []) {
    const mapped = V3_CLASS_TO_MATRIX[r.v3Classification] || null;
    if (r.scenarioId === 'V2-C-WF-EFFECTIVE' && row.requirementId === 'C02-2.3-004') {
      classification = stronger(classification, 'Configuration Drift');
      continue;
    }
    if (r.scenarioId === 'V2-CF-LEG-LOST-DEPT' && row.requirementId === 'C03-3.3-001') {
      classification = stronger(classification, 'Operational Legacy');
      continue;
    }
    if (mapped) classification = stronger(classification, mapped);
  }
  return classification;
}

function applySendBackRule(row, v3ById) {
  if (!SEND_BACK_PLATFORM_IDS.has(row.requirementId)) return;
  const ids = [...new Set([...(row.scenarioIds || []), ...SEND_BACK_SCENARIOS, 'V2-D-GRN-SB', 'V2-D-GRN-SUBMIT-AFTER-SB'])];
  attachRuntime(row, ids, v3ById);
  const fails = SEND_BACK_SCENARIOS.filter((s) => v3ById[s]?.result === 'FAIL');
  const grnPass = v3ById['V3-H-SB-GRN']?.result === 'PASS';
  row.coverageStatement = `GRN Send Back: ${grnPass ? 'PASS (V3-H-SB-GRN)' : 'not proven'}; missing on: ${fails.join(', ')} (HTTP 404)`;
  row.finalClassification = 'Failed Runtime';
  row.gap = 'Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3';
  row.evidenceType = 'Runtime';
}

function applyKeyboardRule(row) {
  if (!KEYBOARD_IDS.has(row.requirementId)) return;
  row.evidenceFile = GATE_C.replace(/\\/g, '/').replace(/^.*?Governance/, 'Governance');
  row.evidenceDetail = 'Gate C GATE_C_BROWSER_RESULTS.json — 7 create shells (GRN,GET_PASS,TRANSFER,BREAKAGE,LOST_ITEMS,MOVEMENTS,INVENTORY_COUNT); detail/list/settings/reports not probed';
  row.finalClassification = 'Partial';
  row.coverageStatement = 'Keyboard probes limited to 7 document-create shells; platform-wide keyboard claim not fully covered';
  row.gap = row.gap || 'Gate C scope = create shells only; requirement scope broader';
  if (row.requirementId === 'C17-17.2-002' || row.requirementId === 'C17-17.2-004') {
    row.actual = 'Gate C checks enter_advances_focus + shift_enter_previous Passed on 7 create shells only';
  } else if (row.requirementId === 'C17-17.2-003') {
    row.actual = 'Row-end add-row behavior not isolated in Gate C probe set';
    row.gap = 'Enter at row end → next row not runtime-probed';
  } else if (row.requirementId === 'C17-17.2-008') {
    row.actual = 'Invalid-field focus retention not in Gate C check list';
    row.evidenceDetail = `${PATHS.keyboardDirective} — directive exists; invalid-focus rule not runtime-probed`;
    row.evidenceFile = PATHS.keyboardDirective;
  } else if (row.requirementId === 'C17-17.2-009' || row.requirementId === 'C23-23.4-007') {
    row.actual = 'Post item-pick focus→quantity not in Gate C isolated probe';
    row.gap = 'Lookup line-entry focus handoff not runtime-proven';
  }
}

function applyDisplayCurrencyRule(row) {
  if (!DISPLAY_CURRENCY_IDS.has(row.requirementId)) return;
  const spec = DISPLAY_CURRENCY_EVIDENCE[row.requirementId];
  if (!spec || !fileExists(spec.file)) {
    row.finalClassification = 'Partial';
    row.gap = 'Display currency evidence path missing or unreadable';
    return;
  }
  row.evidenceFile = spec.file;
  row.evidenceDetail = spec.detail;
  row.finalClassification = spec.classification;
  row.gap = spec.gap || null;
  row.staticWhyAppropriate =
    spec.classification === 'Static Verified — Appropriate'
      ? 'Display-currency layer is presentation-only formatting; evidence file shows no ledger/posting mutation'
      : null;
}

function applyDesktopOnlyRule(row) {
  if (row.requirementId !== 'C24-24.1-001') return;
  row.evidenceFile = PATHS.constitution;
  row.evidenceDetail = 'constitution-base.md:1087 — Desktop only for v2.0 operational data entry (platform policy statement)';
  row.finalClassification = 'Static Verified — Appropriate';
  row.evidenceType = 'Static';
  row.staticWhyAppropriate = 'Constitution §24.1 defines v2.0 desktop-only operational data entry policy; not an N/A exemption';
  row.naAuthority = null;
  row.gap = null;
}

function applySpecialStaticRules(row, trace) {
  if (row.requirementId === 'C10-10.2-014') {
    row.evidenceFile = 'OSE-backend/src/services/stock.service.js';
    row.evidenceDetail = 'Server-side stock validation authoritative; client checks warn only per architecture';
    row.finalClassification = 'Static Verified — Appropriate';
    row.staticWhyAppropriate = 'Backend stock enforcement is authoritative; constitution allows client warn-only';
  }
  if (row.requirementId === 'C03-3.2-002') {
    row.evidenceFile = PATHS.accCatalog;
    row.evidenceDetail = 'ACC catalog.constitution.js — standard Cancel action label; no Abort/Discard aliases';
    row.finalClassification = 'Static Verified — Appropriate';
  }
  if (row.requirementId === 'C29-29.6-001') {
    row.evidenceFile = 'Governance/CONSTITUTION_TRACEABILITY_MATRIX.md';
    row.evidenceDetail = 'Implementation register + closeout audit process for QA constitution validation';
    row.finalClassification = 'Static Verified — Appropriate';
  }
  const uxFallback = {
    'C24-24.4-002': 'OSE-Frontend/docs/governance/APP_VIEWPORT_FRAMEWORK.md',
    'C24-24.4-003': 'OSE-Frontend/docs/governance/APP_VIEWPORT_FRAMEWORK.md',
    'C24-24.5-003': 'docs/governance/assets/ch24.6-responsive-matrix/CHECKLIST.md',
    'C28-28.1-003': 'docs/governance/assets/accessibility/CONTRAST_QA_CHECKLIST.md',
    'C28-28.2-001': 'docs/governance/assets/accessibility/CONTRAST_QA_CHECKLIST.md',
  };
  if (uxFallback[row.requirementId] && fileExists(uxFallback[row.requirementId])) {
    row.evidenceFile = uxFallback[row.requirementId];
    row.finalClassification = 'Partial';
    row.gap = row.gap || 'UX/layout requirement — visual documentation only; spacing/table fixes deferred';
  }
}

function buildBaseRow(req, trace) {
  const t = trace[req.requirementId] || {};
  const primaryFile =
    t.primaryFile ||
    firstExisting([
      'Governance/CONSTITUTION_TRACEABILITY_MATRIX.md',
      'docs/governance/scripts/constitution-base.md',
    ]);
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
    evidenceFile: primaryFile || 'Governance/CONSTITUTION_TRACEABILITY_MATRIX.md',
    evidenceDetail: t.detail || 'Traceability register evidence',
    expected: req.requirement,
    actual: t.verification ? `Traceability verification: ${t.verification}; implemented=${t.implemented}` : t.detail,
    runtimeResult: null,
    finalClassification: 'Partial',
    gap: null,
    coverageStatement: null,
    naAuthority: null,
    staticWhyAppropriate: null,
    platformWide: isPlatformWide(req),
    needsRuntime: needsRuntimeEvidence(req),
  };
}

function finalizeClassification(row, req) {
  if (GOV_CONFLICT_IDS.has(row.requirementId)) {
    row.finalClassification = 'Governance Conflict';
  }
  if (FAILED_RT_IDS.has(row.requirementId) && row.finalClassification !== 'Governance Conflict') {
    row.finalClassification = 'Failed Runtime';
  }

  const fromRuntime = classifyFromRuntime(row, buildV3Index(loadJson(V3_PATH)));
  if (fromRuntime) row.finalClassification = stronger(row.finalClassification || 'Partial', fromRuntime);

  if (SEND_BACK_PLATFORM_IDS.has(row.requirementId)) return;
  if (KEYBOARD_IDS.has(row.requirementId)) return;
  if (DISPLAY_CURRENCY_IDS.has(row.requirementId)) return;
  if (row.requirementId === 'C24-24.1-001') return;

  if (row.runtimeEvidence?.length) {
    const allPass = row.runtimeEvidence.every((r) => r.result === 'PASS');
    const anyFail = row.runtimeEvidence.some((r) => r.result === 'FAIL');
    if (anyFail && row.finalClassification === 'Runtime Verified Complete') {
      row.finalClassification = 'Failed Runtime';
    }
    if (allPass && row.platformWide) {
      row.finalClassification = 'Partial';
      row.coverageStatement = row.coverageStatement || 'Runtime PASS linked but requirement is platform-wide — module coverage incomplete';
      row.gap = row.gap || 'Platform-wide requirement not closed by linked scenario module scope alone';
    }
    if (allPass && !row.platformWide && row.runtimeEvidence.length >= 1) {
      if (!['Governance Conflict', 'Failed Runtime', 'Configuration Drift', 'Operational Legacy', 'Static Dead Code'].includes(row.finalClassification)) {
        row.finalClassification = 'Runtime Verified Complete';
      }
    }
  } else if (row.needsRuntime) {
    if (row.finalClassification === 'Static Verified — Appropriate' && !row.staticWhyAppropriate) {
      row.finalClassification = 'Partial';
      row.gap = row.gap || 'Runtime-oriented requirement lacks v3 runtime scenario linkage';
    }
  } else if (!row.needsRuntime && row.evidenceFile && fileExists(row.evidenceFile)) {
    if (!['Partial', 'Failed Runtime', 'Governance Conflict'].includes(row.finalClassification)) {
      row.finalClassification = 'Static Verified — Appropriate';
      row.staticWhyAppropriate =
        row.staticWhyAppropriate || `Static architecture/governance evidence at ${row.evidenceFile}; ${row.evidenceDetail}`;
    }
  }
}

function buildMatrix() {
  const requirements = loadJson(PATHS.requirements);
  const trace = parseTraceability(fs.readFileSync(PATHS.traceability, 'utf8'));
  const v3 = loadJson(V3_PATH);
  const v3ById = buildV3Index(v3);
  const inv = invertV3Map();

  const rows = [];
  for (const req of requirements) {
    const row = buildBaseRow(req, trace);
    const scenarioIds = inv[req.requirementId] || [];
    if (scenarioIds.length) attachRuntime(row, scenarioIds, v3ById);

    applySendBackRule(row, v3ById);
    applyKeyboardRule(row);
    applyDisplayCurrencyRule(row);
    applyDesktopOnlyRule(row);
    applySpecialStaticRules(row, trace);
    finalizeClassification(row, req);

    if (row.requirementId === 'C02-2.3-004' && row.runtimeEvidence?.some((r) => r.scenarioId === 'V2-C-WF-EFFECTIVE')) {
      row.finalClassification = 'Configuration Drift';
      row.gap = 'GET_PASS published chain includes PENDING_GM on all tenants (V2-C-WF-EFFECTIVE)';
    }
    if (row.requirementId === 'C04-4.3-001' && row.runtimeEvidence?.some((r) => r.scenarioId === 'V2-CF-LEG-LOST-DEPT')) {
      row.finalClassification = stronger(row.finalClassification, 'Operational Legacy');
      if (row.runtimeEvidence.some((r) => r.scenarioId === 'V2-CF-LEG-LOST-DEPT' && r.result === 'FAIL')) {
        row.gap = row.gap ? `${row.gap}; Lost /approve-dept legacy bypass (V2-CF-LEG-LOST-DEPT)` : 'Lost /approve-dept legacy bypass (V2-CF-LEG-LOST-DEPT)';
      }
    }

    if (row.requirementId === 'C23-23.6-002' && row.runtimeEvidence?.length === 1 && row.runtimeEvidence[0].scenarioId === 'V2-CF-GP-XT-READ') {
      row.finalClassification = 'Partial';
      row.coverageStatement = 'Tenant isolation PASS proven for Get Pass cross-tenant read only (V2-CF-GP-XT-READ); lookup-wide tenant isolation not fully probed';
      row.gap = 'Platform lookup tenant isolation requires multi-module lookup probes';
    }

    delete row.platformWide;
    delete row.needsRuntime;
    rows.push(row);
  }

  rows.sort((a, b) => a.requirementId.localeCompare(b.requirementId));
  return rows;
}

function writeChangelog(newRows) {
  let oldRows = [];
  if (fs.existsSync(OLD_MATRIX)) {
    oldRows = loadJson(OLD_MATRIX).rows || [];
  }
  const oldMap = Object.fromEntries(oldRows.map((r) => [r.requirementId, r]));
  const lines = [
    '# Evidence Correction Changelog',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Requirement ID | Old classification | New classification | Reason | New evidence |',
    '|----------------|---------------------|-------------------|--------|--------------|',
  ];

  for (const r of newRows) {
    const old = oldMap[r.requirementId];
    const oldClass = old?.finalClassification || '(none)';
    if (oldClass === r.finalClassification && !String(old?.actual || '').includes('Prior closeout')) continue;
    let reason = [];
    if (String(old?.actual || '').includes('Prior closeout')) reason.push('removed prior-classification-only row');
    if (oldClass !== r.finalClassification) reason.push('classification correction');
    if ((old?.scenario || '').match(/V3-H-SB-TR|V2-B-DASH-NO|V3-H-REJECT-GP[^A]/)) reason.push('scenario ID mapping fix');
    if (KEYBOARD_IDS.has(r.requirementId) && oldClass === 'Runtime Verified Complete') reason.push('keyboard overclaim correction');
    if (DISPLAY_CURRENCY_IDS.has(r.requirementId) && oldClass === 'Static Verified — Appropriate' && r.finalClassification === 'Partial')
      reason.push('display currency evidence gap');
    if (SEND_BACK_PLATFORM_IDS.has(r.requirementId) && oldClass !== 'Failed Runtime') reason.push('send-back platform alignment with v3');
    if (r.requirementId === 'C24-24.1-001') reason.push('N/A correction — desktop-only is platform policy');
    const ev = r.scenario || r.evidenceFile || '';
    lines.push(`| ${r.requirementId} | ${oldClass} | ${r.finalClassification} | ${reason.join('; ') || 'evidence path enrichment'} | ${String(ev).slice(0, 60)} |`);
  }

  fs.writeFileSync(OUT_CHANGELOG, lines.join('\n'));
}

function main() {
  const rows = buildMatrix();
  const counts = {};
  for (const r of rows) counts[r.finalClassification] = (counts[r.finalClassification] || 0) + 1;

  const out = {
    generatedAt: new Date().toISOString(),
    version: 'v2-evidence-corrected',
    title: 'Full Constitution Coverage 393 Matrix (Evidence Integrity Corrected)',
    baseline: {
      v3Report: 'Governance/runtime-revalidation/RUNTIME_CONSTITUTION_GAP_REPORT_v3_FINAL.md',
      v3Register: 'Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json',
      gateC: 'Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json',
      note: 'v3 baseline frozen — scenario IDs and results taken verbatim from P0_RUNTIME_V3_FINAL.json',
    },
    totalRequirements: rows.length,
    classificationCounts: counts,
    rows,
  };

  fs.writeFileSync(OUT_MATRIX, JSON.stringify(out, null, 2));
  writeChangelog(rows);
  console.log('Wrote', OUT_MATRIX);
  console.log('Counts:', counts);
}

main();
