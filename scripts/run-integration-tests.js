'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const localEnvPath = path.join(root, '.env.test.local');
const preloadPath = path.join(root, 'test/harness/preload.js');
const integrationTestPaths = [
    path.join(root, 'test/integration/proof/disposable-tenant-department.test.js'),
    path.join(root, 'test/integration/characterization/acc-permission-resolution.test.js'),
    path.join(root, 'test/integration/characterization/acc-assignment-department-scope.test.js'),
    path.join(root, 'test/integration/characterization/acc-permission-version-stale.test.js'),
    path.join(root, 'test/integration/characterization/acc-assignment-lifecycle-permission-version.test.js'),
    path.join(root, 'test/integration/characterization/acc-assignment-audit-atomicity.test.js'),
    path.join(root, 'test/integration/characterization/acc-assignment-reactivate-permission-version.test.js'),
    path.join(root, 'test/integration/characterization/api-grn-authorization.test.js'),
    path.join(root, 'test/integration/characterization/tenant-isolation-grn.test.js'),
    path.join(root, 'test/integration/characterization/movement-adjustment-runtime.test.js'),
    path.join(root, 'test/integration/characterization/movement-adjustment-api-validation.test.js'),
    path.join(root, 'test/integration/characterization/retired-modules-404.test.js'),
    path.join(root, 'test/integration/characterization/legacy-routes-authenticated.test.js'),
    path.join(root, 'test/integration/characterization/posting-period-document-mirrors.test.js'),
    path.join(root, 'test/integration/characterization/tenant-timezone-boundaries.test.js'),
    path.join(root, 'test/integration/characterization/period-close-inventory-count-blocker.test.js'),
    path.join(root, 'test/integration/characterization/period-close-atomicity-race.test.js'),
    path.join(root, 'test/integration/characterization/period-opening-continuity-verification.test.js'),
    path.join(root, 'test/integration/characterization/period-opening-continuity-staleness.test.js'),
    path.join(root, 'test/integration/characterization/period-ledger-snapshot-valuation.test.js'),
];

if (!fs.existsSync(localEnvPath)) {
    console.error('[test-harness] FAIL: .env.test.local is missing. Copy from .env.test.example and configure OSE_TEST_DATABASE_URL.');
    process.exit(1);
}

dotenv.config({ path: localEnvPath, override: true });
process.env.NODE_ENV = 'test';

const { assertTestDatabaseEnv } = require('../test/harness/assert-test-database-env');
assertTestDatabaseEnv();
process.env.DATABASE_URL = process.env.OSE_TEST_DATABASE_URL;
assertTestDatabaseEnv();

const testRun = spawnSync(
    process.execPath,
    ['--require', preloadPath, '--test', '--test-concurrency=1', ...integrationTestPaths],
    {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env },
    },
);

process.exit(testRun.status ?? 1);
