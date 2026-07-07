'use strict';

const { PrismaClient } = require('@prisma/client');
const { periodEndInstant, assignedPeriodKey } = require('./postingPeriod.util');

const prisma = new PrismaClient();

/**
 * Build closing balances from inventory ledger through period end (Ch.6.12 / D4).
 * @param {string} tenantId
 * @param {number} year
 * @param {number} month 1–12
 */
async function buildClosingSnapshotLines(tenantId, year, month) {
    const periodKey = assignedPeriodKey(year, month);
    const end = periodEndInstant(year, month);

    const entries = await prisma.inventoryLedger.findMany({
        where: {
            tenantId,
            OR: [
                { assignedPostingPeriod: { lte: periodKey } },
                {
                    assignedPostingPeriod: null,
                    postingDate: { lte: end },
                },
                {
                    assignedPostingPeriod: null,
                    postingDate: null,
                    createdAt: { lte: end },
                },
            ],
        },
        orderBy: [{ postingDate: 'asc' }, { createdAt: 'asc' }],
        select: {
            itemId: true,
            locationId: true,
            qtyIn: true,
            qtyOut: true,
            unitCost: true,
            affectsValuation: true,
            assignedPostingPeriod: true,
            postingDate: true,
        },
    });

    /** @type {Map<string, { itemId: string, locationId: string, qty: number, wac: number }>} */
    const map = new Map();

    for (const e of entries) {
        if (e.assignedPostingPeriod && e.assignedPostingPeriod > periodKey) continue;
        const pd = e.postingDate || null;
        if (!e.assignedPostingPeriod && pd && pd > end) continue;

        const key = `${e.itemId}:${e.locationId}`;
        const row = map.get(key) || {
            itemId: e.itemId,
            locationId: e.locationId,
            qty: 0,
            wac: 0,
        };
        row.qty += Number(e.qtyIn) - Number(e.qtyOut);
        if (e.affectsValuation && Number(e.unitCost) > 0) {
            row.wac = Number(e.unitCost);
        }
        map.set(key, row);
    }

    return [...map.values()]
        .filter((r) => Math.abs(r.qty) > 0.0001)
        .map((r) => ({
            itemId: r.itemId,
            locationId: r.locationId,
            closingQty: r.qty,
            wacUnitCost: r.wac,
            closingValue: r.qty * r.wac,
        }));
}

module.exports = {
    buildClosingSnapshotLines,
};
