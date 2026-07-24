'use strict';

/**
 * P2 #31 — Resolve display qty + unit → qtyInBaseUnit using approved ItemUnit rates.
 * Never assume 1:1 when a non-base unitId is supplied.
 */

function badRequest(message, code = 'UNIT_CONVERSION_REQUIRED', details = {}) {
    return Object.assign(new Error(message), { statusCode: 422, code, details });
}

/**
 * @param {object} args
 * @param {string} args.tenantId
 * @param {string} args.itemId
 * @param {number|string} args.qty — quantity in the selected unit
 * @param {string|null|undefined} args.unitId — optional; omit/null = treat as BASE
 * @param {import('@prisma/client').PrismaClient|object} args.db
 * @returns {Promise<{ qtyInBaseUnit: number, qtyDisplay: number, unitId: string|null, conversionRate: number, unitType: string }>}
 */
async function resolveQtyInBaseUnit({ tenantId, itemId, qty, unitId = null, db }) {
    const qtyDisplay = Number(qty);
    if (!Number.isFinite(qtyDisplay)) {
        throw badRequest('Quantity must be a finite number.', 'INVALID_QUANTITY', { qty });
    }

    if (!unitId) {
        return {
            qtyInBaseUnit: qtyDisplay,
            qtyDisplay,
            unitId: null,
            conversionRate: 1,
            unitType: 'BASE',
        };
    }

    const link = await db.itemUnit.findFirst({
        where: { tenantId, itemId, unitId },
        select: { unitType: true, conversionRate: true, unitId: true },
    });
    if (!link) {
        throw badRequest(
            'Selected unit is not an approved unit for this item.',
            'ITEM_UNIT_NOT_APPROVED',
            { itemId, unitId },
        );
    }

    const rate = Number(link.conversionRate);
    if (!(rate > 0) || !Number.isInteger(rate)) {
        throw badRequest(
            'Approved unit conversion rate must be a positive whole number.',
            'INVALID_CONVERSION_RATE',
            { itemId, unitId, conversionRate: link.conversionRate },
        );
    }

    if (link.unitType === 'BASE') {
        if (rate !== 1) {
            throw badRequest(
                'BASE unit conversion rate must be 1.',
                'INVALID_BASE_CONVERSION_RATE',
                { itemId, unitId, conversionRate: rate },
            );
        }
        return {
            qtyInBaseUnit: qtyDisplay,
            qtyDisplay,
            unitId,
            conversionRate: 1,
            unitType: 'BASE',
        };
    }

    return {
        qtyInBaseUnit: qtyDisplay * rate,
        qtyDisplay,
        unitId,
        conversionRate: rate,
        unitType: link.unitType,
    };
}

/**
 * Reject client-supplied qtyInBaseUnit when it disagrees with the resolved value.
 */
function assertClientBaseQtyMatches(resolvedBase, clientBaseQty, details = {}) {
    if (clientBaseQty === undefined || clientBaseQty === null || clientBaseQty === '') return;
    const client = Number(clientBaseQty);
    if (!Number.isFinite(client)) {
        throw badRequest('qtyInBaseUnit must be numeric when provided.', 'INVALID_QTY_IN_BASE', details);
    }
    if (Math.abs(client - resolvedBase) > 1e-9) {
        throw badRequest(
            'qtyInBaseUnit does not match the approved unit conversion.',
            'QTY_IN_BASE_MISMATCH',
            { ...details, clientBaseQty: client, resolvedBase },
        );
    }
}

module.exports = {
    resolveQtyInBaseUnit,
    assertClientBaseQtyMatches,
};
