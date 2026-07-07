const { resolvePostingPeriod } = require('../platform/postingPeriod.util');
const { validatePostingDate } = require('./periodGuard.service');
const err = (message, statusCode = 400) => {
    const e = new Error(message);
    e.statusCode = statusCode;
    return e;
};

async function assertNoDuplicateTransferPost(tx, tenantId, transferId) {
    const existing = await tx.inventoryLedger.findFirst({
        where: { tenantId, referenceType: 'TRANSFER', referenceId: transferId, movementType: 'TRANSFER_OUT' },
    });
    if (existing) {
        throw err('Transfer has already been posted to ledger. Double-posting prevented.', 409);
    }
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} trf — storeTransfer with lines[], sourceLocation, destLocation
 * @param {string} userId — Finance approver / poster
 * @param {Array<{ lineId: string, receivedQty: number }>} [receivedLines] — legacy receive override; defaults to requestedQty
 */
async function postTransferInTransaction(tx, trf, userId, receivedLines = []) {
    const tenantId = trf.tenantId;
    await assertNoDuplicateTransferPost(tx, tenantId, trf.id);

    const destName = trf.destLocation?.name || trf.destLocationId;
    const sourceName = trf.sourceLocation?.name || trf.sourceLocationId;
    const now = new Date();
    await validatePostingDate(tenantId, now);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(now);

    for (const line of trf.lines) {
        const override = receivedLines.find((r) => r.lineId === line.id);
        const receivedQty = override ? Number(override.receivedQty) : Number(line.requestedQty);
        if (receivedQty < 0) {
            throw new Error(`Received quantity cannot be negative for item ${line.itemId}.`);
        }
        if (receivedQty > Number(line.requestedQty)) {
            throw new Error(`Received quantity for item ${line.itemId} cannot exceed requested quantity.`);
        }
        if (receivedQty <= 0) continue;

        const srcKey = {
            tenantId_itemId_locationId: {
                tenantId,
                itemId: line.itemId,
                locationId: trf.sourceLocationId,
            },
        };
        const srcBalance = await tx.stockBalance.findUnique({ where: srcKey });
        if (!srcBalance || Number(srcBalance.qtyOnHand) < receivedQty) {
            throw new Error(`Insufficient source stock for item ${line.itemId} at posting time.`);
        }

        const wac = Number(srcBalance.wacUnitCost);
        const value = receivedQty * wac;
        const srcQtyAfter = Number(srcBalance.qtyOnHand) - receivedQty;

        await tx.stockBalance.update({
            where: srcKey,
            data: { qtyOnHand: { decrement: receivedQty }, lastUpdated: now },
        });

        await tx.inventoryLedger.create({
            data: {
                tenantId,
                itemId: line.itemId,
                locationId: trf.sourceLocationId,
                movementType: 'TRANSFER_OUT',
                qtyOut: receivedQty,
                qtyIn: 0,
                unitCost: wac,
                totalValue: value,
                balanceAfter: srcQtyAfter,
                referenceType: 'TRANSFER',
                referenceId: trf.id,
                referenceNo: trf.transferNo,
                notes: `Transfer OUT to ${destName}`,
                createdBy: userId,
                postingDate,
                assignedPostingPeriod,
            },
        });

        const dstKey = {
            tenantId_itemId_locationId: {
                tenantId,
                itemId: line.itemId,
                locationId: trf.destLocationId,
            },
        };
        const dstBalance = await tx.stockBalance.findUnique({ where: dstKey });
        const prevQty = dstBalance ? Number(dstBalance.qtyOnHand) : 0;
        const prevWac = dstBalance ? Number(dstBalance.wacUnitCost) : 0;
        const newTotalQty = prevQty + receivedQty;
        const newWac = newTotalQty > 0 ? (prevQty * prevWac + receivedQty * wac) / newTotalQty : wac;

        await tx.stockBalance.upsert({
            where: dstKey,
            create: {
                tenantId,
                itemId: line.itemId,
                locationId: trf.destLocationId,
                qtyOnHand: receivedQty,
                wacUnitCost: wac,
                lastUpdated: now,
            },
            update: { qtyOnHand: newTotalQty, wacUnitCost: newWac, lastUpdated: now },
        });

        await tx.inventoryLedger.create({
            data: {
                tenantId,
                itemId: line.itemId,
                locationId: trf.destLocationId,
                movementType: 'TRANSFER_IN',
                qtyIn: receivedQty,
                qtyOut: 0,
                unitCost: wac,
                totalValue: value,
                balanceAfter: newTotalQty,
                referenceType: 'TRANSFER',
                referenceId: trf.id,
                referenceNo: trf.transferNo,
                notes: `Transfer IN from ${sourceName}`,
                createdBy: userId,
                postingDate,
                assignedPostingPeriod,
            },
        });

        await tx.storeTransferLine.update({
            where: { id: line.id },
            data: { receivedQty, unitCost: wac, totalValue: value },
        });
    }

    await tx.storeTransfer.update({
        where: { id: trf.id },
        data: {
            status: 'POSTED',
            postedBy: userId,
            postedAt: now,
            postingDate,
            assignedPostingPeriod,
            approvedBy: userId,
            approvedAt: now,
            receivedBy: userId,
            receivedAt: now,
            closedAt: now,
            updatedAt: now,
        },
    });
}

/** @deprecated Use postTransferInTransaction */
const postTransferReceiveInTransaction = postTransferInTransaction;

module.exports = {
    postTransferInTransaction,
    postTransferReceiveInTransaction,
    assertNoDuplicateTransferPost,
};
