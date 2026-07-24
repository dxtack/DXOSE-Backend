'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const FE_ROOT = path.resolve(__dirname, '../../../OSE-Frontend/src');
const OUT = path.join(REPORT_DIR, 'FRONTEND_LEGACY_DEPENDENCY_MATRIX.json');

const LEGACY_PATTERNS = [
  { pattern: /approve-dept/g, endpoint: '/approve-dept' },
  { pattern: /approve-cost/g, endpoint: '/approve-cost' },
  { pattern: /approve-finance/g, endpoint: '/approve-finance' },
  { pattern: /approve-gm/g, endpoint: '/approve-gm' },
  { pattern: /approveAtCurrentStep/g, endpoint: 'approveAtCurrentStep (routes to legacy ladder)' },
  { pattern: /approveDept\(/g, endpoint: 'service.approveDept' },
  { pattern: /approveCost\(/g, endpoint: 'service.approveCost' },
  { pattern: /approveFinance\(/g, endpoint: 'service.approveFinance' },
  { pattern: /approveGm\(/g, endpoint: 'service.approveGm' },
];

const SCREEN_MAP = {
  'breakage-list': { screen: 'Breakage list', route: '/breakage' },
  'breakage-detail': { screen: 'Breakage detail', route: '/breakage/:id' },
  'lost-items-list': { screen: 'Lost items list', route: '/lost-items' },
  'lost-items-detail': { screen: 'Lost items detail', route: '/lost-items/:id' },
  'returns-workflow-approve-modal': { screen: 'Shared approve modal', route: 'modal' },
};

function walkTs(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, acc);
    else if (/\.(ts|html)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function inferScreen(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  for (const [key, meta] of Object.entries(SCREEN_MAP)) {
    if (filePath.includes(key)) return meta;
  }
  if (filePath.includes('breakage')) return { screen: 'Breakage module', route: '/breakage' };
  if (filePath.includes('lost-items')) return { screen: 'Lost items module', route: '/lost-items' };
  return { screen: base, route: 'unknown' };
}

function modernAlternative(filePath) {
  if (/breakage|lost-items/.test(filePath)) return 'POST /breakage/:id/approve or /lost-items/:id/approve (ACC ApprovalRequest chain)';
  return null;
}

function main() {
  const rows = [];
  for (const file of walkTs(FE_ROOT)) {
    const rel = path.relative(FE_ROOT, file).replace(/\\/g, '/');
    if (!/breakage|lost-items|returns-workflow/.test(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const lp of LEGACY_PATTERNS) {
      if (!lp.pattern.test(text)) continue;
      lp.pattern.lastIndex = 0;
      const fnMatches = [...text.matchAll(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{/g)].map((m) => m[1]);
      const screen = inferScreen(rel);
      const isComponent = rel.endsWith('.component.ts');
      const isService = rel.includes('/services/');
      rows.push({
        frontendFile: `OSE-Frontend/src/${rel}`,
        function: isService ? 'service methods + approveAtCurrentStep ladder' : fnMatches.slice(0, 3).join(', ') || 'template handler',
        activeScreen: screen.screen,
        userAction: isComponent ? 'Approve / workflow action from list or detail' : 'HTTP wrapper',
        endpoint: lp.endpoint,
        runtimeCalled: isComponent ? 'Yes when user clicks Approve on INTERNAL doc without ApprovalRequest' : 'Indirect via component',
        modernAlternative: modernAlternative(rel),
        classification: isComponent && !rel.includes('spec') ? 'Frontend-Dependent Operational Legacy' : 'Legacy service surface',
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const r of rows) {
    const k = `${r.frontendFile}|${r.endpoint}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }

  const out = {
    executedAt: new Date().toISOString(),
    method: 'Static search OSE-Frontend breakage/lost-items + returns-workflow-approve-modal',
    activeScreensCallingLegacy: deduped.filter((r) => r.classification === 'Frontend-Dependent Operational Legacy'),
    allRows: deduped,
    summary: {
      totalRows: deduped.length,
      frontendDependentOperationalLegacy: deduped.filter((r) => r.classification === 'Frontend-Dependent Operational Legacy').length,
      keyFinding:
        'breakage-list, breakage-detail, lost-items-list, lost-items-detail call approveAtCurrentStep which routes INTERNAL DRAFT→approve-dept ladder without ACC pin',
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote FRONTEND_LEGACY_DEPENDENCY_MATRIX.json', deduped.length, 'rows');
}

main();
