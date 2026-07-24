'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const constants = require(path.join(root, 'src/constants/governed-movement.constants'));
const guard = require(path.join(root, 'src/services/movementRegisterGuard.service'));

const { isGovernedMovementType, isMovementWorkflowLocked } = constants;

assert(isGovernedMovementType('lost'));
assert(isMovementWorkflowLocked({
    movementType: 'LOST',
    status: 'FINANCE_APPROVED',
    postedAt: null,
}));

assert(!isMovementWorkflowLocked({
    movementType: 'LOST',
    status: 'DRAFT',
    postedAt: null,
}));

assert.throws(
    () => guard.assertMovementRegisterMutable({ movementType: 'BREAKAGE', status: 'DRAFT' }, 'post'),
    (e) => e.code === 'GOVERNED_POST_FORBIDDEN',
);

assert.throws(
    () =>
        guard.assertMovementRegisterMutable(
            { movementType: 'LOST', status: 'FINANCE_APPROVED', documentNo: 'LST-1' },
            'update',
        ),
    (e) => e.code === 'GOVERNED_WORKFLOW_LOCKED',
);

const utilSrc = fs.readFileSync(
    path.join(root, '../OSE-Frontend/src/app/features/movements/utils/movement-register-display.util.ts'),
    'utf8',
);
assert(utilSrc.includes('PENDING_GM'), 'frontend util includes PENDING_GM workflow status');
assert(utilSrc.includes('resolveMovementRegisterView'), 'frontend resolveMovementRegisterView present');
assert(utilSrc.includes('REGISTER_STATUS.VOID') || utilSrc.includes("'VOID'"), 'frontend uses VOID register status not Cancelled');
assert(
    isMovementWorkflowLocked({
        movementType: 'LOST',
        status: 'FINANCE_APPROVED',
        postedAt: null,
    }),
);

console.log('OK: movement register governed smoke passed');
