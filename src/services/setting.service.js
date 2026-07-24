const prisma = require('../config/database');
const auditService = require('./audit.service');
const { logAction, EntityType } = require('./auditTrail.service');

const OB_SNAPSHOT_SETTING_KEY = 'obFinalizeSnapshot';
const OB_SNAPSHOT_HISTORY_SETTING_KEY = 'obFinalizeSnapshotHistory';

const parseSnapshotValue = (value) => {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

/** Extended timeout for large OB finalize (200+ lines in one transaction). */
const OB_FINALIZE_TRANSACTION_OPTIONS = Object.freeze({
    timeout: 120_000,
    maxWait: 10_000,
});
const getObStatus = async (tenantId) => {
    const [allowRow, snapRow] = await Promise.all([
        prisma.tenantSetting.findUnique({
            where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
            select: { value: true },
        }),
        prisma.tenantSetting.findUnique({
            where: { tenantId_key: { tenantId, key: OB_SNAPSHOT_SETTING_KEY } },
            select: { value: true },
        }),
    ]);

    let snapshot = null;
    if (snapRow?.value) {
        snapshot = parseSnapshotValue(snapRow.value);
    }

    const hasFinalizedSnapshot = Boolean(snapshot?.finalizedAt);
    if (allowRow?.value === 'OPEN') return 'OPEN';
    if (allowRow?.value === 'LOCKED' && hasFinalizedSnapshot) return 'FINALIZED';
    return 'INITIAL_LOCK';
};


const formatUserDisplayName = (user) => {
    if (!user) return 'Unknown';
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return name || user.email || 'Unknown';
};

/**
 * Tenant Settings Service
 * Key-value store for tenant-level configuration.
 * Includes Opening Balance eligibility logic.
 */

// ── GET setting ────────────────────────────────────────────────────────────────
const getSetting = async (tenantId, key) => {
    const setting = await prisma.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key } },
    });
    if (setting) return setting.value;

    // Keep Opening Balance deterministic for new/legacy tenants.
    if (key === 'allowOpeningBalance') return 'LOCKED';

    return null;
};

// ── SET setting (with audit) ───────────────────────────────────────────────────
const setSetting = async (tenantId, key, value, userId, reason = null) => {
    const before = await prisma.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key } },
    });

    const result = await prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: { value, updatedBy: userId, reason },
        create: { tenantId, key, value, updatedBy: userId, reason },
    });

    // Audit log
    await auditService.log({
        tenantId,
        entityType: 'TenantSetting',
        entityId: key,
        action: before ? 'UPDATE' : 'CREATE',
        changedBy: userId,
        beforeValue: before ? { key, value: before.value, reason: before.reason } : null,
        afterValue: { key, value, reason },
    });

    return result;
};

// ── OB ELIGIBILITY CHECK ───────────────────────────────────────────────────────
/**
 * Determines if Opening Balance import is allowed for a tenant.
 * Rules:
 *   1. If setting = 'LOCKED' → always blocked
 *   2. If setting = 'OPEN'   → admin override, always allowed
 *   3. If no setting         → check posted non-OB movements
 * Returns: { allowed: boolean, reason: string }
 */
const isOpeningBalanceAllowed = async (tenantId) => {
    const [obStatus, lockSetting] = await Promise.all([
        getObStatus(tenantId),
        prisma.tenantSetting.findUnique({
            where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
        }),
    ]);

    if (obStatus === 'OPEN') {
        return { allowed: true, reason: 'Opening Balance enabled by administrator.' };
    }

    if (obStatus === 'FINALIZED') {
        return {
            allowed: false,
            reason: lockSetting?.reason || 'Opening Balance has been finalized and locked.',
            lockedAt: lockSetting?.updatedAt,
        };
    }

    return {
        allowed: false,
        reason: lockSetting?.reason || 'Opening Balance is locked by default. Must be enabled by an administrator.',
        lockedAt: lockSetting?.updatedAt,
    };
};

