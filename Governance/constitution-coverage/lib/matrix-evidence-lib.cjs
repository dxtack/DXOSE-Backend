'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const GOV = path.join(ROOT, 'Governance');

const PATHS = {
  requirements: path.join(GOV, 'requirements.json'),
  traceability: path.join(GOV, 'CONSTITUTION_TRACEABILITY_MATRIX.md'),
  v3: path.join(GOV, 'runtime-revalidation/P0_RUNTIME_V3_FINAL.json'),
  gateCKb: path.join(GOV, 'gate-c-remediation/GATE_C_BROWSER_RESULTS.json'),
  feR7: path.join(GOV, 'closeout-runtime-audit/FRONTEND_TEST_ROUND7_RESULTS.json'),
  failedRt: path.join(GOV, 'closeout-runtime-audit/FAILED_RUNTIME_REQUIREMENTS.json'),
  govConflict: path.join(GOV, 'closeout-runtime-audit/GOVERNANCE_CONFLICT_REQUIREMENTS.json'),
  constitution: 'docs/governance/scripts/constitution-base.md',
  displayCurrencyBe: 'OSE-backend/src/platform/displayCurrency.service.js',
  displayCurrencyFePipe: 'OSE-Frontend/src/app/core/pipes/display-currency.pipe.ts',
  displayCurrencyFeSvc: 'OSE-Frontend/src/app/core/services/constitution-platform.service.ts',
  keyboardDirective: 'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
  reportsService: 'OSE-backend/src/services/reports.service.js',
  grnHarness: 'Governance/closeout-runtime-audit/GRN_RUNTIME_MATRIX_FINAL.json',
  errorRegistry: 'OSE-backend/src/platform/errorRegistry.js',
  lookupService: 'OSE-Frontend/src/app/core/services/shared-lookup.service.ts',
  lookupEmpty: 'OSE-Frontend/src/app/shared/components/lookup-empty-state/lookup-empty-state.component.ts',
  uploadMw: 'OSE-backend/src/middleware/upload.middleware.js',
  timelineService: 'OSE-backend/src/platform/documentTimeline.service.js',
  draftGov: 'OSE-backend/src/platform/draftGovernance.service.js',
  accCatalog: 'OSE-backend/src/acc-authority/catalog.constitution.js',
};

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function fileExists(rel) {
  if (!rel || typeof rel !== 'string') return false;
  const clean = rel.split('#')[0].trim();
  return fs.existsSync(path.join(ROOT, clean));
}

function firstExisting(paths) {
  for (const p of paths) {
    if (fileExists(p)) return p;
  }
  return null;
}

