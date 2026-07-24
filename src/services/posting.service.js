const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { checkOBAllowed, validatePostingDate, checkFuturePostingDate } = require('./periodGuard.service');
const { resolvePostingPeriod } = require('../platform/postingPeriod.util');
const { withLedgerPostingFields } = require('../platform/inventoryLedger.util');
const { logAction, EntityType } = require('./auditTrail.service');
const { generateDocNumber, prefixFromMovementType } = require('./docNumbering.service');
const { resolveUnitCost, VALUATION_BASIS } = require('./valuationGovernance.service');
const {
    computePolicyBPostingAdjustment,
    formatPolicyBAuditNote,
} = require('./countPostingPolicy');
const logger = require('../utils/logger');
const { assertMovementRegisterMutable } = require('./movementRegisterGuard.service');
const {
    directionFromSignedQty,
    adjustmentLineAuditSnapshot,
} = require('../utils/adjustmentDirection.util');
const {
    assertConcurrencyVersion,
    bumpConcurrencyUpdate,
    concurrencyConflictError,
} = require('../platform/concurrency.service');
const settingService = require('./setting.service');
const {
    assertNoZeroWacWithQty,
    assertPositiveUnitCostForInboundQty,
} = require('./stockBalanceWacGuard.service');
const { assertIntegerQuantity } = require('./integerQuantityGuard.service');
const { applyAtomicWeightedReceipt } = require('./weightedReceipt.service');
const { assertPostingLineQuantities } = require('./postingQuantityGuard.service');
const { getTenantTimezone } = require('./tenantTimezone.service');

const stockBalanceCacheKey = (itemId, locationId) => `${itemId}:${locationId}`;
const STOCK_DECREMENT_MODE = Object.freeze({
    AVAILABLE: 'AVAILABLE',
    BLOCKED_CUSTODY: 'BLOCKED_CUSTODY',
});
const SHARED_DECREMENT_MOVEMENT_TYPES = new Set(['ISSUE', 'TRANSFER_OUT', 'LOAN_WRITE_OFF']);
const GENERIC_FAIL_CLOSED_MOVEMENT_TYPES = new Set([
    'TEMP_RECEIVE',
    'TEMP_RELEASE',
    'GET_PASS_OUT',
    'GET_PASS_RETURN',
]);
const POLICY_B_STOCK_CONFLICT_RETRIES = 2;

async function conditionalDecrementStock(tx, {
    tenantId,
    itemId,
    locationId,
    qty,
    mode = STOCK_DECREMENT_MODE.AVAILABLE,
}) {
    const decrementQty = Number(qty);
    if (!(decrementQty > 0)) {
        throw Object.assign(new Error('Stock decrement quantity must be greater than zero.'), {
            statusCode: 422,
            code: 'INVALID_STOCK_DECREMENT_QTY',
        });
    }
    if (!Object.values(STOCK_DECREMENT_MODE).includes(mode)) {
        throw Object.assign(new Error(`Unsupported stock decrement mode: ${mode}`), {
            statusCode: 500,
            code: 'INVALID_STOCK_DECREMENT_MODE',
        });
    }

    const blockedDecrement = mode === STOCK_DECREMENT_MODE.BLOCKED_CUSTODY ? decrementQty : 0;
    const rows = await tx.$queryRaw`
        UPDATE "stock_balances"
        SET "qtyOnHand" = "qtyOnHand" - ${decrementQty},
            "qtyBlocked" = "qtyBlocked" - ${blockedDecrement}
        WHERE "tenantId" = ${tenantId}::uuid
          AND "itemId" = ${itemId}::uuid
          AND "locationId" = ${locationId}::uuid
          AND (
                (${mode === STOCK_DECREMENT_MODE.AVAILABLE}::boolean
                    AND "qtyOnHand" - "qtyBlocked" >= ${decrementQty})
             OR (${mode === STOCK_DECREMENT_MODE.BLOCKED_CUSTODY}::boolean
                    AND "qtyOnHand" >= ${decrementQty}
                    AND "qtyBlocked" >= ${decrementQty})
          )
        RETURNING "qtyOnHand", "qtyBlocked", "wacUnitCost"
    `;
    const updated = rows[0];
    if (!updated) {
        throw Object.assign(new Error('Insufficient stock at posting time. Available quantity changed.'), {
            statusCode: 422,
            code:
                mode === STOCK_DECREMENT_MODE.BLOCKED_CUSTODY
                    ? 'INSUFFICIENT_BLOCKED_CUSTODY'
                    : 'INSUFFICIENT_AVAILABLE_STOCK',
            details: { tenantId, itemId, locationId, qty: decrementQty, mode },
        });
    }
    return updated;
}

async function conditionalSetPolicyBStock(tx, {
    tenantId,
    itemId,
    locationId,
    expectedQty,
    expectedBlockedQty,
    targetQty,
    insertWac,
    stockExists,
}) {
    if (targetQty < expectedBlockedQty) {
        throw Object.assign(new Error('Counted quantity cannot be lower than blocked custody quantity.'), {
            statusCode: 422,
            code: 'INSUFFICIENT_AVAILABLE_STOCK',
            details: { tenantId, itemId, locationId, targetQty, qtyBlocked: expectedBlockedQty },
        });
    }

    const rows = stockExists
        ? await tx.$queryRaw`
            UPDATE "stock_balances"
            SET "qtyOnHand" = ${targetQty},
                "lastUpdated" = NOW()
            WHERE "tenantId" = ${tenantId}::uuid
              AND "itemId" = ${itemId}::uuid
              AND "locationId" = ${locationId}::uuid
              AND "qtyOnHand" = ${expectedQty}
              AND "qtyBlocked" = ${expectedBlockedQty}
            RETURNING "qtyOnHand", "qtyBlocked", "wacUnitCost"
        `
        : await tx.$queryRaw`
            INSERT INTO "stock_balances"
                ("tenantId", "itemId", "locationId", "qtyOnHand", "qtyBlocked", "wacUnitCost")
            VALUES
                (${tenantId}::uuid, ${itemId}::uuid, ${locationId}::uuid, ${targetQty}, 0, ${insertWac})
            ON CONFLICT ("tenantId", "itemId", "locationId") DO UPDATE
            SET "qtyOnHand" = EXCLUDED."qtyOnHand",
                "lastUpdated" = NOW()
            WHERE "stock_balances"."qtyOnHand" = ${expectedQty}
              AND "stock_balances"."qtyBlocked" = ${expectedBlockedQty}
            RETURNING "qtyOnHand", "qtyBlocked", "wacUnitCost"
        `;

    if (!rows[0]) {
        throw Object.assign(new Error('Live stock changed while applying Policy-B inventory count.'), {
            statusCode: 409,
            code: 'COUNT_POLICY_B_STOCK_CHANGED',
            details: {
                tenantId,
                itemId,
                locationId,
                expectedQty,
                expectedBlockedQty,
                targetQty,
            },
        });
    }
    return rows[0];
}

