/**
 * Governed Get Pass inventory/accounting posts (Phase G1).
 * All stock + official ledger mutations for checkout/return/destination flows.
 */
const { validatePostingDate } = require('./periodGuard.service');
const { resolvePostingPeriod } = require('../platform/postingPeriod.util');
const { withLedgerPostingFields } = require('../platform/inventoryLedger.util');
const {
    assertPositiveUnitCostForInboundQty,
    assertNoZeroWacWithQty,
} = require('./stockBalanceWacGuard.service');
const { assertIntegerQuantity } = require('./integerQuantityGuard.service');
const { getTenantTimezone } = require('./tenantTimezone.service');
const { applyAtomicWeightedReceipt } = require('./weightedReceipt.service');

const REVERSIBLE_TYPES = ['TEMPORARY', 'CATERING', 'OUTSIDE_CATERING'];

const err = (message, statusCode = 400) => {
    const e = new Error(message);
    e.statusCode = statusCode;
    return e;
};

const isReversibleTransferType = (transferType) => REVERSIBLE_TYPES.includes(transferType);
const isBlockingTransferType = (transferType) => REVERSIBLE_TYPES.includes(transferType);

const getPassPostingEffectKey = ({ tenantId, getPassId, getPassLineId, effectType }) =>
    `v1|GET_PASS|${tenantId}|${getPassId}|${getPassLineId}|${effectType}`;

