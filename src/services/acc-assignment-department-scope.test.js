'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { assertDepartmentsBelongToProperties } = require('./acc-assignment-department-scope');

test('assertDepartmentsBelongToProperties allows empty department list', async () => {
  await assert.doesNotReject(() =>
    assertDepartmentsBelongToProperties([], ['property-1']),
  );
});

test('assertDepartmentsBelongToProperties rejects departments without a property', async () => {
  await assert.rejects(
    () => assertDepartmentsBelongToProperties(['dept-1'], []),
    (err) => err.code === 'DEPARTMENT_REQUIRES_PROPERTY',
  );
});