async function assertOpeningBalanceAllowedInTx(tx, tenantId) {
    const rows = await tx.$queryRaw`
        SELECT "value"
        FROM "tenant_settings"
        WHERE "tenantId" = ${tenantId}::uuid
          AND "key" = 'allowOpeningBalance'
        FOR UPDATE
    `;
    if (rows[0]?.value === 'LOCKED') {
        throw Object.assign(
            new Error('Opening Balance is locked after period close. Use Adjustment in an open period.'),
            { statusCode: 422, code: 'OB_LOCKED' },
        );
    }
}

async function lockOpeningBalanceStock(tx, { tenantId, itemId, locationId }) {
    await tx.$executeRaw`
        INSERT INTO "stock_balances" (
            "tenantId",
            "itemId",
            "locationId",
            "qtyOnHand",
            "qtyBlocked",
            "wacUnitCost"
        )
        VALUES (${tenantId}::uuid, ${itemId}::uuid, ${locationId}::uuid, 0, 0, 0)
        ON CONFLICT ("tenantId", "itemId", "locationId") DO NOTHING
    `;
    const rows = await tx.$queryRaw`
        SELECT "qtyOnHand", "qtyBlocked", "wacUnitCost"
        FROM "stock_balances"
        WHERE "tenantId" = ${tenantId}::uuid
          AND "itemId" = ${itemId}::uuid
          AND "locationId" = ${locationId}::uuid
        FOR UPDATE
    `;
    return rows[0];
}

/**
 * Batch-load stock balances for movement lines (one query vs per-line findUnique).
 * @internal Exported for unit tests.
 */
async function prefetchStockBalancesForLines(tx, tenantId, lines, resolveLocationId) {
    const pairs = [];
    const seen = new Set();
    for (const line of lines) {
        const locationId = resolveLocationId(line);
        if (!locationId || !line.itemId) continue;
        const key = stockBalanceCacheKey(line.itemId, locationId);
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ itemId: line.itemId, locationId });
    }
    if (pairs.length === 0) {
        return new Map();
    }
    const rows = await tx.stockBalance.findMany({
        where: {
            tenantId,
            OR: pairs.map(({ itemId, locationId }) => ({ itemId, locationId })),
        },
    });
    const map = new Map();
    for (const row of rows) {
        map.set(stockBalanceCacheKey(row.itemId, row.locationId), row);
    }
    return map;
}

/**
 * Core engine for posting stock movements to the ledger and updating balances.
 * Uses a database transaction to ensure atomicity.
 */
