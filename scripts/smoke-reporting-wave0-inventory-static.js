'use strict';

/**
 * Static smoke: Wave 0 reporting inventory artifacts exist and meet minimum coverage.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const jsonPath = path.join(repoRoot, 'docs/governance/REPORTING_WAVE0_INVENTORY.json');

let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`OK: ${msg}`);
  }
}

const raw = fs.readFileSync(jsonPath, 'utf8');
const inv = JSON.parse(raw);
ok(inv.rows.length >= 100, `inventory has >= 100 cards (got ${inv.rows.length})`);
ok(inv.stats.dynamicContract >= 50, 'dynamic contract count documented');
ok(inv.stats.explicitContract >= 25, 'explicit contract count documented');
ok(inv.rows.every((r) => r.cardId && r.handlerName && r.pdfExportPath), 'every row has core fields');

const requiredLive = [
  'count-variance-report',
  'current-stock-balance',
  'summary-report',
  'inventory-change-history',
];
for (const id of requiredLive) {
  ok(inv.rows.some((r) => r.cardId === id), `includes ${id}`);
}

if (failed) {
  console.error(`\n${failed} check(s) failed. Run: npm run reporting:wave0-inventory`);
  process.exit(1);
}
console.log('\nReporting Wave 0 inventory static checks passed.');
process.exit(0);