// ── Clear persisted OB finalize snapshot (legacy/admin only — not used on reopen) ─
const clearObFinalizeSnapshot = async (tenantId) => {
    await prisma.tenantSetting.deleteMany({
        where: { tenantId, key: OB_SNAPSHOT_SETTING_KEY },
    });
};

const appendObSnapshotToHistory = async (tenantId, snapshot, userId, tx) => {
    if (!snapshot?.finalizedAt) return;

    const client = tx || prisma;
    const historyRow = await client.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key: OB_SNAPSHOT_HISTORY_SETTING_KEY } },
        select: { value: true },
    });

    let history = [];
    const parsedHistory = parseSnapshotValue(historyRow?.value);
    if (Array.isArray(parsedHistory)) {
        history = parsedHistory;
    }

    history.push({
        ...snapshot,
        archivedAt: new Date().toISOString(),
    });

    await client.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: OB_SNAPSHOT_HISTORY_SETTING_KEY } },
        update: {
            value: JSON.stringify(history),
            updatedBy: userId,
            reason: 'Opening balance snapshot history',
        },
        create: {
            tenantId,
            key: OB_SNAPSHOT_HISTORY_SETTING_KEY,
            value: JSON.stringify(history),
            updatedBy: userId,
            reason: 'Opening balance snapshot history',
        },
    });
};

/**
 * Build OB finalize snapshot summary from current stock balances (qtyOnHand > 0).
 * Same aggregation as manual finalizeOpeningBalance.
 */
const buildObSnapshotFromBalances = async (tenantId, tx, meta = {}) => {
    const client = tx || prisma;
    const balanceRows = await client.stockBalance.findMany({
        where: { tenantId, qtyOnHand: { gt: 0 } },
        select: { itemId: true, qtyOnHand: true, wacUnitCost: true },
    });
    const distinctItems = new Set();
    let totalOpeningValue = 0;
    for (const b of balanceRows) {
        distinctItems.add(b.itemId);
        totalOpeningValue += Number(b.qtyOnHand) * Number(b.wacUnitCost);
    }
    totalOpeningValue = Math.round(totalOpeningValue * 100) / 100;

    return {
        totalItemsCount: distinctItems.size,
        totalOpeningValue,
        postedObDocuments: meta.postedObDocuments ?? 0,
        finalizedAt: meta.finalizedAt || new Date().toISOString(),
        finalizedBy: meta.finalizedBy || 'System',
        currencyCode: meta.currencyCode || 'SAR',
        source: meta.source || undefined,
    };
};

/**
 * Lock OB + write obFinalizeSnapshot from current balances.
 * Used by COUNT_ADJUSTMENT auto-lock paths so getObStatus() becomes FINALIZED
 * (LOCKED alone without snapshot stays INITIAL_LOCK).
 *
 * Does NOT post OPENING_BALANCE drafts — that remains manual finalize only.
 * Idempotent: if a finalized snapshot already exists, returns it unchanged.
 *
 * @param {string} tenantId
 * @param {string|null} userId
 * @param {{ reason?: string, tx?: object, source?: string, skipIfAlreadyFinalized?: boolean }} [options]
 */
