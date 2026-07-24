'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hasPermission } = require('../middleware/authorize');
const { BASE_ROLE_PERMISSIONS } = require('../acc-authority/base-role-permissions');
const { PERMISSION_MAP } = require('../acc-authority/catalog.constitution');

const periodRoutes = fs.readFileSync(path.join(__dirname, 'periodClose.routes.js'), 'utf8');
const constitutionRoutes = fs.readFileSync(path.join(__dirname, 'constitution.routes.js'), 'utf8');
const retiredPermission = ['PERIOD', 'CLOSE', 'MANAGE'].join('_');

test('legacy period-close permission is absent from active backend sources', () => {
    assert.equal(periodRoutes.includes(retiredPermission), false);
    assert.equal(constitutionRoutes.includes(retiredPermission), false);
    assert.equal(PERMISSION_MAP.some((row) => row.legacyCode === retiredPermission), false);
    assert.equal(BASE_ROLE_PERMISSIONS.FINANCE_MANAGER.includes(retiredPermission), false);
});

test('Finance Manager retains every granular period-close capability', () => {
    const expected = [
        'PERIOD_CLOSE_EXECUTE',
        'PERIOD_REOPEN_EXECUTE',
        'PERIOD_RECLOSE_EXECUTE',
        'PERIOD_CLOSE_RESOLUTION',
        'PERIOD_CLOSE_DOCUMENT_POST',
        'PERIOD_CLOSE_DOCUMENT_DELETE',
        'PERIOD_CLOSE_GET_PASS_RESOLVE',
        'PERIOD_CLOSE_GET_PASS_CARRY_FORWARD',
        'PERIOD_AUTO_CLOSE_MANAGE',
    ];
    for (const permission of expected) {
        assert.equal(BASE_ROLE_PERMISSIONS.FINANCE_MANAGER.includes(permission), true, permission);
    }
    for (const role of ['ORG_MANAGER', 'GENERAL_MANAGER']) {
        assert.equal(
            BASE_ROLE_PERMISSIONS[role].some((permission) => permission.startsWith('PERIOD_')),
            false,
            role,
        );
    }
});

test('partial period-close personas are fail-closed outside their duties', () => {
    const user = (permission) => ({ role: 'CUSTOM', permissions: [permission] });
    const closeOnly = user('PERIOD_CLOSE_EXECUTE');
    assert.equal(hasPermission(closeOnly, 'PERIOD_CLOSE_EXECUTE'), true);
    assert.equal(hasPermission(closeOnly, 'PERIOD_REOPEN_EXECUTE'), false);
    assert.equal(hasPermission(closeOnly, 'PERIOD_CLOSE_RESOLUTION'), false);

    const reopenOnly = user('PERIOD_REOPEN_EXECUTE');
    assert.equal(hasPermission(reopenOnly, 'PERIOD_REOPEN_EXECUTE'), true);
    assert.equal(hasPermission(reopenOnly, 'PERIOD_CLOSE_EXECUTE'), false);

    const resolutionOnly = user('PERIOD_CLOSE_RESOLUTION');
    assert.equal(hasPermission(resolutionOnly, 'PERIOD_CLOSE_RESOLUTION'), true);
    assert.equal(hasPermission(resolutionOnly, 'PERIOD_CLOSE_DOCUMENT_POST'), false);

    const recloseOnly = user('PERIOD_RECLOSE_EXECUTE');
    assert.equal(hasPermission(recloseOnly, 'PERIOD_RECLOSE_EXECUTE'), true);
    assert.equal(hasPermission(recloseOnly, 'PERIOD_CLOSE_RESOLUTION'), false);
});

test('period routes map each operation to its granular permission', () => {
    assert.match(periodRoutes, /'PERIOD_RECLOSE_EXECUTE'/);
    assert.match(periodRoutes, /\/resolution'.*requirePermission\('PERIOD_CLOSE_RESOLUTION'\)/);
    assert.match(periodRoutes, /\/open'.*requirePermission\('PERIOD_CLOSE_EXECUTE'\)/);
    assert.match(periodRoutes, /\/start-close'.*requirePermission\('PERIOD_CLOSE_EXECUTE'\)/);
    assert.match(periodRoutes, /\/cancel-close'.*requirePermission\('PERIOD_CLOSE_RESOLUTION'\)/);
    assert.match(periodRoutes, /PERIOD_CLOSE_EXECUTE', 'PERIOD_RECLOSE_EXECUTE'/);
    assert.match(periodRoutes, /requirePermission\('PERIOD_REOPEN_EXECUTE'\)/);
    assert.match(constitutionRoutes, /period-resolution'.*requirePermission\('PERIOD_CLOSE_RESOLUTION'\)/);
    assert.doesNotMatch(periodRoutes, /INTEGRITY_VIEW/);
});

test('legacy seed is retired and cleanup is fail-closed to the test database', () => {
    const root = path.join(__dirname, '..', '..');
    assert.equal(fs.existsSync(path.join(root, 'scripts', 'seed-user-rights-phase1.js')), false);
    const cleanup = fs.readFileSync(path.join(root, 'scripts', 'retire-period-close-manage.js'), 'utf8');
    assert.match(cleanup, /ose_inventory_test/);
    assert.match(cleanup, /current_database\(\)/);
    assert.match(cleanup, /--apply/);
    assert.match(cleanup, /--confirm-db=/);
    assert.match(cleanup, /Refusing permission cleanup outside local/);
});
