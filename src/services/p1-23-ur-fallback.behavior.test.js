'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('active-role permission loaders disable legacy fallback when UR is empty', () => {
  const resolveSrc = fs.readFileSync(
    path.join(__dirname, '../acc-runtime/resolvePermissions.js'),
    'utf8',
  );
  const rbacSrc = fs.readFileSync(path.join(__dirname, 'rbac.service.js'), 'utf8');

  assert.match(resolveSrc, /P1 #23/);
  assert.match(resolveSrc, /isActive/);
  assert.match(resolveSrc, /role\?\.isActive !== false/);
  assert.match(rbacSrc, /P1 #23/);
  assert.match(rbacSrc, /role\?\.isActive !== false/);

  // Ensure UR-configured path still preferred before active/inactive branch.
  const resolveUrIdx = resolveSrc.indexOf('if (urConfigured)');
  const resolveActiveIdx = resolveSrc.indexOf('role?.isActive !== false');
  assert.ok(resolveUrIdx >= 0 && resolveActiveIdx > resolveUrIdx);

  const rbacUrIdx = rbacSrc.indexOf('if (urConfigured)');
  const rbacActiveIdx = rbacSrc.indexOf('role?.isActive !== false');
  assert.ok(rbacUrIdx >= 0 && rbacActiveIdx > rbacUrIdx);
});

test('constitution includes VIEW_CLAIMS action for GET_PASS_VIEW_CLAIMS', () => {
  const { ACTIONS, PERMISSION_MAP } = require('../acc-authority/catalog.constitution');
  assert.ok(ACTIONS.some((a) => a.code === 'VIEW_CLAIMS'));
  assert.ok(PERMISSION_MAP.some((p) => p.legacyCode === 'GET_PASS_VIEW_CLAIMS' && p.action === 'VIEW_CLAIMS'));
});
