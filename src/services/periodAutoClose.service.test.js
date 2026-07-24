'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const servicePath = path.resolve(__dirname, './periodAutoClose.service.js');

function loadService() {
    const originalLoad = Module._load;
    Module._load = function patchedLoader(request, parent, isMain) {
        if (request === '@prisma/client') {
            return { PrismaClient: function PrismaClient() { return {}; } };
        }
        if (request === './periodClose.service') return {};
        if (request === './periodCloseGovernance.service') return {};
        if (request === './tenantTimezone.service') return {};
        if (request === '../utils/logger') return { warn() {}, error() {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[servicePath];
    const service = require(servicePath);
    Module._load = originalLoad;
    return service;
}

test('auto-close due time follows Tenant.timezone', () => {
    const { isAutoCloseDue } = loadService();
    const settings = { dayOfMonth: 5, executionTime: '02:00' };
    const instant = new Date('2026-08-04T23:30:00.000Z');

    assert.equal(isAutoCloseDue(settings, instant, 'Asia/Riyadh'), true);
    assert.equal(isAutoCloseDue(settings, instant, 'UTC'), false);
});

test('auto-close day clamps to tenant-local month end', () => {
    const { isAutoCloseDue } = loadService();
    const settings = { dayOfMonth: 31, executionTime: '02:00' };

    assert.equal(
        isAutoCloseDue(settings, new Date('2026-02-27T23:00:00.000Z'), 'Asia/Riyadh'),
        true,
    );
});
