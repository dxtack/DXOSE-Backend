#!/usr/bin/env node
'use strict';

/**
 * Wave 0 — Reporting Workspace inventory / audit matrix (read-only codegen).
 * No business logic changes. Regenerates docs/governance/REPORTING_WAVE0_INVENTORY.*
 *
 * Usage: node scripts/build-reporting-wave0-inventory.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const repoRoot = path.join(root, '..');
const manifestPath = path.join(
  repoRoot,
  'OSE-Frontend/src/app/features/reports/reporting-workspace/reporting-workspace.manifest.ts',
);
const enPath = path.join(repoRoot, 'OSE-Frontend/public/i18n/en.json');
const registryPath = path.join(
  repoRoot,
  'OSE-Frontend/src/app/features/reports/reporting-workspace/reporting-workspace.registry.ts',
);

const { getReportColumns, resolveContractId } = require('../src/services/report-column-contracts');
const {
  resolveFamily,
  getGroupingSpec,
  isGovernanceAuditLogProxy,
  GOVERNANCE_AUDIT_LOG_PROXY_CARDS,
} = require('../src/services/report-family-registry');

// FE planned card logic (mirrors report-family.registry.ts)
const FE_GOV_PROXY = new Set([
  'audit-activity-report',
  'user-operational-activity',
  'approval-activity-report',
  'workflow-violations',
  'unauthorized-actions-review',
  'manual-override-tracking',
  'operational-exceptions-report',
  'audit-reconstruction-report',
  'operational-accountability-report',
  'reviewer-activity-report-gov',
  'governance-exceptions',
  'workflow-exceptions',
  'workflow-bottlenecks',
]);
const FE_GOV_LIVE = new Set([
  'audit-activity-report',
  'user-operational-activity',
  'approval-activity-report',
  'workflow-violations',
]);

function feIsPlanned(cardId) {
  if (FE_GOV_LIVE.has(cardId)) return false;
  return FE_GOV_PROXY.has(cardId);
}

const LEGACY_ONLY_TYPES = new Set([
  'negative-stock-report',
  'slow-moving-items',
  'dead-stock',
  'zero-movement-items',
  'high-consumption-items',
  'stock-movement-analysis',
  'stock-adjustment-summary',
]);

const COUNT_STATUS_BY_CARD = {
  'pending-approval-sessions': 'PENDING_APPROVAL',
  'rejected-count-sessions': 'REJECTED',
  'count-posting-summary': 'POSTED',
  'count-exceptions': 'REJECTED',
  'count-accuracy-pct': 'POSTED',
  'missing-approval-detection': 'PENDING_APPROVAL',
  'rejected-transactions': 'REJECTED',
  'evidence-completeness-report': 'POSTED',
  'pending-review-queue': 'PENDING_APPROVAL',
  'reviewer-action-queue': 'REVEAL_REVIEW',
  'high-risk-sessions': 'REVEAL_REVIEW',
  'critical-variance-review': 'REVEAL_REVIEW',
  'escalated-operational-issues': 'REVEAL_REVIEW',
  'reviewer-sla-tracking': 'PENDING_APPROVAL',
};

/** Parsed from reporting-workspace.manifest.ts (formatting-tolerant). */
function parseManifestDomains(ts) {
  const anchor = ts.indexOf('REPORTING_WORKSPACE_DOMAINS');
  const slice = anchor >= 0 ? ts.slice(anchor) : ts;
  const domains = [];
  const domainRe =
    /id:\s*'([^']+)'[\s\S]*?titleKey:\s*'([^']+)'([\s\S]*?)subgroups:\s*\[([\s\S]*?)\]\s*,?\s*\n\s*\}/g;
  let dm;
  while ((dm = domainRe.exec(slice)) !== null) {
    const [, domainId, domainTitleKey, domainBody, subgroupsBody] = dm;
    const isPackDomain = /isPackDomain:\s*true/.test(domainBody);
    const subgroups = [];
    const sgRe = /subgroup\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\[([\s\S]*?)\]\s*\)/g;
    let sm;
    while ((sm = sgRe.exec(subgroupsBody)) !== null) {
      const [, sgId, sgTitleSuffix, cardsBody] = sm;
      const cards = [];
      const cardRe = /id:\s*'([^']+)'(?:[^}]*?kind:\s*'([^']+)')?/g;
      let c;
      while ((c = cardRe.exec(cardsBody)) !== null) {
        cards.push({ id: c[1], kind: c[2] || 'report' });
      }
      subgroups.push({
        id: sgId,
        titleKey: `REPORTS.WORKSPACE.SG.${sgTitleSuffix}`,
        cards,
      });
    }
    domains.push({ id: domainId, titleKey: domainTitleKey, isPackDomain, subgroups });
  }
  return domains;
}