async function createIdempotentGetPassLedgerEffect(tx, data) {
    try {
        return await tx.inventoryLedger.create({ data });
    } catch (error) {
        const target = Array.isArray(error?.meta?.target)
            ? error.meta.target.join(',')
            : String(error?.meta?.target || '');
        if (error?.code === 'P2002' && target.includes('postingEffectKey')) {
            throw Object.assign(
                new Error('This Get Pass effect has already been posted to the ledger. Duplicate effect prevented.'),
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

async function assertNoDuplicateGetPassCheckout(tx, tenantId, getPassId) {
    const existing = await tx.inventoryLedger.findFirst({
        where: {
            tenantId,
            referenceType: 'GET_PASS',
            referenceId: getPassId,
            movementType: { in: ['ISSUE', 'GET_PASS_OUT'] },
        },
    });
    if (existing) {
        throw err('Get Pass checkout already posted to ledger. Double-posting prevented.', 409);
    }
}

/**
 * Ch.5.2 — Per-effect guard for secondary Get Pass ledger posts
 * (return / write-off / destination receive / tracking).
 * Same getPass may legally have checkout + return; key includes movementType + item + location.
 */
async function assertNoDuplicateGetPassLedgerEffect(tx, {
    tenantId,
    referenceType,
    referenceId,
    movementType,
    itemId,
    locationId,
}) {
    const existing = await tx.inventoryLedger.findFirst({
        where: {
            tenantId,
            referenceType,
            referenceId,
            movementType,
            itemId,
            locationId,
        },
    });
    if (existing) {
        throw err('Get Pass ledger effect already posted. Double-posting prevented.', 409);
    }
}

/** Non-valuation custody tracking at destination. */
async function createTrackingLedgerEntry(
    tx,
    {
        tenantId,
        itemId,
        locationId,
        movementType,
        qtyIn = 0,
        qtyOut = 0,
        referenceId,
        getPassLineId,
        referenceNo,
        createdBy,
        notes,
    },
    postingDate,
) {
    const timezone = await getTenantTimezone(tenantId, tx);
    await assertNoDuplicateGetPassLedgerEffect(tx, {
        tenantId,
        referenceType: 'GET_PASS',
        referenceId,
        movementType,
        itemId,
        locationId,
    });
    await createIdempotentGetPassLedgerEffect(
        tx,
        withLedgerPostingFields(
            {
                tenantId,
                itemId,
                locationId,
                movementType,
                affectsValuation: false,
                qtyIn,
                qtyOut,
                unitCost: 0,
                totalValue: 0,
                referenceType: 'GET_PASS',
                referenceId,
                referenceNo,
                postingEffectKey:
                    movementType === 'TEMP_RECEIVE'
                        ? getPassPostingEffectKey({
                            tenantId,
                            getPassId: referenceId,
                            getPassLineId,
                            effectType: 'TEMP_RECEIVE',
                        })
                        : null,
                createdBy,
                notes,
            },
            postingDate,
            timezone,
        ),
    );
}

/**
 * Security checkout — block or issue stock + valuation ledger OUT.
 */
async function postGetPassCheckoutInTransaction(tx, { getPass, tenantId, user, linesOut = [] }) {
    await assertNoDuplicateGetPassCheckout(tx, tenantId, getPass.id);
    const postedAt = new Date();
    const timezone = await getTenantTimezone(tenantId, tx);
    await validatePostingDate(tenantId, postedAt, tx, timezone);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt, timezone);

    // Pre-validate aggregated availability with the same rule checkout uses.
    const neededByKey = new Map();
    for (const line of getPass.lines) {
        const key = `${line.itemId}::${line.locationId}`;
        neededByKey.set(key, (neededByKey.get(key) || 0) + Number(line.qty));
    }
    for (const [key, qtyReq] of neededByKey.entries()) {
        const [itemId, locationId] = key.split('::');
        const stock = await tx.stockBalance.findUnique({
            where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
            include: { item: { select: { name: true } } },
        });
        const availableQty = stock ? Number(stock.qtyOnHand) - Number(stock.qtyBlocked || 0) : 0;
        if (!stock || availableQty < qtyReq - 1e-9) {
            const name = stock?.item?.name || 'item';
            throw err(
                `Insufficient stock for ${name}. Available: ${availableQty}. Send back to the creator to amend quantities — Security cannot fix stock here.`,
                422,
            );
        }
    }

    for (const line of getPass.lines) {
        const stockKey = {
            tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: line.locationId },
        };
        const stock = await tx.stockBalance.findUnique({ where: stockKey });

        const qtyReq = Number(line.qty);
        assertIntegerQuantity({
            qty: qtyReq,
            field: 'qty',
            message:
                'Cannot post Get Pass checkout: quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: { passNo: getPass.passNo, itemId: line.itemId, qty: qtyReq },
        });
        const availableQty = stock ? Number(stock.qtyOnHand) - Number(stock.qtyBlocked || 0) : 0;
        if (!stock || availableQty < qtyReq) {
            throw err(
                `Insufficient stock for ${line.item?.name || 'item'}. Available: ${availableQty}. Send back to the creator to amend quantities — Security cannot fix stock here.`,
                422,
            );
        }

        let wac = Number(stock.wacUnitCost);
        let balanceAfter = Number(stock.qtyOnHand);

        if (isReversibleTransferType(getPass.transferType)) {
            const updatedRows = await tx.$queryRaw`
                UPDATE "stock_balances"
                SET "qtyBlocked" = "qtyBlocked" + ${qtyReq}
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "itemId" = ${line.itemId}::uuid
                  AND "locationId" = ${line.locationId}::uuid
                  AND "qtyOnHand" - "qtyBlocked" >= ${qtyReq}
                RETURNING "qtyOnHand", "qtyBlocked", "wacUnitCost"
            `;
            const updatedStock = updatedRows[0];
            if (!updatedStock) {
                throw err(
                    `Insufficient stock for ${line.item?.name || 'item'}. Available stock changed during checkout. Send back to the creator to amend quantities — Security cannot fix stock here.`,
                    422,
                );
            }
            balanceAfter = Number(updatedStock.qtyOnHand);
            wac = Number(updatedStock.wacUnitCost);
        } else {
            const updatedRows = await tx.$queryRaw`
                UPDATE "stock_balances"
                SET "qtyOnHand" = "qtyOnHand" - ${qtyReq}
                WHERE "tenantId" = ${tenantId}::uuid
                  AND "itemId" = ${line.itemId}::uuid
                  AND "locationId" = ${line.locationId}::uuid
                  AND "qtyOnHand" - "qtyBlocked" >= ${qtyReq}
                RETURNING "qtyOnHand", "wacUnitCost"
            `;
            const updatedStock = updatedRows[0];
            if (!updatedStock) {
                throw err(
                    `Insufficient stock for ${line.item?.name || 'item'}. Available stock changed during permanent checkout. Send back to the creator to amend quantities — Security cannot fix stock here.`,
                    422,
                );
            }
            balanceAfter = Number(updatedStock.qtyOnHand);
            wac = Number(updatedStock.wacUnitCost);
        }

        const movementType = getPass.transferType === 'PERMANENT' ? 'ISSUE' : 'GET_PASS_OUT';
        const custodyOnly = isReversibleTransferType(getPass.transferType);
        const qtyOnHandAfterCheckout = custodyOnly
            ? Number(stock.qtyOnHand)
            : balanceAfter;
        await createIdempotentGetPassLedgerEffect(
            tx,
            withLedgerPostingFields(
                {
                    tenantId,
                    itemId: line.itemId,
                    locationId: line.locationId,
                    movementType,
                    affectsValuation: !custodyOnly,
                    qtyIn: 0,
                    qtyOut: qtyReq,
                    unitCost: wac,
                    totalValue: qtyReq * wac,
                    balanceAfter: qtyOnHandAfterCheckout,
                    referenceType: 'GET_PASS',
                    referenceId: getPass.id,
                    referenceNo: getPass.passNo,
                    postingEffectKey: getPassPostingEffectKey({
                        tenantId,
                        getPassId: getPass.id,
                        getPassLineId: line.id,
                        effectType: 'CHECKOUT',
                    }),
                    createdBy: user.id,
                    notes: custodyOnly
                        ? `Get pass custody checkout ${getPass.passNo} (non-valuation)`
                        : `Get pass checkout ${getPass.passNo}`,
                },
                postingDate,
                timezone,
            ),
        );

        const linePayload = linesOut?.find((l) => l.lineId === line.id);
        const conditionOut = linePayload?.conditionOut || line.conditionOut;
        await tx.getPassLine.update({
            where: { id: line.id },
            data: { status: 'OUT', unitCost: wac, conditionOut },
        });
    }

    await tx.getPass.update({
        where: { id: getPass.id },
        data: { postingDate, assignedPostingPeriod, checkedOutAt: postedAt },
    });
    return { postedAt, postingDate, assignedPostingPeriod };
}

async function postPermanentDiscrepancyWriteOff(tx, {
    tenantId,
    itemId,
    locationId,
    discrepancyQty,
    sourceWac,
    getPassId,
    getPassLineId,
    passNo,
    userId,
    notes,
}) {
    if (discrepancyQty <= 0) return;
    assertPositiveUnitCostForInboundQty({
        unitCost: sourceWac,
        qty: discrepancyQty,
        message: 'Cannot post Get Pass discrepancy: checkout-fixed unit cost is missing or zero.',
        details: { passNo, itemId, locationId, discrepancyQty, checkoutFixedUnitCost: sourceWac },
    });
    await assertNoDuplicateGetPassLedgerEffect(tx, {
        tenantId,
        referenceType: 'GET_PASS',
        referenceId: getPassId,
        movementType: 'LOAN_WRITE_OFF',
        itemId,
        locationId,
    });
    const postedAt = new Date();
    const timezone = await getTenantTimezone(tenantId, tx);
    await validatePostingDate(tenantId, postedAt, tx, timezone);
    await createIdempotentGetPassLedgerEffect(
        tx,
        withLedgerPostingFields(
            {
                tenantId,
                itemId,
                locationId,
                movementType: 'LOAN_WRITE_OFF',
                qtyIn: 0,
                qtyOut: discrepancyQty,
                unitCost: sourceWac,
                totalValue: discrepancyQty * sourceWac,
                referenceType: 'GET_PASS',
                referenceId: getPassId,
                referenceNo: passNo,
                postingEffectKey: getPassPostingEffectKey({
                    tenantId,
                    getPassId,
                    getPassLineId,
                    effectType: 'DESTINATION_DISCREPANCY',
                }),
                notes: notes || 'Incoming discrepancy at destination receipt',
                createdBy: userId,
            },
            postedAt,
            timezone,
        ),
    );
}

async function postPermanentDestinationReceiveLine(tx, {
    tenantId,
    destinationItemId,
    locationId,
    receivedQty,
    sourceWac,
    getPassId,
    getPassLineId,
    passNo,
    userId,
}) {
    if (receivedQty <= 0) return;
    assertIntegerQuantity({
        qty: receivedQty,
        field: 'receivedQty',
        message:
            'Cannot post Get Pass destination receive: quantity must be a whole number (integer). Fractional quantities are not allowed.',
        details: { passNo, destinationItemId, receivedQty },
    });

    await assertNoDuplicateGetPassLedgerEffect(tx, {
        tenantId,
        referenceType: 'GET_PASS',
        referenceId: getPassId,
        movementType: 'RECEIVE',
        itemId: destinationItemId,
        locationId,
    });

    const postedAt = new Date();
    const timezone = await getTenantTimezone(tenantId, tx);
    await validatePostingDate(tenantId, postedAt, tx, timezone);

    assertPositiveUnitCostForInboundQty({
        unitCost: sourceWac,
        qty: receivedQty,
        message:
            'Cannot post Get Pass destination receive: source unit cost (WAC) is missing or zero. ' +
            'Correct the source item cost before receiving at the destination; a zero WAC must not overwrite destination cost.',
        details: {
            passNo,
            destinationItemId,
            locationId,
            receivedQty,
            sourceWac,
        },
    });

    const updatedRows = await tx.$queryRaw`
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
            ${destinationItemId}::uuid,
            ${locationId}::uuid,
            ${receivedQty},
            ${sourceWac},
            ${postedAt}
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
    const updatedStock = updatedRows[0];
    const newQty = Number(updatedStock.qtyOnHand);
    const newWac = Number(updatedStock.wacUnitCost);

    assertNoZeroWacWithQty({
        qtyOnHand: newQty,
        wacUnitCost: newWac,
        message:
            'Cannot post Get Pass destination receive: resulting stock would have quantity greater than zero with missing or zero WAC. ' +
            'Correct the source item cost first, then retry.',
        details: {
            passNo,
            destinationItemId,
            locationId,
            resultingQty: newQty,
            resultingWac: newWac,
        },
    });

    await createIdempotentGetPassLedgerEffect(
        tx,
        withLedgerPostingFields(
            {
                tenantId,
                itemId: destinationItemId,
                locationId,
                movementType: 'RECEIVE',
                qtyIn: receivedQty,
                qtyOut: 0,
                unitCost: sourceWac,
                totalValue: receivedQty * sourceWac,
                balanceAfter: newQty,
                referenceType: 'GET_PASS',
                referenceId: getPassId,
                referenceNo: passNo,
                postingEffectKey: getPassPostingEffectKey({
                    tenantId,
                    getPassId,
                    getPassLineId,
                    effectType: 'DESTINATION_RECEIVE',
                }),
                createdBy: userId,
            },
            postedAt,
            timezone,
        ),
    );

}

async function releaseBlockedOnReturn(tx, { stockKey, releaseQty, nonGoodQty }) {
    const key = stockKey?.tenantId_itemId_locationId;
    if (!key) {
        throw err('Stock balance not found for return release.', 400);
    }
    const qtyToRelease = Number(releaseQty || 0);
    const qtyToRemove = Number(nonGoodQty || 0);
    const updatedRows = await tx.$queryRaw`
        UPDATE "stock_balances"
        SET "qtyBlocked" = "qtyBlocked" - ${qtyToRelease},
            "qtyOnHand" = "qtyOnHand" - ${qtyToRemove}
        WHERE "tenantId" = ${key.tenantId}::uuid
          AND "itemId" = ${key.itemId}::uuid
          AND "locationId" = ${key.locationId}::uuid
          AND "qtyBlocked" >= ${qtyToRelease}
          AND "qtyOnHand" >= ${qtyToRemove}
          AND "qtyBlocked" - ${qtyToRelease} <= "qtyOnHand" - ${qtyToRemove}
        RETURNING "qtyOnHand", "qtyBlocked", "wacUnitCost"
    `;
    const updatedStock = updatedRows[0];
    if (!updatedStock) {
        const stock = await tx.stockBalance.findUnique({ where: stockKey });
        if (!stock) {
            throw err('Stock balance not found for return release.', 400);
        }
        throw err('Insufficient blocked quantity for get pass return.', 400);
    }
    return Number(updatedStock.wacUnitCost || 0);
}

async function postReturnGoodLedger(tx, {
    tenantId,
    itemId,
    locationId,
    goodQty,
    wac,
    referenceId,
    referenceNo,
    userId,
    notes,
    balanceAfter,
    affectsValuation = true,
    postingEffectKey = null,
}) {
    if (goodQty <= 0) return;
    await assertNoDuplicateGetPassLedgerEffect(tx, {
        tenantId,
        referenceType: 'GET_PASS_RETURN',
        referenceId,
        movementType: 'RETURN',
        itemId,
        locationId,
    });
    const postedAt = new Date();
    const timezone = await getTenantTimezone(tenantId, tx);
    await validatePostingDate(tenantId, postedAt, tx, timezone);
    let ledgerBalanceAfter = balanceAfter;
    if (ledgerBalanceAfter == null) {
        const stockKey = {
            tenantId_itemId_locationId: { tenantId, itemId, locationId },
        };
        const stock = await tx.stockBalance.findUnique({ where: stockKey });
        ledgerBalanceAfter = stock ? Number(stock.qtyOnHand) : goodQty;
    }
    return createIdempotentGetPassLedgerEffect(
        tx,
        withLedgerPostingFields(
            {
                tenantId,
                itemId,
                locationId,
                movementType: 'RETURN',
                affectsValuation,
                qtyIn: goodQty,
                qtyOut: 0,
                unitCost: wac,
                totalValue: goodQty * wac,
                balanceAfter: ledgerBalanceAfter,
                referenceType: 'GET_PASS_RETURN',
                referenceId,
                referenceNo,
                postingEffectKey,
                createdBy: userId,
                notes,
            },
            postedAt,
            timezone,
        ),
    );
}

async function postReturnGoodWithStockIncrease(tx, {
    tenantId,
    itemId,
    locationId,
    qtyGood,
    wac,
    referenceId,
    referenceNo,
    userId,
}) {
    if (qtyGood <= 0) return;
    assertIntegerQuantity({
        qty: qtyGood,
        field: 'qtyGood',
        message:
            'Cannot post Get Pass return: quantity must be a whole number (integer). Fractional quantities are not allowed.',
        details: { referenceNo, itemId, qtyGood },
    });

    // Atomic increment + weighted-average-cost recompute in a single SQL statement —
    // avoids the lost-update race of a JS read-modify-write under concurrent returns
    // of the same item+location (see applyAtomicWeightedReceipt for the guard details).
    const { qtyOnHand: newQty } = await applyAtomicWeightedReceipt(tx, {
        tenantId,
        itemId,
        locationId,
        qty: qtyGood,
        unitCost: wac,
        context: 'Get Pass return',
    });

    await postReturnGoodLedger(tx, {
        tenantId,
        itemId,
        locationId,
        goodQty: qtyGood,
        wac,
        referenceId,
        referenceNo,
        userId,
        notes: `Get pass return — good qty back to available (${qtyGood}).`,
        balanceAfter: newQty,
    });
}

module.exports = {
    REVERSIBLE_TYPES,
    isReversibleTransferType,
    isBlockingTransferType,
    createTrackingLedgerEntry,
    postGetPassCheckoutInTransaction,
    postPermanentDiscrepancyWriteOff,
    postPermanentDestinationReceiveLine,
    releaseBlockedOnReturn,
    postReturnGoodLedger,
    postReturnGoodWithStockIncrease,
    assertNoDuplicateGetPassCheckout,
    assertNoDuplicateGetPassLedgerEffect,
};
