const { resolvePostingPeriod } = require('../platform/postingPeriod.util');
const { validatePostingDate, checkFuturePostingDate } = require('./periodGuard.service');
const {
    assertPositiveUnitCostForInboundQty,
    assertNoZeroWacWithQty,
} = require('./stockBalanceWacGuard.service');
const { assertIntegerQuantity } = require('./integerQuantityGuard.service');
const { getTenantTimezone } = require('./tenantTimezone.service');
const err = (message, statusCode = 400) => {
    const e = new Error(message);
    e.statusCode = statusCode;
    return e;
};

const transferPostingEffectKey = ({ tenantId, transferId, transferLineId, direction }) =>
    `v1|TRANSFER|${tenantId}|${transferId}|${transferLineId}|${direction}`;

async function createIdempotentTransferLedgerEffect(tx, data) {
    try {
        return await tx.inventoryLedger.create({ data });
    } catch (error) {
        const target = Array.isArray(error?.meta?.target)
            ? error.meta.target.join(',')
            : String(error?.meta?.target || '');
        if (error?.code === 'P2002' && target.includes('postingEffectKey')) {
            throw Object.assign(
                new Error('This transfer line has already been posted to the ledger. Duplicate effect prevented.'),
                {
                    statusCode: 409,
                    code: 'POSTING_EFFECT_ALREADY_APPLIED',
                    details: { postingEffectKey: data.postingEffectKey },
                },
            );
        }
        throw error;
    }
}

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
 * @param {{ postingDate?: Date|string, fromResolutionWorkspace?: boolean }} [opts]
 */
async function postTransferInTransaction(tx, trf, userId, receivedLines = [], opts = {}) {
    const tenantId = trf.tenantId;
    await assertNoDuplicateTransferPost(tx, tenantId, trf.id);
    const timezone = await getTenantTimezone(tenantId, tx);

    const destName = trf.destLocation?.name || trf.destLocationId;
    const sourceName = trf.sourceLocation?.name || trf.sourceLocationId;
    const now = opts.postingDate != null ? new Date(opts.postingDate) : new Date();
    if (opts.fromResolutionWorkspace) {
        checkFuturePostingDate(now, timezone);
    } else {
        await validatePostingDate(tenantId, now, tx, timezone);
    }
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(now, timezone);

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
        assertIntegerQuantity({
            qty: receivedQty,
            field: 'receivedQty',
            message:
                'Cannot post transfer: quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: {
                transferNo: trf.transferNo,
                itemId: line.itemId,
                receivedQty,
            },
        });

        const updatedSourceRows = await tx.$queryRaw`
            UPDATE "stock_balances"
            SET "qtyOnHand" = "qtyOnHand" - ${receivedQty},
                "lastUpdated" = ${now}
            WHERE "tenantId" = ${tenantId}::uuid
              AND "itemId" = ${line.itemId}::uuid
              AND "locationId" = ${trf.sourceLocationId}::uuid
              AND "qtyOnHand" - "qtyBlocked" >= ${receivedQty}
            RETURNING "qtyOnHand", "wacUnitCost"
        `;
        const updatedSource = updatedSourceRows[0];
        if (!updatedSource) {
            throw new Error(`Insufficient available source stock for item ${line.itemId} at posting time.`);
        }

        const wac = Number(updatedSource.wacUnitCost);
        assertPositiveUnitCostForInboundQty({
            unitCost: wac,
            qty: receivedQty,
            message:
                'Cannot post transfer: source stock has quantity but missing or zero WAC. ' +
                'Correct the source item cost (GRN or Item Master) before transferring.',
            details: {
                transferNo: trf.transferNo,
                itemId: line.itemId,
                sourceLocationId: trf.sourceLocationId,
                sourceWac: wac,
            },
        });
        const value = receivedQty * wac;
        const srcQtyAfter = Number(updatedSource.qtyOnHand);

        await createIdempotentTransferLedgerEffect(tx, {
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
            postingEffectKey: transferPostingEffectKey({
                tenantId,
                transferId: trf.id,
                transferLineId: line.id,
                direction: 'OUT',
            }),
            notes: `Transfer OUT to ${destName}`,
            createdBy: userId,
            postingDate,
            assignedPostingPeriod,
        });

        const updatedDestinationRows = await tx.$queryRaw`
            INSERT INTO "stock_balances" (
                "tenantId",
                "itemId",
                "locationId",
                "qtyOnHand",
                "wacUnitCost",
                "lastUpdated"
            )
            VALUES (
                ${tenantId}::uuid,
                ${line.itemId}::uuid,
                ${trf.destLocationId}::uuid,
                ${receivedQty},
                ${wac},
                ${now}
            )
            ON CONFLICT ("tenantId", "itemId", "locationId")
            DO UPDATE SET
                "wacUnitCost" = CASE
                    WHEN "stock_balances"."qtyOnHand" + EXCLUDED."qtyOnHand" > 0
                    THEN (
                        ("stock_balances"."qtyOnHand" * "stock_balances"."wacUnitCost")
                        + (EXCLUDED."qtyOnHand" * EXCLUDED."wacUnitCost")
                    ) / ("stock_balances"."qtyOnHand" + EXCLUDED."qtyOnHand")
                    ELSE EXCLUDED."wacUnitCost"
                END,
                "qtyOnHand" = "stock_balances"."qtyOnHand" + EXCLUDED."qtyOnHand",
                "lastUpdated" = EXCLUDED."lastUpdated"
            RETURNING "qtyOnHand", "wacUnitCost"
        `;
        const updatedDestination = updatedDestinationRows[0];
        const newTotalQty = Number(updatedDestination.qtyOnHand);
        const newWac = Number(updatedDestination.wacUnitCost);

        assertNoZeroWacWithQty({
            qtyOnHand: newTotalQty,
            wacUnitCost: newWac,
            message:
                'Cannot post transfer: destination stock would have quantity greater than zero with missing or zero WAC. ' +
                'Correct the source item cost before transferring.',
            details: {
                transferNo: trf.transferNo,
                itemId: line.itemId,
                destLocationId: trf.destLocationId,
                resultingQty: newTotalQty,
                resultingWac: newWac,
            },
        });

        await createIdempotentTransferLedgerEffect(tx, {
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
            postingEffectKey: transferPostingEffectKey({
                tenantId,
                transferId: trf.id,
                transferLineId: line.id,
                direction: 'IN',
            }),
            notes: `Transfer IN from ${sourceName}`,
            createdBy: userId,
            postingDate,
            assignedPostingPeriod,
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