/** Parse ENGINE_CARD_ROUTES from registry.ts */
function parseEngineRoutes(ts) {
  const routes = {};
  const re = /'([^']+)':\s*\{\s*route:\s*'([^']+)'(?:,\s*filterMode:\s*'([^']+)')?/g;
  let m;
  while ((m = re.exec(ts)) !== null) {
    routes[m[1]] = { route: m[2], filterMode: m[3] || 'period' };
  }
  return routes;
}

function parsePackIds(ts) {
  const ids = new Set();
  const block = ts.match(/PACK_CARD_IDS = new Set[^[]*\[([\s\S]*?)\]/)?.[1] || '';
  const re = /'([^']+)'/g;
  let m;
  while ((m = re.exec(block)) !== null) ids.add(m[1]);
  return ids;
}

function resolveHandlerName(cardId) {
  const direct = {
    'current-stock-balance': 'stockBalanceRows(includeZero)',
    'inventory-by-location': 'stockBalanceRows',
    'count-variance-report': 'runCountVarianceReport',
    'variance-by-location': 'runCountVarianceReport(grouped)',
    'variance-by-department': 'runCountVarianceReport(grouped)',
    'variance-by-category': 'runCountVarianceReport(grouped)',
    'variance-by-counter': 'runCountVarianceReport(grouped)',
    'variance-value-impact': 'runCountVarianceReport',
    'top-variance-items': 'runCountVarianceReport(top100)',
    'count-sessions-history': 'countSessionRows',
    'count-approval-history': 'countApprovalHistoryRows',
    'open-count-sessions': 'countSessionRows(DRAFT)',
    'blind-count-review': 'countSessionRows(proxy)',
    'multi-location-count-review': 'countSessionRows(proxy)',
    'recount-analysis': 'countSessionRows(proxy)',
    'cycle-count-performance': 'countSessionRows(proxy)',
    'count-timeline-report': 'countSessionRows(proxy)',
    'unexpected-found-items': 'countSessionRows(proxy)',
    'missing-items-report': 'countSessionRows(proxy)',
    'reviewer-workload': 'countSessionRows(proxy)',
    'operational-follow-up-tracker': 'countSessionRows(proxy)',
    'audit-activity-report': 'auditLogRows',
    'user-operational-activity': 'auditLogRows',
    'approval-activity-report': 'auditLogRows',
    'workflow-violations': 'auditLogRows',
    'unauthorized-actions-review': 'auditLogRows',
    'manual-override-tracking': 'auditLogRows',
    'operational-exceptions-report': 'auditLogRows',
    'audit-reconstruction-report': 'auditLogRows',
    'operational-accountability-report': 'auditLogRows',
    'reviewer-activity-report-gov': 'auditLogRows',
    'governance-exceptions': 'auditLogRows',
    'workflow-exceptions': 'auditLogRows',
    'workflow-bottlenecks': 'auditLogRows',
    'posting-activity-report': 'ledgerRows',
    'adjustment-history': 'ledgerRows',
    'inventory-change-history': 'ledgerRows',
    'workflow-completion-analysis': 'ledgerRows',
    'workflow-timeline-report': 'ledgerRows',
    'stock-adjustment-summary': 'ledgerRows(ADJUSTMENT)+legacy',
    'open-transfers': 'transferRows(openOnly)',
    'transfer-delays': 'transferRows(openOnly)',
    'open-workflow-attention': 'transferRows(openOnly)',
    'transfer-aging': 'transferRows',
    'operational-delays': 'transferRows(openOnly)',
    'overdue-returns': 'getPassRows(overdue)',
    'get-pass-activity': 'getPassRows',
    'open-get-passes': 'getPassRows',
    'temporary-movement-report': 'getPassRows',
    'returned-vs-outstanding-assets': 'getPassRows',
    'lost-items-register': 'lostItemsRows',
    'breakage-workflow': 'ledgerRows(BREAKAGE)',
    'period-close-validation': 'periodCloseRows',
    'posting-integrity-check': 'periodCloseRows',
    'pending-operational-actions': 'pendingOperationsRows',
    'daily-operational-review': 'pendingOperationsRows',
    'operational-attention-report': 'pendingOperationsRows',
    'negative-stock-report': 'runLegacyAnalytics',
    'slow-moving-items': 'runLegacyAnalytics',
    'dead-stock': 'runLegacyAnalytics',
    'zero-movement-items': 'runLegacyAnalytics',
    'high-consumption-items': 'runLegacyAnalytics',
    'stock-movement-analysis': 'runLegacyAnalytics+ledgerRows(handler)',
    'critical-stock-levels': 'runLegacyAnalytics',
  };

  if (direct[cardId]) return direct[cardId];
  if (COUNT_STATUS_BY_CARD[cardId]) {
    return `countSessionRows(status=${COUNT_STATUS_BY_CARD[cardId]})`;
  }
  if (ENGINE_ROUTES[cardId]) {
    const rt = ENGINE_ROUTES[cardId].route;
    if (rt === '/reports/summary') return 'report.service.generateReport(SUMMARY)';
    if (rt === '/reports/detail') return 'report.service.generateReport(DETAIL)';
    if (rt === '/reports/valuation') return 'valuation-report.component+report.service';
    if (rt === '/reports/omc') return 'report.service.generateReport(OMC)';
    if (rt === '/reports/breakage') return 'report.service.generateReport(BREAKAGE)';
    if (rt === '/reports/transfers') return 'report.service.generateReport(TRANSFERS)';
    if (rt === '/reports/aging') return 'report.service.generateReport(AGING)';
  }
  return 'NOT_IMPLEMENTED';
}