const postDocument = async (documentId, tenantId, userId, db = prisma, expectedVersion = null, opts = {}) => {
    // 1. Fetch document and validate status
    const document = await db.movementDocument.findFirst({
        where: { id: documentId, tenantId },
        include: {
            lines: {
                include: {
                    item: { select: { name: true, barcode: true, unitPrice: true } },
                    location: { select: { name: true } }
                }
            },
            createdByUser: { select: { firstName: true, lastName: true } }
        }
    });

    if (!document) {
        const error = new Error('Document not found');
        error.statusCode = 404;
        throw error;
    }

    assertMovementRegisterMutable(document, 'post');

    if (document.status !== 'DRAFT') {
        const error = new Error(`Cannot post a document with status ${document.status}`);
        error.statusCode = 400;
        throw error;
    }

    assertConcurrencyVersion(expectedVersion, document.concurrencyVersion, {
        required: expectedVersion != null,
        audit: expectedVersion != null
            ? { tenantId, entityType: EntityType.MOVEMENT, entityId: documentId, changedBy: userId }
            : null,
    });

    if (document.lines.length === 0) {
        const error = new Error('Cannot post an empty document');
        error.statusCode = 400;
        throw error;
    }

    if (GENERIC_FAIL_CLOSED_MOVEMENT_TYPES.has(document.movementType)) {
        throw Object.assign(
            new Error(
                `${document.movementType} cannot be posted through the generic movement engine. ` +
                'Use the governed Get Pass custody workflow.',
            ),
            {
                statusCode: 400,
                code: 'MOVEMENT_TYPE_REQUIRES_GOVERNED_POSTING',
            },
        );
    }

    assertPostingLineQuantities({
        documentType: document.movementType,
        lines: document.lines,
        quantityField: 'qtyInBaseUnit',
    });

    // ── Period Guard (postingDate at commit — not documentDate) ─────────────
    // Ordinary posts: now() + OPEN only. Resolution workspace may pass postingDate
    // after assertPeriodAllowPostingForResolution (OPEN|CLOSING for that period).
    const postedAt = opts.postingDate != null ? new Date(opts.postingDate) : new Date();
    const timezone = await getTenantTimezone(tenantId, db);
    if (opts.fromResolutionWorkspace) {
        checkFuturePostingDate(postedAt, timezone);
    } else {
        await validatePostingDate(tenantId, postedAt, db, timezone);
    }
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt, timezone);
    if (document.movementType === 'OPENING_BALANCE') {
        await checkOBAllowed(tenantId);

        // ── Zero-Cost Guard ──────────────────────────────────────────────────
        // Opening Balance without a unit cost produces WAC = 0 and breaks
        // Valuation and OMC reports. Every OB line must have unitCost > 0.
        const zeroCostLines = document.lines.filter(
            (l) => Number(l.qtyInBaseUnit) > 0 && !(Number(l.unitCost) > 0),
        );
        if (zeroCostLines.length > 0) {
            const names = zeroCostLines.map(l => l.item?.name || l.itemId).join(', ');
            throw Object.assign(
                new Error(`Opening Balance requires a valid unit cost for every line. Missing cost for: ${names}`),
                { statusCode: 400, code: 'OB_ZERO_COST' }
            );
        }
        // ─────────────────────────────────────────────────────────────────────
    }
    // ─────────────────────────────────────────────────────────────────────────

    // 2. Perform the Transaction
    const transactionWork = async (tx) => {
        const adjustmentPostEvidence = [];
        // ============================================================================
        // 🚨 ARCHITECTURAL GUARD: STRICT LEDGER CONSISTENCY RULE 🚨
        // `StockBalance` must NEVER be mutated outside of this engine.
        // Every `tx.stockBalance.update/upsert` MUST be paired with a corresponding
        // `tx.inventoryLedger.create` entry within this exact same database transaction.
        // Bypassing this rule will break OMC (Opening-Movement-Closing) reconciliation.
        // ============================================================================

        const isOpeningBalance = document.movementType === 'OPENING_BALANCE';
        let obStockCache = null;
        if (isOpeningBalance) {
            const activeLines = document.lines.filter((line) => Number(line.qtyInBaseUnit) > 0);
            obStockCache = await prefetchStockBalancesForLines(
                tx,
                tenantId,
                activeLines,
                (line) => document.sourceLocationId || line.locationId,
            );
        }

        const getCachedStock = (itemId, locationId) => {
            if (!obStockCache) return undefined;
            return obStockCache.get(stockBalanceCacheKey(itemId, locationId)) ?? null;
        };

        const setCachedStock = (itemId, locationId, row) => {
            if (obStockCache) {
                obStockCache.set(stockBalanceCacheKey(itemId, locationId), row);
            }
        };

        // Process each line in the document
        for (const line of document.lines) {
            const { itemId, qtyInBaseUnit, unitCost, totalValue } = line;
            const qty = Number(qtyInBaseUnit);

            assertIntegerQuantity({
                qty,
                field: 'qtyInBaseUnit',
                message:
                    'Cannot post movement: quantity must be a whole number (integer). Fractional quantities are not allowed.',
                details: {
                    documentNo: document.documentNo,
                    movementType: document.movementType,
                    itemId,
                    qty,
                },
            });

            // Determine Action and Locations based on MovementType
            let sourceLocationId = document.sourceLocationId || line.locationId;
            let destLocationId = document.destLocationId || line.locationId;

            const isIncrease = ['OPENING_BALANCE', 'RECEIVE', 'TRANSFER_IN', 'RETURN'].includes(document.movementType);
            const isDecrease = ['ISSUE', 'TRANSFER_OUT', 'BREAKAGE', 'LOST', 'LOAN_WRITE_OFF'].includes(document.movementType);
            const isTransfer = document.movementType === 'TRANSFER'; // Generic transfer if combined
            const isAdjustment = ['ADJUSTMENT', 'COUNT_ADJUSTMENT'].includes(document.movementType);

            // -- A. Decrement Stock (Source) --
            if (isDecrease || document.movementType === 'TRANSFER') {
                const usesSharedDecrement = SHARED_DECREMENT_MOVEMENT_TYPES.has(document.movementType);
                let currentStock;
                let balanceAfter;

                if (usesSharedDecrement) {
                    currentStock = await conditionalDecrementStock(tx, {
                        tenantId,
                        itemId,
                        locationId: sourceLocationId,
                        qty,
                        mode: STOCK_DECREMENT_MODE.AVAILABLE,
                    });
                    balanceAfter = Number(currentStock.qtyOnHand);
                } else {
                    // Legacy combined TRANSFER and governed types retain their existing specialized handling.
                    currentStock = await tx.stockBalance.findUnique({
                        where: {
                            tenantId_itemId_locationId: {
                                tenantId,
                                itemId,
                                locationId: sourceLocationId
                            }
                        }
                    });

                    if (!currentStock || Number(currentStock.qtyOnHand) < qty) {
                        throw new Error(`Insufficient stock for Item ${line.item.name} at source location. Available: ${currentStock ? currentStock.qtyOnHand : 0}, Requested: ${qty}`);
                    }
                    balanceAfter = Number(currentStock.qtyOnHand) - qty;
                }

                // Create Ledger Entry for Issue
                await tx.inventoryLedger.create({
                    data: withLedgerPostingFields(
                        {
                            tenantId,
                            itemId,
                            locationId: sourceLocationId,
                            movementType: document.movementType === 'TRANSFER' ? 'TRANSFER_OUT' : document.movementType,
                            qtyOut: qty,
                            qtyIn: 0,
                            unitCost: currentStock.wacUnitCost, // Outgoing at current WAC
                            totalValue: qty * Number(currentStock.wacUnitCost),
                            balanceAfter,
                            referenceType: 'MOVEMENT',
                            referenceId: document.id,
                            referenceNo: document.documentNo,
                            createdBy: userId,
                        },
                        postingDate,
                        timezone,
                    ),
                });

                if (!usesSharedDecrement) {
                    // WAC doesn't change on issue.
                    await tx.stockBalance.update({
                        where: {
                            tenantId_itemId_locationId: {
                                tenantId,
                                itemId,
                                locationId: sourceLocationId
                            }
                        },
                        data: {
                            qtyOnHand: { decrement: qty }
                        }
                    });
                }
            }

            // -- B. Increment Stock (Destination) --
            if (isIncrease || document.movementType === 'TRANSFER') {
                const destLoc = isTransfer ? destLocationId : sourceLocationId;

                // Fetch current stock to calculate new WAC
                const currentStock = isOpeningBalance
                    ? getCachedStock(itemId, destLoc)
                    : await tx.stockBalance.findUnique({
                        where: {
                            tenantId_itemId_locationId: { tenantId, itemId, locationId: destLoc },
                        },
                    });

                const currentQty = currentStock ? Number(currentStock.qtyOnHand) : 0;
                const currentWac = currentStock ? Number(currentStock.wacUnitCost) : 0;

                // Cost used for the new receipt
                const receiveUnitCost = Number(unitCost) > 0 ? Number(unitCost) : currentWac;
                const receiveTotalValue = Number(totalValue) > 0 ? Number(totalValue) : (qty * receiveUnitCost);

                // OPENING_BALANCE while OB is open is an overwrite (stock = qty), not additive.
                if (document.movementType === 'OPENING_BALANCE') {
                    const lockedStock = await lockOpeningBalanceStock(tx, {
                        tenantId,
                        itemId,
                        locationId: destLoc,
                    });
                    await assertOpeningBalanceAllowedInTx(tx, tenantId);
                    const liveQty = Number(lockedStock.qtyOnHand);
                    const liveBlockedQty = Number(lockedStock.qtyBlocked || 0);
                    const liveWac = Number(lockedStock.wacUnitCost || 0);
                    const targetQty = qty;
                    if (targetQty < liveBlockedQty) {
                        throw Object.assign(
                            new Error('Opening Balance target cannot be lower than blocked custody quantity.'),
                            {
                                statusCode: 422,
                                code: 'OB_TARGET_BELOW_BLOCKED',
                                details: { tenantId, itemId, locationId: destLoc, targetQty, liveBlockedQty },
                            },
                        );
                    }
                    const deltaQty = targetQty - liveQty;
                    const isIncreaseDelta = deltaQty >= 0;
                    const absDelta = Math.abs(deltaQty);
                    const balanceAfter = targetQty;
                    const deltaTotalValue = (targetQty * receiveUnitCost) - (liveQty * liveWac);

                    assertNoZeroWacWithQty({
                        qtyOnHand: targetQty,
                        wacUnitCost: receiveUnitCost,
                        message:
                            'Cannot post opening balance: quantity is greater than zero but unit cost (WAC) is missing or zero. ' +
                            'Enter a valid unit cost for every line with quantity, then retry.',
                        details: {
                            documentNo: document.documentNo,
                            itemId,
                            locationId: destLoc,
                            targetQty,
                            unitCost: receiveUnitCost,
                        },
                    });

                    // Keep ledger consistency by recording the delta needed to reach target quantity.
                    await tx.inventoryLedger.create({
                        data: withLedgerPostingFields(
                            {
                                tenantId,
                                itemId,
                                locationId: destLoc,
                                movementType: document.movementType,
                                qtyIn: isIncreaseDelta ? absDelta : 0,
                                qtyOut: isIncreaseDelta ? 0 : absDelta,
                                unitCost: receiveUnitCost,
                                totalValue: deltaTotalValue,
                                balanceAfter,
                                referenceType: 'MOVEMENT',
                                referenceId: document.id,
                                referenceNo: document.documentNo,
                                createdBy: userId,
                            },
                            postingDate,
                            timezone,
                        ),
                    });

                    await tx.stockBalance.update({
                        where: {
                            tenantId_itemId_locationId: { tenantId, itemId, locationId: destLoc }
                        },
                        data: {
                            qtyOnHand: targetQty,
                            wacUnitCost: receiveUnitCost
                        }
                    });
                    setCachedStock(itemId, destLoc, {
                        itemId,
                        locationId: destLoc,
                        qtyOnHand: targetQty,
                        wacUnitCost: receiveUnitCost,
                    });
                } else {
                    const updatedStock = await applyAtomicWeightedReceipt(tx, {
                        tenantId,
                        itemId,
                        locationId: destLoc,
                        qty,
                        unitCost: receiveUnitCost,
                        context: `${document.movementType} ${document.documentNo}`,
                    });
                    const balanceAfter = updatedStock.qtyOnHand;

                    // Create Ledger Entry for Receipt
                    await tx.inventoryLedger.create({
                        data: withLedgerPostingFields(
                            {
                                tenantId,
                                itemId,
                                locationId: destLoc,
                                movementType: document.movementType === 'TRANSFER' ? 'TRANSFER_IN' : document.movementType,
                                qtyIn: qty,
                                qtyOut: 0,
                                unitCost: receiveUnitCost,
                                totalValue: receiveTotalValue,
                                balanceAfter,
                                referenceType: 'MOVEMENT',
                                referenceId: document.id,
                                referenceNo: document.documentNo,
                                createdBy: userId,
                            },
                            postingDate,
                            timezone,
                        ),
                    });
                }
            }

            // -- C. Adjustments (Positive or Negative handled dynamically) --
            if (isAdjustment) {
                const adjLocationId = sourceLocationId || line.locationId;
                const isPositive = qty >= 0;
                const absQty = Math.abs(qty);

                // Fetch current WAC to value the adjustment
                const currentStock = await tx.stockBalance.findUnique({
                    where: { tenantId_itemId_locationId: { tenantId, itemId, locationId: adjLocationId } }
                });

                let currentWac = currentStock ? Number(currentStock.wacUnitCost) : Number(unitCost) || 0;
                let currentQty = currentStock ? Number(currentStock.qtyOnHand) : 0;
                let balanceAfter;

                if (isPositive) {
                    balanceAfter = currentQty + absQty;
                } else {
                    const updatedStock = await conditionalDecrementStock(tx, {
                        tenantId,
                        itemId,
                        locationId: adjLocationId,
                        qty: absQty,
                        mode: STOCK_DECREMENT_MODE.AVAILABLE,
                    });
                    balanceAfter = Number(updatedStock.qtyOnHand);
                    currentQty = balanceAfter + absQty;
                    currentWac = Number(updatedStock.wacUnitCost);
                }

                const adjUnitCost = Number(unitCost) > 0 ? Number(unitCost) : currentWac;
                const adjTotalValue = absQty * adjUnitCost;

                // Create Ledger Entry
                await tx.inventoryLedger.create({
                    data: withLedgerPostingFields(
                        {
                            tenantId,
                            itemId,
                            locationId: adjLocationId,
                            movementType: document.movementType,
                            qtyIn: isPositive ? absQty : 0,
                            qtyOut: isPositive ? 0 : absQty,
                            unitCost: adjUnitCost,
                            totalValue: adjTotalValue,
                            balanceAfter,
                            referenceType: 'MOVEMENT',
                            referenceId: document.id,
                            referenceNo: document.documentNo,
                            createdBy: userId,
                        },
                        postingDate,
                        timezone,
                    ),
                });

                if (isPositive) {
                    // Increase balance (upsert in case balance doesn't exist yet)
                    const newTotalQty = currentQty + absQty;
                    const newWac = newTotalQty > 0
                        ? ((currentQty * currentWac) + adjTotalValue) / newTotalQty
                        : adjUnitCost;

                    assertPositiveUnitCostForInboundQty({
                        unitCost: adjUnitCost,
                        qty: absQty,
                        message:
                            'Cannot post adjustment: quantity increase requires a valid unit cost (WAC). ' +
                            'Correct the item cost (GRN or Item Master), then retry.',
                        details: {
                            documentNo: document.documentNo,
                            itemId,
                            locationId: adjLocationId,
                            qty: absQty,
                            unitCost: adjUnitCost,
                        },
                    });
                    assertNoZeroWacWithQty({
                        qtyOnHand: newTotalQty,
                        wacUnitCost: newWac,
                        message:
                            'Cannot post adjustment: resulting stock would have quantity greater than zero with missing or zero WAC. ' +
                            'Correct the item cost first, then retry.',
                        details: {
                            documentNo: document.documentNo,
                            itemId,
                            locationId: adjLocationId,
                            resultingQty: newTotalQty,
                            resultingWac: newWac,
                        },
                    });

                    await tx.stockBalance.upsert({
                        where: { tenantId_itemId_locationId: { tenantId, itemId, locationId: adjLocationId } },
                        update: { qtyOnHand: { increment: absQty }, wacUnitCost: newWac },
                        create: { tenantId, itemId, locationId: adjLocationId, qtyOnHand: absQty, wacUnitCost: adjUnitCost }
                    });
                }

                if (document.movementType === 'ADJUSTMENT') {
                    adjustmentPostEvidence.push({
                        ...adjustmentLineAuditSnapshot(line, directionFromSignedQty(qty)),
                        stockBefore: currentQty,
                        stockAfter: balanceAfter,
                        unitCost: adjUnitCost,
                        totalValue: adjTotalValue,
                        ledgerReferenceType: 'MOVEMENT',
                        ledgerReferenceId: document.id,
                        ledgerReferenceNo: document.documentNo,
                    });
                }
            }
        }

        // 3. Mark Document as POSTED + assign refNumber
        const prefix = prefixFromMovementType(document.movementType);
        const refNumber = await generateDocNumber(tenantId, prefix, document.documentDate || new Date());

        let updatedDocument;
        try {
            updatedDocument = await tx.movementDocument.update({
                where: { id: documentId, concurrencyVersion: document.concurrencyVersion },
                data: bumpConcurrencyUpdate({
                    status: 'POSTED',
                    postedAt,
                    postingDate,
                    assignedPostingPeriod,
                    documentNo: document.documentNo || refNumber,
                }),
            });
        } catch (err) {
            if (err?.code === 'P2025') throw concurrencyConflictError();
            throw err;
        }

        // 4. Auto-lock Opening Balance if this is a non-OB movement
        if (document.movementType !== 'OPENING_BALANCE') {
            await tx.tenantSetting.upsert({
                where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
                update: {
                    value: 'LOCKED',
                    reason: `Auto-locked: ${document.movementType} posted (${document.documentNo})`,
                },
                create: {
                    tenantId,
                    key: 'allowOpeningBalance',
                    value: 'LOCKED',
                    reason: `Auto-locked: first non-OB posting (${document.documentNo})`,
                },
            });
        }

        if (document.movementType === 'ADJUSTMENT' && adjustmentPostEvidence.length > 0) {
            await logAction({
                tenantId,
                entityType: EntityType.MOVEMENT,
                entityId: documentId,
                action: 'POST',
                changedBy: userId,
                note: `ADJUSTMENT posted (${updatedDocument.documentNo || document.documentNo})`,
                beforeValue: {
                    status: 'DRAFT',
                    documentNo: document.documentNo,
                    reason: document.reason ?? null,
                    notes: document.notes ?? null,
                    lines: adjustmentPostEvidence.map((row) => ({
                        itemId: row.itemId,
                        locationId: row.locationId,
                        direction: row.direction,
                        quantity: row.quantity,
                        stockBefore: row.stockBefore,
                    })),
                },
                afterValue: {
                    status: 'POSTED',
                    documentNo: updatedDocument.documentNo || document.documentNo,
                    postedAt: updatedDocument.postedAt,
                    reason: document.reason ?? null,
                    notes: document.notes ?? null,
                    lines: adjustmentPostEvidence,
                },
                tx,
            });
        }

        return updatedDocument;

    };

    const nestedInParentTransaction = db !== prisma;

    const result = nestedInParentTransaction
        ? await transactionWork(db)
        : await prisma.$transaction(transactionWork);

    const auditPayload = {
        tenantId,
        entityType: EntityType.MOVEMENT,
        entityId: documentId,
        action: 'POST',
        changedBy: userId,
        note: `${document.movementType} posted (${result.documentNo || documentId})`,
    };

    const skipOuterPostAudit = document.movementType === 'ADJUSTMENT';

    if (!skipOuterPostAudit) {
        if (nestedInParentTransaction) {
            await logAction({ ...auditPayload, tx: db });
        } else {
            // Standalone post: audit outside transaction so a log failure never rolls back posting.
            await logAction(auditPayload);
        }
    }

    return result;
};

