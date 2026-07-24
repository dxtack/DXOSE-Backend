'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('P2 #29 — current-stock-balance stamps live effectiveAsOf (not historical snapshot claim)', () => {
    const handlers = fs.readFileSync(path.join(__dirname, 'report-workspace.handlers.js'), 'utf8');
    const analytics = fs.readFileSync(path.join(__dirname, 'report-analytics.service.js'), 'utf8');
    assert.match(handlers, /reportBasis: 'LIVE_STOCK_BALANCE'/);
    assert.match(handlers, /effectiveAsOf/);
    assert.match(analytics, /cardId === 'current-stock-balance'/);
    assert.match(analytics, /asOfIsLive = true/);
    assert.match(analytics, /Live balance as of/);
});
