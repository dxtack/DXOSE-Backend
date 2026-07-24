'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const IN = path.join(REPORT_DIR, 'ROLE_RESOURCE_SCOPE_VERDICTS.json');
const OUT_SUMMARY = path.join(REPORT_DIR, 'ROLE_RESOURCE_SCOPE_SUMMARY.json');
const OUT_FAILS = path.join(REPORT_DIR, 'ROLE_RESOURCE_SCOPE_FAILS.json');

function main() {
  const src = JSON.parse(fs.readFileSync(IN, 'utf8'));
  if (src.summaryTable) {
    fs.writeFileSync(
      OUT_SUMMARY,
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          totals: src.summaryTable.reduce(
            (a, r) => {
              a.total += r.total;
              a.PASS += r.PASS || 0;
              a.FAIL += r.FAIL || 0;
              a.BLOCKED += r.BLOCKED || 0;
              a.NOT_APPLICABLE += r.NOT_APPLICABLE || 0;
              return a;
            },
            { total: 0, PASS: 0, FAIL: 0, BLOCKED: 0, NOT_APPLICABLE: 0 },
          ),
          summaryTable: src.summaryTable,
          observeCount: src.observeCount || 0,
        },
        null,
        2,
      ),
    );
  }

  const matrix = src.matrix || src.rows || [];
  const failRows = matrix
    .filter((row) => row.verdict === 'FAIL' || row.result === 'FAIL')
    .map((row) => ({
      resource: row.resource,
      operation: row.operation || row.role,
      role: row.role,
      expectedScope: row.policy,
      actualData: row.returnedCount != null ? `count=${row.returnedCount}` : row.result,
      http: row.http,
      defect: row.defect || 'Read scope — operational data without assignment or policy mismatch',
    }));

  fs.writeFileSync(OUT_FAILS, JSON.stringify({ executedAt: new Date().toISOString(), failCount: failRows.length, rows: failRows }, null, 2));
  console.log('Wrote scope summary', failRows.length, 'FAIL rows');
}

main();
