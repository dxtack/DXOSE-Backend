/**
 * ACC P2 — Static verification for enforcement alignment deliverables.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(label, ok) {
    if (ok) {
        passed += 1;
        console.log(`  ✓ ${label}`);
    } else {
        failed += 1;
        console.log(`  ✗ ${label}`);
    }
}

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('\nACC P2 — Enforcement Alignment Verification');
console.log('='.repeat(60));

console.log('\n[1] Services');
assert('acc-membership-assignment-sync.service.js', fs.existsSync(path.join(ROOT, 'src/services/acc-membership-assignment-sync.service.js')));
assert('acc-p2-assignment-coverage.service.js', fs.existsSync(path.join(ROOT, 'src/services/acc-p2-assignment-coverage.service.js')));
assert('acc-p2-route-migration.service.js', fs.existsSync(path.join(ROOT, 'src/services/acc-p2-route-migration.service.js')));
assert('acc-p2-enforcement-status.service.js', fs.existsSync(path.join(ROOT, 'src/services/acc-p2-enforcement-status.service.js')));

console.log('\n[2] Settings identity boundary');
const usersSvc = read('src/services/users.service.js');
assert('throwAccessManagedInAcc helper', usersSvc.includes('throwAccessManagedInAcc'));
assert('updateUserRole blocked', usersSvc.includes('updateUserRole = async') && usersSvc.includes('throwAccessManagedInAcc()'));
assert('createUser dual-write sync', usersSvc.includes('syncMembershipToAssignment'));

console.log('\n[3] Permission engine alignment');
const permEngine = read('src/engines/permission-resolution.engine.js');
assert('resolveEffectivePermissionsForSession exported', permEngine.includes('resolveEffectivePermissionsForSession'));
const accResolve = read('src/acc-runtime/resolvePermissions.js');
assert('_findSessionAssignment exported', accResolve.includes('_findSessionAssignment'));

console.log('\n[4] Scope pilot wiring');
const auth = read('src/middleware/authenticate.js');
assert('scopeEnforcementMiddleware in authenticate', auth.includes('scopeEnforcementMiddleware'));

console.log('\n[5] Enforcement API routes');
const routes = read('src/routes/accEnforcement.routes.js');
assert('GET /p2-status', routes.includes("'/p2-status'"));
assert('GET /assignment-coverage', routes.includes("'/assignment-coverage'"));
assert('GET /route-migration-inventory', routes.includes("'/route-migration-inventory'"));

console.log('\n[6] authorize(role) inventory');
const { getAuthorizeRoleInventory } = require('../src/services/acc-p2-route-migration.service');
const inventory = getAuthorizeRoleInventory();
assert('inventory scans route files', inventory.summary.routeFilesScanned > 0);
console.log(`     Files with authorize(role): ${inventory.summary.filesWithAuthorizeRole}`);
console.log(`     Total authorize(role) calls: ${inventory.summary.totalAuthorizeRoleCalls}`);

console.log('\n' + '='.repeat(60));
console.log(`Result: ${passed} passed, ${failed} failed\n`);

if (failed > 0) process.exit(1);
