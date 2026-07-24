#!/usr/bin/env node
'use strict';

/**
 * Migration rollback verification on TEST DB COPY (TEMPLATE clone — dev DB untouched).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SOURCE_DB = process.env.PG_SOURCE_DB || 'ose_inventory';
const TEST_DB = 'ose_inventory_p2_gate_test';
const DOCKER = process.env.PG_DOCKER_CONTAINER || 'ose_postgres';
const PG_USER = process.env.PG_USER || 'ose_user';

const REPORT = path.join(
    __dirname,
    '../governance-evidence-archive/timeline-remediation/backfill-reports/MIGRATION_ROLLBACK_TEST_EVIDENCE.json',
);

const ROLLBACK_SQL = `
DROP INDEX IF EXISTS "approval_requests_grnImportId_cycleNumber_key";
ALTER TABLE "approval_requests" DROP CONSTRAINT IF EXISTS "approval_requests_grnImportId_fkey";
DROP INDEX IF EXISTS "approval_requests_grnImportId_idx";
ALTER TABLE "approval_requests" DROP COLUMN IF EXISTS "grnImportId";
ALTER TABLE "approval_requests" DROP COLUMN IF EXISTS "cycleNumber";
`;

const REAPPLY_SQL = `
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "grnImportId" UUID;
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "cycleNumber" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS "approval_requests_grnImportId_idx" ON "approval_requests"("grnImportId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_requests_grnImportId_fkey') THEN
    ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_grnImportId_fkey"
      FOREIGN KEY ("grnImportId") REFERENCES "grn_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_grnImportId_cycleNumber_key"
  ON "approval_requests" ("grnImportId", "cycleNumber") WHERE "grnImportId" IS NOT NULL;
`;

function dockerPsql(db, sql) {
    execSync(`docker exec -i ${DOCKER} psql -U ${PG_USER} -d ${db} -v ON_ERROR_STOP=1`, {
        input: sql,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'],
    });
}

function dockerPsqlQuery(db, sql) {
    return execSync(`docker exec ${DOCKER} psql -U ${PG_USER} -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
    }).trim();
}

function main() {
    const evidence = {
        at: new Date().toISOString(),
        method: 'CREATE DATABASE TEMPLATE clone (source untouched)',
        sourceDatabase: SOURCE_DB,
        testDatabase: TEST_DB,
        steps: [],
    };

    dockerPsql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TEST_DB}' AND pid <> pg_backend_pid();`);
    dockerPsql('postgres', `DROP DATABASE IF EXISTS "${TEST_DB}";`);
    dockerPsql('postgres', `CREATE DATABASE "${TEST_DB}" TEMPLATE "${SOURCE_DB}";`);
    evidence.steps.push({ step: 'clone_template_db', status: 'PASS' });

    const grnCountBefore = dockerPsqlQuery(TEST_DB, 'SELECT COUNT(*) FROM grn_imports');
    const hasColsBefore =
        dockerPsqlQuery(TEST_DB, "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='approval_requests' AND column_name IN ('grnImportId','cycleNumber')");
    evidence.steps.push({
        step: 'verify_columns_before_rollback',
        status: hasColsBefore === '2' ? 'PASS' : 'FAIL',
        grnImportCount: grnCountBefore,
        approvalHistoryColumns: hasColsBefore,
    });

    dockerPsql(TEST_DB, ROLLBACK_SQL);
    evidence.steps.push({ step: 'rollback_grn_history_sql', status: 'PASS' });

    const hasColsAfterRollback = dockerPsqlQuery(
        TEST_DB,
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='approval_requests' AND column_name='grnImportId'",
    );
    evidence.steps.push({
        step: 'verify_columns_removed',
        status: hasColsAfterRollback === '0' ? 'PASS' : 'FAIL',
        grnImportIdPresent: hasColsAfterRollback,
    });

    dockerPsql(TEST_DB, REAPPLY_SQL);
    evidence.steps.push({ step: 'reapply_grn_history_sql', status: 'PASS' });

    const hasColsAfterReapply = dockerPsqlQuery(
        TEST_DB,
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='approval_requests' AND column_name IN ('grnImportId','cycleNumber')",
    );
    const grnCountAfter = dockerPsqlQuery(TEST_DB, 'SELECT COUNT(*) FROM grn_imports');
    evidence.steps.push({
        step: 'data_intact_after_reapply',
        status: hasColsAfterReapply === '2' && grnCountBefore === grnCountAfter ? 'PASS' : 'FAIL',
        grnImportCountBefore: grnCountBefore,
        grnImportCountAfter: grnCountAfter,
        columnsRestored: hasColsAfterReapply,
    });

    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(evidence, null, 2));

    const failed = evidence.steps.some((s) => s.status === 'FAIL');
    console.log(JSON.stringify(evidence, null, 2));
    if (failed) process.exit(1);
    console.log('Migration rollback test PASS — report:', REPORT);
}

main();
