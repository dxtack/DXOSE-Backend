const test = require('node:test');
const assert = require('node:assert/strict');

const {
    resolveUserScope,
    departmentLookupScopeWhere,
    pickAllowedDepartmentIds,
    SCOPE_PROFILE,
    SCOPE_SOURCE,
} = require('./scope.service');

const TENANT_ID = 'tenant-1';

test('FINANCE_MANAGER is property-wide on mutation paths (assignmentOnly)', async () => {
    const scope = await resolveUserScope(
        { id: 'user-fm', role: 'FINANCE_MANAGER', tenantId: TENANT_ID },
        TENANT_ID,
        { assignmentOnly: true },
    );
    assert.equal(scope.isTenantWide, true);
    assert.equal(scope.scopeLabel, 'Property-wide');
});

test('COST_CONTROL is property-wide on mutation paths (assignmentOnly)', async () => {
    const scope = await resolveUserScope(
        { id: 'user-cc', role: 'COST_CONTROL', tenantId: TENANT_ID },
        TENANT_ID,
        { assignmentOnly: true },
    );
    assert.equal(scope.isTenantWide, true);
});

test('STOREKEEPER is property-wide on mutation paths (assignmentOnly)', async () => {
    const scope = await resolveUserScope(
        { id: 'user-sk', role: 'STOREKEEPER', tenantId: TENANT_ID },
        TENANT_ID,
        { assignmentOnly: true },
    );
    assert.equal(scope.isTenantWide, true);
});

test('departmentLookupScopeWhere uses ACC department IDs even with zero locations', () => {
    const scope = {
        role: 'DEPT_MANAGER',
        profile: SCOPE_PROFILE.LOCATIONS,
        scopeSource: SCOPE_SOURCE.UR_ASSIGNMENT,
        isTenantWide: false,
        departmentId: 'fnb-dept',
        allowedDepartmentIds: ['fnb-dept'],
        allowedLocationIds: [],
        canViewAllDepartments: false,
        canViewAllLocations: false,
        scopeLabel: 'Food & Beverage',
        userId: 'michael',
    };

    assert.deepEqual(departmentLookupScopeWhere(scope), {
        id: { in: ['fnb-dept'] },
    });
});

test('departmentLookupScopeWhere returns empty when ACC has neither departments nor locations', () => {
    const scope = {
        role: 'DEPT_MANAGER',
        profile: SCOPE_PROFILE.LOCATIONS,
        scopeSource: SCOPE_SOURCE.UR_ASSIGNMENT,
        isTenantWide: false,
        departmentId: null,
        allowedDepartmentIds: [],
        allowedLocationIds: [],
        canViewAllDepartments: false,
        canViewAllLocations: false,
        scopeLabel: 'No ACC scope assignment',
        userId: 'michael',
    };

    assert.deepEqual(departmentLookupScopeWhere(scope), { id: { in: [] } });
});

test('pickAllowedDepartmentIds keeps same-tenant assignment ids', () => {
    const execTenant = 'exec-tenant';
    const ids = pickAllowedDepartmentIds(
        [
            { id: 'exec-fnb', tenantId: execTenant },
            { id: 'airport-fnb', tenantId: 'airport-tenant' },
        ],
        execTenant,
        [{ id: 'should-not-use' }],
    );
    assert.deepEqual(ids, ['exec-fnb']);
});

test('pickAllowedDepartmentIds remaps when ACC linked another hotel F&B id', () => {
    const execTenant = 'exec-tenant';
    const ids = pickAllowedDepartmentIds(
        [{ id: 'airport-fnb', tenantId: 'airport-tenant' }],
        execTenant,
        [{ id: 'exec-fnb' }],
    );
    assert.deepEqual(ids, ['exec-fnb']);
});
