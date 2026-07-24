'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    STEP_PERMISSION_GET_PASS: backendGetPassMap,
    COUNT_STATUS_PERMISSION: backendCountMap,
    resolveGetPassPermission: backendResolveGetPass,
    resolveCountPermission: backendResolveCount,
    resolveWaitingPermission: backendResolveWaiting,
} = require('./workflow-step-permissions');

const backendRoot = path.join(__dirname, '..', '..');
const frontendUtilPath = path.join(
    backendRoot,
    '..',
    'OSE-Frontend',
    'src',
    'app',
    'shared',
    'utils',
    'workflow-step-permissions.util.ts',
);

function parseTsStringRecord(source, constName) {
    const re = new RegExp(`const ${constName}[\\s\\S]*?=\\s*\\{([\\s\\S]*?)\\};`, 'm');
    const match = source.match(re);
    if (!match) throw new Error(`Could not find ${constName}`);
    const entries = {};
    for (const item of match[1].matchAll(/(\w+):\s*'([^']+)'/g)) {
        entries[item[1]] = item[2];
    }
    if (!Object.keys(entries).length) {
        throw new Error(`No entries parsed for ${constName}`);
    }
    return entries;
}

function parseTsStringSet(source, constName) {
    const re = new RegExp(`const ${constName}[\\s\\S]*?new Set\\(\\[([\\s\\S]*?)\\]\\)`, 'm');
    const match = source.match(re);
    if (!match) throw new Error(`Could not find ${constName}`);
    return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function parseFrontendMaps() {
    const source = fs.readFileSync(frontendUtilPath, 'utf8');
    return {
        STEP_PERMISSION_GET_PASS: parseTsStringRecord(source, 'STEP_PERMISSION_GET_PASS'),
        COUNT_STATUS_PERMISSION: parseTsStringRecord(source, 'COUNT_STATUS_PERMISSION'),
        GET_PASS_RETURN_STATUSES: parseTsStringSet(source, 'GET_PASS_RETURN_STATUSES'),
    };
}

function frontendResolveGetPass(maps, status, waitingForRole, options = {}) {
    const s = String(status ?? '').trim();
    if (maps.STEP_PERMISSION_GET_PASS[s]) {
        return maps.STEP_PERMISSION_GET_PASS[s];
    }
    if (s === 'APPROVED') return 'GET_PASS_APPROVE_EXIT';
    if (s === 'OUT' || s === 'PARTIALLY_RETURNED') return 'GET_PASS_APPROVE_RETURN';
    if (maps.GET_PASS_RETURN_STATUSES.includes(s)) {
        return options.isInternalTransfer ? 'GET_PASS_CONFIRM_DESTINATION' : 'GET_PASS_APPROVE_RETURN';
    }
    if (waitingForRole === 'STOREKEEPER') return 'GET_PASS_APPROVE_EXIT';
    if (waitingForRole === 'SECURITY') return 'GET_PASS_APPROVE_RETURN';
    return 'GET_PASS_VIEW';
}

function frontendResolveCount(maps, status) {
    const s = String(status ?? '').trim();
    return maps.COUNT_STATUS_PERMISSION[s] ?? 'STOCK_COUNT_EXECUTE';
}

function assertMapsEqual(label, backendMap, frontendMap) {
    const backendKeys = Object.keys(backendMap).sort();
    const frontendKeys = Object.keys(frontendMap).sort();
    assert.deepEqual(frontendKeys, backendKeys, `${label} key mismatch`);
    for (const key of backendKeys) {
        assert.equal(frontendMap[key], backendMap[key], `${label} value mismatch at ${key}`);
    }
}

function parseJsStringArray(source, constName) {
    const re = new RegExp(`const ${constName} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`, 'm');
    const match = source.match(re);
    if (!match) throw new Error(`Could not find ${constName}`);
    return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function readBackendReturnStatuses() {
    const source = fs.readFileSync(path.join(__dirname, 'workflow-step-permissions.js'), 'utf8');
    return parseJsStringArray(source, 'GET_PASS_RETURN_STATUSES');
}

test('STEP_PERMISSION_GET_PASS — backend/frontend map parity', () => {
    const fe = parseFrontendMaps();
    assertMapsEqual('STEP_PERMISSION_GET_PASS', backendGetPassMap, fe.STEP_PERMISSION_GET_PASS);
});

test('COUNT_STATUS_PERMISSION — backend/frontend map parity', () => {
    const fe = parseFrontendMaps();
    assertMapsEqual('COUNT_STATUS_PERMISSION', backendCountMap, fe.COUNT_STATUS_PERMISSION);
});

test('GET_PASS_RETURN_STATUSES — backend/frontend parity', () => {
    const fe = parseFrontendMaps();
    const be = readBackendReturnStatuses().sort();
    assert.deepEqual([...fe.GET_PASS_RETURN_STATUSES].sort(), be);
});

test('GRN_MANAGE contract — backend waiting permission', () => {
    const result = backendResolveWaiting({ module: 'GRN', status: 'PENDING_FINANCE' });
    assert.equal(result.waitingForPermission, 'GRN_MANAGE');
});

test('resolveGetPassPermission — backend/frontend behavior parity matrix', () => {
    const feMaps = parseFrontendMaps();
    const cases = [
        ['PENDING_DEPT', null, {}, 'GET_PASS_APPROVE'],
        ['PENDING_GM', null, {}, 'GET_PASS_APPROVE_FINAL'],
        ['PENDING_SECURITY', null, {}, 'GET_PASS_APPROVE_EXIT'],
        ['APPROVED', null, {}, 'GET_PASS_APPROVE_EXIT'],
        ['OUT', null, {}, 'GET_PASS_APPROVE_RETURN'],
        ['RETURNING', null, {}, 'GET_PASS_APPROVE_RETURN'],
        ['RETURNING', null, { isInternalTransfer: true }, 'GET_PASS_CONFIRM_DESTINATION'],
        ['UNKNOWN', 'STOREKEEPER', {}, 'GET_PASS_APPROVE_EXIT'],
        ['UNKNOWN', 'SECURITY', {}, 'GET_PASS_APPROVE_RETURN'],
        ['UNKNOWN', null, {}, 'GET_PASS_VIEW'],
    ];
    for (const [status, role, options, expected] of cases) {
        const be = backendResolveGetPass(status, role, options);
        const fe = frontendResolveGetPass(feMaps, status, role, options);
        assert.equal(be, expected, `backend case status=${status}`);
        assert.equal(fe, expected, `frontend case status=${status}`);
        assert.equal(be, fe, `parity case status=${status}`);
    }
});

test('resolveCountPermission — backend/frontend behavior parity matrix', () => {
    const feMaps = parseFrontendMaps();
    const cases = [
        ['DRAFT', 'STOCK_COUNT_CREATE'],
        ['PENDING_APPROVAL', 'APPROVE_INVENTORY_COUNT'],
        ['FINANCE_APPROVED', 'APPROVE_INVENTORY_COUNT'],
        ['UNKNOWN', 'STOCK_COUNT_EXECUTE'],
        ['  COUNTING  ', 'STOCK_COUNT_EXECUTE'],
    ];
    for (const [status, expected] of cases) {
        const be = backendResolveCount(status);
        const fe = frontendResolveCount(feMaps, status);
        assert.equal(be, expected, `backend case status=${status}`);
        assert.equal(fe, expected, `frontend case status=${status}`);
        assert.equal(be, fe, `parity case status=${status}`);
    }
});