/**
 * M10: Engine for posting Stock Count adjustments to the ledger.
 */
const postStockCount = async (sessionId, tenantId, userId) => {
    try {
    const session = await prisma.stockCountSession.findUnique({
        where: { id: sessionId, tenantId },
        include: { lines: true }
    });

    if (!session) throw new Error('Session not found');
    if (session.status === 'POSTED') throw new Error('Session is already POSTED');
    assertPostingLineQuantities({
        documentType: 'LEGACY_STOCK_COUNT',
        lines: session.lines,
        quantityField: 'countedQty',
        allowNull: true,
    });

    // ── Period Guard (postingDate at commit) ─────────────────────────────────
    const postedAt = new Date();
    const timezone = await getTenantTimezone(tenantId);
    await validatePostingDate(tenantId, postedAt, prisma, timezone);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt, timezone);
    // ─────────────────────────────────────────────────────────────────────────

    const result = await prisma.$transaction(async (tx) => {
        // ============================================================================
        // 🚨 ARCHITECTURAL GUARD: STRICT LEDGER CONSISTENCY RULE 🚨
        // `StockBalance` must NEVER be mutated independently.
        // Every adjustment MUST have a parallel `COUNT_ADJUSTMENT` ledger entry.
        // ============================================================================

        for (const line of session.lines) {
            if (line.countedQty === null) continue;

            const countedQty = Number(line.countedQty);
            const bookQty = Number(line.bookQty);
            assertIntegerQuantity({
                qty: countedQty,
                field: 'countedQty',
                message:
                    'Cannot post stock count: counted quantity must be a whole number (integer). Fractional quantities are not allowed.',
                details: { sessionNo: session.sessionNo, itemId: line.itemId, countedQty },
            });
            const currentStock = await tx.stockBalance.findUnique({
                where: { tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: session.locationId } }
            });
            let currentQty = currentStock ? Number(currentStock.qtyOnHand) : 0;
            const policy = computePolicyBPostingAdjustment(countedQty, currentQty);
            if (policy.skip) continue;

            const { isPositive, absAdjustment: absVariance, targetQty } = policy;
            let wac = Number(line.wacUnitCost);
            let balanceAfter = targetQty;

            if (!isPositive) {
                const updatedStock = await conditionalDecrementStock(tx, {
                    tenantId,
                    itemId: line.itemId,
                    locationId: session.locationId,
                    qty: absVariance,
                    mode: STOCK_DECREMENT_MODE.AVAILABLE,
                });
                balanceAfter = Number(updatedStock.qtyOnHand);
                currentQty = balanceAfter + absVariance;
                wac = Number(updatedStock.wacUnitCost);
            }
            const totalValue = absVariance * wac;

            if (isPositive) {
                assertPositiveUnitCostForInboundQty({
                    unitCost: wac,
                    qty: absVariance,
                    message:
                        'Cannot post stock count: a positive variance requires a valid unit cost (WAC). ' +
                        'Correct the item cost (via GRN or Item Master) before approving this count difference.',
                    details: {
                        sessionNo: session.sessionNo,
                        itemId: line.itemId,
                        locationId: session.locationId,
                        varianceQty: absVariance,
                        unitCost: wac,
                    },
                });
                assertNoZeroWacWithQty({
                    qtyOnHand: targetQty,
                    wacUnitCost: currentStock ? Number(currentStock.wacUnitCost) : wac,
                    message:
                        'Cannot post stock count: resulting stock would have quantity greater than zero with missing or zero WAC. ' +
                        'Correct the item cost first, then retry.',
                    details: {
                        sessionNo: session.sessionNo,
                        itemId: line.itemId,
                        resultingQty: targetQty,
                    },
                });
            }

            // Create Ledger Entry
            await tx.inventoryLedger.create({
                data: withLedgerPostingFields(
                    {
                        tenantId,
                        itemId: line.itemId,
                        locationId: session.locationId,
                        movementType: 'COUNT_ADJUSTMENT',
                        qtyIn: isPositive ? absVariance : 0,
                        qtyOut: isPositive ? 0 : absVariance,
                        unitCost: wac,
                        totalValue: totalValue,
                        balanceAfter,
                        referenceType: 'STOCK_COUNT',
                        referenceId: session.id,
                        referenceNo: session.sessionNo,
                        approvalId: session.approvalRequestId,
                        createdBy: userId,
                    },
                    postingDate,
                    timezone,
                ),
            });

            // Update Stock Balance
            // Usually, WAC is re-calculated for POSITIVE variances on RECEIPT.
            // For stock count, we typically value found items at current WAC to prevent distortion,
            // meaning WAC stays unchanged either way, we just increment qty.
            if (isPositive) {
                // Upsert to handle rare case where item wasn't in balance before, though createSession guarantees it
                await tx.stockBalance.upsert({
                    where: { tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: session.locationId } },
                    update: { qtyOnHand: { increment: absVariance } },
                    create: { tenantId, itemId: line.itemId, locationId: session.locationId, qtyOnHand: absVariance, wacUnitCost: wac }
                });
            }
        }

        const updatedSession = await tx.stockCountSession.update({
            where: { id: sessionId },
            data: { status: 'POSTED', postedAt, postingDate, assignedPostingPeriod }
        });

        // Auto-lock + finalize OB so getObStatus() becomes FINALIZED (not INITIAL_LOCK)
        await settingService.ensureObFinalizedFromCurrentBalances(tenantId, userId, {
            reason: `Auto-locked: COUNT_ADJUSTMENT posted (${session.sessionNo})`,
            tx,
            source: 'AUTO_COUNT_ADJUSTMENT_LEGACY_STOCK_COUNT',
        });

        return updatedSession;
    });

    await logAction({
        tenantId,
        entityType: EntityType.STOCK_COUNT,
        entityId: sessionId,
        action: 'POST',
        changedBy: userId,
        note: `LEGACY_STOCK_COUNT_POSTED referenceType=STOCK_COUNT sessionNo=${result.sessionNo}`,
        afterValue: {
            sessionNo: result.sessionNo,
            referenceType: 'STOCK_COUNT',
        },
    });

    return result;
    } catch (err) {
        logger.error('[Posting] postStockCount failed', {
            sessionId,
            tenantId,
            message: err.message,
            code: err.code,
        });
        throw err;
    }
};

