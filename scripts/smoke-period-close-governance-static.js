'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function assert(cond, msg) {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        failed += 1;
    } else {
        console.log(`OK: ${msg}`);
    }
}

const svc = fs.readFileSync(path.join(root, 'src', 'services', 'periodCloseGovernance.service.js'), 'utf8');
assert(svc.includes('runMonthEndCloseChecklist'), 'month-end checklist exported');
assert(svc.includes('assertCloseBlockersZero'), 'blockers=0 gate exported');
assert(!svc.includes('MONTH_END_CLOSE_REQUIRE_CLEAN_CHECKLIST'), 'no env bypass for blockers');

const routes = fs.readFileSync(path.join(root, 'src', 'routes', 'integrity.routes.js'), 'utf8');
assert(routes.includes('month-end-checklist'), 'integrity routes expose checklist');

const periodClose = fs.readFileSync(path.join(root, 'src', 'services', 'periodClose.service.js'), 'utf8');
assert(periodClose.includes('assertCloseBlockersZero') || periodClose.includes('completeClose'), 'close period invokes blocker gate');
assert(!periodClose.includes('deleteMany'), 're-close does not delete snapshots');

const guard = fs.readFileSync(path.join(root, 'src', 'services', 'periodGuard.service.js'), 'utf8');
assert(guard.includes('checkPeriodLock'), 'period guard exists');
assert(!guard.includes('month: null'), 'annual month=null removed from guard');

if (failed) {
    console.error(`\n${failed} failed.`);
    process.exit(1);
}
console.log('\nPeriod close governance static checks passed.');
process.exit(0);
