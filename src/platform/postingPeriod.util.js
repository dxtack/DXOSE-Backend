'use strict';

/**
 * Posting period resolution (Ch.6.5 / Ch.6.6).
 */

function pad2(n) {
    return String(n).padStart(2, '0');
}

function resolvePostingPeriod(postingDate) {
    const pd = postingDate instanceof Date ? postingDate : new Date(postingDate);
    if (Number.isNaN(pd.getTime())) {
        throw Object.assign(new Error('Invalid posting date.'), { status: 422, code: 'INVALID_POSTING_DATE' });
    }
    const year = pd.getFullYear();
    const month = pd.getMonth() + 1;
    return {
        postingDate: pd,
        assignedPostingPeriod: `${year}-${pad2(month)}`,
    };
}

function parseAssignedPeriod(assignedPostingPeriod) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(assignedPostingPeriod || ''));
    if (!m) return null;
    return { year: Number(m[1]), month: Number(m[2]) };
}

function periodEndInstant(year, month) {
    return new Date(year, month, 0, 23, 59, 59, 999);
}

function assignedPeriodKey(year, month) {
    return `${year}-${pad2(month)}`;
}

module.exports = {
    resolvePostingPeriod,
    parseAssignedPeriod,
    periodEndInstant,
    assignedPeriodKey,
};
