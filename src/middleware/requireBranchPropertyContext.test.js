'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PROPERTY_CONTEXT_CODE,
    PROPERTY_CONTEXT_MESSAGE,
} = require('./requireBranchPropertyContext');

test('property context error constants match API contract', () => {
    assert.equal(PROPERTY_CONTEXT_CODE, 'PROPERTY_CONTEXT_REQUIRED');
    assert.equal(PROPERTY_CONTEXT_MESSAGE, 'Select a property before editing master data.');
});
