const cron = require('node-cron');
const prisma = require('../config/database');
const notificationService = require('../services/notification.service');
const emailService = require('../services/email.service');
const getPassService = require('../services/getPass.service');
const { processMailQueue } = require('../services/mail/queue');
const { processAuditWriteQueue } = require('../services/audit-write-queue.service');
const { invalidateTenantCache } = require('../middleware/subscription');
const logger = require('./logger');

// Daily at midnight (server local time): sync subStatus for past-due licenses
cron.schedule('0 0 * * *', async () => {
    logger.info('[CRON] Starting subscription expiration sync...');
    try {
        const now = new Date();
        const due = await prisma.tenant.findMany({
            where: {
                licenseEndDate: { not: null, lt: now },
                subStatus: { not: 'EXPIRED' },
            },
            select: { id: true },
        });
        if (due.length === 0) {
            logger.info('[CRON] Subscription expiration sync: no tenants to update.');
            return;
        }
        await prisma.tenant.updateMany({
            where: { id: { in: due.map((t) => t.id) } },
            data: { subStatus: 'EXPIRED' },
        });
        due.forEach((t) => invalidateTenantCache(t.id));
        logger.info(`[CRON] Subscription expiration sync: marked ${due.length} tenant(s) as EXPIRED.`);
    } catch (error) {
        logger.error('[CRON] Subscription expiration sync failed', { message: error.message, stack: error.stack });
    }
});

// Run every day at 8:00 AM
cron.schedule('0 8 * * *', async () => {
    logger.info('[CRON] Starting Daily Stock Alert check...');
    try {
        // Find active tenant admins
        const tenants = await prisma.tenantMember.findMany({
            where: { role: { code: 'ADMIN' }, isActive: true, tenantId: { not: null }, user: { isActive: true } },
            select: { tenantId: true, user: { select: { email: true } } },
            distinct: ['tenantId']
        });

        for (const admin of tenants) {
            const tenantId = admin.tenantId;
            const alerts = await notificationService.getLowStockAlerts(tenantId);
            const criticalAlerts = alerts.filter(a => a.severity === 'critical');

            if (criticalAlerts.length > 0) {
                logger.info(`[CRON] Found ${criticalAlerts.length} critical alerts for tenant ${tenantId}. Sending email...`);
                // For a more robust solution, you'd aggregate all admins/purchasing managers for the tenant
                await emailService.sendCriticalStockAlert(criticalAlerts, admin.user.email);
            }
        }
    } catch (error) {
        logger.error('[CRON] Failed to run Daily Stock Alert check', { message: error.message, stack: error.stack });
    }
});

// Every 2 minutes: re-drive any PENDING EmailLog rows whose nextRetryAt has passed.
// Ensures approval/password-reset emails survive transient SMTP outages.
cron.schedule('*/2 * * * *', async () => {
    try {
        const result = await processMailQueue();
        if (result.picked > 0) {
            logger.info(
                `[CRON] mail queue: picked=${result.picked} sent=${result.sent} failed=${result.failed}`
            );
        }
    } catch (error) {
        logger.error('[CRON] mail queue processing failed', {
            message: error.message,
            stack: error.stack,
        });
    }
});

// Every 2 minutes: re-drive failed audit_log writes queued in audit_write_queue (P0-C).
cron.schedule('*/2 * * * *', async () => {
    try {
        const result = await processAuditWriteQueue();
        if (result.picked > 0) {
            logger.info(
                `[CRON] audit write queue: picked=${result.picked} completed=${result.completed} failed=${result.failed}`,
            );
        }
    } catch (error) {
        logger.error('[CRON] audit write queue processing failed', {
            message: error.message,
            stack: error.stack,
        });
    }
});

// Daily auto close — Ch.6.14 (respects tenant settings; no bypass when blockers exist).
cron.schedule('0 2 * * *', async () => {
    if (process.env.DISABLE_PERIOD_AUTO_CLOSE_CRON === '1' || process.env.DISABLE_PERIOD_AUTO_CLOSE_CRON === 'true') {
        return;
    }
    logger.info('[CRON] Starting period auto close job...');
    try {
        const { runAutoCloseJob } = require('../services/periodAutoClose.service');
        const results = await runAutoCloseJob();
        const closed = results.filter((r) => r.closed).length;
        const blocked = results.filter((r) => r.closed === false && r.checklist).length;
        logger.info(`[CRON] Period auto close completed: tenants=${results.length}, closed=${closed}, blocked=${blocked}.`);
    } catch (error) {
        logger.error('[CRON] Period auto close failed', { message: error.message, stack: error.stack });
    }
});

logger.info('[CRON] Scheduler initialized.');

// Daily 06:00 — integrity scan all active tenants (persisted history per tenant).
cron.schedule('0 6 * * *', async () => {
    if (process.env.DISABLE_INTEGRITY_CRON === '1' || process.env.DISABLE_INTEGRITY_CRON === 'true') {
        return;
    }
    logger.info('[CRON] Starting daily integrity scan...');
    try {
        const { runIntegrityScansForAllTenants } = require('../services/integrityScheduler.service');
        const result = await runIntegrityScansForAllTenants();
        logger.info(
            `[CRON] Integrity scan completed: tenants=${result.scanned}/${result.totalTenants}, unhealthy=${result.unhealthy}.`,
        );
    } catch (error) {
        logger.error('[CRON] Integrity scan failed', { message: error.message, stack: error.stack });
    }
});

// Run every day at 9:00 AM: mark overdue gate passes and notify cost control users.
cron.schedule('0 9 * * *', async () => {
    logger.info('[CRON] Starting overdue gate pass scan...');
    try {
        const { overdueCount, notifiedCount } = await getPassService.checkAndNotifyOverduePasses({
            notifyCostControl: true,
        });
        logger.info(
            `[CRON] Overdue gate pass scan completed: overdue=${overdueCount}, notified=${notifiedCount}.`
        );
    } catch (error) {
        logger.error('[CRON] Overdue gate pass scan failed', {
            message: error.message,
            stack: error.stack,
        });
    }
});
