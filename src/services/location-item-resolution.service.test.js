'use strict';

const assert = require('assert');
const { normalizeMode, MODES } = require('./location-item-resolution.service');

assert.strictEqual(normalizeMode('operational'), MODES.OPERATIONAL);
assert.strictEqual(normalizeMode('receiving'), MODES.RECEIVING);
assert.strictEqual(normalizeMode('grn'), MODES.RECEIVING);
assert.strictEqual(normalizeMode(undefined), MODES.OPERATIONAL);

console.log('location-item-resolution.service.test.js: OK');
