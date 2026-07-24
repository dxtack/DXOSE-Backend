'use strict';

const prisma = require('../config/database');

/**
 * Attach display-ready unitCost/totalValue on movement lines using WAC when not set.
 */
async function enrichMovementLinesFinancials(tenantId, lines = []) {
    if (!lines.length) return lines;

    const keys = lines.map((l) => ({
        itemId: l.itemId,
        locationId: l.locationId,
    }));
    const itemIds = [...new Set(keys.map((k) => k.itemId))];
    const locationIds = [...new Set(keys.map((k) => k.locationId))];

    const balances = await prisma.stockBalance.findMany({
        where: {
            tenantId,
            itemId: { in: itemIds },
            locationId: { in: locationIds },
        },
        select: { itemId: true, locationId: true, wacUnitCost: true },
    });
    const wacMap = new Map(
        balances.map((b) => [`${b.itemId}:${b.locationId}`, Number(b.wacUnitCost) || 0]),
    );

    return lines.map((line) => {
        let unitCost = Number(line.unitCost) || 0;
        let totalValue = Number(line.totalValue) || 0;
        const qty = Number(line.qtyInBaseUnit) || 0;

        if (unitCost <= 0) {
            const wac = wacMap.get(`${line.itemId}:${line.locationId}`) || 0;
            if (wac > 0) unitCost = wac;
        }
        if (totalValue <= 0 && unitCost > 0 && qty > 0) {
            totalValue = unitCost * qty;
        }

        return {
            ...line,
            unitCost,
            totalValue,
        };
    });
}

module.exports = { enrichMovementLinesFinancials };
