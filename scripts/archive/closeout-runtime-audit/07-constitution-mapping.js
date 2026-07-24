'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const MATRIX_PATH = path.resolve(__dirname, '../../governance-evidence-archive/CONSTITUTION_TRACEABILITY_MATRIX.md');

const SCENARIO_LINKS = [
  { scenarioIds: ['GP-submit-NO_ASSIGN-disposable', 'NO_ASSIGN_SUBMIT'], requirementIdPatterns: [/permission/i, /assignment/i, /get.?pass/i, /scope/i] },
  { scenarioIds: ['GET_PASS_WORKFLOW_ROLLOUT'], requirementIdPatterns: [/workflow/i, /get.?pass/i, /approv/i] },
  { scenarioIds: ['LEGACY_LOST_APPROVE_DEPT'], requirementIdPatterns: [/lost/i, /legacy/i, /breakage/i] },
  { scenarioIds: ['CROSS_TENANT_GP_500'], requirementIdPatterns: [/tenant/i, /isolation/i, /security/i] },
  { scenarioIds: ['GRN-E2E'], requirementIdPatterns: [/grn/i, /receiv/i] },
  { scenarioIds: ['TRANSFER-E2E'], requirementIdPatterns: [/transfer/i] },
  { scenarioIds: ['IC-E2E'], requirementIdPatterns: [/inventory count/i, /stock count/i] },
];

function parseMatrixRows(content) {
  return content
    .split('\n')
    .filter((l) => l.startsWith('| C'))
    .map((line) => {
      const cols = line.split('|').map((c) => c.trim());
      return { id: cols[1], requirement: cols[4] || cols[3], scope: cols[6], modules: cols[7], implemented: cols[8], evidence: cols[12] || '' };
    });
}

function classifyType(row) {
  const s = `${row.scope} ${row.modules} ${row.requirement}`.toLowerCase();
  if (row.scope === 'Platform' || row.modules === 'Governance') return 'Documentation';
  if (/timeline|ux|screen|view|display|label|i18n/.test(s)) return 'UI/UX';
  if (/permission|role|access|security|tenant|scope|assignment/.test(s)) return 'Permission/security';
  if (/report|export|pdf/.test(s)) return 'Reporting';
  if (/ledger|stock|posting|integrity|reconcil/.test(s)) return 'Data integrity';
  if (/workflow|approve|reject|submit|status/.test(s)) return 'Runtime workflow';
  return 'Static architecture';
}

