/**
 * Governed movement posting for Breakage and Lost (Phase G1).
 * Single implementation path — domain services must delegate here via postingEngine.
 */
const { incrementTotalQtyDamage, incrementTotalQtyLost } = require('./stockCumulative.service');
const { validatePostingDate } = require('./periodGuard.service');
const { resolvePostingPeriod } = require('../platform/postingPeriod.util');

const err = (message, statusCode = 400) => {
    const e = new Error(message);
    e.statusCode = statusCode;
    return e;
};

async function ledgerBalanceAfterAtLocation(tx, tenantId, itemId, locationId) {
    const stock = await tx.stockBalance.findUnique({
        where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
    });
    return stock ? Number(stock.qtyOnHand) : 0;
}

async function assertNoDuplicateLedgerPost(tx, tenantId, documentId) {
    const existing = await tx.inventoryLedger.findFirst({
        where: { tenantId, referenceId: documentId },
    });
    if (existing) {
        throw err('Document has already been posted to ledger. Double-posting prevented.', 409);
    }
}

/**
 * Post approved BREAKAGE movement (internal or GET_PASS_RETURN).
 */
async function postBreakageMovementInTransaction(tx, doc, tenantId, userId) {
    await assertNoDuplicateLedgerPost(tx, tenantId, doc.id);
    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt);
    const isGetPassReturn = doc.sourceType === 'GET_PASS_RETURN';

    if (isGetPassReturn) {
        for (const line of doc.lines) {
            const qty = parseFloat(line.qtyInBaseUnit);
            if (qty <= 0) continue;
            const unitCost = parseFloat(line.unitCost || 0);
            const lossValue = qty * unitCost;
            const balanceAfter = await ledgerBalanceAfterAtLocation(
                tx,
                tenantId,
                line.itemId,
                line.locationId,
            );

            await tx.inventoryLedger.create({
                data: {
                    tenantId,
                    itemId: line.itemId,
                    locationId: line.locationId,
                    movementType: 'BREAKAGE',
                    qtyOut: qty,
                    qtyIn: 0,
                    unitCost,
                    totalValue: lossValue,
                    balanceAfter,
                    referenceType: 'BREAKAGE',
                    referenceId: doc.id,
                    referenceNo: doc.documentNo,
                    notes: doc.reason,
                    createdBy: userId,
                    postingDate,
                    assignedPostingPeriod,
                },
            });
            await incrementTotalQtyDamage(tx, tenantId, line.itemId, line.locationId, qty);
        }
        return;
    }

    for (const line of doc.lines) {
        const itemId = line.itemId;
        const locationId = line.locationId;
        const qty = parseFloat(line.qtyInBaseUnit);
        const stockKey = { tenantId_itemId_locationId: { tenantId, itemId, locationId } };

        const currentStock = await tx.stockBalance.findUnique({ where: stockKey });
        const qtyBefore = currentStock ? parseFloat(currentStock.qtyOnHand) : 0;
        const wacBefore = currentStock ? parseFloat(currentStock.wacUnitCost) : 0;

        if (qtyBefore < qty) {
            throw err(
                `Insufficient stock for ${line.item?.name || itemId} at location. Available: ${qtyBefore}, Requested: ${qty}`,
            );
        }

        const balanceAfter = qtyBefore - qty;
        const lossValue = qty * wacBefore;

        await tx.inventoryLedger.create({
            data: {
                tenantId,
                itemId,
                locationId,
                movementType: 'BREAKAGE',
                qtyOut: qty,
                qtyIn: 0,
                unitCost: wacBefore,
                totalValue: lossValue,
                balanceAfter,
                referenceType: 'BREAKAGE',
                referenceId: doc.id,
                referenceNo: doc.documentNo,
                notes: doc.reason,
                createdBy: userId,
                postingDate,
                assignedPostingPeriod,
            },
        });

        await tx.stockBalance.update({
            where: stockKey,
            data: {
                qtyOnHand: { decrement: qty },
                totalQtyDamage: { increment: qty },
            },
        });
    }
}

/**
 * Post approved LOST movement (internal or GET_PASS_RETURN).
 */
async function postLostMovementInTransaction(tx, doc, userId) {
    await assertNoDuplicateLedgerPost(tx, doc.tenantId, doc.id);
    const postedAt = new Date();
    await validatePostingDate(doc.tenantId, postedAt);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt);
    const isGetPassReturn = doc.sourceType === 'GET_PASS_RETURN';

    if (isGetPassReturn) {
        for (const line of doc.lines) {
            const qty = Number(line.qtyInBaseUnit || 0);
            if (qty <= 0) continue;
            const unitCost = Number(line.unitCost || 0);
            const balanceAfter = await ledgerBalanceAfterAtLocation(
                tx,
                doc.tenantId,
                line.itemId,
                line.locationId,
            );

            await tx.inventoryLedger.create({
                data: {
                    tenantId: doc.tenantId,
                    itemId: line.itemId,
                    locationId: line.locationId,
                    movementType: 'LOST',
                    qtyIn: 0,
                    qtyOut: qty,
                    unitCost,
                    totalValue: qty * unitCost,
                    balanceAfter,
                    referenceType: 'LOST',
                    referenceId: doc.id,
                    referenceNo: doc.documentNo,
                    notes: doc.reason || null,
                    createdBy: userId,
                    postingDate,
                    assignedPostingPeriod,
                },
            });
            await incrementTotalQtyLost(tx, doc.tenantId, line.itemId, line.locationId, qty);
        }
        return;
    }

    for (const line of doc.lines) {
        const qty = Number(line.qtyInBaseUnit || 0);
        if (qty <= 0) continue;

        const stockKey = {
            tenantId_itemId_locationId: {
                tenantId: doc.tenantId,
                itemId: line.itemId,
                locationId: line.locationId,
            },
        };
        const stock = await tx.stockBalance.findUnique({ where: stockKey });
        const qtyBefore = Number(stock?.qtyOnHand || 0);
        if (qtyBefore < qty) {
            throw err(`Insufficient stock for ${line.item?.name || line.itemId}.`, 400);
        }
        const wac = Number(stock?.wacUnitCost || 0);
        const balanceAfter = qtyBefore - qty;

        await tx.inventoryLedger.create({
            data: {
                tenantId: doc.tenantId,
                itemId: line.itemId,
                locationId: line.locationId,
                movementType: 'LOST',
                qtyIn: 0,
                qtyOut: qty,
                unitCost: wac,
                totalValue: qty * wac,
                balanceAfter,
                referenceType: 'LOST',
                referenceId: doc.id,
                referenceNo: doc.documentNo,
                notes: doc.reason || null,
                createdBy: userId,
                postingDate,
                assignedPostingPeriod,
            },
        });

        await tx.stockBalance.update({
            where: stockKey,
            data: {
                qtyOnHand: { decrement: qty },
                totalQtyLost: { increment: qty },
            },
        });
    }
}

module.exports = {
    postBreakageMovementInTransaction,
    postLostMovementInTransaction,
    assertNoDuplicateLedgerPost,
};
