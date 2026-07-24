'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(backendRoot, 'src/services/mapping.service.js');

test('mapping.service — imports shared database client', () => {
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /require\('\.\.\/config\/database'\)/);
    assert.doesNotMatch(src, /new PrismaClient\(\)/);
    assert.doesNotMatch(src, /\$disconnect/);
});

test('mapping.service — exports unchanged', () => {
    const mappingService = require('./mapping.service');
    const expected = [
        'upsertItemMapping',
        'listItemMappings',
        'upsertUomMapping',
        'listUomMappings',
        'upsertVendorMapping',
        'listVendorMappings',
        'getUnmatchedVendors',
        'applyMappingsToGrn',
    ];
    for (const key of expected) {
        assert.equal(typeof mappingService[key], 'function', `export ${key} must remain a function`);
    }
});