/**
 * M13: Engine for posting Approved Stock Reports (SavedStockReport) to the ledger
 * and updating stock balances. Iterates per-location variances from SavedStockReportLocationQty.
 */
const postStockReport = async (reportId, tenantId, userId) => {
    try {
    const report = await prisma.savedStockReport.findUnique({
        where: { id: reportId, tenantId },
        include: {
            lines: {
                include: { locationQtys: true }
            }
        }
    });

    if (!report) throw new Error('Stock Report not found');
    if (report.status === 'POSTED') throw new Error('Stock Report is already POSTED');
    assertPostingLineQuantities({
        documentType: 'SAVED_STOCK_REPORT',
        lines: report.lines.flatMap((line) =>
            line.locationQtys.map((locationQty) => ({
                ...locationQty,
                itemId: line.itemId,
            })),
        ),
        quantityField: 'varianceQty',
    });

    // ── Period Guard (postingDate at commit) ─────────────────────────────────
    const postedAt = new Date();
    const timezone = await getTenantTimezone(tenantId);
    await validatePostingDate(tenantId, postedAt, prisma, timezone);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt, timezone);
    // ─────────────────────────────────────────────────────────────────────────

    const result = await prisma.$transaction(async (tx) => {
        // ============================================================================
        // 🚨 ARCHITECTURAL GUARD: STRICT LEDGER CONSISTENCY RULE 🚨
        // Iterate over each item line, and for each sub-location qty entry that has
        // a non-zero variance, create a ledger entry and adjust stock balance.
        // ============================================================================

        for (const line of report.lines) {
            for (const locQty of line.locationQtys) {
                const varianceQty = Number(locQty.varianceQty);
                if (varianceQty === 0) continue; // No adjustment for this location
                assertIntegerQuantity({
                    qty: varianceQty,
                    field: 'varianceQty',
                    message:
                        'Cannot post stock report: quantity must be a whole number (integer). Fractional quantities are not allowed.',
                    details: {
                        reportNo: report.reportNo,
                        itemId: line.itemId,
                        varianceQty,
                    },
                });

                const locationId = locQty.locationId;
                const isPositive = varianceQty > 0;
                const absVariance = Math.abs(varianceQty);

                // Re-fetch current WAC since it might have changed since the draft was created
                const currentStock = await tx.stockBalance.findUnique({
                    where: { tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId } }
                });
                let wac = currentStock ? Number(currentStock.wacUnitCost) : 0;
                let currentQty = currentStock ? Number(currentStock.qtyOnHand) : 0;
                let balanceAfter;

                if (isPositive) {
                    balanceAfter = currentQty + absVariance;
                } else {
                    const updatedStock = await conditionalDecrementStock(tx, {
                        tenantId,
                        itemId: line.itemId,
                        locationId,
                        qty: absVariance,
                        mode: STOCK_DECREMENT_MODE.AVAILABLE,
                    });
                    balanceAfter = Number(updatedStock.qtyOnHand);
                    currentQty = balanceAfter + absVariance;
                    wac = Number(updatedStock.wacUnitCost);
                }
                const adjustedTotalValue = absVariance * wac;

                if (isPositive) {
                    assertPositiveUnitCostForInboundQty({
                        unitCost: wac,
                        qty: absVariance,
                        message:
                            'Cannot post stock report: a positive variance requires a valid unit cost (WAC). ' +
                            'Correct the item cost (via GRN or Item Master) before posting this difference.',
                        details: {
                            reportNo: report.reportNo,
                            itemId: line.itemId,
                            locationId,
                            varianceQty: absVariance,
                            unitCost: wac,
                        },
                    });
                    assertNoZeroWacWithQty({
                        qtyOnHand: balanceAfter,
                        wacUnitCost: wac,
                        message:
                            'Cannot post stock report: resulting stock would have quantity greater than zero with missing or zero WAC. ' +
                            'Correct the item cost first, then retry.',
                        details: {
                            reportNo: report.reportNo,
                            itemId: line.itemId,
                            locationId,
                            resultingQty: balanceAfter,
                            resultingWac: wac,
                        },
                    });
                }

                // Create Ledger Entry for this item+location variance
                await tx.inventoryLedger.create({
                    data: withLedgerPostingFields(
                        {
                            tenantId,
                            itemId: line.itemId,
                            locationId,
                            movementType: 'COUNT_ADJUSTMENT',
                            qtyIn: isPositive ? absVariance : 0,
                            qtyOut: isPositive ? 0 : absVariance,
                            unitCost: wac,
                            totalValue: adjustedTotalValue,
                            balanceAfter,
                            referenceType: 'STOCK_REPORT',
                            referenceId: report.id,
                            referenceNo: report.reportNo,
                            approvalId: report.approvalRequestId || null,
                            createdBy: userId,
                        },
                        postingDate,
                        timezone,
                    ),
                });

                // Update Stock Balance for this item+location
                if (isPositive) {
                    await tx.stockBalance.upsert({
                        where: { tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId } },
                        update: { qtyOnHand: { increment: absVariance } },
                        create: { tenantId, itemId: line.itemId, locationId, qtyOnHand: absVariance, wacUnitCost: wac }
                    });
                }
            }
        }

        const updatedReport = await tx.savedStockReport.update({
            where: { id: reportId },
            data: { status: 'POSTED', postedAt, postingDate, assignedPostingPeriod }
        });

        // Auto-lock + finalize OB so getObStatus() becomes FINALIZED (not INITIAL_LOCK)
        await settingService.ensureObFinalizedFromCurrentBalances(tenantId, userId, {
            reason: `Auto-locked: COUNT_ADJUSTMENT posted via Stock Report (${report.reportNo})`,
            tx,
            source: 'AUTO_COUNT_ADJUSTMENT_STOCK_REPORT',
        });

        return updatedReport;

    });

    await logAction({
        tenantId,
        entityType: EntityType.STOCK_REPORT,
        entityId: reportId,
        action: 'POST',
        changedBy: userId,
        note: `STOCK_REPORT_POSTED referenceType=STOCK_REPORT reportNo=${result.reportNo}`,
        afterValue: {
            reportNo: result.reportNo,
            referenceType: 'STOCK_REPORT',
        },
    });

    return result;
    } catch (err) {
        logger.error('[Posting] postStockReport failed', {
            reportId,
            tenantId,
            message: err.message,
            code: err.code,
        });
        throw err;
    }
};