/** Semantic allow-list: Scenario ID → Requirement IDs it may evidence (v3 register only) */
const V3_REQ_MAP = {
  'V2-CF-GP-NEVER-SUBMIT': ['C04-4.3-001'],
  'V2-A-NEVER-SUBMIT': ['C04-4.3-001'],
  'V2-A-INACTIVE-SUBMIT': ['C04-4.3-001'],
  'V2-A-DELETED-SUBMIT': ['C04-4.3-001'],
  'V2-A-WRONG-PROP-SUBMIT': ['C04-4.3-001', 'C04-4.4-003'],
  'V2-A-STALE-JWT': ['C04-4.3-001'],
  'V2-A-VALID-SUBMIT': ['C04-4.3-001'],
  'V2-CF-GP-FF-FINANCE': ['C04-4.3-001', 'C03-3.3-001'],
  'V2-CF-GP-FF-ORG': ['C04-4.3-001', 'C03-3.3-001'],
  'V2-CF-GP-XT-READ': ['C04-4.2-002', 'C23-23.6-002'],
  'V2-CF-WP-NEVER-LIST': ['C04-4.3-001'],
  'V2-CF-WP-NEVER-SUMMARY': ['C04-4.3-001'],
  'V2-CF-WP-NEVER-ALERTS': ['C04-4.3-001'],
  'V2-B-NEVER-LIST': ['C04-4.3-001'],
  'V2-B-NEVER-SUMMARY': ['C04-4.3-001'],
  'V2-B-NEVER-ALERTS': ['C04-4.3-001'],
  'V2-B-DASH-NEVER': ['C04-4.3-001'],
  'V2-C-WF-EFFECTIVE': ['C05-5.2-011'],
  'V2-CF-LEG-LOST-DEPT': ['C04-4.3-001'],
  'V2-CF-GRN-RESUBMIT-DEAD': ['C02-2.7-002', 'C03-3.4-009'],
  'V2-D-GRN-RESUBMIT-CALL': ['C02-2.7-002', 'C03-3.4-009'],
  'V3-GRN-RESUBMIT-BROWSER': ['C02-2.7-002', 'C03-3.4-009'],
  'V2-D-GRN-SB': ['C03-3.4-001', 'C03-3.4-002', 'C03-3.4-003', 'C03-3.4-004', 'C03-3.4-005'],
  'V2-D-GRN-SUBMIT-AFTER-SB': ['C02-2.7-001', 'C02-2.7-003'],
  'V2-F-RPT-BRK-APPROVED-OUT': ['C02-2.4.2-001', 'C02-2.3-007'],
  'V2-F-RPT-LOST-LEDGER-OUT': ['C02-2.4.2-001', 'C02-2.3-007'],
  'V2-F-RPT-POSTED-IN': ['C02-2.4.2-001', 'C02-2.3-007'],
  'V2-F-RPT-DRAFT-OUT': ['C02-2.4.2-001'],
  'V3-E-POSTING-BREAKAGE': ['C05-5.2-011', 'C02-2.3-007'],
  'V3-E-POSTING-LOST': ['C05-5.2-011', 'C02-2.3-007'],
  'V3-E-POSTING-REPORT-LINK': ['C02-2.4.2-001', 'C02-2.3-007'],
  'V2-G-WRONG-SCOPE': ['C04-4.3-001', 'C04-4.4-003'],
  'V3-H-REJECT-GETPASS': ['C03-3.4-006', 'C03-3.4-007', 'C03-3.4-008', 'C03-3.4-010'],
  'V3-H-REJECT-IC': ['C03-3.4-006', 'C03-3.4-007', 'C03-3.4-008', 'C03-3.4-010'],
  'V3-H-REJECT-TRANSFER': ['C03-3.4-006', 'C03-3.4-010'],
  'V3-H-REJECT-BREAKAGE': ['C03-3.4-006', 'C03-3.4-010'],
  'V3-H-REJECT-LOST': ['C03-3.4-006', 'C03-3.4-010'],
  'V3-H-SB-GRN': ['C03-3.4-001', 'C03-3.4-002', 'C03-3.4-003', 'C03-3.4-004', 'C03-3.4-005', 'C02-2.7-001', 'C02-2.7-003'],
  'V3-H-SB-TRANSFER': ['C03-3.4-001', 'C03-3.4-002', 'C03-3.4-003', 'C03-3.4-004', 'C03-3.4-005', 'C02-2.7-001', 'C02-2.7-003'],
  'V3-H-SB-BREAKAGE': ['C03-3.4-001', 'C03-3.4-002', 'C03-3.4-003', 'C03-3.4-004', 'C03-3.4-005', 'C02-2.7-001', 'C02-2.7-003'],
  'V3-H-SB-LOST': ['C03-3.4-001', 'C03-3.4-002', 'C03-3.4-003', 'C03-3.4-004', 'C03-3.4-005', 'C02-2.7-001', 'C02-2.7-003'],
  'V3-H-SB-GETPASS': ['C03-3.4-001', 'C03-3.4-002', 'C03-3.4-003', 'C03-3.4-004', 'C03-3.4-005', 'C02-2.7-001', 'C02-2.7-003'],
  'V3-H-SB-IC': ['C03-3.4-001', 'C03-3.4-002', 'C03-3.4-003', 'C03-3.4-004', 'C03-3.4-005', 'C02-2.7-001', 'C02-2.7-003'],
};