function loadEvidence() {
  const links = [];
  const failed = new Set();
  const verified = new Map();

  if (fs.existsSync(path.join(REPORT_DIR, 'NO_ASSIGN_CROSS_MODULE_MATRIX.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'NO_ASSIGN_CROSS_MODULE_MATRIX.json'), 'utf8'));
    if (d.summary?.failWithMutation > 0) failed.add('NO_ASSIGN_SUBMIT');
    links.push({ requirementIds: [], scenarioId: 'NO_ASSIGN_CROSS_MODULE', status: 'Partial', evidence: d.summary });
  }
  if (fs.existsSync(path.join(REPORT_DIR, 'GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json'))) {
    links.push({ requirementIds: [], scenarioId: 'GET_PASS_WORKFLOW_ROLLOUT', status: 'Governance Conflict', evidence: { drift: true } });
  }
  if (fs.existsSync(path.join(REPORT_DIR, 'LEGACY_ROUTE_CLASSIFICATION.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'LEGACY_ROUTE_CLASSIFICATION.json'), 'utf8'));
    if (d.summary?.activeOperationalLegacy > 0) failed.add('LEGACY_LOST_APPROVE_DEPT');
    links.push({ requirementIds: [], scenarioId: 'LEGACY_ROUTE', status: 'Partial', evidence: d.summary });
  }
  if (fs.existsSync(path.join(REPORT_DIR, 'GET_PASS_CROSS_TENANT_ACTION_MATRIX.json'))) {
    links.push({ requirementIds: [], scenarioId: 'CROSS_TENANT_GP_500', status: 'Failed Runtime', evidence: 'HTTP 500 on foreign ID' });
  }

  for (const h of fs.readdirSync(REPORT_DIR).filter((f) => f.endsWith('_HARNESS.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, h), 'utf8'));
    for (const s of data.scenarios || []) {
      if (s.result === 'PASS') verified.set(s.id, h);
      if (s.result === 'FAIL') failed.add(s.id);
    }
  }
  return { links, failed, verified };
}

function matchRequirement(row, type, evidence) {
  if (row.evidence.includes('Verification: Failed')) return 'Governance Conflict';
  const t = classifyType(row);
  const text = `${row.requirement} ${row.modules}`.toLowerCase();

  if (t === 'Documentation' || (t === 'Static architecture' && row.implemented === 'Yes'))
    return 'Static Verified — appropriate for static requirement';
  if (t === 'UI/UX' || t === 'Reporting') return 'Not Run';

  if (evidence.failed.has('NO_ASSIGN_SUBMIT') && /get.?pass/.test(text) && /permission|assignment|submit/.test(text))
    return 'Failed Runtime';
  if (/get.?pass/.test(text) && /workflow|gm|approv/.test(text) && evidence.links.some((l) => l.scenarioId === 'GET_PASS_WORKFLOW_ROLLOUT'))
    return 'Governance Conflict';
  if (/lost/.test(text) && /legacy|approv/.test(text) && evidence.failed.has('LEGACY_LOST_APPROVE_DEPT'))
    return 'Partial';

  if (['Runtime workflow', 'Permission/security', 'Data integrity'].includes(t)) {
    const hasPass = [...evidence.verified.keys()].some((id) => {
      if (/grn/i.test(text) && id.startsWith('GRN')) return true;
      if (/transfer/i.test(text) && id.startsWith('TR')) return true;
      if (/inventory count|stock count/i.test(text) && id.startsWith('IC')) return true;
      if (/get.?pass/i.test(text) && id.startsWith('GP')) return true;
      return false;
    });
    if (hasPass && /single module only/.test(text)) return 'Partial';
    if (hasPass) return 'Partial';
    return 'Not Run';
  }
  return 'Static Verified — appropriate for static requirement';
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const rows = parseMatrixRows(fs.readFileSync(MATRIX_PATH, 'utf8'));
  const evidence = loadEvidence();
  const statusCounts = {
    'Runtime Verified Complete': 0,
    'Static Verified — appropriate for static requirement': 0,
    Partial: 0,
    'Not Run': 0,
    'Failed Runtime': 0,
    'Governance Conflict': 0,
    'Not Applicable': 0,
  };
  const requirementLinks = [];

  for (const row of rows) {
    const final = matchRequirement(row, classifyType(row), evidence);
    statusCounts[final] = (statusCounts[final] || 0) + 1;
    const linkedScenarios = [...evidence.verified.entries()]
      .filter(([id]) => {
        const mod = row.modules?.toLowerCase() || '';
        if (mod.includes('grn') && id.startsWith('GRN')) return true;
        if (mod.includes('transfer') && id.startsWith('TR')) return true;
        if (/inventory count/i.test(mod) && id.startsWith('IC')) return true;
        if (/get pass/i.test(mod) && id.startsWith('GP')) return true;
        return false;
      })
      .map(([id, harness]) => ({ scenarioId: id, harness }));
    requirementLinks.push({ requirementId: row.id, requirement: row.requirement, finalStatus: final, linkedScenarios, requirementIds: linkedScenarios.map((s) => s.scenarioId) });
  }

  fs.writeFileSync(path.join(REPORT_DIR, 'CONSTITUTION_REQUIREMENT_TEST_LINKS.json'), JSON.stringify({ executedAt: new Date().toISOString(), scenarioCatalog: SCENARIO_LINKS, requirementLinks }, null, 2));
  const total = rows.length;
  const sum = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  fs.writeFileSync(path.join(REPORT_DIR, 'CONSTITUTION_STATUS_COUNTS.json'), JSON.stringify({ total, sum, statusCounts, generatorNote: 'Runtime Verified Complete requires multi-module proof per requirement — most remain Partial until full linkage' }, null, 2));
  console.log('Wrote CONSTITUTION_REQUIREMENT_TEST_LINKS.json', total, 'requirements');
  if (sum !== total) { console.error('sum mismatch', sum, total); process.exit(1); }
}

main();
