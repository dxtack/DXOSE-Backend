'use strict';

const {
    assertPositiveUnitCostForInboundQty,
    assertNoZeroWacWithQty,
} = require('./stockBalanceWacGuard.service');

async function applyAtomicWeightedReceipt(tx, {
    tenantId,
    itemId,
    locationId,
    qty,
    unitCost,
    context = 'receipt',
}) {
    const receiptQty = Number(qty);
    const receiptUnitCost = Number(unitCost);
    assertPositiveUnitCostForInboundQty({
        unitCost: receiptUnitCost,
        qty: receiptQty,
        message: `Cannot post ${context}: inbound quantity requires a valid positive unit cost.`,
        details: { tenantId, itemId, locationId, qty: receiptQty, unitCost: receiptUnitCost },
    });

    const now = new Date();
    const rows = await tx.$queryRaw`
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
            ${itemId}::uuid,
            ${locationId}::uuid,
            ${receiptQty},
            ${receiptUnitCost},
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
        RETURNING "qtyOnHand", "qtyBlocked", "wacUnitCost"
    `;
    const updated = rows[0];
    assertNoZeroWacWithQty({
        qtyOnHand: Number(updated.qtyOnHand),
        wacUnitCost: Number(updated.wacUnitCost),
        message: `Cannot post ${context}: resulting stock has quantity with missing or zero WAC.`,
        details: {
            tenantId,
            itemId,
            locationId,
            resultingQty: Number(updated.qtyOnHand),
            resultingWac: Number(updated.wacUnitCost),
        },
    });
    return {
        qtyOnHand: Number(updated.qtyOnHand),
        qtyBlocked: Number(updated.qtyBlocked || 0),
        wacUnitCost: Number(updated.wacUnitCost),
        receiptUnitCost,
    };
}

module.exports = { applyAtomicWeightedReceipt };
