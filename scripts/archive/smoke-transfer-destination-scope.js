'use strict';

const assert = require('assert');
const path = require('path');

const scope = require(path.join(__dirname, '../src/services/scope/scope.service'));

const fbScope = {
    isTenantWide: false,
    profile: 'DEPARTMENT',
    departmentId: 'dept-fb',
    allowedLocationIds: ['loc-fb-1'],
};

const sourceWhere = scope.locationLookupScopeWhere(fbScope);
const destWhere = scope.locationTransferDestinationLookupScopeWhere(fbScope);

assert.deepStrictEqual(sourceWhere, { id: { in: ['loc-fb-1'] } });
assert.deepStrictEqual(destWhere, {});

const resolved = scope.resolveLocationLookupScopeWhere(
    fbScope,
    scope.LOCATION_LOOKUP_PURPOSE.TRANSFER_DESTINATION,
);
assert.deepStrictEqual(resolved, {});

const fs = require('fs');
const locSrc = fs.readFileSync(
    path.join(__dirname, '../src/services/location.service.js'),
    'utf8',
);
assert(locSrc.includes('resolveLocationLookupScopeWhere'), 'location list uses purpose-aware scope');
assert(locSrc.includes('transfer_destination'), 'transfer_destination purpose wired');

console.log('OK: transfer destination scope smoke passed');
