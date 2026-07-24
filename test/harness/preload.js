'use strict';

/**
 * Node preload for integration tests — loads .env.test.local only, never .env.
 * Must run before any test file imports Prisma or product code.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { assertTestDatabaseEnv } = require('./assert-test-database-env');

const root = path.join(__dirname, '../..');
const localEnvPath = path.join(root, '.env.test.local');

if (!fs.existsSync(localEnvPath)) {
    console.error('[test-harness:preload] FAIL: .env.test.local is missing (copy from .env.test.example)');
    process.exit(1);
}

dotenv.config({ path: localEnvPath, override: true });
process.env.NODE_ENV = 'test';

assertTestDatabaseEnv();
process.env.DATABASE_URL = process.env.OSE_TEST_DATABASE_URL;
assertTestDatabaseEnv();