const SEND_BACK_PLATFORM_IDS = new Set([
  'C03-3.4-001',
  'C03-3.4-002',
  'C03-3.4-003',
  'C03-3.4-004',
  'C03-3.4-005',
  'C02-2.7-001',
]);

const KEYBOARD_IDS = new Set([
  'C17-17.2-001',
  'C17-17.2-002',
  'C17-17.2-003',
  'C17-17.2-004',
  'C17-17.2-005',
  'C17-17.2-006',
  'C17-17.2-007',
  'C17-17.2-008',
  'C17-17.2-009',
  'C17-17.3-001',
  'C17-17.3-002',
  'C17-17.3-003',
  'C17-17.3-004',
  'C17-17.3-005',
  'C17-17.3-006',
  'C17-17.3-007',
  'C23-23.4-001',
  'C23-23.4-002',
  'C23-23.4-003',
  'C23-23.4-007',
]);

const ARTIFACT_PRESENCE_IDS = new Set([
  'C01-1.2-003',
  'C01-1.2-004',
  'C01-1.2-005',
  'C01-1.2-006',
  'C01-1.2-007',
  'C01-1.2-008',
  'C01-1.2-009',
]);

const DISPLAY_CURRENCY_IDS = new Set([
  'C11-11.3-002',
  'C11-11.3-003',
  'C11-11.3-004',
  'C11-11.3-005',
  'C11-11.3-006',
  'C11-11.3-007',
  'C11-11.3-008',
  'C11-11.3-009',
  'C11-11.3-010',
  'C11-11.3-011',
  'C11-11.4-001',
  'C11-11.4-002',
  'C11-11.4-003',
  'C11-11.4-004',
  'C11-11.4-005',
  'C11-11.4-006',
  'C11-11.6-001',
  'C11-11.6-002',
]);

