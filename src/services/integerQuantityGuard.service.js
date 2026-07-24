'use strict';

/**
 * Hard guard: operational inventory quantities must be whole numbers.
 * DX OS&E counts equipment/supplies — fractional stock units are out of scope.
 */

const EPS = 1e-9;

const DEFAULT_MESSAGE =
    'Quantity must be a whole number (integer). Fractional quantities are not allowed.';

/**
 * @param {unknown} qty
 * @returns {boolean}
 */
function isIntegerQuantity(qty) {
    const n = Number(qty);
    if (!Number.isFinite(n)) return false;
    return Math.abs(n - Math.round(n)) < EPS;
}

/**
 * @param {object} opts
 * @param {number|string|null|undefined} opts.qty
 * @param {boolean} [opts.allowNull=false] — when true, null/undefined skips (e.g. uncounted IC cell)
 * @param {string} [opts.message]
 * @param {object} [opts.details]
 * @param {string} [opts.field]
 */
function assertIntegerQuantity({ qty, allowNull = false, message, details, field } = {}) {
    if (allowNull && (qty === null || qty === undefined || qty === '')) {
        return;
    }
    if (!isIntegerQuantity(qty)) {
        const err = new Error(message || DEFAULT_MESSAGE);
        err.statusCode = 422;
        err.code = 'NON_INTEGER_QUANTITY';
        if (field) err.field = field;
        if (details && typeof details === 'object') {
            err.details = details;
        }
        throw err;
    }
}

/**
 * Assert every value in a list is an integer quantity.
 * @param {Array<{ qty: unknown, field?: string, details?: object }>} items
 * @param {string} [message]
 */
function assertIntegerQuantities(items, message) {
    for (const item of items || []) {
        assertIntegerQuantity({
            qty: item.qty,
            allowNull: !!item.allowNull,
            message: item.message || message,
            details: item.details,
            field: item.field,
        });
    }
}

module.exports = {
    EPS,
    DEFAULT_MESSAGE,
    isIntegerQuantity,
    assertIntegerQuantity,
    assertIntegerQuantities,
};
