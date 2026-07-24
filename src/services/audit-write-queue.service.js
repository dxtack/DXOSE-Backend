'use strict';

const prisma = require('../config/database');
const logger = require('../utils/logger');
const { writeAuditLogFromQueueRow } = require('./auditWriter.service');

const BATCH_LIMIT = 50;
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_INITIAL_DELAY_SECONDS = 30;

const getMaxAttempts = () => {
    const n = parseInt(process.env.AUDIT_WRITE_MAX_ATTEMPTS, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ATTEMPTS;
};

const getInitialDelaySeconds = () => {
    const n = parseInt(process.env.AUDIT_WRITE_RETRY_INITIAL_DELAY_SECONDS, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_INITIAL_DELAY_SECONDS;
};

const computeBackoffMs = (attempts) => {
    const base = getInitialDelaySeconds() * 1000;
    const multiplier = Math.min(2 ** Math.max(0, attempts - 1), 16);
    return base * multiplier;
};

/**
 * Persist a failed audit write for async retry (P0-C).
 */
async function enqueueAuditWrite(payload) {
    const nextRetryAt = new Date(Date.now() + getInitialDelaySeconds() * 1000);
    const row = await prisma.auditWriteQueue.create({
        data: {
            tenantId: payload.tenantId,
            entityType: payload.entityType,
            entityId: String(payload.entityId),
            action: payload.action,
            changedBy: payload.changedBy,
            note: payload.note ?? null,
            beforeValue: payload.beforeValue ?? null,
            afterValue: payload.afterValue ?? null,
            ipAddress: payload.ipAddress ?? null,
            userAgent: payload.userAgent ?? null,
            status: 'PENDING',
            attempts: 0,
            nextRetryAt,
        },
    });
    logger.warn('[AuditQueue] audit write queued for retry', {
        queueId: row.id,
        tenantId: payload.tenantId,
        entityType: payload.entityType,
        action: payload.action,
    });
    return row;
}

async function attemptQueueRowWrite(row) {
    await writeAuditLogFromQueueRow(row);
}

/**
 * Re-drive PENDING audit_write_queue rows. Called by scheduler.js (every 2 min).
 */
const processAuditWriteQueue = async () => {
    const maxAttempts = getMaxAttempts();
    const now = new Date();

    const pending = await prisma.auditWriteQueue.findMany({
        where: {
            status: 'PENDING',
            attempts: { lt: maxAttempts },
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_LIMIT,
    });

    if (pending.length === 0) return { picked: 0, completed: 0, failed: 0 };

    logger.info(`[AuditQueue] processing ${pending.length} pending row(s)`);

    let completed = 0;
    let failed = 0;

    for (const row of pending) {
        try {
            await attemptQueueRowWrite(row);
            await prisma.auditWriteQueue.update({
                where: { id: row.id },
                data: {
                    status: 'COMPLETED',
                    attempts: { increment: 1 },
                    completedAt: new Date(),
                    lastError: null,
                    nextRetryAt: null,
                },
            });
            completed++;
            logger.info(`[AuditQueue] completed queueId=${row.id} action=${row.action}`);
        } catch (err) {
            const attempts = row.attempts + 1;
            const isDead = attempts >= maxAttempts;
            const nextRetryAt = isDead ? null : new Date(Date.now() + computeBackoffMs(attempts));

            await prisma.auditWriteQueue.update({
                where: { id: row.id },
                data: {
                    status: isDead ? 'DEAD' : 'PENDING',
                    attempts,
                    lastError: err.message,
                    nextRetryAt,
                },
            });
            failed++;
            logger.error(`[AuditQueue] retry failed queueId=${row.id} attempts=${attempts}`, {
                message: err.message,
                dead: isDead,
            });
        }
    }

    return { picked: pending.length, completed, failed };
};

module.exports = {
    enqueueAuditWrite,
    processAuditWriteQueue,
    attemptQueueRowWrite,
    getMaxAttempts,
    computeBackoffMs,
};
