'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Wave D — structured governance rows from audit log (grouping: module → document → events).
 */
async function getGovernanceAuditRows(tenantId, { start, end, cardId }) {
    const logs = await prisma.auditLog.findMany({
        where: { tenantId, changedAt: { gte: start, lte: end } },
        include: { changedByUser: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { changedAt: 'desc' },
        take: 3000,
    });

    let filtered = logs;
    if (cardId === 'approval-activity-report') {
        filtered = logs.filter((l) => /APPROV|REJECT|SUBMIT/i.test(String(l.action || '')));
    } else if (cardId === 'workflow-violations') {
        filtered = logs.filter((l) => /VIOLAT|OVERRIDE|REJECT|FAIL/i.test(String(l.action || l.note || '')));
    } else if (cardId === 'user-operational-activity') {
        filtered = logs.filter((l) => l.changedBy);
    }

    return filtered.map((l) => {
        const moduleKey = l.entityType || 'System';
        const documentKey = `${moduleKey}-${String(l.entityId || 'na').slice(0, 8)}`;
        return {
            date: l.changedAt.toISOString().split('T')[0],
            time: l.changedAt.toISOString().split('T')[1]?.slice(0, 8) || '',
            moduleKey,
            documentKey,
            entityType: l.entityType,
            action: l.action,
            entityId: l.entityId,
            changedBy: l.changedByUser
                ? `${l.changedByUser.firstName || ''} ${l.changedByUser.lastName || ''}`.trim()
                : String(l.changedBy || 'System'),
            note: l.note || '',
        };
    });
}

module.exports = {
    getGovernanceAuditRows,
};
