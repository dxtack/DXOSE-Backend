/**
 * Governed GRN post (Phase G1) — stock + ledger + movement mirror in one transaction.
 */
const { validatePostingDate } = require('./periodGuard.service');
const { resolvePostingPeriod } = require('../platform/postingPeriod.util');

const err = (message, statusCode = 400) => {
    const e = new Error(message);
    e.statusCode = statusCode;
    return e;
};

async function assertNoDuplicateGrnPost(tx, tenantId, grnId) {
    const existing = await tx.inventoryLedger.findFirst({
        where: { tenantId, referenceType: 'GRN', referenceId: grnId },
    });
    if (existing) {
        throw err('GRN has already been posted to ledger. Double-posting prevented.', 409);
    }
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} grn — grnImport with lines[]
 * @param {string} userId
 */
async function postGrnInTransaction(tx, grn, userId) {
    const tenantId = grn.tenantId;
    await assertNoDuplicateGrnPost(tx, tenantId, grn.id);

    if (!grn.lines?.length) {
        throw err('GRN has no lines to post', 422);
    }

    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt);

    for (const line of grn.lines) {
        if (!line.internalItemId || !line.internalUomId) {
            throw err('Line is missing item or UOM — aborting post');
        }

        const qtyToPost = Number(line.qtyInBaseUnit);
        if (qtyToPost <= 0) {
            throw err('Line has zero or negative quantity — aborting post');
        }

        const lineUnitPrice = Number(line.unitPrice);
        const totalValue = qtyToPost * lineUnitPrice;

        const stockKey = {
            tenantId_itemId_locationId: {
                tenantId,
                itemId: line.internalItemId,
                locationId: grn.locationId,
            },
        };

        const balance = await tx.stockBalance.findUnique({ where: stockKey });
        const prevQty = balance ? Number(balance.qtyOnHand) : 0;
        const prevWac = balance ? Number(balance.wacUnitCost) : 0;
        const newQty = prevQty + qtyToPost;
        const newWac =
            newQty > 0 ? (prevQty * prevWac + qtyToPost * lineUnitPrice) / newQty : lineUnitPrice;

        await tx.stockBalance.upsert({
            where: stockKey,
            create: {
                tenantId,
                itemId: line.internalItemId,
                locationId: grn.locationId,
                qtyOnHand: newQty,
                wacUnitCost: newWac,
            },
            update: { qtyOnHand: newQty, wacUnitCost: newWac, lastUpdated: new Date() },
        });

        await tx.inventoryLedger.create({
            data: {
                tenantId,
                itemId: line.internalItemId,
                locationId: grn.locationId,
                movementType: 'RECEIVE',
                qtyIn: qtyToPost,
                qtyOut: 0,
                unitCost: lineUnitPrice,
                totalValue,
                balanceAfter: newQty,
                referenceType: 'GRN',
                referenceId: grn.id,
                referenceNo: grn.grnNumber,
                notes: `GRN: ${grn.grnNumber} | Supplier: ${grn.vendorNameSnapshot}`,
                createdBy: userId,
                postingDate,
                assignedPostingPeriod,
            },
        });
    }

    const movementLinesCreate = grn.lines.map((line) => {
        const qtyToPost = Number(line.qtyInBaseUnit);
        const lineUnitPrice = Number(line.unitPrice);
        return {
            itemId: line.internalItemId,
            locationId: grn.locationId,
            unitId: line.internalUomId,
            qtyRequested: qtyToPost,
            qtyInBaseUnit: qtyToPost,
            unitCost: lineUnitPrice,
            totalValue: qtyToPost * lineUnitPrice,
        };
    });

    await tx.movementDocument.create({
        data: {
            tenantId,
            documentNo: grn.grnNumber,
            movementType: 'RECEIVE',
            status: 'POSTED',
            destLocationId: grn.locationId,
            supplierId: grn.vendorId,
            documentDate: grn.receivingDate,
            notes: grn.notes ? `GRN ${grn.grnNumber}: ${grn.notes}` : `Posted from GRN ${grn.grnNumber}`,
            createdBy: userId,
            postedAt,
            lines: { create: movementLinesCreate },
        },
    });

    await tx.grnImport.update({
        where: { id: grn.id },
        data: {
            status: 'POSTED',
            postedBy: userId,
            postedAt,
            postingDate,
            assignedPostingPeriod,
            updatedAt: new Date(),
        },
    });
}

module.exports = {
    postGrnInTransaction,
    assertNoDuplicateGrnPost,
};
