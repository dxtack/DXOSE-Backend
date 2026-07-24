/**
 * Scheduled integrity scans (Phase J1).
 */
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const { runAndPersistIntegrityScan } = require('./integrityMonitoring.service');

const prisma = new PrismaClient();

async function runIntegrityScansForAllTenants() {
    const tenants = await prisma.tenant.findMany({
        where: { isActive: true, adminStatus: 'ACTIVE' },
        select: { id: true, name: true },
    });
    let scanned = 0;
    let unhealthy = 0;
    for (const tenant of tenants) {
        try {
            const entry = await runAndPersistIntegrityScan(tenant.id, {
                triggeredBy: 'CRON',
                stockLedgerSampleSize: 150,
            });
            scanned += 1;
            if (!entry.healthy) unhealthy += 1;
            if (!entry.healthy) {
                logger.warn('[IntegrityCron] tenant scan unhealthy', {
                    tenantId: tenant.id,
                    tenantName: tenant.name,
                    blockerCount: entry.summary?.blockerCount,
                });
            }
        } catch (error) {
            logger.error('[IntegrityCron] tenant scan failed', {
                tenantId: tenant.id,
                message: error.message,
            });
        }
    }
    return { scanned, unhealthy, totalTenants: tenants.length };
}

module.exports = { runIntegrityScansForAllTenants };
