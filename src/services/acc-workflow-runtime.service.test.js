'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('./acc-workflow-runtime.service');
const { defaultStepsForModule, DEFAULT_MODULE_CHAINS } = require('./acc-workflow-default-chains');

test('defaultStepsForModule returns steps for all Builder modules', () => {
  for (const key of Object.keys(DEFAULT_MODULE_CHAINS)) {
    const steps = defaultStepsForModule(key);
    assert.ok(steps.length > 0, `expected steps for ${key}`);
  }
});

test('resolveWorkflowForDocument rejects unknown module', async () => {
  await assert.rejects(
    () => runtime.resolveWorkflowForDocument({ moduleKey: 'NOT_A_MODULE', tenantId: null }),
    (err) => err.statusCode === 422,
  );
});

test('resolveWorkflowForDocument falls back to default TRANSFER chain when unpublished', async () => {
  const engine = require('../engines/workflow-resolution.engine');
  const original = engine.resolvePublishedWorkflowChain;
  engine.resolvePublishedWorkflowChain = async () => null;
  try {
    const chain = await runtime.resolveWorkflowForDocument({ moduleKey: 'TRANSFER', tenantId: null });
    assert.equal(chain.moduleKey, 'TRANSFER');
    assert.equal(chain.source, 'default-chain');
    assert.equal(chain.versionId, null);
    assert.deepEqual(chain.roleCodes, ['DEPT_MANAGER', 'FINANCE_MANAGER']);
    assert.ok(chain.steps.length >= 2);
  } finally {
    engine.resolvePublishedWorkflowChain = original;
  }
});

test('resolveWorkflowForDocument falls back to default STOCK_COUNT chain when unpublished', async () => {
  const engine = require('../engines/workflow-resolution.engine');
  const original = engine.resolvePublishedWorkflowChain;
  engine.resolvePublishedWorkflowChain = async () => null;
  try {
    const chain = await runtime.resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId: null });
    assert.equal(chain.moduleKey, 'STOCK_COUNT');
    assert.equal(chain.source, 'default-chain');
    assert.equal(chain.versionId, null);
    assert.deepEqual(chain.roleCodes, ['COST_CONTROL', 'DEPT_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER']);
    assert.ok(chain.steps.length >= 4);
  } finally {
    engine.resolvePublishedWorkflowChain = original;
  }
});

test('resolveWorkflowForDocument still requires published workflow for non-fallback modules', async () => {
  const engine = require('../engines/workflow-resolution.engine');
  const original = engine.resolvePublishedWorkflowChain;
  engine.resolvePublishedWorkflowChain = async () => null;
  try {
    await assert.rejects(
      () => runtime.resolveWorkflowForDocument({ moduleKey: 'BREAKAGE', tenantId: null }),
      (err) =>
        err.statusCode === 422 &&
        /ACC published workflow is required for BREAKAGE/.test(err.message),
    );
  } finally {
    engine.resolvePublishedWorkflowChain = original;
  }
});

test('getWorkflowEnforcementStatus reports P30 acc-only', () => {
  const status = runtime.getWorkflowEnforcementStatus();
  assert.equal(status.runtimePhase, 'P30');
  assert.equal(status.primarySource, 'acc-only');
  assert.equal(status.accZeroLegacy, true);
  assert.equal(status.legacyFallback, undefined);
  assert.equal(status.accWorkflowLegacyRetired, true);
});
