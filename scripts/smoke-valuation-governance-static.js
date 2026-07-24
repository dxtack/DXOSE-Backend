/**
 * Static + unit smoke: valuation governance (Phase A3).
 */
'use strict';

const {
    VALUATION_BASIS,
    estimateVarianceValue,
} = require('../src/services/valuationGovernance.service');

let failed = 0;

function assert(cond, msg) {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        failed += 1;
    } else {
        console.log(`OK: ${msg}`);
    }
}

assert(VALUATION_BASIS.WAC === 'WAC', 'WAC basis constant');
assert(VALUATION_BASIS.MISSING_WAC === 'MISSING_WAC', 'MISSING_WAC basis constant');

const withWac = estimateVarianceValue(2, 10, VALUATION_BASIS.WAC);
assert(withWac.varianceValueEstimate === 20, 'variance value = qty * unit cost');
assert(withWac.incompleteValuation === false, 'WAC path is complete');

const missing = estimateVarianceValue(2, 0, VALUATION_BASIS.MISSING_WAC);
assert(missing.varianceValueEstimate === 0, 'zero cost yields zero value');
assert(missing.incompleteValuation === true, 'MISSING_WAC + qty flags incomplete');

const zeroQty = estimateVarianceValue(0, 0, VALUATION_BASIS.MISSING_WAC);
assert(zeroQty.incompleteValuation === false, 'zero qty is not incomplete valuation');

if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed.`);
    process.exit(1);
}
console.log('\nValuation governance static checks passed.');
process.exit(0);
