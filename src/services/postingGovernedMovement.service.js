/**
 * Governed movement posting for Breakage and Lost (Phase G1).
 * Single implementation path — domain services must delegate here via postingEngine.
 */
const { incrementTotalQtyDamage, incrementTotalQtyLost } = require('./stockCumulative.service');
const { validatePostingDate, checkFuturePostingDate } = require('./periodGuard.service');
const { resolvePostingPeriod } = require('../platform/postingPeriod.util');
const { assertPostingLineQuantities } = require('./postingQuantityGuard.service');
const { getTenantTimezone } = require('./tenantTimezone.service');

function resolvePostedAt(opts = {}) {
    return opts.postingDate != null ? new Date(opts.postingDate) : new Date();
}

async function guardPostedAt(tx, tenantId, postedAt, timezone, opts = {}) {
    if (opts.fromResolutionWorkspace) {
        checkFuturePostingDate(postedAt, timezone);
    } else {
        await validatePostingDate(tenantId, postedAt, tx, timezone);
    }
}
const { assertIntegerQuantity } = require('./integerQuantityGuard.service');

const err = (message, statusCode = 400) => {
    const e = new Error(message);
    e.statusCode = statusCode;
    return e;
};

const movementPostingEffectKey = ({ tenantId, documentId, movementLineId, effectType }) => {
    return `v1|MOVEMENT|${tenantId}|${documentId}|${movementLineId}|${effectType}`;
};

