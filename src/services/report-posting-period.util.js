'use strict';

const pad2 = (value) => String(value).padStart(2, '0');

function isWholeUtcMonth(start, end, endExclusive = false) {
    const from = new Date(start);
    const to = new Date(end);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
    if (
        from.getUTCDate() !== 1 ||
        from.getUTCHours() !== 0 ||
        from.getUTCMinutes() !== 0 ||
        from.getUTCSeconds() !== 0 ||
        from.getUTCMilliseconds() !== 0
    ) {
        return false;
    }

    const nextMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    return endExclusive
        ? to.getTime() === nextMonth.getTime()
        : to.getTime() === nextMonth.getTime() - 1;
}

function postingDateCondition(start, end, endExclusive) {
    return endExclusive ? { gte: start, lt: end } : { gte: start, lte: end };
}

function legacyFallbackBranches(condition, legacyDateFields) {
    const branches = [];
    const precedingNulls = {
        assignedPostingPeriod: null,
        postingDate: null,
    };

    for (const field of legacyDateFields) {
        branches.push({ ...precedingNulls, [field]: condition });
        precedingNulls[field] = null;
    }
    return branches;
}

/**
 * Canonical report period membership for posting-governed records.
 * Full UTC months use the immutable assigned period. Other ranges use postingDate.
 * Older rows fall back only when all higher-authority posting fields are absent.
 */
function reportPostingPeriodWhere(
    start,
    end,
    { endExclusive = false, legacyDateFields = ['createdAt'] } = {},
) {
    const condition = postingDateCondition(start, end, endExclusive);
    const fallback = legacyFallbackBranches(condition, legacyDateFields);

    if (isWholeUtcMonth(start, end, endExclusive)) {
        const from = new Date(start);
        const periodKey = `${from.getUTCFullYear()}-${pad2(from.getUTCMonth() + 1)}`;
        return {
            OR: [
                { assignedPostingPeriod: periodKey },
                { assignedPostingPeriod: null, postingDate: condition },
                ...fallback,
            ],
        };
    }

    return {
        OR: [
            { postingDate: condition },
            ...fallback,
        ],
    };
}

function reportPostingBeforeWhere(boundary, { inclusive = false } = {}) {
    const condition = inclusive ? { lte: boundary } : { lt: boundary };
    return {
        OR: [
            { postingDate: condition },
            {
                assignedPostingPeriod: null,
                postingDate: null,
                createdAt: condition,
            },
        ],
    };
}

module.exports = {
    isWholeUtcMonth,
    reportPostingPeriodWhere,
    reportPostingBeforeWhere,
};