function resolveRenderPath(cardId, kind, route) {
  if (kind === 'pack' || PACK_IDS.has(cardId)) {
    return 'FE: reporting-pack.component (link hub only)';
  }
  if (ENGINE_ROUTES[cardId]) {
    const r = ENGINE_ROUTES[cardId].route;
    if (r === '/reports/summary') return 'FE: summary-inventory-report.component';
    if (r === '/reports/valuation') return 'FE: valuation-report.component';
    return 'FE: report-engine.component';
  }
  const family = resolveFamily(cardId);
  if (family.dedicatedView) {
    if (family.familyId === 'count-variance') return 'FE: analytics-report + count-variance-grouped-view';
    if (family.familyId === 'stock-balance') return 'FE: analytics-report + stock-balance-table';
    if (family.familyId === 'ledger') return 'FE: analytics-report + grouped-table (ledger)';
    if (family.familyId === 'transfers') return 'FE: analytics-report + grouped-table (transfers)';
    if (family.familyId === 'governance') return 'FE: analytics-report + grouped-table (governance)';
    if (family.familyId === 'breakage') return 'FE: report-engine (breakage) — engine shell';
    if (family.familyId === 'omc') return 'FE: report-engine (omc) — engine shell';
  }
  return 'FE: analytics-report.component (generic table)';
}

function resolvePdfPath(cardId, kind, route) {
  if (kind === 'pack' || PACK_IDS.has(cardId)) return 'N/A (pack — no bundle PDF)';
  if (ENGINE_ROUTES[cardId]) {
    return 'pdf.service.generateReportPDF via report.service.exportPdf (saved engine report)';
  }
  return 'pdf.service.generateReportPDF via report-analytics.exportAnalyticsPdf';
}

function resolveContractStatus(cardId) {
  const cols = getReportColumns(cardId);
  if (cols?.length) {
    const cid = resolveContractId(cardId);
    return cid === cardId ? 'explicit' : `alias→${cid}`;
  }
  if (ENGINE_ROUTES[cardId]) return 'engine-columns(report.service)';
  return 'dynamic (row keys)';
}

