/**
 * Governed GRN post (Phase G1) — stock + ledger + movement mirror in one transaction.
 */
const { validatePostingDate, checkFuturePostingDate } = require('./periodGuard.service');
const { resolvePostingPeriod } = require('../platform/postingPeriod.util');
const {
    assertPositiveUnitCostForInboundQty,
} = require('./stockBalanceWacGuard.service');
const { assertIntegerQuantity } = require('./integerQuantityGuard.service');
const { applyAtomicWeightedReceipt } = require('./weightedReceipt.service');
const { getTenantTimezone } = require('./tenantTimezone.service');

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
 * @param {{ postingDate?: Date|string, fromResolutionWorkspace?: boolean }} [opts]
 *        When fromResolutionWorkspace, caller must have run assertPeriodAllowPostingForResolution.
 */
async function postGrnInTransaction(tx, grn, userId, opts = {}) {
    const tenantId = grn.tenantId;
    await assertNoDuplicateGrnPost(tx, tenantId, grn.id);
    const timezone = await getTenantTimezone(tenantId, tx);

    if (!grn.lines?.length) {
        throw err('GRN has no lines to post', 422);
    }

    const postedAt = opts.postingDate != null ? new Date(opts.postingDate) : new Date();
    if (opts.fromResolutionWorkspace) {
        checkFuturePostingDate(postedAt, timezone);
    } else {
        await validatePostingDate(tenantId, postedAt, tx, timezone);
    }
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt, timezone);

    for (const line of grn.lines) {
        if (!line.internalItemId || !line.internalUomId) {
            throw err('Line is missing item or UOM — aborting post');
        }

        const qtyToPost = Number(line.qtyInBaseUnit);
        if (qtyToPost <= 0) {
            throw err('Line has zero or negative quantity — aborting post');
        }
        assertIntegerQuantity({
            qty: qtyToPost,
            field: 'qtyInBaseUnit',
            message:
                'Cannot post GRN: quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: { grnNumber: grn.grnNumber, itemId: line.internalItemId, qty: qtyToPost },
        });

        const lineUnitPrice = Number(line.unitPrice);
        assertPositiveUnitCostForInboundQty({
            unitCost: lineUnitPrice,
            qty: qtyToPost,
            message:
                'Cannot post GRN: a line has quantity greater than zero but unit price is missing or zero. ' +
                'Enter a valid unit price on every received line, then retry.',
            details: {
                grnNumber: grn.grnNumber,
                itemId: line.internalItemId,
                receivedQty: qtyToPost,
                unitPrice: lineUnitPrice,
            },
        });
        const totalValue = qtyToPost * lineUnitPrice;

        const updatedStock = await applyAtomicWeightedReceipt(tx, {
            tenantId,
            itemId: line.internalItemId,
            locationId: grn.locationId,
            qty: qtyToPost,
            unitCost: lineUnitPrice,
            context: `GRN ${grn.grnNumber}`,
        });
        const newQty = updatedStock.qtyOnHand;

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
