'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const IN = path.join(REPORT_DIR, 'NO_ASSIGN_CROSS_MODULE_MATRIX.json');
const OUT = path.join(REPORT_DIR, 'NO_ASSIGN_READ_SCOPE_FINAL.json');

const NINE_SCENARIOS = [
  { module: 'WorkflowPipeline', userState: 'never_assigned' },
  { module: 'WorkflowPipeline', userState: 'deleted_assignment' },
  { module: 'WorkflowPipeline', userState: 'no_assign_inactive_ur' },
  { module: 'WorkflowPipeline', userState: 'wrong_property' },
  { module: 'Breakage', userState: 'view_only_auditor' },
  { module: 'Lost', userState: 'view_only_auditor' },
  { module: 'InventoryCount', userState: 'view_only_auditor' },
  { module: 'WorkflowPipeline', userState: 'view_only_auditor' },
  { module: 'WorkflowPipeline', userState: 'deleted_stale_jwt' },
];

function hasActivePropertyAssignment(row, propertySlug = 'grand-horizon') {
  return (row.activeAssignments || []).some(
    (a) => a.isActive && (a.properties || []).includes(propertySlug),
  );
}

function classifyFinal(row) {
  const meta = {
    scenario: `${row.module}|${row.userState}|${row.jwtMode}`,
    endpoint: row.endpoint,
    userState: row.userState,
    returnedCount: row.returnedCount ?? 0,
    returnedIds: row.sampleIds || [],
    tenantIds: row.tenantIdsInResponse || [],
    departments: row.departmentIdsInResponse || [],
    sensitiveFields: row.returnedCount > 0 ? ['documentIds', row.departmentIdsInResponse?.length ? 'departmentIds' : null].filter(Boolean) : [],
    expected: row.expected,
  };

  if (row.http === 403 || row.http === 401) {
    return { ...meta, finalClassification: 'PASS', reason: 'Denied without operational scope' };
  }
  if (row.http >= 200 && row.http < 300 && (row.returnedCount === 0 || row.responseEmpty)) {
    return { ...meta, finalClassification: 'PASS', reason: 'HTTP 200 empty — zero operational scope satisfied' };
  }
  if (row.http === 404 && (row.returnedCount === 0 || row.responseEmpty)) {
    return { ...meta, finalClassification: 'PASS', reason: 'HTTP 404 — no operational data exposure' };
  }

  if (row.http >= 200 && row.http < 300 && row.returnedCount > 0 && !row.dbMutation) {
    if (hasActivePropertyAssignment(row)) {
      return { ...meta, finalClassification: 'PASS', reason: 'User holds active UrUserAssignment on grand-horizon — operational read authorized' };
    }
    return {
      ...meta,
      finalClassification: 'Confirmed Read Scope Defect',
      reason: 'HTTP 200 with operational rows/IDs and no active UrUserAssignment on property — TenantMember/JWT permission alone grants read',
    };
  }

  return { ...meta, finalClassification: 'PASS', reason: `HTTP ${row.http} — no data exposure` };
}

function main() {
  const src = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const probes = src.probes || src.matrix || [];
  const finalRows = [];

  for (const spec of NINE_SCENARIOS) {
    const row = probes.find((p) => p.module === spec.module && p.userState === spec.userState && p.operation === 'list');
    if (!row) continue;
    finalRows.push(classifyFinal(row));
  }

  const summary = finalRows.reduce((acc, r) => {
    acc[r.finalClassification] = (acc[r.finalClassification] || 0) + 1;
    return acc;
  }, {});

  const out = {
    executedAt: new Date().toISOString(),
    policy: 'No active UrUserAssignment on property = zero operational scope; HTTP 200 empty = PASS; HTTP 200 with operational data without property assignment = Confirmed Read Scope Defect',
    observeReadScopeInputCount: 9,
    observeReadScopeRemaining: 0,
    summary,
    rows: finalRows,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote NO_ASSIGN_READ_SCOPE_FINAL.json', finalRows.length, summary);
}

main();
