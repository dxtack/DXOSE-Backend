'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/services/reorder.service.js');

test('reorder.service — imports shared database client', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('reorder.service — exports unchanged', () => {
    const reorderService = require('./reorder.service');
    assert.equal(typeof reorderService.getReorderSuggestions, 'function');
});

test('reorder.service — module loads with shared client', () => {
    assert.equal(typeof require('../config/database'), 'object');
    assert.equal(typeof require('./reorder.service').getReorderSuggestions, 'function');
});