const ensureObFinalizedFromCurrentBalances = async (tenantId, userId, options = {}) => {
    const {
        reason = 'Auto-finalized from current stock balances',
        tx = null,
        source = 'AUTO_STOCK_MUTATION',
        skipIfAlreadyFinalized = true,
    } = options;
    const client = tx || prisma;
    const now = new Date();

    const existingSnapRow = await client.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key: OB_SNAPSHOT_SETTING_KEY } },
        select: { value: true },
    });
    const existingSnapshot = parseSnapshotValue(existingSnapRow?.value);
    if (skipIfAlreadyFinalized && existingSnapshot?.finalizedAt) {
        await client.tenantSetting.upsert({
            where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
            update: {
                value: 'LOCKED',
                ...(userId ? { updatedBy: userId } : {}),
                reason,
                updatedAt: now,
            },
            create: {
                tenantId,
                key: 'allowOpeningBalance',
                value: 'LOCKED',
                updatedBy: userId || undefined,
                reason,
                updatedAt: now,
            },
        });
        return { alreadyFinalized: true, snapshotSummary: existingSnapshot };
    }

    if (existingSnapshot?.finalizedAt) {
        await appendObSnapshotToHistory(tenantId, existingSnapshot, userId, client);
    }

    let finalizedByName = 'System';
    if (userId) {
        const finalizedByUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true, email: true },
        });
        finalizedByName = formatUserDisplayName(finalizedByUser);
    }

    const snapshotSummary = await buildObSnapshotFromBalances(tenantId, client, {
        finalizedAt: now.toISOString(),
        finalizedBy: finalizedByName,
        postedObDocuments: 0,
        source,
    });

    const allowSetting = await client.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
        update: {
            value: 'LOCKED',
            ...(userId ? { updatedBy: userId } : {}),
            reason,
            updatedAt: now,
        },
        create: {
            tenantId,
            key: 'allowOpeningBalance',
            value: 'LOCKED',
            updatedBy: userId || undefined,
            reason,
            updatedAt: now,
        },
    });

    await client.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: 'isOpeningBalanceAllowed' } },
        update: {
            value: 'false',
            ...(userId ? { updatedBy: userId } : {}),
            reason,
            updatedAt: now,
        },
        create: {
            tenantId,
            key: 'isOpeningBalanceAllowed',
            value: 'false',
            updatedBy: userId || undefined,
            reason,
            updatedAt: now,
        },
    });

    await client.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: OB_SNAPSHOT_SETTING_KEY } },
        update: {
            value: JSON.stringify(snapshotSummary),
            ...(userId ? { updatedBy: userId } : {}),
            reason: 'Opening balance finalized snapshot',
            updatedAt: now,
        },
        create: {
            tenantId,
            key: OB_SNAPSHOT_SETTING_KEY,
            value: JSON.stringify(snapshotSummary),
            updatedBy: userId || undefined,
            reason: 'Opening balance finalized snapshot',
        },
    });

    await logAction({
        tenantId,
        entityType: EntityType.SETTINGS,
        entityId: 'allowOpeningBalance',
        action: 'FINALIZE_OB',
        changedBy: userId || null,
        note: reason,
        beforeValue: existingSnapshot ? { snapshotSummary: existingSnapshot } : null,
        afterValue: {
            allowOpeningBalance: allowSetting.value,
            isOpeningBalanceAllowed: 'false',
            snapshotSummary,
            source,
        },
        tx: client !== prisma ? client : undefined,
    });

    return { alreadyFinalized: false, snapshotSummary };
};

/**
 * Enable OB setup phase: OPEN allowOpeningBalance, align isOpeningBalanceAllowed tenant flag.
 * Preserves existing finalize snapshots so history stays visible after reopen.
 */
const enableOpeningBalanceStage = async (tenantId, userId, reason = 'Initial Setup') => {
    await setSetting(tenantId, 'allowOpeningBalance', 'OPEN', userId, reason);
    await setSetting(tenantId, 'isOpeningBalanceAllowed', 'true', userId, reason);
};

