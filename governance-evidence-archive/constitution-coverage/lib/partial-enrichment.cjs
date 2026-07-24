'use strict';

const {
  isPlatformWide,
  inferModules,
  KEYBOARD_IDS,
  DISPLAY_CURRENCY_IDS,
  SEND_BACK_PLATFORM_IDS,
  isArtifactPresenceRequirement,
} = require('./matrix-evidence-lib.cjs');

const MODULES_ALL = ['GRN', 'Transfer', 'Breakage/Lost', 'Get Pass', 'Inventory Count', 'Movements', 'Reports'];

const GENERIC_MISSING = [
  /^Runtime verification not executed across/i,
  /^Runtime behavior not probed; static symbol presence only$/i,
  /^Complete multi-module runtime proof for platform-wide requirement$/i,
  /^Platform-wide coverage incomplete; modules not probed:/i,
  /^Additional modules\/scenarios required by requirement scope not executed$/i,
];

const SHARED_REMEDIATION = {
  'SCOPE-ENFORCEMENT-01': 'Assignment and property-scope enforcement on submit/list/pipeline/movement APIs',
  'SEND-BACK-PLATFORM-01': 'Unified Send Back runtime across Transfer/Breakage/Lost/GetPass/IC',
  'KEYBOARD-SCOPE-01': 'Keyboard verification for Detail/List/Settings screens beyond 7 create shells',
  'POSTING-LIFECYCLE-01': 'Posting state/report alignment — POSTED lifecycle when ledger effects occur',
  'REJECT-FLOW-01': 'Reject flow hardening — reason capture, permission, and post-reject edit matrix',
  'TENANT-SCOPE-01': 'Platform-wide lookup tenant isolation probes across GRN/Transfer/IC',
};

function modulesFromRuntime(row) {
  const mods = new Set();
  for (const sid of row.scenarioIds || []) {
    if (/GRN|D-GRN/.test(sid)) mods.add('GRN');
    if (/TRANSFER/.test(sid)) mods.add('Transfer');
    if (/BRK|BREAKAGE|LOST|LEG/.test(sid)) mods.add('Breakage/Lost');
    if (/GP|GETPASS|GET_PASS/.test(sid)) mods.add('Get Pass');
    if (/IC|INVENTORY/.test(sid)) mods.add('Inventory Count');
    if (/RPT|POSTING/.test(sid)) mods.add('Reports');
    if (/G-|MOVEMENT/.test(sid)) mods.add('Movements');
    if (/WP|B-|DASH|PIPELINE/.test(sid)) mods.add('Workflow Pipeline');
  }
  return [...mods];
}

function evidenceScopeLabel(row, req) {
  if (KEYBOARD_IDS.has(row.requirementId)) return 'Frontend browser — 7 create shells only (GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT)';
  const rt = row.runtimeEvidence?.length > 0;
  const mods = modulesFromRuntime(row);
  const fe = (row.primaryEvidence || '').includes('OSE-Frontend');
  const be = (row.primaryEvidence || '').includes('OSE-backend');
  const gov = (row.primaryEvidence || '').includes('Governance/') || (row.primaryEvidence || '').includes('docs/governance');

  if (!rt && gov && !be && !fe) return 'Static definition only — governance library artifact';
  if (!rt && be && !fe) return 'Backend guard only — static service/route symbols';
  if (!rt && fe && !be) return 'Frontend display only — static component/directive symbols';
  if (rt && mods.length === 1) return `Runtime partial — ${[...mods][0]} module only`;
  if (rt && mods.length > 1) return `Runtime partial — modules: ${mods.join(', ')}`;
  if (!rt) return `Static traceability only — ${inferModules(req)} symbols cited`;
  return 'Mixed static infrastructure + partial runtime';
}

function isGenericMissing(text) {
  if (!text) return true;
  return GENERIC_MISSING.some((re) => re.test(String(text).trim()));
}

