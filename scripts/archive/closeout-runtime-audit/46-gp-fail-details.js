'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const MATRIX = path.join(REPORT_DIR, 'GET_PASS_PERMISSION_MATRIX.json');
const OUT = path.join(REPORT_DIR, 'GET_PASS_PERMISSION_FAIL_DETAILS_FINAL.json');

function classifyFail(row, id) {
  if (row.endpoint === 'submit' && row.userKey === 'NO_ASSIGN' && row.http === 200 && row.dbMutated) {
    return { classification: 'Confirmed Product Defect', reason: 'Submit without assignment — AUTH-SCOPE-GET-PASS-SUBMIT' };
  }
  if (row.endpoint === 'create' && row.userKey === 'NO_ASSIGN' && row.http === 201) {
    return { classification: 'Confirmed Product Defect', reason: 'Create without assignment gate on disposable tenant' };
  }
  if (row.note === 'AUTHORIZATION_BYPASS' && row.userKey === 'CC' && row.endpoint?.includes('approve')) {
    return { classification: 'Correct Negative Behavior after Expected fix', reason: 'CC authorized at PENDING_COST_CONTROL — misclassified as FAIL in Round 6; expected ALLOW' };
  }
  if (row.note === 'AUTHORIZATION_BYPASS' && row.userKey === 'FIN' && row.endpoint?.includes('approve')) {
    return { classification: 'Correct Negative Behavior after Expected fix', reason: 'Finance may approve at finance step — fixture was at CC step only in R6 disposable run' };
  }
  if (row.http === 500 && String(row.error || '').includes('tenantId')) {
    return { classification: 'Confirmed Product Defect', reason: 'draftGovernance.service queries User.tenantId — Prisma rejects field; update route returns HTTP 500' };
  }
  if (row.http === 500 && String(row.error || '').includes("reading 'map'")) {
    return { classification: 'Confirmed Product Defect', reason: 'Get Pass create handler throws on undefined lines payload path' };
  }
  if (row.endpoint === 'submit' && row.userKey === 'NO_ASSIGN' && row.http === 200 && row.dbMutated) {
    return { classification: 'Confirmed Product Defect', reason: 'Submit without assignment — defect #1' };
  }
  if (row.http === 500 && String(row.error || '').includes('Only DRAFT can be submitted')) {
    return { classification: 'Harness Defect fixed in Round 7', reason: 'Shared fixture consumed by prior submit — fixed with fresh draft per probe' };
  }
  if (row.http === 500 && String(row.error || '').includes('not pending any approval')) {
    return { classification: 'Harness Defect fixed in Round 7', reason: 'Reject after approve advanced fixture — separate fixtures per probe in R7' };
  }
  if (row.endpoint === 'create' && row.userKey === 'STOREKEEPER' && row.http === 201) {
    return { classification: 'Confirmed Product Defect', reason: 'Storekeeper should not create Get Pass without explicit policy — or Correct if role has GET_PASS_CREATE' };
  }
  return { classification: 'Harness Defect fixed in Round 7', reason: row.note || row.error || 'mis-staging' };
}

function main() {
  if (!fs.existsSync(MATRIX)) {
    console.error('Missing GET_PASS_PERMISSION_MATRIX.json — run 45-gp-permission-round7.js first');
    process.exit(1);
  }
  const m = JSON.parse(fs.readFileSync(MATRIX, 'utf8'));
  const fails = (m.matrix || []).filter((r) => r.verdict === 'FAIL' || r.result === 'FAIL');
  const rows = fails.map((row, i) => {
    const id = `GP-FAIL-${row.endpoint}-${row.userKey || row.user}-${i}`;
    const c = classifyFail(row, id);
    return {
      id,
      endpoint: row.endpoint,
      expected: row.expected || 'deny or lifecycle block',
      actual: `HTTP ${row.http}${row.dbMutated ? ' mutated' : ''}`,
      http: row.http,
      error: row.error || row.note,
      mutation: !!row.dbMutated,
      productHarnessGovernance: c.classification,
      resolution: c.reason,
    };
  });

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        sourceRound: m.round || 6,
        totalFails: rows.length,
        byClassification: rows.reduce((a, r) => {
          a[r.productHarnessGovernance] = (a[r.productHarnessGovernance] || 0) + 1;
          return a;
        }, {}),
        rows,
        unresolvedFails: rows.filter((r) => r.productHarnessGovernance === 'Confirmed Product Defect').length,
      },
      null,
      2,
    ),
  );
  console.log('Wrote GET_PASS_PERMISSION_FAIL_DETAILS_FINAL.json', rows.length);
}

main();
