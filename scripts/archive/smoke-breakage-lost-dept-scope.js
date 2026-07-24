'use strict';

const assert = require('assert');
const path = require('path');
const { buildScopeWhere, SCOPE_MODULE, SCOPE_PROFILE } = require(path.join(__dirname, '../src/services/scope/scope.service'));

const fbScope = {
    isTenantWide: false,
    profile: SCOPE_PROFILE.DEPARTMENT,
    departmentId: 'dept-fb',
    allowedLocationIds: ['loc-fb-1', 'loc-fb-2'],
    userId: 'user-1',
};

const where = buildScopeWhere(SCOPE_MODULE.BREAKAGE, fbScope, { userId: 'user-1' });
assert(where.OR, 'dept scope uses OR predicates');
assert(
    where.OR.some((p) => p.lines?.some?.location?.departmentId === 'dept-fb'),
    'matches line department',
);
assert(
    where.OR.some((p) => p.sourceLocationId?.in?.includes('loc-fb-1')),
    'matches header source location',
);
assert(
    !where.OR.some((p) => p.createdBy),
    'does not filter by createdBy',
);

const scopeSrc = require('fs').readFileSync(
    path.join(__dirname, '../src/services/scope/scope.service.js'),
    'utf8',
);
assert(!scopeSrc.includes('createdBy: userId'), 'removed createdBy-only list scope');

const helperSrc = require('fs').readFileSync(
    path.join(__dirname, '../../OSE-Frontend/src/app/shared/utils/returns-workflow.helpers.ts'),
    'utf8',
);
assert(helperSrc.includes('returnsWorkflowDeptManagerListApiStatusParam'), 'dept manager tab status helper');
assert(helperSrc.includes("return false"), 'createdBy list filter disabled');

console.log('OK: breakage/lost dept scope smoke passed');
