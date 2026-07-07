const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { checkOBAllowed, validatePostingDate } = require('./periodGuard.service');
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

const stockBalanceCacheKey = (itemId, locationId) => `${itemId}:${locationId}`;

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
const postDocument = async (documentId, tenantId, userId, db = prisma, expectedVersion = null) => {
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

    // ── Period Guard (postingDate at commit — not documentDate) ─────────────
    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt);
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

            if (isOpeningBalance && !(qty > 0)) {
                continue;
            }

            // Determine Action and Locations based on MovementType
            let sourceLocationId = document.sourceLocationId || line.locationId;
            let destLocationId = document.destLocationId || line.locationId;

            const isIncrease = ['OPENING_BALANCE', 'RECEIVE', 'TRANSFER_IN', 'RETURN'].includes(document.movementType);
            const isDecrease = ['ISSUE', 'TRANSFER_OUT', 'BREAKAGE', 'LOST', 'LOAN_WRITE_OFF'].includes(document.movementType);
            const isTransfer = document.movementType === 'TRANSFER'; // Generic transfer if combined
            const isAdjustment = ['ADJUSTMENT', 'COUNT_ADJUSTMENT'].includes(document.movementType);

            // -- A. Decrement Stock (Source) --
            if (isDecrease || document.movementType === 'TRANSFER') {
                // Fetch current stock
                const currentStock = await tx.stockBalance.findUnique({
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
                const balanceAfter = Number(currentStock.qtyOnHand) - qty;

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
                    ),
                });

                // Update Stock Balance
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
                        // WAC doesn't change on issue
                    }
                });
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
                    const targetQty = qty;
                    const deltaQty = targetQty - currentQty;
                    const isIncreaseDelta = deltaQty >= 0;
                    const absDelta = Math.abs(deltaQty);
                    const balanceAfter = targetQty;
                    const deltaTotalValue = absDelta * receiveUnitCost;

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
                        ),
                    });

                    await tx.stockBalance.upsert({
                        where: {
                            tenantId_itemId_locationId: { tenantId, itemId, locationId: destLoc }
                        },
                        update: {
                            qtyOnHand: targetQty,
                            wacUnitCost: receiveUnitCost
                        },
                        create: {
                            tenantId,
                            itemId,
                            locationId: destLoc,
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
                    // Calculate new WAC
                    const totalValueBefore = currentQty * currentWac;
                    const newTotalQty = currentQty + qty;
                    const newWac = newTotalQty > 0 ? ((totalValueBefore + receiveTotalValue) / newTotalQty) : 0;
                    const balanceAfter = currentQty + qty;

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
                        ),
                    });

                    // Upsert Stock Balance
                    await tx.stockBalance.upsert({
                        where: {
                            tenantId_itemId_locationId: { tenantId, itemId, locationId: destLoc }
                        },
                        update: {
                            qtyOnHand: { increment: qty },
                            wacUnitCost: newWac
                        },
                        create: {
                            tenantId,
                            itemId,
                            locationId: destLoc,
                            qtyOnHand: qty,
                            wacUnitCost: receiveUnitCost
                        }
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

                const currentWac = currentStock ? Number(currentStock.wacUnitCost) : Number(unitCost) || 0;
                const adjUnitCost = Number(unitCost) > 0 ? Number(unitCost) : currentWac;
                const adjTotalValue = absQty * adjUnitCost;
                const currentQty = currentStock ? Number(currentStock.qtyOnHand) : 0;

                if (!isPositive && (!currentStock || currentQty < absQty)) {
                    throw Object.assign(
                        new Error(
                            `Insufficient stock for adjustment of ${line.item.name}. Available: ${currentStock ? currentStock.qtyOnHand : 0}, Requested: ${absQty}`,
                        ),
                        { statusCode: 422 },
                    );
                }

                const balanceAfter = isPositive ? (currentQty + absQty) : (currentQty - absQty);

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
                    ),
                });

                if (isPositive) {
                    // Increase balance (upsert in case balance doesn't exist yet)
                    const newTotalQty = currentQty + absQty;
                    const newWac = newTotalQty > 0
                        ? ((currentQty * currentWac) + adjTotalValue) / newTotalQty
                        : adjUnitCost;

                    await tx.stockBalance.upsert({
                        where: { tenantId_itemId_locationId: { tenantId, itemId, locationId: adjLocationId } },
                        update: { qtyOnHand: { increment: absQty }, wacUnitCost: newWac },
                        create: { tenantId, itemId, locationId: adjLocationId, qtyOnHand: absQty, wacUnitCost: adjUnitCost }
                    });
                } else {
                    // Decrease balance (already validated above)
                    await tx.stockBalance.update({
                        where: { tenantId_itemId_locationId: { tenantId, itemId, locationId: adjLocationId } },
                        data: { qtyOnHand: { decrement: absQty } }
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

    // ── Period Guard (postingDate at commit) ─────────────────────────────────
    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);
    const { postingDate } = resolvePostingPeriod(postedAt);
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
            const currentStock = await tx.stockBalance.findUnique({
                where: { tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: session.locationId } }
            });
            const currentQty = currentStock ? Number(currentStock.qtyOnHand) : 0;
            const policy = computePolicyBPostingAdjustment(countedQty, currentQty);
            if (policy.skip) continue;

            const { isPositive, absAdjustment: absVariance, targetQty } = policy;
            const wac = Number(line.wacUnitCost);
            const totalValue = absVariance * wac;

            if (!isPositive && (!currentStock || currentQty < absVariance)) {
                throw new Error(`Insufficient stock for count adjustment. Available: ${currentStock ? currentStock.qtyOnHand : 0}, Requested: ${absVariance}`);
            }
            const balanceAfter = targetQty;

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
            } else {
                // Negative variance
                await tx.stockBalance.update({
                    where: { tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: session.locationId } },
                    data: { qtyOnHand: { decrement: absVariance } }
                });
            }
        }

        const updatedSession = await tx.stockCountSession.update({
            where: { id: sessionId },
            data: { status: 'POSTED', postedAt: new Date() }
        });

        // Auto-lock Opening Balance on stock count posting
        await tx.tenantSetting.upsert({
            where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
            update: {
                value: 'LOCKED',
                reason: `Auto-locked: COUNT_ADJUSTMENT posted (${session.sessionNo})`,
            },
            create: {
                tenantId,
                key: 'allowOpeningBalance',
                value: 'LOCKED',
                reason: `Auto-locked: COUNT_ADJUSTMENT posted (${session.sessionNo})`,
            },
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

    // ── Period Guard (postingDate at commit) ─────────────────────────────────
    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);
    const { postingDate } = resolvePostingPeriod(postedAt);
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

                const locationId = locQty.locationId;
                const isPositive = varianceQty > 0;
                const absVariance = Math.abs(varianceQty);

                // Re-fetch current WAC since it might have changed since the draft was created
                const currentStock = await tx.stockBalance.findUnique({
                    where: { tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId } }
                });
                const wac = currentStock ? Number(currentStock.wacUnitCost) : 0;
                const currentQty = currentStock ? Number(currentStock.qtyOnHand) : 0;
                const adjustedTotalValue = absVariance * wac;

                if (!isPositive && (!currentStock || currentQty < absVariance)) {
                    throw new Error(`Insufficient stock for stock report adjustment. Available: ${currentStock ? currentStock.qtyOnHand : 0}, Requested: ${absVariance}`);
                }
                const balanceAfter = isPositive ? (currentQty + absVariance) : (currentQty - absVariance);

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
                    ),
                });

                // Update Stock Balance for this item+location
                if (isPositive) {
                    await tx.stockBalance.upsert({
                        where: { tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId } },
                        update: { qtyOnHand: { increment: absVariance } },
                        create: { tenantId, itemId: line.itemId, locationId, qtyOnHand: absVariance, wacUnitCost: wac }
                    });
                } else {
                    // Use updateMany to avoid P2025 error if balance record doesn't exist
                    await tx.stockBalance.updateMany({
                        where: { tenantId, itemId: line.itemId, locationId },
                        data: { qtyOnHand: { decrement: absVariance } }
                    });
                }
            }
        }

        const updatedReport = await tx.savedStockReport.update({
            where: { id: reportId },
            data: { status: 'POSTED', postedAt: new Date() }
        });

        // Auto-lock Opening Balance on stock count posting
        await tx.tenantSetting.upsert({
            where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
            update: {
                value: 'LOCKED',
                reason: `Auto-locked: COUNT_ADJUSTMENT posted via Stock Report (${report.reportNo})`,
            },
            create: {
                tenantId,
                key: 'allowOpeningBalance',
                value: 'LOCKED',
                reason: `Auto-locked: COUNT_ADJUSTMENT posted via Stock Report (${report.reportNo})`,
            },
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
const postInventoryCountSession = async (sessionId, tenantId, userId) => {
    try {
    const session = await prisma.stockCountSession.findFirst({
        where: { id: sessionId, tenantId },
        include: {
            scopedLocations: true,
        }
    });
    if (!session) throw new Error('Count session not found');
    if (session.status === 'POSTED') throw new Error('Count session already POSTED');
    const postableStatuses = ['PENDING_GM', 'FINANCE_APPROVED', 'PENDING_APPROVAL', 'PENDING_FINANCE'];
    if (!postableStatuses.includes(session.status)) {
        throw new Error('Count session must complete final GM approval before posting');
    }

    // ── Period Guard (postingDate at commit — not count/document date) ───────
    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);
    const { postingDate } = resolvePostingPeriod(postedAt);
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

    const result = await prisma.$transaction(async (tx) => {
        let ledgerEntriesCreated = 0;
        let itemsAffected = 0;
        let totalAbsVarianceValue = 0;

        const affectedItemSet = new Set();

        for (const c of latestCells) {
            const bookQty = Number(c.bookQty);
            const countedQty = Number(c.countedQty);
            const locationId = c.locationId;
            const itemId = c.itemId;

            const currentStock = await tx.stockBalance.findUnique({
                where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } }
            });
            const currentQty = currentStock ? Number(currentStock.qtyOnHand) : 0;
            const policy = computePolicyBPostingAdjustment(countedQty, currentQty);
            if (policy.skip) continue;

            const resolved = await resolveUnitCost(tx, { tenantId, itemId, locationId });
            const unitCost = resolved.unitCost;
            const valuationBasis = resolved.valuationBasis;

            const { isPositive, absAdjustment: absVariance, targetQty } = policy;
            const adjustedTotalValue = absVariance * unitCost;

            if (!isPositive && (!currentStock || currentQty < absVariance)) {
                const err = new Error(`Insufficient stock for count adjustment. Available: ${currentStock ? currentStock.qtyOnHand : 0}, Requested: ${absVariance}`);
                err.statusCode = 400;
                err.code = 'COUNT_ADJUSTMENT_INSUFFICIENT_STOCK';
                throw err;
            }

            const balanceAfter = targetQty;
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
                ),
            });
            ledgerEntriesCreated += 1;
            totalAbsVarianceValue += Math.abs(adjustedTotalValue);
            affectedItemSet.add(itemId);

            if (isPositive) {
                await tx.stockBalance.upsert({
                    where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
                    update: { qtyOnHand: { increment: absVariance } },
                    create: {
                        tenantId,
                        itemId,
                        locationId,
                        qtyOnHand: absVariance,
                        wacUnitCost: unitCost > 0 ? unitCost : 0,
                    },
                });
            } else {
                await tx.stockBalance.updateMany({
                    where: { tenantId, itemId, locationId },
                    data: { qtyOnHand: { decrement: absVariance } }
                });
            }
        }

        itemsAffected = affectedItemSet.size;

        const updated = await tx.stockCountSession.update({
            where: { id: sessionId },
            data: { status: 'POSTED', postedAt: new Date() }
        });

        // Auto-lock Opening Balance on stock count posting (same policy)
        await tx.tenantSetting.upsert({
            where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
            update: {
                value: 'LOCKED',
                reason: `Auto-locked: COUNT_ADJUSTMENT posted via Inventory Count (${session.sessionNo})`,
            },
            create: {
                tenantId,
                key: 'allowOpeningBalance',
                value: 'LOCKED',
                reason: `Auto-locked: COUNT_ADJUSTMENT posted via Inventory Count (${session.sessionNo})`,
            },
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
    });

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
    stockBalanceCacheKey,
    prefetchStockBalancesForLines,
};