function specificPartial(req, row) {
  const id = row.requirementId;
  return (
    {
      'C04-4.2-001': {
        implementedPart: 'Static route audit: GRN/Transfer/Breakage/Lost/GetPass/IC evidence routes use module VIEW permissions',
        missingPart: 'Runtime negative — user without module VIEW downloading evidence on each module endpoint',
        gap: 'Route permission declarations verified; per-endpoint runtime denial matrix not executed',
        rootCauseGroup: null,
      },
      'C04-4.3-003': {
        implementedPart: row.runtimeEvidence?.filter((r) => r.result === 'PASS').map((r) => r.scenarioId).join(', ') || 'Scope PASS probes where linked',
        missingPart: row.runtimeEvidence?.filter((r) => r.result === 'FAIL').map((r) => `${r.scenarioId} (${r.actual})`).join('; ') || 'Scope failure remediation',
        gap: 'Action Allowed = Permission+Workflow+Lifecycle+Business Rules+Scope — Scope gate failures on linked v3 probes',
        rootCauseGroup: 'SCOPE-ENFORCEMENT-01',
      },
      'C05-5.2-002': {
        implementedPart: 'grn.service.js + transfer.service.js static workflow-state guards before post',
        missingPart: 'Breakage, Lost, Get Pass, Movements, IC posting-path workflow-state runtime verification',
        gap: 'Posting workflow-state check traced on GRN+Transfer only',
        rootCauseGroup: 'POSTING-LIFECYCLE-01',
      },
      'C07-7.2-001': {
        implementedPart: 'draftGovernance.service.js — GRN, Transfer, Get Pass, Breakage create default DRAFT',
        missingPart: 'Lost Items, Movements, Inventory Count server-draft create runtime proof',
        gap: 'Server-recognized draft at create verified for 4 families not all operational documents',
        rootCauseGroup: null,
      },
      'C08-8.6-003': {
        implementedPart: 'grn.service.js concurrencyVersion on approve; get-pass FE sends version',
        missingPart: 'Duplicate-approve rejection runtime test on Transfer/Breakage/Lost/IC',
        gap: 'Version field present on GRN/GetPass; duplicate approve prevention not runtime-proven platform-wide',
        rootCauseGroup: null,
      },
      'C15-15.3-001': {
        implementedPart: 'approvalChain.service.js single write of ApprovalStep.comment',
        missingPart: 'DB immutability constraint + update/delete API audit on all modules',
        gap: 'Comment write-once in one service; platform immutability not exhaustively verified',
        rootCauseGroup: null,
      },
      'C22-22.2-001': {
        implementedPart: 'auditTrail.service.js + auditGoverned.service.js; partial GRN/Transfer/IC wiring',
        missingPart: 'Breakage create/submit paths lack audit calls per traceability grep',
        gap: 'Audit helpers exist; not every workflow action on every module wired',
        rootCauseGroup: null,
      },
      'C02-2.7-003': {
        implementedPart: 'GRN V2-D-GRN-SUBMIT-AFTER-SB PASS — Submit after Send Back re-enters workflow',
        missingPart: 'Transfer/Breakage/Lost/GetPass/IC Submit-after-Return blocked — Send Back HTTP 404',
        gap: 'Submit-entering-workflow after Return verified GRN only',
        rootCauseGroup: 'SEND-BACK-PLATFORM-01',
      },
    }[id] || null
  );
}

