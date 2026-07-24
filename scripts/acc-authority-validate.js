'use strict';

/**
 * ACC Authority validation — Phase E
 * Run: node scripts/acc-authority-validate.js
 * Exit 0 = PASS, 1 = FAIL
 */

const fs = require('fs');
const path = require('path');
const {
  PERMISSION_MAP,
  RESOURCES,
  ROUTE_PERMISSION_REGISTRY,
} = require('../src/acc-authority/catalog.constitution');

const ROUTES_DIR = path.join(__dirname, '..', 'src', 'routes');
const AUTHORIZE_PATH = path.join(__dirname, '..', 'src', 'middleware', 'authorize.js');
const FRONTEND_ROUTES = path.join(__dirname, '..', '..', 'OSE-Frontend', 'src', 'app', 'app.routes.ts');

const errors = [];
const warnings = [];

function scanAuthorizeRoleCalls() {
  const files = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.js'));
  const tenantRoleOnly = [];
  const platformAllowlist = new Set(['superAdmin.routes.js']);

  for (const file of files) {
    const content = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
    if (!content.includes('authorize(')) continue;
    if (platformAllowlist.has(file)) continue;
    const matches = content.match(/authorize\s*\(/g);
    if (matches?.length) {
      tenantRoleOnly.push({ file, count: matches.length });
    }
  }
  return tenantRoleOnly;
}

function validateCatalog() {
  const resourceCodes = new Set(RESOURCES.map((r) => r.code));
  for (const p of PERMISSION_MAP) {
    if (!resourceCodes.has(p.resource)) {
      errors.push(`Permission ${p.legacyCode} references unknown resource ${p.resource}`);
    }
  }
}

function validateAuthorizeStaticMatrix() {
  const content = fs.readFileSync(AUTHORIZE_PATH, 'utf8');
  if (!content.includes('runtime-permission-matrix')) {
    errors.push('authorize.js must import PERMISSIONS from acc-authority/runtime-permission-matrix (Phase F)');
  }
  const { PERMISSIONS } = require('../src/acc-authority/runtime-permission-matrix');
  for (const p of PERMISSION_MAP) {
    if (!Object.prototype.hasOwnProperty.call(PERMISSIONS, p.legacyCode)) {
      warnings.push(`Runtime matrix missing entry for ${p.legacyCode}`);
    }
  }
}

function validatePhaseFLegacyRetirement() {
  const rbacSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'rbac.service.js'), 'utf8');
  if (/require\s*\(\s*['"].*rbac-matrix\.constants['"]\s*\)/.test(rbacSrc)) {
    errors.push('rbac.service.js must not import rbac-matrix.constants (Phase F)');
  }
  const resolveSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'acc-runtime', 'resolvePermissions.js'),
    'utf8',
  );
  if (/mergeWithOperationalMatrix\s*\(/.test(resolveSrc)) {
    errors.push('resolvePermissions.js must not call mergeWithOperationalMatrix (Phase F)');
  }
  const userRightsSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'controllers', 'userRights.controller.js'),
    'utf8',
  );
  if (/require\s*\(\s*['"].*rbac-matrix\.constants['"]\s*\)/.test(userRightsSrc)) {
    errors.push('userRights.controller.js must not import rbac-matrix.constants (Phase F)');
  }
}

function validateFrontendRegistry() {
  if (!fs.existsSync(FRONTEND_ROUTES)) {
    warnings.push('Frontend app.routes.ts not found — skip route registry check');
    return;
  }
  const content = fs.readFileSync(FRONTEND_ROUTES, 'utf8');
  for (const [route, perm] of Object.entries(ROUTE_PERMISSION_REGISTRY)) {
    if (!content.includes(perm) && route !== '/admin/tenants') {
      warnings.push(`Route registry ${route} → ${perm} not referenced in app.routes.ts`);
    }
  }
}

function main() {
  console.log('ACC Authority Validation\n');

  validateCatalog();
  validateAuthorizeStaticMatrix();
  validatePhaseFLegacyRetirement();
  validateFrontendRegistry();

  const roleOnly = scanAuthorizeRoleCalls();
  if (roleOnly.length > 0) {
    for (const entry of roleOnly) {
      errors.push(`Role-only authorize() remains in ${entry.file} (${entry.count} call(s))`);
    }
  }

  if (warnings.length) {
    console.log('Warnings:');
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
    console.log('');
  }

  if (errors.length) {
    console.log('Errors:');
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log(`\nFAIL — ${errors.length} error(s)\n`);
    process.exit(1);
  }

  console.log(`PASS — catalog ${RESOURCES.length} resources, ${PERMISSION_MAP.length} permissions`);
  console.log('No tenant role-only route files detected.\n');
}

main();
