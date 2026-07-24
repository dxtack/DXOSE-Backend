'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const ROUTES_DIR = path.resolve(__dirname, '../../src/routes');
const SERVICES_DIR = path.resolve(__dirname, '../../src/services');
const OUT_CSV = path.join(REPORT_DIR, 'ASSIGNMENT_GATE_ROUTE_INVENTORY.csv');

const MODULE_MAP = {
  'grn.routes.js': 'GRN',
  'transfer.routes.js': 'Transfer',
  'breakage.routes.js': 'Breakage',
  'lostItems.routes.js': 'Lost',
  'getPass.routes.js': 'GetPass',
  'inventoryCount.routes.js': 'InventoryCount',
  'movement.routes.js': 'Movements',
  'ledger.routes.js': 'Ledger',
  'stock.routes.js': 'Stock',
  'inventory-history.routes.js': 'InventoryHistory',
  'reports.routes.js': 'Reports',
  'workflow-pipeline.routes.js': 'WorkflowPipeline',
  'dashboard.routes.js': 'Dashboard',
  'item.routes.js': 'Items',
  'department.routes.js': 'Departments',
  'category.routes.js': 'Categories',
  'unit.routes.js': 'Units',
  'supplier.routes.js': 'Suppliers',
  'location.routes.js': 'Locations',
};

const RUNTIME_DEFECTS = new Set([
  'GetPass|POST|/get-passes/:id/submit',
]);

const RUNTIME_SAFE = new Set([
  'Breakage|POST|/breakage',
  'Lost|POST|/lost-items',
  'Transfer|POST|/transfers',
]);

function serviceScopeHint(module, method) {
  const files = {
    GRN: 'grn.service.js',
    Transfer: 'transfer.service.js',
    Breakage: 'breakage.service.js',
    Lost: 'lostItems.service.js',
    GetPass: 'getPass.service.js',
    InventoryCount: 'inventoryCount.service.js',
    Movements: 'movement.service.js',
  };
  const f = files[module];
  if (!f) return { called: 'unknown', enforced: 'unknown' };
  const p = path.join(SERVICES_DIR, f);
  if (!fs.existsSync(p)) return { called: 'no', enforced: 'no' };
  const src = fs.readFileSync(p, 'utf8');
  const hasResolve = src.includes('resolveScopeContext');
  const hasAssert = src.includes('assertInScope') || src.includes('SCOPE_VIOLATION');
  const submitBlock = module === 'GetPass' ? src.includes('const submitGetPass') && !src.match(/submitGetPass[\s\S]{0,800}resolveScopeContext/) : true;
  return {
    called: hasResolve ? 'yes' : 'no',
    enforced: hasAssert ? 'yes' : 'no',
    getPassSubmitMissingScope: module === 'GetPass' && submitBlock ? 'yes' : 'no',
  };
}

function parseRouteFile(fileName, content) {
  const module = MODULE_MAP[fileName] || fileName.replace('.routes.js', '');
  const rows = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/i);
    if (!m) continue;
    const method = m[1].toUpperCase();
    const route = m[2];
    const window = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
    const permM = window.match(/requirePermission\(\s*['"`]([^'"`]+)['"`]/);
    const anyPermM = window.match(/requireAnyPermission\(([^)]+)\)/);
    const perm = permM ? permM[1] : anyPermM ? anyPermM[1].replace(/['"`]/g, '').slice(0, 80) : '';
    const isMutation = !['GET', 'HEAD'].includes(method);
    const scope = serviceScopeHint(module, method);
    const key = `${module}|${method}|${route.startsWith('/') ? route : '/' + route}`;
    let finalStatus = 'Unverified';
    if (RUNTIME_DEFECTS.has(key.replace(/\/:id/g, '/:id'))) finalStatus = 'Runtime confirmed defect';
    else if (key.includes('GetPass') && method === 'POST' && route.includes('submit')) finalStatus = 'Runtime confirmed defect';
    else if (RUNTIME_SAFE.has(key)) finalStatus = 'Runtime verified safe';
    else if (!perm && !route.includes('approve') && !route.includes('reject')) finalStatus = 'Permission-only or controller gate';
    else if (scope.called === 'yes' && scope.enforced === 'yes') finalStatus = 'Assignment enforced (service scope)';
    else if (scope.called === 'yes') finalStatus = 'Scope resolver called — verify enforce path';
    else if (perm) finalStatus = 'Permission-only';
    else finalStatus = 'Unverified';

    let classification = 'Permission-only';
    if (finalStatus === 'Runtime confirmed defect') classification = 'Empty assignment bypass possible';
    else if (finalStatus === 'Runtime verified safe') classification = 'Assignment enforced';
    else if (finalStatus.includes('Assignment enforced')) classification = 'Assignment enforced';
    else if (route.includes('approve-dept')) classification = 'Permission-only legacy';

    rows.push({
      module,
      method,
      route,
      requirePermission: perm ? 'yes' : 'no',
      permissionKey: perm,
      scopeResolverCalled: scope.called,
      emptyAssignmentEnforced: scope.getPassSubmitMissingScope === 'yes' ? 'no' : scope.enforced,
      serviceOwnershipCheck: scope.enforced,
      runtimeTest: RUNTIME_DEFECTS.has(key) || RUNTIME_SAFE.has(key) ? 'yes' : 'partial',
      classification,
      finalStatus,
    });
  }
  return rows;
}

function main() {
  const all = [];
  for (const f of fs.readdirSync(ROUTES_DIR)) {
    if (!f.endsWith('.routes.js') || !MODULE_MAP[f]) continue;
    all.push(...parseRouteFile(f, fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8')));
  }
  const header =
    'Module,Method,Route,requirePermission,Permission key,Scope resolver called,Empty assignment enforced,Service ownership check,Runtime test,Classification,Final status\n';
  const csv =
    header +
    all
      .map((r) =>
        [
          r.module,
          r.method,
          r.route,
          r.requirePermission,
          r.permissionKey,
          r.scopeResolverCalled,
          r.emptyAssignmentEnforced,
          r.serviceOwnershipCheck,
          r.runtimeTest,
          r.classification,
          r.finalStatus,
        ]
          .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT_CSV, csv);
  fs.writeFileSync(
    path.join(REPORT_DIR, 'ASSIGNMENT_GATE_ROUTE_INVENTORY.json'),
    JSON.stringify({ executedAt: new Date().toISOString(), totalRoutes: all.length, rows: all }, null, 2),
  );
  console.log('Wrote ASSIGNMENT_GATE_ROUTE_INVENTORY.csv', all.length, 'routes');
}

main();