const DISPLAY_CURRENCY_EVIDENCE = {
  'C11-11.3-002': {
    file: PATHS.displayCurrencyBe,
    detail: 'formatAmount:34-40 — fixed-decimal label only; no FX conversion',
    classification: 'Static Verified — Appropriate',
  },
  'C11-11.3-003': {
    file: PATHS.displayCurrencyFePipe,
    detail: 'DisplayCurrencyPipe:8-10 — transform() calls formatAmount on display string only',
    classification: 'Static Verified — Appropriate',
  },
  'C11-11.3-004': {
    file: PATHS.reportsService,
    detail: 'reports.service.js — ledger queries use stored amounts; displayCurrency relabel is export header only',
    classification: 'Partial',
    gap: 'Ledger immutability under display-currency change not runtime-proven all report types',
  },
  'C11-11.3-005': {
    file: PATHS.reportsService,
    detail: 'Valuation report paths read posted ledger rows; no displayCurrency mutation in query',
    classification: 'Partial',
    gap: 'Valuation channel matrix not fully runtime-verified',
  },
  'C11-11.3-006': {
    file: PATHS.reportsService,
    detail: 'Historical posted documents queried by status=POSTED; display currency is presentation layer',
    classification: 'Partial',
    gap: 'Historical document display across all modules not runtime-proven',
  },
  'C11-11.3-007': {
    file: PATHS.displayCurrencyBe,
    detail: 'formatAmount — no arithmetic beyond fixed decimal formatting',
    classification: 'Static Verified — Appropriate',
  },
  'C11-11.3-008': {
    file: 'OSE-backend/src/services/stock.service.js',
    detail: 'Stock valuation uses quantity×cost; displayCurrency.service not invoked in stock posting',
    classification: 'Partial',
    gap: 'Inventory valuation UI channels not fully probed',
  },
  'C11-11.3-009': {
    file: 'OSE-backend/src/platform/postingEngine.service.js',
    detail: 'Posting engine writes ledger in stored currency; displayCurrency.service separate',
    classification: 'Partial',
    gap: 'All posting families not runtime-verified for display-currency isolation',
  },
  'C11-11.3-010': {
    file: PATHS.displayCurrencyBe,
    detail: 'No taxation logic in displayCurrency.service',
    classification: 'Partial',
    gap: 'Tax calculation modules not exhaustively audited',
  },
  'C11-11.3-011': {
    file: 'OSE-backend/src/platform/postingEngine.service.js',
    detail: 'Accounting transactions persisted before display formatting',
    classification: 'Partial',
    gap: 'Cross-module accounting transaction audit incomplete',
  },
  'C11-11.4-001': {
    file: PATHS.displayCurrencyFeSvc,
    detail: 'ConstitutionPlatformService:55-56 formatAmount used across FE shells',
    classification: 'Partial',
    gap: 'UI consistency not verified on every screen',
  },
  'C11-11.4-002': {
    file: PATHS.reportsService,
    detail: 'Report export relabelCurrencyHeaders uses displayCurrency for column headers',
    classification: 'Partial',
    gap: 'All report types not runtime-verified',
  },
  'C11-11.4-003': {
    file: 'OSE-Frontend/src/app/features/dashboard/dashboard.component.ts',
    detail: 'Dashboard KPI amounts use display formatting patterns',
    classification: 'Partial',
    gap: 'Dashboard widgets not fully audited',
  },
  'C11-11.4-004': {
    file: 'OSE-backend/src/services/report.service.js',
    detail: 'exportEngineGroupedExcel passes displayCurrency to export engine',
    classification: 'Partial',
    gap: 'All export formats not verified',
  },
  'C11-11.4-005': {
    file: 'OSE-backend/src/services/pdf.service.js',
    detail: 'pdf.service.js:359-360 layout.formatMoney uses displayCurrency code',
    classification: 'Partial',
    gap: 'Print/PDF parity not runtime-verified all modules',
  },
  'C11-11.4-006': {
    file: PATHS.reportsService,
    detail: 'Property display currency applied in report export relabel path',
    classification: 'Partial',
    gap: 'PDF channel under Ch11.4.6 not fully probed',
  },
  'C11-11.6-001': {
    file: PATHS.displayCurrencyBe,
    detail: 'setDisplayCurrency:25-31 updates tenantSetting only; no ledger mutation',
    classification: 'Partial',
    gap: 'Historical posted document presentation after currency change not runtime-proven',
  },
  'C11-11.6-002': {
    file: PATHS.displayCurrencyBe,
    detail: 'setDisplayCurrency upserts tenant setting key displayCurrency only',
    classification: 'Static Verified — Appropriate',
  },
};

const V3_CLASS_TO_MATRIX = {
  'Runtime Confirmed Compliant': 'Runtime Verified Complete',
  'Runtime Confirmed Defect': 'Failed Runtime',
  'Governance Conflict': 'Governance Conflict',
  'Configuration Drift': 'Configuration Drift',
  'Operational Legacy': 'Operational Legacy',
  'Static Dead Code': 'Static Dead Code',
};

const CLASS_RANK = {
  'Failed Runtime': 10,
  'Governance Conflict': 9,
  'Configuration Drift': 9,
  'Operational Legacy': 9,
  'Static Dead Code': 8,
  Partial: 5,
  'Runtime Verified Complete': 4,
  'Static Verified — Appropriate': 3,
  'Not Applicable by Explicit Approved Decision': 2,
  'Blocked by Verified Environment Limitation': 2,
};

function stronger(a, b) {
  return (CLASS_RANK[a] || 0) >= (CLASS_RANK[b] || 0) ? a : b;
}

function isValidEvidencePath(f) {
  if (!f || f === 'OSE-Frontend' || f === 'OSE-backend' || f === 'Governance') return false;
  if (!f.includes('/')) return false;
  return fileExists(f);
}

