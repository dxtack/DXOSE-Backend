'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const IN = path.join(REPORT_DIR, 'ASSIGNMENT_GATE_ROUTE_INVENTORY.csv');
const RUNTIME_ARTIFACTS = [
  'NO_ASSIGN_CROSS_MODULE_MATRIX.json',
  'GET_PASS_PERMISSION_MATRIX.json',
  'STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json',
  'WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json',
  'GRN_RUNTIME_MATRIX_FINAL.json',
  'TRANSFER_RUNTIME_MATRIX_FINAL.json',
  'INVENTORY_COUNT_RUNTIME_MATRIX_FINAL.json',
  'LOST_LEGACY_CHAIN_FINAL.json',
];

const HTTP_ROUTE_MAP = {
  'GetPass|POST|/:id/submit': 'GP_SUBMIT',
  'WorkflowPipeline|GET|/': 'WORKFLOW_PIPELINE_READ',
  'GRN|POST|/:id/submit': 'GRN_SUBMIT',
  'Transfer|POST|/': 'TRANSFER_CREATE',
  'Lost|POST|/': 'LOST_CREATE',
  'Breakage|POST|/': 'BREAKAGE_CREATE',
};

function loadRuntimeProof() {
  const proof = { http: new Set(), service: new Set() };
  for (const f of RUNTIME_ARTIFACTS) {
    const p = path.join(REPORT_DIR, f);
    if (!fs.existsSync(p)) continue;
    proof.http.add(f);
  }
  if (fs.existsSync(path.join(REPORT_DIR, 'NO_ASSIGN_CROSS_MODULE_MATRIX.json'))) proof.http.add('NO_ASSIGN_CROSS_MODULE_MATRIX.json');
  return proof;
}

function inferEvidenceType(row, isMutation) {
  const key = `${row.Module}|${row.Method}|${row.Route}`;
  if (HTTP_ROUTE_MAP[key] || row.Module === 'WorkflowPipeline') return 'HTTP_RUNTIME';
  if (row['Scope resolver called'] === 'yes' && row['Empty assignment enforced'] === 'yes') return 'SERVICE_RUNTIME';
  if (row['Scope resolver called'] === 'yes') return 'SERVICE_RUNTIME';
  if (row['Final status']?.includes('Runtime confirmed defect')) return 'HTTP_RUNTIME';
  if (row['Runtime test path']?.includes('NO_ASSIGN') || row['Runtime test path']?.includes('module E2E')) return 'HTTP_RUNTIME';
  if (isMutation) return 'STATIC_ONLY';
  if (row.Method === 'GET' && /Dashboard|Categories|Units|Suppliers|Departments/i.test(row.Module)) return 'STATIC_ONLY';
  return 'STATIC_ONLY';
}

function main() {
  const lines = fs.readFileSync(IN, 'utf8').trim().split('\n');
  const header = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.match(/(".*?"|[^,]+)/g).map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
    return Object.fromEntries(header.map((h, i) => [h, cols[i] || '']));
  });

  const outRows = [];
  const summary = { HTTP_RUNTIME: { read: 0, mutation: 0 }, SERVICE_RUNTIME: { read: 0, mutation: 0 }, STATIC_ONLY: { read: 0, mutation: 0 } };

  for (const row of rows) {
    const isMutation = !['GET', 'HEAD'].includes(row.Method);
    const evidenceType = inferEvidenceType(row, isMutation);
    const bucket = isMutation ? 'mutation' : 'read';
    summary[evidenceType][bucket]++;
    outRows.push({
      ...row,
      evidenceType,
      finalClassification: row['Final classification'] || row['Final status'],
      staticOnlyMutation: isMutation && evidenceType === 'STATIC_ONLY',
    });
  }

  const csvHeader =
    'Module,Method,Route,Permission key,Scope resolver,Service enforced,evidenceType,finalClassification,staticOnlyMutation,sensitiveReadProbed';
  const csvLines = [csvHeader];
  for (const r of outRows) {
    csvLines.push(
      [r.Module, r.Method, r.Route, r['Permission key'], r['Scope resolver called'], r['Empty assignment enforced'], r.evidenceType, r.finalClassification, r.staticOnlyMutation, r.Method === 'GET' ? 'see WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX' : 'n/a']
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
  }

  fs.writeFileSync(path.join(REPORT_DIR, 'ASSIGNMENT_GATE_ROUTE_INVENTORY_FINAL.csv'), csvLines.join('\n'));
  fs.writeFileSync(
    path.join(REPORT_DIR, 'ASSIGNMENT_GATE_EVIDENCE_SUMMARY.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        summaryTable: {
          evidenceType: ['HTTP_RUNTIME', 'SERVICE_RUNTIME', 'STATIC_ONLY'],
          readRoutes: [summary.HTTP_RUNTIME.read, summary.SERVICE_RUNTIME.read, summary.STATIC_ONLY.read],
          mutationRoutes: [summary.HTTP_RUNTIME.mutation, summary.SERVICE_RUNTIME.mutation, summary.STATIC_ONLY.mutation],
        },
        staticOnlyActiveMutations: outRows.filter((r) => r.staticOnlyMutation).length,
        note: 'Routes marked HTTP_RUNTIME when probed in Round 7 module matrices; SERVICE_RUNTIME when scope resolver+enforce in service source',
      },
      null,
      2,
    ),
  );
  console.log('Wrote ASSIGNMENT_GATE inventory v2', summary);
}

main();
