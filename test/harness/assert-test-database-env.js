'use strict';

/**
 * Integration test safety guard — no Prisma or product imports.
 * Fails closed with exit code 1 on unsafe environment.
 */

const REQUIRED_DB_NAME = 'ose_inventory_test';
const FORBIDDEN_DB_NAMES = new Set(['ose_inventory']);
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);

function fail(message) {
    console.error(`[test-harness:guard] FAIL: ${message}`);
    process.exit(1);
}

function parseDatabaseUrl(raw, label) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
        fail(`${label} is required`);
    }
    let parsed;
    try {
        parsed = new URL(raw.trim());
    } catch {
        fail(`${label} is not a valid URL`);
    }
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
        fail(`${label} must use a postgresql:// URL scheme`);
    }
    const host = parsed.hostname.toLowerCase();
    const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('?')[0] || '');
    if (!dbName) {
        fail(`${label} must include a database name`);
    }
    return { host, dbName, normalized: raw.trim() };
}

function assertTestDatabaseEnv() {
    if (process.env.NODE_ENV !== 'test') {
        fail(`NODE_ENV must be "test" (received "${process.env.NODE_ENV ?? ''}")`);
    }

    const testUrl = process.env.OSE_TEST_DATABASE_URL;
    if (!testUrl) {
        fail('OSE_TEST_DATABASE_URL is not set');
    }

    const test = parseDatabaseUrl(testUrl, 'OSE_TEST_DATABASE_URL');

    if (test.dbName !== REQUIRED_DB_NAME) {
        fail(`Database name must be exactly "${REQUIRED_DB_NAME}" (received "${test.dbName}")`);
    }
    if (!test.dbName.includes('test')) {
        fail('Database name must contain "test"');
    }
    if (!ALLOWED_HOSTS.has(test.host)) {
        fail(`Database host must be localhost or 127.0.0.1 (received "${test.host}")`);
    }
    if (FORBIDDEN_DB_NAMES.has(test.dbName)) {
        fail('Integration tests must not use the project database "ose_inventory"');
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
        const active = parseDatabaseUrl(databaseUrl, 'DATABASE_URL');
        if (!ALLOWED_HOSTS.has(active.host)) {
            fail(`DATABASE_URL host must be localhost or 127.0.0.1 (received "${active.host}")`);
        }
        if (FORBIDDEN_DB_NAMES.has(active.dbName)) {
            fail('DATABASE_URL points to project database "ose_inventory"; use ose_inventory_test only');
        }
        if (active.dbName !== test.dbName) {
            fail(
                `DATABASE_URL database "${active.dbName}" differs from OSE_TEST_DATABASE_URL database "${test.dbName}"`,
            );
        }
        if (active.normalized !== test.normalized) {
            fail('DATABASE_URL must match OSE_TEST_DATABASE_URL for integration tests');
        }
    }
}

module.exports = { assertTestDatabaseEnv, REQUIRED_DB_NAME };
