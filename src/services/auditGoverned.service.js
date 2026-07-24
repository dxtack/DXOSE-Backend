/**
 * Governed audit envelope (Phase H1) — all domain services should prefer logGovernedEvent or logAction.
 */
const { logAction, EntityType } = require('./auditTrail.service');

/**
 * @param {object} p
 * @param {string} p.tenantId
 * @param {string} p.entityType
 * @param {string|number} p.entityId
 * @param {string} p.action - AuditAction
 * @param {string} p.changedBy
 * @param {string} [p.eventType] - workflow classifier in note
 * @param {string} [p.note]
 * @param {object} [p.beforeValue]
 * @param {object} [p.afterValue]
 * @param {import('@prisma/client').Prisma.TransactionClient} [p.tx]
 */
async function logGovernedEvent({
    tenantId,
    entityType,
    entityId,
    action,
    changedBy,
    eventType = 'OPERATIONAL',
    note = null,
    beforeValue = null,
    afterValue = null,
    tx = null,
}) {
    const composedNote = [eventType, note].filter(Boolean).join(' | ');
    await logAction({
        tenantId,
        entityType,
        entityId,
        action,
        changedBy,
        note: composedNote,
        beforeValue,
        afterValue,
        tx,
    });
}

module.exports = {
    logGovernedEvent,
    EntityType,
};
