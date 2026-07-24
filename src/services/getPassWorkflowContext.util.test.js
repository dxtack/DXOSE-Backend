'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildGetPassWorkflowContext,
    isGetPassCreateActorRole,
} = require('./getPassWorkflowContext.util');

test('create actor roles: dept/storekeeper yes, finance/security no', () => {
    assert.equal(isGetPassCreateActorRole('DEPT_MANAGER'), true);
    assert.equal(isGetPassCreateActorRole('STOREKEEPER'), true);
    assert.equal(isGetPassCreateActorRole('FINANCE_MANAGER'), false);
    assert.equal(isGetPassCreateActorRole('COST_CONTROL'), false);
    assert.equal(isGetPassCreateActorRole('SECURITY'), false);
});

test('DRAFT → SUBMIT for Creator', () => {
    const wf = buildGetPassWorkflowContext({ status: 'DRAFT' });
    assert.equal(wf.currentStepKey, 'SUBMIT');
    assert.deepEqual(wf.allowedActionKeys, ['SUBMIT']);
    assert.equal(wf.actorResolution, 'Creator');
});

test('PENDING_DEPT → DEPT_APPROVAL ACC.Step(1)', () => {
    const wf = buildGetPassWorkflowContext(
        { status: 'PENDING_DEPT' },
        {
            versionId: 'v1',
            steps: [
                { stepOrder: 1, roleCode: 'DEPT_MANAGER', statusKey: 'PENDING_DEPT', permissionCode: 'GET_PASS_APPROVE' },
                { stepOrder: 2, roleCode: 'COST_CONTROL', statusKey: 'PENDING_COST_CONTROL' },
            ],
        },
    );
    assert.equal(wf.currentStepKey, 'DEPT_APPROVAL');
    assert.equal(wf.actorResolution, 'ACC.Step(1)');
    assert.equal(wf.requiredRoleCode, 'DEPT_MANAGER');
    assert.ok(wf.allowedActionKeys.includes('APPROVE'));
});

test('PENDING_SECURITY → SECURITY_EXIT posting', () => {
    const wf = buildGetPassWorkflowContext(
        { status: 'PENDING_SECURITY' },
        {
            steps: [
                { stepOrder: 1, roleCode: 'DEPT_MANAGER', statusKey: 'PENDING_DEPT' },
                { stepOrder: 2, roleCode: 'COST_CONTROL', statusKey: 'PENDING_COST_CONTROL' },
                { stepOrder: 3, roleCode: 'FINANCE_MANAGER', statusKey: 'PENDING_FINANCE' },
                { stepOrder: 4, roleCode: 'SECURITY', statusKey: 'PENDING_SECURITY' },
            ],
        },
    );
    assert.equal(wf.currentStepKey, 'SECURITY_EXIT');
    assert.equal(wf.stepType, 'POSTING');
    assert.equal(wf.requiredRoleCode, 'SECURITY');
});
