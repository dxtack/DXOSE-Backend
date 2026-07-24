'use strict';

/**
 * Posting period resolution (Ch.6.5 / Ch.6.6).
 * Timestamps remain UTC instants; period identity follows the tenant calendar.
 */

const {
    DEFAULT_TENANT_TIMEZONE,
    tenantPeriodYearMonth,
    tenantMonthBounds,
} = require('../utils/tenant-calendar.util');

function pad2(n) {
    return String(n).padStart(2, '0');
}

function resolvePostingPeriod(postingDate, timezone = DEFAULT_TENANT_TIMEZONE) {
    const pd = postingDate instanceof Date ? postingDate : new Date(postingDate);
    if (Number.isNaN(pd.getTime())) {
        throw Object.assign(new Error('Invalid posting date.'), { status: 422, code: 'INVALID_POSTING_DATE' });
    }
    const { year, month } = tenantPeriodYearMonth(pd, timezone);
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

/** UTC instant at the inclusive end of a tenant-local calendar month. */
function periodEndInstant(year, month, timezone = DEFAULT_TENANT_TIMEZONE) {
    return tenantMonthBounds(year, month, timezone).end;
}

/** Inclusive UTC instants for a tenant-local calendar month. */
function monthBounds(year, month, timezone = DEFAULT_TENANT_TIMEZONE) {
    return tenantMonthBounds(year, month, timezone);
}

/** Compatibility helper for callers that explicitly need a UTC calendar month. */
function utcMonthBounds(year, month) {
    return tenantMonthBounds(year, month, 'UTC');
}

/**
 * Posting instant for Close Resolution Workspace posts (Ch.6.9).
 * Uses period end, clamped to now so FUTURE_POSTING_DATE cannot fire for the current month.
 */
function resolutionPostingDate(year, month, timezone = DEFAULT_TENANT_TIMEZONE) {
    const end = periodEndInstant(year, month, timezone);
    const now = new Date();
    return end.getTime() > now.getTime() ? now : end;
}

function assignedPeriodKey(year, month) {
    return `${year}-${pad2(month)}`;
}

/**
 * Ch.6 — postingDate / assignedPostingPeriod are immutable once set.
 * @param {object} existing — persisted document row
 * @param {object} patch — incoming update fields (may include postingDate / assignedPostingPeriod)
 */
function assertPostingPeriodFieldsImmutable(existing, patch = {}) {
    if (!existing || !patch || typeof patch !== 'object') return;

    if (Object.prototype.hasOwnProperty.call(patch, 'postingDate') && patch.postingDate !== undefined) {
        const next = patch.postingDate == null ? null : new Date(patch.postingDate).getTime();
        const prev = existing.postingDate == null ? null : new Date(existing.postingDate).getTime();
        if (prev != null && next !== prev) {
            throw Object.assign(
                new Error('postingDate cannot be changed after it is assigned (Ch.6).'),
                { status: 422, statusCode: 422, code: 'POSTING_PERIOD_IMMUTABLE' },
            );
        }
    }

    if (
        Object.prototype.hasOwnProperty.call(patch, 'assignedPostingPeriod') &&
        patch.assignedPostingPeriod !== undefined
    ) {
        const next = patch.assignedPostingPeriod == null ? null : String(patch.assignedPostingPeriod);
        const prev =
            existing.assignedPostingPeriod == null ? null : String(existing.assignedPostingPeriod);
        if (prev != null && next !== prev) {
            throw Object.assign(
                new Error('assignedPostingPeriod cannot be changed after it is assigned (Ch.6).'),
                { status: 422, statusCode: 422, code: 'POSTING_PERIOD_IMMUTABLE' },
            );
        }
    }
}

module.exports = {
    resolvePostingPeriod,
    parseAssignedPeriod,
    periodEndInstant,
    monthBounds,
    utcMonthBounds,
    resolutionPostingDate,
    assignedPeriodKey,
    assertPostingPeriodFieldsImmutable,
};