function resolveWorkspaceStatus(cardId, kind, planned) {
  if (planned) return 'planned';
  if (kind === 'pack' || PACK_IDS.has(cardId)) return 'pack';
  if (ENGINE_ROUTES[cardId]) {
    const targets = Object.entries(ENGINE_ROUTES).filter(([, v]) => v.route === ENGINE_ROUTES[cardId].route);
    if (targets.length > 1) return `live-engine-alias→${ENGINE_ROUTES[cardId].route}`;
    return 'live-engine';
  }
  if (isGovernanceAuditLogProxy(cardId) && !FE_GOV_LIVE.has(cardId)) return 'live-proxy-audit-log';
  if (feIsPlanned(cardId)) return 'planned-ui-only';
  const handler = resolveHandlerName(cardId);
  if (handler === 'NOT_IMPLEMENTED') return 'live-no-handler';
  if (handler.includes('proxy')) return 'live-title-mismatch';
  if (LEGACY_ONLY_TYPES.has(cardId) || cardId === 'critical-stock-levels') return 'live-legacy-analytics';
  return 'live-analytics';
}

function buildRiskNotes(row) {
  const risks = [];
  if (row.workspaceStatus.startsWith('planned')) risks.push('UI blocked (roadmap)');
  if (row.workspaceStatus === 'live-no-handler') risks.push('Empty analytics if opened via direct URL');
  if (row.workspaceStatus.includes('alias')) risks.push('Multiple cards → same screen');
  if (row.workspaceStatus === 'live-title-mismatch') risks.push('Card title ≠ dataset (session list proxy)');
  if (row.workspaceStatus === 'live-proxy-audit-log') risks.push('Governance proxy: audit log columns only');
  if (row.columnContract === 'dynamic (row keys)') risks.push('PDF/Excel dynamic headers; weak SAR alignment');
  if (row.columnContract?.startsWith('alias')) risks.push('Shares column contract with sibling card');
  if (row.pdfExportPath?.includes('generateReportPDF') && !row.pdfGrouping) {
    risks.push('Flat PDF table; no group subtotals');
  }
  if (row.handlerName?.includes('runCountVarianceReport(grouped)') && row.cardId === 'variance-by-department') {
    risks.push('Group key uses category field for department card');
  }
  if (row.cardId === 'stock-adjustment-summary') risks.push('Dual path: handler ledger + legacy movement docs');
  if (row.cardId === 'stock-movement-analysis') risks.push('Dual path: legacy analytics + handler alias to ledger contract');
  if (row.kind === 'pack') risks.push('No single audit PDF deliverable');
  if (row.reportFamily === 'generic' && row.workspaceStatus.startsWith('live')) {
    risks.push('Generic family — no KPI strip');
  }
  return risks.length ? risks.join('; ') : '—';
}

const manifestTs = fs.readFileSync(manifestPath, 'utf8');
const registryTs = fs.readFileSync(registryPath, 'utf8');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

const ENGINE_ROUTES = parseEngineRoutes(registryTs);
const PACK_IDS = parsePackIds(registryTs);
const domains = parseManifestDomains(manifestTs);

const domainLabels = en.REPORTS?.WORKSPACE?.DOMAINS || {};
const cardLabels = en.REPORTS?.WORKSPACE?.C || {};
const sgLabels = en.REPORTS?.WORKSPACE?.SG || {};

const rows = [];
for (const domain of domains) {
  const domainLabel = domainLabels[domain.id.replace(/-/g, '_').toUpperCase()] || domain.id;
  for (const sg of domain.subgroups) {
    const sgKey = sg.titleKey.replace('REPORTS.WORKSPACE.SG.', '');
    const subgroupLabel = sgLabels[sgKey] || sg.id;
    for (const card of sg.cards) {
      const planned = feIsPlanned(card.id);
      const titleKey = `REPORTS.WORKSPACE.C.${card.id.replace(/-/g, '_').toUpperCase()}`;
      const title = cardLabels[card.id.replace(/-/g, '_').toUpperCase()] || card.id;
      let route = '';
      let filterMode = 'period';
      if (planned) {
        route = '(disabled)';
      } else if (PACK_IDS.has(card.id) || card.kind === 'pack') {
        route = `/reports/pack/${card.id}`;
      } else if (ENGINE_ROUTES[card.id]) {
        route = ENGINE_ROUTES[card.id].route;
        filterMode = ENGINE_ROUTES[card.id].filterMode || 'period';
      } else {
        route = `/reports/analytics/${card.id}`;
        if (card.id === 'current-stock-balance') filterMode = 'snapshot';
      }

      const family = resolveFamily(card.id);
      const grouping = Boolean(getGroupingSpec(card.id)?.levels?.length);

      const row = {
        cardId: card.id,
        reportTitle: title,
        domain: domainLabel,
        subgroup: subgroupLabel,
        route,
        filterMode,
        kind: card.kind,
        renderPath: resolveRenderPath(card.id, card.kind, route),
        handlerName: resolveHandlerName(card.id),
        columnContract: resolveContractStatus(card.id),
        pdfExportPath: resolvePdfPath(card.id, card.kind, route),
        workspaceStatus: resolveWorkspaceStatus(card.id, card.kind, planned),
        reportFamily: family.familyId,
        dedicatedView: family.dedicatedView,
        pdfGrouping: grouping,
        titleKey,
      };
      row.riskNotes = buildRiskNotes(row);
      rows.push(row);
    }
  }
}

