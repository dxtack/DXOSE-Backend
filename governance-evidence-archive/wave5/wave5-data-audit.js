'use strict';

/**
 * Wave 5 — Transfer Legacy Data Audit (all tenants)
 * Usage: node Governance/wave5/wave5-data-audit.js
 */

delete process.env.DATABASE_URL;
require('../../test/harness/preload');

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const OUT = path.join(__dirname, 'WAVE5_DATA_AUDIT.json');

const LEGACY_STATUSES = ['IN_TRANSIT', 'RECEIVED', 'CLOSED', 'SUBMITTED', 'APPROVED', 'PENDING_FINAL'];
const ACTIVE_STATUSES = ['DRAFT', 'PENDING_DEPT', 'PENDING_FINANCE', 'POSTED', 'REJECTED'];
const HISTORICAL_STATUSES = ['IN_TRANSIT', 'RECEIVED', 'CLOSED', 'SUBMITTED', 'APPROVED', 'PENDING_FINAL'];

async function main() {
  const prisma = new PrismaClient();
  try {
    const total = await prisma.storeTransfer.count();
    const byStatus = await prisma.storeTransfer.groupBy({
      by: ['status'],
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });

    const byTenant = await prisma.storeTransfer.groupBy({
      by: ['tenantId', 'status'],
      _count: { _all: true },
    });

    const legacyCounts = {};
    for (const s of LEGACY_STATUSES) {
      legacyCounts[s] = await prisma.storeTransfer.count({ where: { status: s } });
    }

    const withDispatchTs = await prisma.storeTransfer.count({ where: { dispatchedAt: { not: null } } });
    const withReceiveTs = await prisma.storeTransfer.count({ where: { receivedAt: { not: null } } });
    const withPosted = await prisma.storeTransfer.count({ where: { postedAt: { not: null } } });
    const postedStatus = await prisma.storeTransfer.count({ where: { status: 'POSTED' } });

    const legacySamples = await prisma.storeTransfer.findMany({
      where: { status: { in: LEGACY_STATUSES } },
      select: {
        id: true,
        tenantId: true,
        transferNo: true,
        status: true,
        dispatchedAt: true,
        receivedAt: true,
        postedAt: true,
        closedAt: true,
        approvedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    const v2PostedSample = await prisma.storeTransfer.findMany({
      where: { status: 'POSTED' },
      select: {
        id: true,
        transferNo: true,
        dispatchedAt: true,
        receivedAt: true,
        postedAt: true,
        postedBy: true,
        receivedBy: true,
      },
      take: 5,
    });

    const ledgerTransfer = await prisma.inventoryLedger.count({
      where: { referenceType: 'TRANSFER' },
    });

    const audit = {
      generatedAt: new Date().toISOString(),
      database: process.env.OSE_TEST_DATABASE_URL ? 'test' : 'configured',
      totals: { transfers: total, ledgerTransferEntries: ledgerTransfer },
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
      legacyStatusCounts: legacyCounts,
      legacyFieldCounts: {
        dispatchedAtPopulated: withDispatchTs,
        receivedAtPopulated: withReceiveTs,
        postedAtPopulated: withPosted,
        statusPosted: postedStatus,
      },
      tenantStatusMatrix: byTenant.map((r) => ({
        tenantId: r.tenantId,
        status: r.status,
        count: r._count._all,
      })),
      legacySamples,
      v2PostedSample,
      classification: {
        activeOperational: ACTIVE_STATUSES,
        historicalReadOnly: HISTORICAL_STATUSES.filter((s) => (legacyCounts[s] || 0) > 0),
        deadStatuses: HISTORICAL_STATUSES.filter((s) => (legacyCounts[s] || 0) === 0),
      },
    };

    fs.writeFileSync(OUT, `${JSON.stringify(audit, null, 2)}\n`);
    console.log(JSON.stringify({
      total,
      byStatus: audit.byStatus,
      legacyStatusCounts: legacyCounts,
      deadStatuses: audit.classification.deadStatuses,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
