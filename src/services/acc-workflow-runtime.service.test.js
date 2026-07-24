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

test('getWorkflowEnforcementStatus reports P30 acc-only', () => {
  const status = runtime.getWorkflowEnforcementStatus();
  assert.equal(status.runtimePhase, 'P30');
  assert.equal(status.primarySource, 'acc-only');
  assert.equal(status.accZeroLegacy, true);
  assert.equal(status.legacyFallback, undefined);
  assert.equal(status.accWorkflowLegacyRetired, true);
});
