/**
 * Governed Get Pass inventory/accounting posts (Phase G1).
 * All stock + official ledger mutations for checkout/return/destination flows.
 */
const { validatePostingDate } = require('./periodGuard.service');
const { resolvePostingPeriod } = require('../platform/postingPeriod.util');
const { withLedgerPostingFields } = require('../platform/inventoryLedger.util');

const REVERSIBLE_TYPES = ['TEMPORARY', 'CATERING', 'OUTSIDE_CATERING'];

const err = (message, statusCode = 400) => {
    const e = new Error(message);
    e.statusCode = statusCode;
    return e;
};

const isReversibleTransferType = (transferType) => REVERSIBLE_TYPES.includes(transferType);
const isBlockingTransferType = (transferType) => REVERSIBLE_TYPES.includes(transferType);

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

/** Non-valuation custody tracking at destination. */
async function createTrackingLedgerEntry(
    tx,
    { tenantId, itemId, locationId, movementType, qtyIn = 0, qtyOut = 0, referenceId, referenceNo, createdBy, notes },
    postingDate,
) {
    await tx.inventoryLedger.create({
        data: withLedgerPostingFields(
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
                createdBy,
                notes,
            },
            postingDate,
        ),
    });
}

/**
 * Security checkout — block or issue stock + valuation ledger OUT.
 */
async function postGetPassCheckoutInTransaction(tx, { getPass, tenantId, user, linesOut = [] }) {
    await assertNoDuplicateGetPassCheckout(tx, tenantId, getPass.id);
    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);
    const { postingDate, assignedPostingPeriod } = resolvePostingPeriod(postedAt);

    for (const line of getPass.lines) {
        const stockKey = {
            tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: line.locationId },
        };
        const stock = await tx.stockBalance.findUnique({ where: stockKey });

        const qtyReq = Number(line.qty);
        const availableQty = stock ? Number(stock.qtyOnHand) - Number(stock.qtyBlocked || 0) : 0;
        if (!stock || availableQty < qtyReq) {
            throw err(
                `Insufficient stock for ${line.item?.name || 'item'}. Available: ${availableQty}`,
                422,
            );
        }

        const wac = Number(stock.wacUnitCost);
        let balanceAfter = Number(stock.qtyOnHand);

        if (isReversibleTransferType(getPass.transferType)) {
            await tx.stockBalance.update({
                where: stockKey,
                data: { qtyBlocked: { increment: qtyReq } },
            });
        } else {
            balanceAfter = balanceAfter - qtyReq;
            await tx.stockBalance.update({
                where: stockKey,
                data: { qtyOnHand: { decrement: qtyReq } },
            });
        }

        const movementType = getPass.transferType === 'PERMANENT' ? 'ISSUE' : 'GET_PASS_OUT';
        const custodyOnly = isReversibleTransferType(getPass.transferType);
        const qtyOnHandAfterCheckout = custodyOnly
            ? Number(stock.qtyOnHand)
            : balanceAfter;
        await tx.inventoryLedger.create({
            data: withLedgerPostingFields(
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
                    createdBy: user.id,
                    notes: custodyOnly
                        ? `Get pass custody checkout ${getPass.passNo} (non-valuation)`
                        : `Get pass checkout ${getPass.passNo}`,
                },
                postingDate,
            ),
        });

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
}

async function postPermanentDiscrepancyWriteOff(tx, {
    tenantId,
    itemId,
    locationId,
    discrepancyQty,
    sourceWac,
    getPassId,
    passNo,
    userId,
    notes,
}) {
    if (discrepancyQty <= 0) return;
    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);
    await tx.inventoryLedger.create({
        data: withLedgerPostingFields(
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
                notes: notes || 'Incoming discrepancy at destination receipt',
                createdBy: userId,
            },
            postedAt,
        ),
    });
}

async function postPermanentDestinationReceiveLine(tx, {
    tenantId,
    destinationItemId,
    locationId,
    receivedQty,
    sourceWac,
    getPassId,
    passNo,
    userId,
}) {
    if (receivedQty <= 0) return;

    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);

    const stockKey = {
        tenantId_itemId_locationId: { tenantId, itemId: destinationItemId, locationId },
    };
    const balance = await tx.stockBalance.findUnique({ where: stockKey });
    const prevQty = balance ? Number(balance.qtyOnHand) : 0;
    const newQty = prevQty + receivedQty;

    await tx.inventoryLedger.create({
        data: withLedgerPostingFields(
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
                createdBy: userId,
            },
            postedAt,
        ),
    });

    await tx.stockBalance.upsert({
        where: stockKey,
        update: { qtyOnHand: newQty, wacUnitCost: sourceWac, lastUpdated: new Date() },
        create: {
            tenantId,
            itemId: destinationItemId,
            locationId,
            qtyOnHand: receivedQty,
            qtyBlocked: 0,
            wacUnitCost: sourceWac,
        },
    });
}

async function releaseBlockedOnReturn(tx, { stockKey, releaseQty, nonGoodQty }) {
    const stock = await tx.stockBalance.findUnique({ where: stockKey });
    if (!stock) {
        throw err('Stock balance not found for return release.', 400);
    }
    const blocked = Number(stock.qtyBlocked || 0);
    if (blocked + 1e-9 < releaseQty) {
        throw err('Insufficient blocked quantity for get pass return.', 400);
    }
    await tx.stockBalance.update({
        where: stockKey,
        data: {
            qtyBlocked: { decrement: releaseQty },
            ...(nonGoodQty > 0 ? { qtyOnHand: { decrement: nonGoodQty } } : {}),
        },
    });
    return Number(stock.wacUnitCost || 0);
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
}) {
    if (goodQty <= 0) return;
    const postedAt = new Date();
    await validatePostingDate(tenantId, postedAt);
    let ledgerBalanceAfter = balanceAfter;
    if (ledgerBalanceAfter == null) {
        const stockKey = {
            tenantId_itemId_locationId: { tenantId, itemId, locationId },
        };
        const stock = await tx.stockBalance.findUnique({ where: stockKey });
        ledgerBalanceAfter = stock ? Number(stock.qtyOnHand) : goodQty;
    }
    await tx.inventoryLedger.create({
        data: withLedgerPostingFields(
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
                createdBy: userId,
                notes,
            },
            postedAt,
        ),
    });
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

    const stockKey = {
        tenantId_itemId_locationId: { tenantId, itemId, locationId },
    };

    const currentStock = await tx.stockBalance.findUnique({ where: stockKey });
    const curQty = currentStock ? Number(currentStock.qtyOnHand) : 0;
    const newQty = curQty + qtyGood;

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
    const curWac = currentStock ? Number(currentStock.wacUnitCost) : 0;
    const totalValBefore = curQty * curWac;
    const newVal = totalValBefore + qtyGood * wac;
    const newWac = newQty > 0 ? newVal / newQty : 0;

    await tx.stockBalance.upsert({
        where: stockKey,
        update: { qtyOnHand: newQty, wacUnitCost: newWac, lastUpdated: new Date() },
        create: { tenantId, itemId, locationId, qtyOnHand: qtyGood, wacUnitCost: wac },
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
};
