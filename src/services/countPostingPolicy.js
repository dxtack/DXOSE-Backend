/**
 * Inventory count posting policy (Wave 1 — Policy B).
 *
 * Operational / audit variance on session cells remains:
 *   snapshotVarianceQty = countedQty - bookQty (frozen at snapshot)
 *
 * Ledger and stock balance adjustments at post time use:
 *   postingAdjustmentQty = countedQty - currentLiveQtyAtPostingTime
 *
 * Goal: final qtyOnHand === countedQty after post (when countedQty is set).
 */

/**
 * @param {number|string} countedQty
 * @param {number|string} currentLiveQty
 * @returns {{
 *   adjustmentQty: number,
 *   skip: boolean,
 *   targetQty: number,
 *   isPositive: boolean,
 *   absAdjustment: number,
 * }}
 */
function computePolicyBPostingAdjustment(countedQty, currentLiveQty) {
    const counted = Number(countedQty);
    const current = Number(currentLiveQty);

    if (!Number.isFinite(counted)) {
        const err = new Error('countedQty must be a finite number for count posting');
        err.statusCode = 400;
        err.code = 'COUNT_POSTING_INVALID_COUNTED_QTY';
        throw err;
    }
    if (!Number.isFinite(current)) {
        const err = new Error('currentLiveQty must be a finite number for count posting');
        err.statusCode = 400;
        err.code = 'COUNT_POSTING_INVALID_CURRENT_QTY';
        throw err;
    }

    const adjustmentQty = counted - current;

    if (adjustmentQty === 0) {
        return {
            adjustmentQty: 0,
            skip: true,
            targetQty: counted,
            isPositive: false,
            absAdjustment: 0,
        };
    }

    return {
        adjustmentQty,
        skip: false,
        targetQty: counted,
        isPositive: adjustmentQty > 0,
        absAdjustment: Math.abs(adjustmentQty),
    };
}

/**
 * Audit note fragment: snapshot variance vs posting adjustment.
 * @param {number} bookQty
 * @param {number} countedQty
 * @param {number} currentLiveQty
 */
function formatPolicyBAuditNote(bookQty, countedQty, currentLiveQty) {
    const snapshotVariance = Number(countedQty) - Number(bookQty);
    const postingAdjustment = Number(countedQty) - Number(currentLiveQty);
    return `postingPolicy=POLICY_B;snapshotVariance=${snapshotVariance};postingAdjustment=${postingAdjustment}`;
}

module.exports = {
    computePolicyBPostingAdjustment,
    formatPolicyBAuditNote,
};
