/**
 * Central valuation resolution for inventory variances and governed posting.
 * Prevents silent zero-value variances without an explicit valuationBasis.
 */

const VALUATION_BASIS = Object.freeze({
    WAC: 'WAC',
    FALLBACK_LAST_GRN: 'FALLBACK_LAST_GRN',
    FALLBACK_ITEM_PRICE: 'FALLBACK_ITEM_PRICE',
    MISSING_WAC: 'MISSING_WAC',
});

const EPS = 1e-9;

/**
 * @param {import('@prisma/client').Prisma.TransactionClient | import('@prisma/client').PrismaClient} db
 */
async function resolveUnitCost(db, { tenantId, itemId, locationId }) {
    const stock = await db.stockBalance.findUnique({
        where: {
            tenantId_itemId_locationId: { tenantId, itemId, locationId },
        },
        select: { wacUnitCost: true, qtyOnHand: true },
    });
    const wac = stock ? Number(stock.wacUnitCost || 0) : 0;
    if (wac > EPS) {
        return {
            unitCost: wac,
            valuationBasis: VALUATION_BASIS.WAC,
            incompleteValuation: false,
            wacAtLocation: wac,
        };
    }

    const grnLine = await db.grnLine.findFirst({
        where: {
            internalItemId: itemId,
            grnImport: { tenantId, status: 'POSTED' },
        },
        orderBy: { grnImport: { postedAt: 'desc' } },
        select: { unitPrice: true },
    });
    const grnUnit = grnLine ? Number(grnLine.unitPrice || 0) : 0;
    if (grnUnit > EPS) {
        return {
            unitCost: grnUnit,
            valuationBasis: VALUATION_BASIS.FALLBACK_LAST_GRN,
            incompleteValuation: false,
            wacAtLocation: wac,
        };
    }

    const item = await db.item.findFirst({
        where: { id: itemId, tenantId },
        select: { unitPrice: true },
    });
    const itemPrice = item ? Number(item.unitPrice || 0) : 0;
    if (itemPrice > EPS) {
        return {
            unitCost: itemPrice,
            valuationBasis: VALUATION_BASIS.FALLBACK_ITEM_PRICE,
            incompleteValuation: false,
            wacAtLocation: wac,
        };
    }

    return {
        unitCost: 0,
        valuationBasis: VALUATION_BASIS.MISSING_WAC,
        incompleteValuation: true,
        wacAtLocation: wac,
    };
}

function estimateVarianceValue(varianceQty, unitCost, valuationBasis) {
    const qty = Number(varianceQty || 0);
    const cost = Number(unitCost || 0);
    const value = qty * cost;
    return {
        varianceValueEstimate: value,
        valuationBasis,
        incompleteValuation:
            valuationBasis === VALUATION_BASIS.MISSING_WAC && Math.abs(qty) > EPS,
    };
}

module.exports = {
    VALUATION_BASIS,
    EPS,
    resolveUnitCost,
    estimateVarianceValue,
};