// Summary stats
const stats = {
  totalCards: rows.length,
  planned: rows.filter((r) => r.workspaceStatus.includes('planned')).length,
  pack: rows.filter((r) => r.workspaceStatus === 'pack').length,
  engineAlias: rows.filter((r) => r.workspaceStatus.includes('alias')).length,
  noHandler: rows.filter((r) => r.workspaceStatus === 'live-no-handler').length,
  titleMismatch: rows.filter((r) => r.workspaceStatus === 'live-title-mismatch').length,
  dynamicContract: rows.filter((r) => r.columnContract === 'dynamic (row keys)').length,
  explicitContract: rows.filter((r) => r.columnContract === 'explicit' || r.columnContract.startsWith('alias')).length,
};

const outDir = path.join(repoRoot, 'docs/governance');
fs.mkdirSync(outDir, { recursive: true });

const jsonPath = path.join(outDir, 'REPORTING_WAVE0_INVENTORY.json');
fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), stats, rows }, null, 2));

function mdEscape(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

let md = `# Reporting Workspace — Wave 0 Inventory\n\n`;
md += `Generated: ${new Date().toISOString().slice(0, 10)} (script: \`OSE-backend/scripts/build-reporting-wave0-inventory.js\`)\n\n`;
md += `> Read-only audit. No business logic or report data changes.\n\n`;
md += `## Summary\n\n`;
md += `| Metric | Count |\n|--------|------:|\n`;
for (const [k, v] of Object.entries(stats)) {
  md += `| ${k} | ${v} |\n`;
}
md += `\n## Full inventory\n\n`;
md += `| cardId | Title | Domain | Subgroup | Route | Render path | Handler | Contract | PDF path | Status | Risks |\n`;
md += `|--------|-------|--------|----------|-------|-------------|---------|----------|----------|--------|-------|\n`;
for (const r of rows) {
  md += `| ${r.cardId} | ${mdEscape(r.reportTitle)} | ${mdEscape(r.domain)} | ${mdEscape(r.subgroup)} | ${mdEscape(r.route)} | ${mdEscape(r.renderPath)} | ${mdEscape(r.handlerName)} | ${mdEscape(r.columnContract)} | ${mdEscape(r.pdfExportPath)} | ${r.workspaceStatus} | ${mdEscape(r.riskNotes)} |\n`;
}

const mdPath = path.join(outDir, 'REPORTING_WAVE0_INVENTORY.md');
fs.writeFileSync(mdPath, md);

// Wave 1 scope recommendation (static template + stats-driven)
const wave1Scope = {
  pdfFacade: [
    'Unify generateReportPDF header/footer with report-pdf-enterprise (T2 analytics)',
    'Deprecate or delegate generateStockCountEvidencePDF + generateStockReportVariancePDF',
  ],
  contracts: rows
    .filter((r) => r.columnContract === 'dynamic (row keys)' && r.workspaceStatus.startsWith('live'))
    .map((r) => r.cardId),
  highRiskLive: rows
    .filter((r) => r.riskNotes !== '—' && r.workspaceStatus.startsWith('live'))
    .slice(0, 40)
    .map((r) => ({ cardId: r.cardId, risks: r.riskNotes })),
};

const scopePath = path.join(outDir, 'REPORTING_WAVE1_SCOPE_RECOMMENDATION.json');
fs.writeFileSync(scopePath, JSON.stringify(wave1Scope, null, 2));

console.log(`Wave 0 inventory: ${rows.length} cards`);
console.log(`  JSON: ${jsonPath}`);
console.log(`  MD:   ${mdPath}`);
console.log(`  Wave 1 scope hint: ${scopePath}`);
console.log('Stats:', stats);
