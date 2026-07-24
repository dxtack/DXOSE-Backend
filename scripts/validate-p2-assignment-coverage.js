/**
 * ACC P2 — Assignment linkage coverage report (read-only).
 *
 * Usage:
 *   node scripts/validate-p2-assignment-coverage.js
 *   node scripts/validate-p2-assignment-coverage.js --tenantId=<uuid>
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { getAssignmentCoverageReport } = require('../src/services/acc-p2-assignment-coverage.service');

const prisma = new PrismaClient();

async function main() {
    const tenantArg = process.argv.find((a) => a.startsWith('--tenantId='));
    const tenantId = tenantArg ? tenantArg.split('=')[1] : null;

    console.log('\nACC P2 — Assignment Linkage Coverage');
    console.log('='.repeat(60));

    const report = await getAssignmentCoverageReport({ tenantId });
    const s = report.summary;

    console.log(`  Scope tenantId:               ${report.scope.tenantId ?? 'ALL'}`);
    console.log(`  Active TenantMembers:         ${s.activeTenantMembers}`);
    console.log(`  Legacy-tagged assignments:    ${s.legacyTaggedAssignments}`);
    console.log(`  Linked:                       ${s.linked}`);
    console.log(`  Unmigrated:                   ${s.unmigrated}`);
    console.log(`  Coverage:                     ${s.coveragePercent}%`);
    console.log(`  Role drift rows:              ${s.roleDrift}`);
    console.log(`  Active/inactive drift:        ${s.inactiveDrift}`);
    console.log(`  Orphan legacy assignments:    ${s.orphanLegacyAssignments}`);
    console.log(`  Coverage complete:            ${s.coverageComplete ? 'YES ✓' : 'NO ✗'}`);
    console.log('='.repeat(60));

    if (report.unmigrated.length > 0) {
        console.log('\nSample unmigrated (max 10):');
        report.unmigrated.slice(0, 10).forEach((r) => {
            console.log(`  - ${r.email} | ${r.roleCode} | member=${r.tenantMemberId}`);
        });
    }

    console.log('\nKnown limitations:');
    report.knownLimitations.forEach((l) => console.log(`  • ${l}`));
    console.log('');

    if (!s.coverageComplete) {
        process.exit(1);
    }
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error('FAILED:', e.message);
        prisma.$disconnect();
        process.exit(1);
    });