/**
 * Inventory Count (v1) — post approved StockCountSession using per item×location variances
 * from StockCountLocationQty (latest round per cell), valued at CURRENT WAC at posting time.
 *
 * Creates InventoryLedger entries with movementType=COUNT_ADJUSTMENT and referenceType=COUNT_SESSION.
 */
/**
 * Ch.5.2 — Prevent duplicate COUNT_SESSION ledger effects for one session.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} tenantId
 * @param {string} sessionId
 */
async function assertNoDuplicateCountSessionPost(tx, tenantId, sessionId) {
    const existing = await tx.inventoryLedger.findFirst({
        where: {
            tenantId,
            referenceType: 'COUNT_SESSION',
            referenceId: sessionId,
        },
    });
    if (existing) {
        const e = new Error('Count session has already been posted to ledger. Double-posting prevented.');
        e.statusCode = 409;
        e.code = 'COUNT_SESSION_ALREADY_POSTED';
        throw e;
    }
}

async function acquireCanonicalCountCellLocks(tx, tenantId, cells) {
    const keys = [...new Set(
        cells.map((cell) => `${cell.itemId}:${cell.locationId}`),
    )].sort();

    for (const key of keys) {
        const [itemId, locationId] = key.split(':');
        const rows = await tx.$queryRaw`
            SELECT pg_try_advisory_xact_lock(
                hashtextextended(
                    ${`${tenantId}:${itemId}:${locationId}`},
                    0
                )
            ) AS "acquired"
        `;
        if (!rows[0]?.acquired) {
            throw Object.assign(
                new Error(
                    'This item/location is locked by another inventory count currently being completed. ' +
                    'Review the completed count before retrying this session.',
                ),
                {
                    statusCode: 409,
                    code: 'COUNT_ITEM_LOCKED_BY_ANOTHER_COUNT',
                    details: { tenantId, itemId, locationId },
                },
            );
        }
    }
}