function enrichPartialRow(row, req, trace) {
  if (row.finalClassification !== 'Partial') return row;
  if (isArtifactPresenceRequirement(row.requirementId)) return row;
  if (row.implementedPart && row.missingPart && row.gap) {
    if (!row.evidenceScope) row.evidenceScope = evidenceScopeLabel(row, req);
    if (!row.recommendedRemediationFront && row.rootCauseGroup)
      row.recommendedRemediationFront = SHARED_REMEDIATION[row.rootCauseGroup];
    return row;
  }

  const spec = specificPartial(req, row);
  const traceFiles = trace[row.requirementId]?.files || [];
  const rtMods = modulesFromRuntime(row);

  if (spec) {
    Object.assign(row, spec);
  } else if (KEYBOARD_IDS.has(row.requirementId)) {
    row.implementedPart =
      'Gate C: enter/shift-enter/esc/tab/focus_visible Passed on GRN, GET_PASS, TRANSFER, BREAKAGE, LOST_ITEMS, MOVEMENTS, INVENTORY_COUNT create shells';
    row.missingPart =
      'Detail screens, list views, settings, reports, dialogs, lookup overlays, row-end add-row, invalid-field focus retention';
    row.gap = 'Keyboard constitution claims platform-wide; probes cover create shells only';
    row.rootCauseGroup = 'KEYBOARD-SCOPE-01';
  } else if (row.runtimeEvidence?.length) {
    const pass = row.runtimeEvidence.filter((r) => r.result === 'PASS');
    const fail = row.runtimeEvidence.filter((r) => r.result === 'FAIL');
    row.implementedPart = pass.length
      ? `${pass.map((r) => r.scenarioId).join(', ')} PASS on ${rtMods.join('/') || 'linked module'}`
      : `Static/trace symbols at ${traceFiles.slice(0, 2).join(', ') || row.primaryEvidence}`;
    row.missingPart = fail.length
      ? `${fail.map((r) => `${r.scenarioId}: ${r.actual}`).join('; ')}`
      : isPlatformWide(req)
        ? `No runtime probe on: ${MODULES_ALL.filter((m) => !rtMods.includes(m)).join(', ')}`
        : `No runtime probe beyond ${rtMods.join('/') || 'linked scenarios'}`;
    row.gap = `${row.implementedPart}. Not proven: ${row.missingPart}`;
  } else if (traceFiles.length) {
    const methods = trace[row.requirementId]?.methods?.slice(0, 2).join('; ') || 'cited symbols';
    row.implementedPart = `${traceFiles.slice(0, 2).join(', ')} — ${methods}`;
    row.missingPart = isPlatformWide(req)
      ? `Behavior not runtime-probed on modules in scope: ${inferModules(req)}`
      : `End-to-end runtime behavior not executed for ${inferModules(req)}`;
    row.gap = `${row.implementedPart}. Not proven: ${row.missingPart}`;
  } else {
    row.implementedPart = `Governance artifact ${row.primaryEvidence}`;
    row.missingPart = `Product implementation path not linked for ${inferModules(req)}`;
    row.gap = `${row.implementedPart}. Not proven: ${row.missingPart}`;
  }

  row.evidenceScope = evidenceScopeLabel(row, req);
  if (row.rootCauseGroup && SHARED_REMEDIATION[row.rootCauseGroup]) {
    row.recommendedRemediationFront = SHARED_REMEDIATION[row.rootCauseGroup];
  } else if (!row.recommendedRemediationFront) {
    const ch = req.chapter;
    if (/^C18|^C19/.test(row.requirementId)) {
      row.recommendedRemediationFront = 'Validation UX — i18n + error channel matrix across modules';
      row.rootCauseGroup = row.rootCauseGroup || 'VALIDATION-UX-01';
    } else if (ch === '5') {
      row.recommendedRemediationFront = SHARED_REMEDIATION['POSTING-LIFECYCLE-01'];
      row.rootCauseGroup = 'POSTING-LIFECYCLE-01';
    } else if (ch === '22') {
      row.recommendedRemediationFront = 'Audit — wire logGovernedEvent on all workflow actions all modules';
      row.rootCauseGroup = 'AUDIT-COVERAGE-01';
    } else {
      row.recommendedRemediationFront = `Targeted runtime matrix for ${inferModules(req)} — ${row.requirementId}`;
      row.rootCauseGroup = `PARTIAL-${row.requirementId}`;
    }
  }

  if (!row.gap) row.gap = `${row.implementedPart}. Not proven: ${row.missingPart}`;
  return row;
}

module.exports = { enrichPartialRow, evidenceScopeLabel, modulesFromRuntime, isGenericMissing, SHARED_REMEDIATION };