async function createIdempotentLedgerEffect(tx, data) {
    try {
        return await tx.inventoryLedger.create({ data });
    } catch (error) {
        const target = Array.isArray(error?.meta?.target)
            ? error.meta.target.join(',')
            : String(error?.meta?.target || '');
        if (error?.code === 'P2002' && target.includes('postingEffectKey')) {
            throw Object.assign(
                new Error('This movement line has already been posted to the ledger. Duplicate effect prevented.'),
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
 * GET_PASS_RETURN qty stays in qtyBlocked until this GM post — clear block + on-hand together.
 * @param {{ postingDate?: Date|string, fromResolutionWorkspace?: boolean }} [opts]
 */
async function postBreakageMovementInTransaction(tx, doc, tenantId, userId, opts = {}) {
    await assertNoDuplicateLedgerPost(tx, tenantId, doc.id);
    assertPostingLineQuantities({
        documentType: 'BREAKAGE',
        lines: doc.lines,
        quantityField: 'qtyInBaseUnit',
    });
    const postedAt = resolvePostedAt(opts);
    const timezone = await getTenantTimezone(tenantId, tx);
    await guardPostedAt(tx, tenantId, postedAt, timezone, opts);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt, timezone);
    const isGetPassReturn = doc.sourceType === 'GET_PASS_RETURN';

    for (const line of doc.lines) {
        const itemId = line.itemId;
        const locationId = line.locationId;
        const qty = parseFloat(line.qtyInBaseUnit);
        assertIntegerQuantity({
            qty,
            field: 'qtyInBaseUnit',
            message:
                'Cannot post breakage: quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: { documentNo: doc.documentNo, itemId, qty },
        });
        const updatedRows = await tx.$queryRaw`
            UPDATE "stock_balances"
            SET "qtyOnHand" = "qtyOnHand" - ${qty},
                "totalQtyDamage" = "totalQtyDamage" + ${qty},
                "qtyBlocked" = "qtyBlocked" - ${isGetPassReturn ? qty : 0}
            WHERE "tenantId" = ${tenantId}::uuid
              AND "itemId" = ${itemId}::uuid
              AND "locationId" = ${locationId}::uuid
              AND "qtyOnHand" >= ${qty}
              AND (
                    (${isGetPassReturn}::boolean AND "qtyBlocked" >= ${qty})
                 OR (NOT ${isGetPassReturn}::boolean AND "qtyOnHand" - "qtyBlocked" >= ${qty})
              )
            RETURNING "qtyOnHand", "wacUnitCost"
        `;
        const updatedStock = updatedRows[0];
        if (!updatedStock) {
            throw err(
                isGetPassReturn
                    ? `Insufficient stock or blocked custody for get-pass breakage ${line.item?.name || itemId}.`
                    : `Insufficient available stock for ${line.item?.name || itemId} at location.`,
            );
        }

        const balanceAfter = Number(updatedStock.qtyOnHand);
        const wacBefore = Number(updatedStock.wacUnitCost);
        const lossValue = qty * wacBefore;

        await createIdempotentLedgerEffect(tx, {
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
            postingEffectKey: movementPostingEffectKey({
                tenantId,
                documentId: doc.id,
                movementLineId: line.id,
                effectType: 'BREAKAGE',
            }),
            notes: doc.reason,
            createdBy: userId,
            postingDate,
            assignedPostingPeriod,
        });

    }
    return { postedAt, postingDate, assignedPostingPeriod };
}

/**
 * Post approved LOST movement (internal or GET_PASS_RETURN).
 * GET_PASS_RETURN clears qtyBlocked + qtyOnHand together at GM (custody held until then).
 * @param {{ postingDate?: Date|string, fromResolutionWorkspace?: boolean }} [opts]
 */
async function postLostMovementInTransaction(tx, doc, userId, opts = {}) {
    await assertNoDuplicateLedgerPost(tx, doc.tenantId, doc.id);
    assertPostingLineQuantities({
        documentType: 'LOST',
        lines: doc.lines,
        quantityField: 'qtyInBaseUnit',
    });
    const postedAt = resolvePostedAt(opts);
    const timezone = await getTenantTimezone(doc.tenantId, tx);
    await guardPostedAt(tx, doc.tenantId, postedAt, timezone, opts);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt, timezone);
    const isGetPassReturn = doc.sourceType === 'GET_PASS_RETURN';
    const tenantId = doc.tenantId;

    for (const line of doc.lines) {
        const qty = Number(line.qtyInBaseUnit || 0);
        assertIntegerQuantity({
            qty,
            field: 'qtyInBaseUnit',
            message:
                'Cannot post lost: quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: { documentNo: doc.documentNo, itemId: line.itemId, qty },
        });

        const updatedRows = await tx.$queryRaw`
            UPDATE "stock_balances"
            SET "qtyOnHand" = "qtyOnHand" - ${qty},
                "totalQtyLost" = "totalQtyLost" + ${qty},
                "qtyBlocked" = "qtyBlocked" - ${isGetPassReturn ? qty : 0}
            WHERE "tenantId" = ${tenantId}::uuid
              AND "itemId" = ${line.itemId}::uuid
              AND "locationId" = ${line.locationId}::uuid
              AND "qtyOnHand" >= ${qty}
              AND (
                    (${isGetPassReturn}::boolean AND "qtyBlocked" >= ${qty})
                 OR (NOT ${isGetPassReturn}::boolean AND "qtyOnHand" - "qtyBlocked" >= ${qty})
              )
            RETURNING "qtyOnHand", "wacUnitCost"
        `;
        const updatedStock = updatedRows[0];
        if (!updatedStock) {
            throw err(
                isGetPassReturn
                    ? `Insufficient stock or blocked custody for get-pass lost ${line.item?.name || line.itemId}.`
                    : `Insufficient available stock for ${line.item?.name || line.itemId}.`,
                400,
            );
        }
        const wac = Number(updatedStock.wacUnitCost);
        const balanceAfter = Number(updatedStock.qtyOnHand);

        await createIdempotentLedgerEffect(tx, {
            tenantId,
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
            postingEffectKey: movementPostingEffectKey({
                tenantId,
                documentId: doc.id,
                movementLineId: line.id,
                effectType: 'LOST',
            }),
            notes: doc.reason || null,
            createdBy: userId,
            postingDate,
            assignedPostingPeriod,
        });

    }
    return { postedAt, postingDate, assignedPostingPeriod };
}

module.exports = {
    postBreakageMovementInTransaction,
    postLostMovementInTransaction,
    assertNoDuplicateLedgerPost,
};
