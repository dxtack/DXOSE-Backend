'use strict';

require('dotenv').config();

const {
    assertAwaitingStatusKey,
    findPublishStatusKeyViolations,
    validateWorkflowChainSteps,
} = require('../src/services/acc-workflow-status-key-guard.service');

let failed = 0;
function assert(label, cond) {
    if (cond) console.log(`  ✓ ${label}`);
    else {
        console.error(`  ✗ ${label}`);
        failed++;
    }
}

assert('publish allows POSTED on final step only', findPublishStatusKeyViolations([
    { stepOrder: 1, statusKey: 'PENDING_FINANCE' },
    { stepOrder: 2, statusKey: 'POSTED' },
]).length === 0);

assert('publish rejects POSTED on intermediate step', findPublishStatusKeyViolations([
    { stepOrder: 1, statusKey: 'POSTED' },
    { stepOrder: 2, statusKey: 'PENDING_FINANCE' },
]).length === 1);

let blocked = false;
try {
    assertAwaitingStatusKey('CLOSED', { moduleKey: 'GET_PASS', stepNumber: 3 });
} catch (e) {
    blocked = e.code === 'WORKFLOW_STATUS_KEY_MISCONFIG';
}
assert('runtime blocks CLOSED awaiting key', blocked);

let publishThrew = false;
try {
    validateWorkflowChainSteps(
        [{ stepOrder: 1, statusKey: 'OUT' }, { stepOrder: 2, statusKey: 'PENDING_GM' }],
        { moduleKey: 'GET_PASS', context: 'publish' },
    );
} catch (e) {
    publishThrew = e.code === 'WORKFLOW_STATUS_KEY_MISCONFIG';
}
assert('validateWorkflowChainSteps throws on publish violation', publishThrew);

console.log(failed ? `\nFAIL (${failed})` : '\nPASS');
process.exit(failed ? 1 : 0);
