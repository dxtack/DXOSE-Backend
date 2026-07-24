'use strict';

const {
    DEFAULT_TENANT_TIMEZONE,
    tenantDayBounds,
    tenantDateKey,
    tenantPeriodYearMonth,
} = require('./tenant-calendar.util');

/**
 * Inclusive UTC end-of-day for report date filters.
 * Date-only values (`YYYY-MM-DD` or ISO midnight) → `…T23:59:59.999Z`
 * so UTC+ evening ledger posts on that calendar day are not cut off by
 * local `setHours(23,59,59,999)`.
 * Full timestamps are used as-is.
 */
function toInclusiveUtcEndOfDay(dateInput, timezone = DEFAULT_TENANT_TIMEZONE) {
    if (dateInput == null || dateInput === '') {
        return new Date();
    }
    if (typeof dateInput === 'string') {
        const trimmed = dateInput.trim();
        const dayOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dayOnly) {
            return tenantDayBounds(`${dayOnly[1]}-${dayOnly[2]}-${dayOnly[3]}`, timezone).end;
        }
        const dayPrefix = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dayPrefix && /T00:00:00(\.0+)?Z?$/i.test(trimmed)) {
            return tenantDayBounds(`${dayPrefix[1]}-${dayPrefix[2]}-${dayPrefix[3]}`, timezone).end;
        }
    }
    const dt = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput);
    if (Number.isNaN(dt.getTime())) {
        throw Object.assign(new Error('Invalid end date. Please provide a valid date.'), { status: 400 });
    }
    if (
        dt.getUTCHours() === 0 &&
        dt.getUTCMinutes() === 0 &&
        dt.getUTCSeconds() === 0 &&
        dt.getUTCMilliseconds() === 0
    ) {
        return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 23, 59, 59, 999));
    }
    return dt;
}

/**
 * UTC start-of-day for date-only inputs (pair of toInclusiveUtcEndOfDay).
 */
function toUtcStartOfDay(dateInput, timezone = DEFAULT_TENANT_TIMEZONE) {
    if (dateInput == null || dateInput === '') {
        const now = new Date();
        const local = tenantDateKey(now, timezone);
        return tenantDayBounds(local, timezone).start;
    }
    if (typeof dateInput === 'string') {
        const trimmed = dateInput.trim();
        const dayOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dayOnly) {
            return tenantDayBounds(`${dayOnly[1]}-${dayOnly[2]}-${dayOnly[3]}`, timezone).start;
        }
        const dayPrefix = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dayPrefix && /T00:00:00(\.0+)?Z?$/i.test(trimmed)) {
            return tenantDayBounds(`${dayPrefix[1]}-${dayPrefix[2]}-${dayPrefix[3]}`, timezone).start;
        }
    }
    const dt = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput);
    if (Number.isNaN(dt.getTime())) {
        throw Object.assign(new Error('Invalid start date. Please provide a valid date.'), { status: 400 });
    }
    const day = tenantDateKey(dt, timezone);
    return tenantDayBounds(day, timezone).start;
}

/**
 * Calendar year + month (1–12) in UTC for PeriodClose / posting-period keys.
 * Never use local getFullYear()/getMonth() for fiscal period identity.
 */
function toUtcPeriodYearMonth(dateInput = new Date(), timezone = DEFAULT_TENANT_TIMEZONE) {
    const dt = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput);
    if (Number.isNaN(dt.getTime())) {
        throw Object.assign(new Error('Invalid date for period year/month.'), { status: 400 });
    }
    return tenantPeriodYearMonth(dt, timezone);
}

module.exports = { toInclusiveUtcEndOfDay, toUtcStartOfDay, toUtcPeriodYearMonth };
