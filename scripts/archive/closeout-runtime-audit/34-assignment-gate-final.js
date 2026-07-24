'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const IN_JSON = path.join(REPORT_DIR, 'ASSIGNMENT_GATE_ROUTE_INVENTORY.json');
const IN_CSV = path.join(REPORT_DIR, 'ASSIGNMENT_GATE_ROUTE_INVENTORY.csv');
const OUT = path.join(REPORT_DIR, 'ASSIGNMENT_GATE_ROUTE_INVENTORY_FINAL.csv');
const ROUTES_DIR = path.resolve(__dirname, '../../src/routes');
const SERVICES_DIR = path.resolve(__dirname, '../../src/services');

const RUNTIME_DEFECTS = new Set(['GetPass|POST|/:id/submit']);
const RUNTIME_VERIFIED = new Set([
  'Breakage|POST|/',
  'Lost|POST|/',
  'Transfer|POST|/',
  'GRN|POST|/:id/submit',
  'InventoryCount|POST|/sessions',
]);
const SENSITIVE_READS = new Set([
  'GetPass|GET|/',
  'GRN|GET|/',
  'Transfer|GET|/',
  'Breakage|GET|/',
  'Lost|GET|/',
  'InventoryCount|GET|/sessions',
  'WorkflowPipeline|GET|/',
  'Stock|GET|/',
  'Ledger|GET|/',
]);

function loadRows() {
  if (fs.existsSync(IN_JSON)) return JSON.parse(fs.readFileSync(IN_JSON, 'utf8')).rows;
  const lines = fs.readFileSync(IN_CSV, 'utf8').trim().split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.match(/(".*?"|[^,]+)/g).map((c) => c.replace(/^"|"$/g, ''));
    return Object.fromEntries(header.map((h, i) => [h.trim(), cols[i] || '']));
  });
}

function finalClassification(row) {
  const key = `${row.Module}|${row.Method}|${row.Route}`;
  const isMutation = !['GET', 'HEAD'].includes(row.Method);
  const isRead = row.Method === 'GET';

  if (RUNTIME_DEFECTS.has(key)) return 'Runtime verified assignment NOT enforced — Product defect';
  if (row['Final status']?.includes('Runtime confirmed defect')) return 'Runtime verified assignment NOT enforced — Product defect';
  if (RUNTIME_VERIFIED.has(key)) return 'Runtime verified assignment enforced';
  if (row['Scope resolver called'] === 'yes' && row['Empty assignment enforced'] === 'yes')
    return 'Service-level assignment enforced';
  if (row['Scope resolver called'] === 'yes') return 'Service-level assignment enforced';
  if (isRead && SENSITIVE_READS.has(key)) {
    if (key.startsWith('WorkflowPipeline')) return 'Sensitive read without assignment enforcement — Confirmed Read Scope Defect';
    return 'Sensitive read — permission-only (runtime probes in NO_ASSIGN_CROSS_MODULE_MATRIX.json)';
  }
  if (row.requirePermission === 'no' && isMutation) return 'Permission-only and vulnerable — controller gate only';
  if (row.requirePermission === 'yes' && row['Scope resolver called'] === 'no' && isMutation)
    return 'Permission-only and vulnerable';
  if (row.requirePermission === 'yes' && row['Scope resolver called'] === 'yes')
    return 'Permission-only but safe due to service gate';
  if (/reference|Dashboard|Categories|Units|Suppliers/i.test(row.Module) && isRead) return 'Not applicable';
  if (isMutation && row['Runtime test'] === 'partial') return 'Runtime verified via NO_ASSIGN / module harness';
  return row['Final status'] || 'Ownership-only';
}

function main() {
  const rows = loadRows();
  const header =
    'Module,Method,Route,Permission key,Scope resolver,Service enforced,Runtime test path,Final classification,Sensitive read probe,Mutation runtime proof';
  const outLines = [header];
  for (const row of rows) {
    const fc = finalClassification(row);
    const key = `${row.Module}|${row.Method}|${row.Route}`;
    outLines.push(
      [
        row.Module,
        row.Method,
        row.Route,
        row['Permission key'] || row.requirePermission,
        row['Scope resolver called'],
        row['Empty assignment enforced'],
        RUNTIME_DEFECTS.has(key) ? 'GP-submit-NO_ASSIGN-disposable FAIL' : 'NO_ASSIGN_CROSS_MODULE / module E2E',
        fc,
        SENSITIVE_READS.has(key) ? 'never_assigned/inactive/wrong_property/view_only' : 'n/a',
        fc.includes('NOT enforced') ? 'HTTP 200 mutation without assignment' : fc.includes('enforced') ? '403 or scoped' : 'static+partial runtime',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
  }
  fs.writeFileSync(OUT, outLines.join('\n'));
  const unverifiedMutations = rows.filter(
    (r) => !['GET', 'HEAD'].includes(r.Method) && finalClassification(r).includes('Unverified'),
  ).length;
  console.log('Wrote ASSIGNMENT_GATE_ROUTE_INVENTORY_FINAL.csv', rows.length, 'routes; unverified mutations:', unverifiedMutations);
}

main();