const postInventoryCountSession = async (sessionId, tenantId, userId) => {
    try {
    const session = await prisma.stockCountSession.findFirst({
        where: { id: sessionId, tenantId },
        include: {
            scopedLocations: true,
        }
    });
    if (!session) throw new Error('Count session not found');
    if (session.status === 'POSTED') {
        const e = new Error('Count session already POSTED');
        e.statusCode = 409;
        e.code = 'COUNT_SESSION_ALREADY_POSTED';
        throw e;
    }
    const postableStatuses = ['PENDING_GM', 'FINANCE_APPROVED', 'PENDING_APPROVAL', 'PENDING_FINANCE'];
    if (!postableStatuses.includes(session.status)) {
        throw new Error('Count session must complete final GM approval before posting');
    }

    // ── Period Guard (postingDate at commit — not count/document date) ───────
    const postedAt = new Date();
    const timezone = await getTenantTimezone(tenantId);
    await validatePostingDate(tenantId, postedAt, prisma, timezone);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt, timezone);
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch all per-location qty rows; choose latest round per item×location
    const cells = await prisma.stockCountLocationQty.findMany({
        where: { sessionId },
        orderBy: [{ itemId: 'asc' }, { locationId: 'asc' }, { roundNo: 'desc' }]
    });
    const latestMap = new Map();
    for (const c of cells) {
        const key = `${c.itemId}:${c.locationId}`;
        if (!latestMap.has(key)) latestMap.set(key, c);
    }
    const latestCells = [...latestMap.values()].filter(c => c.countedQty !== null);
    assertPostingLineQuantities({
        documentType: 'CANONICAL_INVENTORY_COUNT',
        lines: latestCells,
        quantityField: 'countedQty',
    });

    const transactionWork = async (tx) => {
        await assertNoDuplicateCountSessionPost(tx, tenantId, session.id);
        await acquireCanonicalCountCellLocks(tx, tenantId, latestCells);

        let ledgerEntriesCreated = 0;
        let itemsAffected = 0;
        let totalAbsVarianceValue = 0;

        const affectedItemSet = new Set();

        for (const c of latestCells) {
            const bookQty = Number(c.bookQty);
            const countedQty = Number(c.countedQty);
            const locationId = c.locationId;
            const itemId = c.itemId;
            assertIntegerQuantity({
                qty: countedQty,
                field: 'countedQty',
                message:
                    'Cannot post inventory count: counted quantity must be a whole number (integer). Fractional quantities are not allowed.',
                details: { sessionNo: session.sessionNo, itemId, locationId, countedQty },
            });

            const currentStock = await tx.stockBalance.findUnique({
                where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } }
            });
            const stockExists = currentStock != null;
            let currentQty = currentStock ? Number(currentStock.qtyOnHand) : 0;
            const currentBlockedQty = currentStock ? Number(currentStock.qtyBlocked) : 0;
            const policy = computePolicyBPostingAdjustment(countedQty, currentQty);
            if (policy.skip) {
                await conditionalSetPolicyBStock(tx, {
                    tenantId,
                    itemId,
                    locationId,
                    expectedQty: currentQty,
                    expectedBlockedQty: currentBlockedQty,
                    targetQty: countedQty,
                    insertWac: currentStock ? Number(currentStock.wacUnitCost) : 0,
                    stockExists,
                });
                continue;
            }

            const resolved = await resolveUnitCost(tx, { tenantId, itemId, locationId });
            let unitCost = resolved.unitCost;
            const valuationBasis = resolved.valuationBasis;

            const { isPositive, absAdjustment: absVariance, targetQty } = policy;
            let balanceAfter = targetQty;

            if (!isPositive) {
                unitCost = currentStock ? Number(currentStock.wacUnitCost) : unitCost;
            }
            const adjustedTotalValue = absVariance * unitCost;

            if (isPositive) {
                assertPositiveUnitCostForInboundQty({
                    unitCost,
                    qty: absVariance,
                    message:
                        'Cannot post inventory count: this positive variance cannot be valued because the item has no unit cost (WAC). ' +
                        'Correct the item cost first (via a GRN with a valid unit price, or Item Master), then approve/post this count difference.',
                    details: {
                        sessionNo: session.sessionNo,
                        itemId,
                        locationId,
                        varianceQty: absVariance,
                        unitCost,
                        valuationBasis,
                    },
                });
                const resultingWac =
                    currentStock && Number(currentStock.wacUnitCost) > 0
                        ? Number(currentStock.wacUnitCost)
                        : unitCost;
                assertNoZeroWacWithQty({
                    qtyOnHand: targetQty,
                    wacUnitCost: resultingWac,
                    message:
                        'Cannot post inventory count: resulting stock would have quantity greater than zero with missing or zero WAC. ' +
                        'Correct the item cost first, then retry.',
                    details: {
                        sessionNo: session.sessionNo,
                        itemId,
                        locationId,
                        resultingQty: targetQty,
                        resultingWac,
                        valuationBasis,
                    },
                });
            }

            const updatedStock = await conditionalSetPolicyBStock(tx, {
                tenantId,
                itemId,
                locationId,
                expectedQty: currentQty,
                expectedBlockedQty: currentBlockedQty,
                targetQty,
                insertWac: unitCost > 0 ? unitCost : 0,
                stockExists,
            });
            balanceAfter = Number(updatedStock.qtyOnHand);
            if (!isPositive) {
                unitCost = Number(updatedStock.wacUnitCost);
            }

            const policyNote = formatPolicyBAuditNote(bookQty, countedQty, currentQty);

            await tx.inventoryLedger.create({
                data: withLedgerPostingFields(
                    {
                        tenantId,
                        itemId,
                        locationId,
                        movementType: 'COUNT_ADJUSTMENT',
                        qtyIn: isPositive ? absVariance : 0,
                        qtyOut: isPositive ? 0 : absVariance,
                        unitCost,
                        totalValue: adjustedTotalValue,
                        balanceAfter,
                        referenceType: 'COUNT_SESSION',
                        referenceId: session.id,
                        referenceNo: session.sessionNo,
                        approvalId: session.approvalRequestId || null,
                        createdBy: userId,
                        notes: `${policyNote};valuationBasis=${valuationBasis}${
                            valuationBasis === VALUATION_BASIS.MISSING_WAC
                                ? '; financial value incomplete — review master data'
                                : ''
                        }`,
                    },
                    postingDate,
                    timezone,
                ),
            });
            ledgerEntriesCreated += 1;
            totalAbsVarianceValue += Math.abs(adjustedTotalValue);
            affectedItemSet.add(itemId);

        }

        itemsAffected = affectedItemSet.size;

        const updated = await tx.stockCountSession.update({
            where: { id: sessionId },
            data: { status: 'POSTED', postedAt, postingDate, assignedPostingPeriod }
        });

        // Auto-lock + finalize OB so getObStatus() becomes FINALIZED (not INITIAL_LOCK)
        await settingService.ensureObFinalizedFromCurrentBalances(tenantId, userId, {
            reason: `Auto-locked: COUNT_ADJUSTMENT posted via Inventory Count (${session.sessionNo})`,
            tx,
            source: 'AUTO_COUNT_ADJUSTMENT_INVENTORY_COUNT',
        });

        return {
            postedAt: updated.postedAt,
            ledgerEntriesCreated,
            itemsAffected,
            locationsAffected: (session.scopedLocations || []).length || 1,
            totalAbsVarianceValue,
            valuationBasis: 'GOVERNED_RESOLUTION_AT_POSTING',
            postingPolicy:
                'POLICY_B: postingAdjustment = countedQty - currentLiveQtyAtPostingTime; snapshotVariance = countedQty - bookQty (audit only)',
        };
    };

    let result;
    for (let attempt = 0; attempt <= POLICY_B_STOCK_CONFLICT_RETRIES; attempt += 1) {
        try {
            result = await prisma.$transaction(transactionWork);
            break;
        } catch (err) {
            if (err?.code !== 'COUNT_POLICY_B_STOCK_CHANGED' || attempt === POLICY_B_STOCK_CONFLICT_RETRIES) {
                throw err;
            }
        }
    }

    await logAction({
        tenantId,
        entityType: EntityType.STOCK_COUNT,
        entityId: sessionId,
        action: 'POST',
        changedBy: userId,
        note: `INVENTORY_COUNT_POSTED referenceType=COUNT_SESSION sessionNo=${session.sessionNo} valuation=GOVERNED`,
        afterValue: {
            sessionNo: session.sessionNo,
            referenceType: 'COUNT_SESSION',
            ledgerEntriesCreated: result.ledgerEntriesCreated,
            itemsAffected: result.itemsAffected,
        },
    });

    return result;
    } catch (err) {
        logger.error('[Posting] postInventoryCountSession failed', {
            sessionId,
            tenantId,
            message: err.message,
            code: err.code,
        });
        throw err;
    }
};

module.exports = {
    postDocument,
    postStockCount,
    postStockReport,
    postInventoryCountSession,
    conditionalDecrementStock,
    STOCK_DECREMENT_MODE,
    assertNoDuplicateCountSessionPost,
    stockBalanceCacheKey,
    prefetchStockBalancesForLines,
};
