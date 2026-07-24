const { writeAuditLog } = require('./auditWriter.service');

/**
 * Central audit trail logger for OS&E Inventory System.
 *
 * Usage:
 *   await logAction({
 *     tenantId,
 *     entityType: 'MOVEMENT' | 'STOCK_COUNT' | 'PERIOD_CLOSE' | 'ITEM' | ...
 *     entityId,
 *     action: 'CREATE' | 'SUBMIT' | 'POST' | 'APPROVE' | 'REJECT' | 'CLOSE_PERIOD' | 'LOCK_OB' | ...
 *     changedBy,          // userId
 *     note,               // optional human-readable description
 *     beforeValue,        // optional snapshot before change
 *     afterValue,         // optional snapshot after change
 *     tx,                 // optional prisma transaction client
 *   });
 *
 * `action` must be a member of Prisma `AuditAction` or the write is skipped (errors are logged, never thrown).
 */
const logAction = async ({
    tenantId,
    entityType,
    entityId,
    action,
    changedBy,
    note = null,
    beforeValue = null,
    afterValue = null,
    tx = null,
}) => {
    await writeAuditLog({
        tenantId,
        entityType,
        entityId,
        action,
        changedBy,
        note,
        beforeValue,
        afterValue,
        tx,
    });
};

// ── Entity Type constants ──────────────────────────────────────────────────
const EntityType = {
    MOVEMENT:       'MOVEMENT',
    STOCK_COUNT:    'STOCK_COUNT',
    STOCK_REPORT:   'STOCK_REPORT',
    PERIOD_CLOSE:   'PERIOD_CLOSE',
    GRN:            'GRN',
    BREAKAGE:       'BREAKAGE',
    LOST:           'LOST',
    TRANSFER:       'TRANSFER',
    ITEM:           'ITEM',
    LOCATION:       'LOCATION',
    DEPARTMENT:     'DEPARTMENT',
    CATEGORY:       'CATEGORY',
    SETTINGS:       'SETTINGS',
    USER:           'USER',
    GET_PASS:       'GET_PASS',
};

module.exports = { logAction, EntityType };
