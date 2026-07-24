'use strict';

/**
 * Wave 4 — Concurrency guards (unit + service behavior).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertConcurrencyVersion,
  CONFLICT_CODE,
  versionRequiredError,
} = require('./concurrency.service');

test('assertConcurrencyVersion: missing version when required → 409 CONCURRENCY_VERSION_REQUIRED', () => {
  assert.throws(
    () => assertConcurrencyVersion(null, 0, { required: true }),
    (err) => err.status === 409 && err.code === 'CONCURRENCY_VERSION_REQUIRED',
  );
});

test('assertConcurrencyVersion: correct version passes', () => {
  assert.doesNotThrow(() => assertConcurrencyVersion(2, 2, { required: true }));
});

test('assertConcurrencyVersion: stale version → 409 CONCURRENCY_CONFLICT', () => {
  assert.throws(
    () => assertConcurrencyVersion(1, 2, { required: true }),
    (err) => err.status === 409 && err.code === CONFLICT_CODE,
  );
});

test('versionRequiredError exposes 409', () => {
  const required = versionRequiredError();
  assert.equal(required.status, 409);
});