function parseTraceability(content) {
  const map = {};
  for (const line of content.split('\n')) {
    if (!line.startsWith('| C')) continue;
    const cols = line.split('|').map((c) => c.trim());
    const id = cols[1];
    if (!id || !/^C\d/.test(id)) continue;
    const evidence = cols[12] || '';
    const verification = cols[13] || '';
    const implemented = cols[8] || '';
    const files = [...evidence.matchAll(/File: ([^\\|;]+)/g)]
      .map((m) => m[1].trim())
      .filter(isValidEvidencePath);
    const methods = [...evidence.matchAll(/Method: ([^\\|;]+)/g)].map((m) => m[1].trim());
    map[id] = {
      evidence,
      verification,
      implemented,
      files,
      methods,
      primaryFile: files[0] || null,
      detail: methods[0] ? `Method: ${methods[0]}` : evidence.slice(0, 120),
    };
  }
  return map;
}

function isPlatformWide(req) {
  const s = `${req.requirement} ${req.scope || ''}`.toLowerCase();
  if (/every module|all modules|across all|platform-wide|all dx ose|every document|each module shall|consistent across|unified|all user interfaces|all operational modules/.test(s))
    return true;
  if (req.scope === 'Platform-wide') return true;
  return false;
}

function inferModules(req) {
  const t = `${req.requirement} ${req.scope || ''}`.toLowerCase();
  const mods = [];
  if (/platform|governance|constitution|keyboard|lookup|validation|error|notification|loading|accessibility|print|export|layout|timeline|currency|attachment|period|desktop|responsive|zoom|browser/.test(t))
    mods.push('Platform');
  if (/grn|goods receipt/.test(t)) mods.push('GRN');
  if (/transfer/.test(t)) mods.push('Transfer');
  if (/inventory count|stock count/.test(t)) mods.push('Inventory Count');
  if (/get pass/.test(t)) mods.push('Get Pass');
  if (/breakage|lost/.test(t)) mods.push('Breakage/Lost');
  if (/movement/.test(t)) mods.push('Movements');
  if (/report/.test(t)) mods.push('Reports');
  if (/workflow|approve|submit|reject|send back|permission|assignment|tenant/.test(t)) mods.push('Workflow');
  if (mods.length === 0) mods.push('Platform');
  return [...new Set(mods)].join(', ');
}

function needsRuntimeEvidence(req) {
  if (typeof req === 'string') {
    if (ARTIFACT_PRESENCE_IDS.has(req)) return false;
    req = { requirement: '' };
  }
  if (req.requirementId && ARTIFACT_PRESENCE_IDS.has(req.requirementId)) return false;
  const t = req.requirement.toLowerCase();
  if (/shall maintain|must maintain|official governance library|artifact present|policy document|definition recorded/.test(t))
    return false;
  return /shall not|must not|shall always|must always|workflow|submit|approve|reject|send back|posting|ledger|stock|permission|assignment|tenant|keyboard|lookup|validation|error handling|notification|loading|double submission|report.*derive|timeline|editable|read-only|scope|isolation|concurrency|audit record/.test(
    t,
  );
}

function isArtifactPresenceRequirement(id) {
  return ARTIFACT_PRESENCE_IDS.has(id);
}

function buildV3Index(v3) {
  const byId = {};
  for (const s of v3.scenarios) byId[s.id] = s;
  return byId;
}

function invertV3Map() {
  const inv = {};
  for (const [sid, ids] of Object.entries(V3_REQ_MAP)) {
    for (const rid of ids) {
      if (!inv[rid]) inv[rid] = [];
      inv[rid].push(sid);
    }
  }
  return inv;
}

module.exports = {
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
  CLASS_RANK,
  stronger,
  parseTraceability,
  isPlatformWide,
  inferModules,
  needsRuntimeEvidence,
  isArtifactPresenceRequirement,
  ARTIFACT_PRESENCE_IDS,
  buildV3Index,
  invertV3Map,
};
