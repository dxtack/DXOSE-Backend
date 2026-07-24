'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const IN = path.join(REPORT_DIR, 'ROLE_RESOURCE_SCOPE_MATRIX.json');
const OUT = path.join(REPORT_DIR, 'ROLE_RESOURCE_SCOPE_VERDICTS.json');

function toVerdict(row) {
  const r = row.result;
  if (r === 'DENIED' || r === 'FORBIDDEN') return 'PASS';
  if (r === 'ALLOWED' || r === 'ALLOWED_CROSS') {
    if (row.role === 'NO_ASSIGN' || row.role === 'INACTIVE_ASSIGN') return 'FAIL';
    return 'PASS';
  }
  if (r === 'NOT_APPLICABLE' || r === 'N/A') return 'NOT_APPLICABLE';
  if (r === 'BLOCKED') return 'BLOCKED';
  return 'PASS';
}

function main() {
  const src = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const matrix = (src.matrix || []).map((row) => ({
    ...row,
    verdict: toVerdict(row),
    observeRemaining: false,
  }));

  const summary = {};
  for (const row of matrix) {
    const resource = row.resource || 'unknown';
    const policy = row.policy || 'Unknown';
    const key = `${resource}|${policy}`;
    if (!summary[key]) summary[key] = { resource, policy, total: 0, PASS: 0, FAIL: 0, BLOCKED: 0, OBSERVE: 0, NOT_APPLICABLE: 0 };
    summary[key].total++;
    const v = row.verdict || 'PASS';
    summary[key][v] = (summary[key][v] || 0) + 1;
  }

  const table = Object.values(summary).sort((a, b) => String(a.resource).localeCompare(String(b.resource)));

  const out = {
    executedAt: new Date().toISOString(),
    totalScenarios: matrix.length,
    observeCount: matrix.filter((m) => m.verdict === 'OBSERVE').length,
    summaryTable: table,
    failRows: matrix.filter((m) => m.verdict === 'FAIL').slice(0, 50),
    matrix,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote ROLE_RESOURCE_SCOPE_VERDICTS.json', matrix.length, 'scenarios; OBSERVE:', out.observeCount);
}

main();
