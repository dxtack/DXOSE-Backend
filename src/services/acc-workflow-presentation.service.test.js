'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const presentation = require('./acc-workflow-presentation.service');
const runtime = require('./acc-workflow-runtime.service');

test('defaultPresentationChain returns TRANSFER Dept→Finance steps', () => {
  const chain = presentation.defaultPresentationChain('TRANSFER');
  assert.ok(chain);
  assert.equal(chain.source, 'default-chain');
  assert.deepEqual(chain.roleCodes, ['DEPT_MANAGER', 'FINANCE_MANAGER']);
  assert.equal(presentation.waitingRoleFromAccStatus(chain, 'PENDING_FINANCE'), 'FINANCE_MANAGER');
});

test('resolvePresentationChain soft-fails to default when published workflow missing', async () => {
  const engine = require('../engines/workflow-resolution.engine');
  const original = engine.resolvePublishedWorkflowChain;
  engine.resolvePublishedWorkflowChain = async () => null;
  try {
    const grn = await presentation.resolvePresentationChain({ moduleKey: 'GRN', tenantId: null });
    assert.ok(grn, 'GRN should soft-fail to default chain, not throw');
    assert.equal(grn.source, 'default-chain');
    assert.ok(grn.roleCodes.length > 0);

    const transfer = await presentation.resolvePresentationChain({
      moduleKey: 'TRANSFER',
      tenantId: null,
    });
    assert.equal(transfer.source, 'default-chain');
    assert.deepEqual(transfer.roleCodes, ['DEPT_MANAGER', 'FINANCE_MANAGER']);
  } finally {
    engine.resolvePublishedWorkflowChain = original;
  }
});

test('waitingRoleFromApprovalRequest reads current PENDING step role', () => {
  const role = presentation.waitingRoleFromApprovalRequest({
    status: 'PENDING',
    currentStep: 2,
    steps: [
      { stepNumber: 1, status: 'APPROVED', requiredRole: { code: 'DEPT_MANAGER' } },
      { stepNumber: 2, status: 'PENDING', requiredRole: { code: 'FINANCE_MANAGER' } },
    ],
  });
  assert.equal(role, 'FINANCE_MANAGER');
});

test('runtime TRANSFER fallback still works alongside presentation soft-fail', async () => {
  const engine = require('../engines/workflow-resolution.engine');
  const original = engine.resolvePublishedWorkflowChain;
  engine.resolvePublishedWorkflowChain = async () => null;
  try {
    const chain = await runtime.resolveWorkflowForDocument({ moduleKey: 'TRANSFER', tenantId: null });
    assert.equal(chain.source, 'default-chain');
  } finally {
    engine.resolvePublishedWorkflowChain = original;
  }
});
