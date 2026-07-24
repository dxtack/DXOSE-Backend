/**
 * ACC Big Bang Stage S7 — Assignment backfill (data only)
 * ───────────────────────────────────────────────────────
 * Populates ur_user_assignments from active TenantMember rows.
 * Runtime still uses TenantMember — no enforce flags, no cutover.
 *
 * Usage:
 *   node scripts/backfill-assignments.js
 *   node scripts/backfill-assignments.js --dry-run
 *
 * Mapping:
 *   TenantMember.userId/roleId/isActive → UrUserAssignment
 *   TenantMember.id                     → notes = 'legacy:<uuid>' (idempotency tag)
 *   tenantId set                        → UrAssignmentProperty row
 *   departmentId + !canViewAllDepartments → UrAssignmentDepartment row
 *
 * Re-runs are safe: existing legacy tags are skipped.
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const {
  runAccAssignmentBackfill,
  printBackfillReport,
} = require('./lib/acc-assignment-backfill');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const mode = DRY_RUN ? '[DRY RUN]' : '[LIVE]';
  console.log(`\nACC Big Bang S7 — Assignment Backfill ${mode}`);
  console.log('='.repeat(60));

  const stats = await runAccAssignmentBackfill(prisma, { dryRun: DRY_RUN });
  printBackfillReport(stats, DRY_RUN);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('\nBACKFILL FAILED:', e.message);
    prisma.$disconnect();
    process.exit(1);
  });
