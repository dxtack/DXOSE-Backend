'use strict';

const ADJUSTMENT_DIRECTION_INCREASE = 'INCREASE';
const ADJUSTMENT_DIRECTION_DECREASE = 'DECREASE';
const ADJUSTMENT_DIRECTIONS = Object.freeze(
    new Set([ADJUSTMENT_DIRECTION_INCREASE, ADJUSTMENT_DIRECTION_DECREASE]),
);

function adjustmentDirectionError(message, statusCode = 422, code = 'ADJUSTMENT_DIRECTION_INVALID') {
    return Object.assign(new Error(message), { statusCode, code });
}

/**
 * @param {unknown} direction
 * @returns {'INCREASE' | 'DECREASE'}
 */
function normalizeAdjustmentDirection(direction) {
    const normalized = String(direction ?? '').trim().toUpperCase();
    if (!ADJUSTMENT_DIRECTIONS.has(normalized)) {
        throw adjustmentDirectionError('Adjustment direction must be INCREASE or DECREASE.');
    }
    return normalized;
}

/**
 * @param {unknown} qty — user-entered positive quantity
 * @param {'INCREASE' | 'DECREASE'} direction
 */
function signedQtyForAdjustment(qty, direction) {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
        throw adjustmentDirectionError('Line quantity must be greater than zero.', 422, 'ADJUSTMENT_QTY_INVALID');
    }
    return direction === ADJUSTMENT_DIRECTION_DECREASE ? -n : n;
}

/**
 * @param {unknown} signedQty — stored qtyInBaseUnit
 * @returns {'INCREASE' | 'DECREASE'}
 */
function directionFromSignedQty(signedQty) {
    const n = Number(signedQty);
    if (!Number.isFinite(n) || n === 0) {
        return ADJUSTMENT_DIRECTION_INCREASE;
    }
    return n < 0 ? ADJUSTMENT_DIRECTION_DECREASE : ADJUSTMENT_DIRECTION_INCREASE;
}

/** Absolute quantity for display from signed stored qty. */
function displayQtyFromSigned(signedQty) {
    return Math.abs(Number(signedQty) || 0);
}

/**
 * Resolve document-level direction with optional per-line override.
 * @param {object} data — movement create/update payload
 * @param {object} line
 */
function resolveLineAdjustmentDirection(data, line) {
    if (line?.direction) {
        return normalizeAdjustmentDirection(line.direction);
    }
    if (data?.adjustmentDirection) {
        return normalizeAdjustmentDirection(data.adjustmentDirection);
    }
    throw adjustmentDirectionError('Adjustment direction is required (INCREASE or DECREASE).');
}

/**
 * Build audit-friendly line snapshot with direction.
 * @param {object} line — prisma line or payload line
 */
function adjustmentLineAuditSnapshot(line, directionOverride = null) {
    const signed = Number(line.qtyInBaseUnit ?? line.qtyRequested ?? 0);
    const direction = directionOverride || directionFromSignedQty(signed);
    return {
        itemId: line.itemId ?? line.item?.id ?? null,
        itemName: line.item?.name ?? null,
        locationId: line.locationId ?? line.location?.id ?? null,
        locationName: line.location?.name ?? null,
        direction,
        quantity: displayQtyFromSigned(signed),
        signedQty: signed,
        unitCost: Number(line.unitCost ?? 0),
        totalValue: Number(line.totalValue ?? 0),
        notes: line.notes ?? null,
    };
}

/**
 * @param {object} document
 */
function adjustmentDocumentAuditSnapshot(document) {
    const lines = (document.lines || []).map((line) => adjustmentLineAuditSnapshot(line));
    return {
        id: document.id,
        documentNo: document.documentNo,
        movementType: document.movementType,
        status: document.status,
        documentDate: document.documentDate,
        sourceLocationId: document.sourceLocationId ?? null,
        reason: document.reason ?? null,
        notes: document.notes ?? null,
        lines,
        adjustmentDirection: lines[0]?.direction ?? null,
    };
}

module.exports = {
    ADJUSTMENT_DIRECTION_INCREASE,
    ADJUSTMENT_DIRECTION_DECREASE,
    ADJUSTMENT_DIRECTIONS,
    normalizeAdjustmentDirection,
    signedQtyForAdjustment,
    directionFromSignedQty,
    displayQtyFromSigned,
    resolveLineAdjustmentDirection,
    adjustmentLineAuditSnapshot,
    adjustmentDocumentAuditSnapshot,
};