// ── Inventory / OB status for settings UI and clients ─────────────────────────
const getInventoryStatus = async (tenantId) => {
    const [ob, obStatus, allowRow, snapRow] = await Promise.all([
        isOpeningBalanceAllowed(tenantId),
        getObStatus(tenantId),
        prisma.tenantSetting.findUnique({
            where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
        }),
        prisma.tenantSetting.findUnique({
            where: { tenantId_key: { tenantId, key: OB_SNAPSHOT_SETTING_KEY } },
        }),
    ]);

    let snapshotSummary = null;
    if (snapRow?.value) {
        snapshotSummary = parseSnapshotValue(snapRow.value);
    }

    if (!snapshotSummary) {
        const log = await prisma.auditLog.findFirst({
            where: {
                tenantId,
                entityType: EntityType.SETTINGS,
                entityId: 'allowOpeningBalance',
                action: 'FINALIZE_OB',
            },
            orderBy: { changedAt: 'desc' },
            include: {
                changedByUser: { select: { firstName: true, lastName: true, email: true } },
            },
        });
        if (log?.afterValue && typeof log.afterValue === 'object' && log.afterValue.snapshotSummary) {
            snapshotSummary = log.afterValue.snapshotSummary;
        } else if (log) {
            snapshotSummary = {
                totalItemsCount: null,
                totalOpeningValue: null,
                finalizedAt: log.changedAt.toISOString(),
                finalizedBy: formatUserDisplayName(log.changedByUser),
            };
        }
    }

    return {
        isOpeningBalanceAllowed: ob.allowed,
        obStatus,
        reason: ob.reason,
        lockedAt: ob.lockedAt ? ob.lockedAt.toISOString() : null,
        allowOpeningBalance: {
            value: allowRow?.value ?? null,
            reason: allowRow?.reason ?? null,
            updatedAt: allowRow?.updatedAt ? allowRow.updatedAt.toISOString() : null,
        },
        snapshotSummary,
    };
};

