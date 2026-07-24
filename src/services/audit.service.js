const prisma = require('../config/database');
const { writeAuditLog } = require('./auditWriter.service');

/**
 * M14 — Audit Service
 * Writes immutable audit log entries — never updates or deletes records
 */

const log = async ({ tenantId, entityType, entityId, action, changedBy, beforeValue, afterValue, ipAddress, userAgent }) => {
    await writeAuditLog({
        tenantId,
        entityType,
        entityId,
        action,
        changedBy,
        note: null,
        beforeValue: beforeValue ?? null,
        afterValue: afterValue ?? null,
        ipAddress,
        userAgent,
        tx: null,
    });
};

const getAuditLog = async (tenantId, { entityType, entityId, changedBy, from, to, page = 1, limit = 50 } = {}) => {
    const skip = (page - 1) * limit;

    const where = {
        tenantId,
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId: String(entityId) } : {}),
        ...(changedBy ? { changedBy } : {}),
        ...(from || to
            ? {
                changedAt: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                },
            }
            : {}),
    };

    const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
            where,
            orderBy: { changedAt: 'desc' },
            skip,
            take: limit,
            include: {
                changedByUser: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
            },
        }),
    ]);

    return { logs, total, page, limit };
};

module.exports = { log, getAuditLog };
