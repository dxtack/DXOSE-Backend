'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const localEnvPath = path.join(root, '.env.test.local');

console.log('TEST-ONLY SCHEMA BOOTSTRAP');
console.log('This uses prisma db push and does not validate the migration chain.');
console.log('SF-004 remains open.');

if (!fs.existsSync(localEnvPath)) {
    console.error('[test-bootstrap] FAIL: .env.test.local is missing. Copy from .env.test.example and configure OSE_TEST_DATABASE_URL.');
    process.exit(1);
}

dotenv.config({ path: localEnvPath, override: true });
process.env.NODE_ENV = 'test';

const { assertTestDatabaseEnv } = require('../test/harness/assert-test-database-env');
assertTestDatabaseEnv();
process.env.DATABASE_URL = process.env.OSE_TEST_DATABASE_URL;
assertTestDatabaseEnv();

const push = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env },
    shell: true,
});

process.exit(push.status ?? 1);
