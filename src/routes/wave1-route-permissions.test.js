'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

test('transfer read routes require TRANSFER_VIEW (SYS-DEC-06)', () => {
    const src = read('transfer.routes.js');
    assert.match(src, /router\.get\('\/', requirePermission\('TRANSFER_VIEW'\)/);
    assert.match(src, /router\.get\('\/:id\/evidence', requirePermission\('TRANSFER_VIEW'\)/);
    assert.match(src, /router\.get\('\/:id\/evidence\/pdf', requirePermission\('TRANSFER_VIEW'\)/);
    assert.match(src, /router\.get\('\/:id', requirePermission\('TRANSFER_VIEW'\)/);
    assert.doesNotMatch(src, /requirePermission\('INVENTORY_VIEW'\)/);
});

test('transfer legacy dispatch/receive routes removed (SYS-DEC-07)', () => {
    const src = read('transfer.routes.js');
    assert.doesNotMatch(src, /\/dispatch/);
    assert.doesNotMatch(src, /\/receive/);
});

test('breakage mutations use BREAKAGE_CREATE not MANAGE_INVENTORY (SYS-DEC-05)', () => {
    const src = read('breakage.routes.js');
    assert.match(src, /router\.post\('\/:id\/submit', requirePermission\('BREAKAGE_CREATE'\)/);
    assert.match(src, /router\.post\('\/:id\/void', requirePermission\('BREAKAGE_CREATE'\)/);
    assert.match(src, /router\.post\('\/:id\/attachment', requirePermission\('BREAKAGE_CREATE'\)/);
    assert.doesNotMatch(src, /MANAGE_INVENTORY/);
});
