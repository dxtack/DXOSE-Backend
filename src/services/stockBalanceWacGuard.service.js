'use strict';

/**
 * Hard guard: qtyOnHand > 0 requires wacUnitCost > 0.
 * qty = 0 with WAC = 0 is always allowed.
 */

const EPS = 1e-9;

const DEFAULT_MESSAGE =
    'Cannot post: stock quantity would be greater than zero while unit cost (WAC) is missing or zero. ' +
    'Correct the item cost first (via a GRN with a valid unit price, or Item Master / opening cost), then retry.';

/**
 * @param {object} opts
 * @param {number|string} opts.qtyOnHand — resulting on-hand after the write
 * @param {number|string} opts.wacUnitCost — resulting WAC after the write
 * @param {string} [opts.message] — user-facing override
 * @param {object} [opts.details] — optional structured context for clients
 */
function assertNoZeroWacWithQty({ qtyOnHand, wacUnitCost, message, details } = {}) {
    const qty = Number(qtyOnHand);
    const wac = Number(wacUnitCost);
    if (!Number.isFinite(qty) || !(qty > EPS)) {
        return;
    }
    if (Number.isFinite(wac) && wac > EPS) {
        return;
    }
    const err = new Error(message || DEFAULT_MESSAGE);
    err.statusCode = 422;
    err.code = 'ZERO_WAC_WITH_QTY';
    if (details && typeof details === 'object') {
        err.details = details;
    }
    throw err;
}

/**
 * Guard inbound unit price / cost before it enters WAC math.
 * @param {object} opts
 * @param {number|string} opts.unitCost
 * @param {number|string} [opts.qty] — when qty > 0, unitCost must be > 0
 * @param {string} [opts.message]
 * @param {object} [opts.details]
 */
function assertPositiveUnitCostForInboundQty({ unitCost, qty = 1, message, details } = {}) {
    const q = Number(qty);
    if (!Number.isFinite(q) || !(q > EPS)) {
        return;
    }
    const cost = Number(unitCost);
    if (Number.isFinite(cost) && cost > EPS) {
        return;
    }
    const err = new Error(
        message ||
            'Cannot post: quantity is greater than zero but unit cost / price is missing or zero. ' +
                'Enter a valid unit cost before posting.',
    );
    err.statusCode = 422;
    err.code = 'ZERO_WAC_WITH_QTY';
    if (details && typeof details === 'object') {
        err.details = details;
    }
    throw err;
}

module.exports = {
    EPS,
    DEFAULT_MESSAGE,
    assertNoZeroWacWithQty,
    assertPositiveUnitCostForInboundQty,
};