// ── FINALIZE OPENING BALANCE (strict validation + lock) ───────────────────────
const finalizeOpeningBalance = async (tenantId, userId) => {
    const postingEngine = require('./postingEngine.service');
    const totalItemsCount = await prisma.item.count({
        where: { tenantId },
    });

    if (totalItemsCount === 0) {
        const error = new Error('Cannot finalize opening balance with no items. Please add your stock first.');
        error.statusCode = 400;
        error.code = 'OB_FINALIZE_NO_ITEMS';
        error.details = { totalItemsCount };
        throw error;
    }

    const obDraftLines = await prisma.movementLine.findMany({
        where: {
            document: {
                tenantId,
                movementType: 'OPENING_BALANCE',
                status: 'DRAFT',
            },
        },
        include: {
            document: { select: { id: true, documentNo: true } },
            item: { select: { id: true, name: true, code: true } },
            location: { select: { id: true, name: true } },
        },
    });

    const itemCount = obDraftLines.filter((line) => Number(line.qtyInBaseUnit) > 0).length;
    if (itemCount === 0) {
        const error = new Error('Cannot finalize an empty warehouse. Add opening stock quantities first.');
        error.statusCode = 400;
        error.code = 'OB_FINALIZE_EMPTY_WAREHOUSE';
        error.details = { itemCount };
        throw error;
    }

    const [itemsMissingBaseUnit] = await Promise.all([
        prisma.item.findMany({
            where: {
                tenantId,
                isActive: true,
                itemUnits: {
                    none: { unitType: 'BASE' },
                },
            },
            select: {
                id: true,
                name: true,
                code: true,
            },
            orderBy: { name: 'asc' },
        }),
    ]);

    const invalidDraftBalances = obDraftLines
        .filter((line) => !(Number(line.qtyInBaseUnit) > 0) || !(Number(line.unitCost) > 0))
        .map((line) => ({
            docNo: line.document?.documentNo || null,
            itemId: line.itemId,
            itemName: line.item?.name || line.item?.code || line.itemId,
            storeName: line.location?.name || '',
            qty: Number(line.qtyInBaseUnit),
            unitCost: Number(line.unitCost),
        }));

    const itemsMissingBaseUnitPayload = itemsMissingBaseUnit.map((item) => ({
        itemId: item.id,
        itemName: item.name || item.code || item.id,
    }));

    if (
        invalidDraftBalances.length > 0
        || itemsMissingBaseUnitPayload.length > 0
    ) {
        const error = new Error('Opening balance finalization failed validation checks.');
        error.statusCode = 400;
        error.code = 'OB_FINALIZE_VALIDATION_FAILED';
        error.details = {
            invalidDraftBalances,
            itemsMissingBaseUnit: itemsMissingBaseUnitPayload,
        };
        throw error;
    }

    const finalizedByUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
    });
    const finalizedByName = formatUserDisplayName(finalizedByUser);

    const result = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const existingSnapRow = await tx.tenantSetting.findUnique({
            where: { tenantId_key: { tenantId, key: OB_SNAPSHOT_SETTING_KEY } },
            select: { value: true },
        });
        const existingSnapshot = parseSnapshotValue(existingSnapRow?.value);
        if (existingSnapshot?.finalizedAt) {
            await appendObSnapshotToHistory(tenantId, existingSnapshot, userId, tx);
        }

        const obDraftDocuments = await tx.movementDocument.findMany({
            where: {
                tenantId,
                movementType: 'OPENING_BALANCE',
                status: 'DRAFT',
            },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        });

        for (const draftDoc of obDraftDocuments) {
            await postingEngine.postMovementDocument(draftDoc.id, tenantId, userId, tx);
        }

        const allowSetting = await tx.tenantSetting.upsert({
            where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
            update: {
                value: 'LOCKED',
                updatedBy: userId,
                reason: 'Finalized after strict validation checks.',
                updatedAt: now,
            },
            create: {
                tenantId,
                key: 'allowOpeningBalance',
                value: 'LOCKED',
                updatedBy: userId,
                reason: 'Finalized after strict validation checks.',
                updatedAt: now,
            },
        });

        const booleanSetting = await tx.tenantSetting.upsert({
            where: { tenantId_key: { tenantId, key: 'isOpeningBalanceAllowed' } },
            update: {
                value: 'false',
                updatedBy: userId,
                reason: 'Finalized after strict validation checks.',
                updatedAt: now,
            },
            create: {
                tenantId,
                key: 'isOpeningBalanceAllowed',
                value: 'false',
                updatedBy: userId,
                reason: 'Finalized after strict validation checks.',
                updatedAt: now,
            },
        });

        const snapshotSummary = await buildObSnapshotFromBalances(tenantId, tx, {
            finalizedAt: now.toISOString(),
            finalizedBy: finalizedByName,
            postedObDocuments: obDraftDocuments.length,
            currencyCode: 'SAR',
            source: 'MANUAL_FINALIZE',
        });

        await tx.tenantSetting.upsert({
            where: { tenantId_key: { tenantId, key: OB_SNAPSHOT_SETTING_KEY } },
            update: {
                value: JSON.stringify(snapshotSummary),
                updatedBy: userId,
                reason: 'Opening balance finalized snapshot',
                updatedAt: now,
            },
            create: {
                tenantId,
                key: OB_SNAPSHOT_SETTING_KEY,
                value: JSON.stringify(snapshotSummary),
                updatedBy: userId,
                reason: 'Opening balance finalized snapshot',
            },
        });

        await logAction({
            tenantId,
            entityType: EntityType.SETTINGS,
            entityId: 'allowOpeningBalance',
            action: 'FINALIZE_OB',
            changedBy: userId,
            note: 'Opening balance finalized and locked after strict validation checks.',
            beforeValue: null,
            afterValue: {
                allowOpeningBalance: allowSetting.value,
                isOpeningBalanceAllowed: booleanSetting.value,
                snapshotSummary,
            },
            tx,
        });

        return {
            finalized: true,
            settings: {
                allowOpeningBalance: allowSetting.value,
                isOpeningBalanceAllowed: booleanSetting.value,
            },
            snapshotSummary,
        };
    }, OB_FINALIZE_TRANSACTION_OPTIONS);

    return result;
};

module.exports = {
    getObStatus,
    getSetting,
    setSetting,
    isOpeningBalanceAllowed,
    finalizeOpeningBalance,
    ensureObFinalizedFromCurrentBalances,
    buildObSnapshotFromBalances,
    clearObFinalizeSnapshot,
    getInventoryStatus,
    OB_FINALIZE_TRANSACTION_OPTIONS,
    enableOpeningBalanceStage,
};
