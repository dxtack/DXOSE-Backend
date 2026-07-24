'use strict';

const DEFAULT_TENANT_TIMEZONE = 'Asia/Riyadh';

function assertIanaTimezone(timezone) {
    const value = String(timezone || '').trim();
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    } catch (_err) {
        throw Object.assign(new Error(`Invalid IANA timezone: ${value || '(empty)'}`), {
            status: 422,
            statusCode: 422,
            code: 'INVALID_TENANT_TIMEZONE',
        });
    }
    return value;
}

function tenantDateParts(dateInput, timezone = DEFAULT_TENANT_TIMEZONE) {
    const date = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
        throw Object.assign(new Error('Invalid date.'), { status: 400, code: 'INVALID_DATE' });
    }
    const zone = assertIanaTimezone(timezone);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const out = {};
    for (const part of parts) {
        if (part.type !== 'literal') out[part.type] = Number(part.value);
    }
    return {
        year: out.year,
        month: out.month,
        day: out.day,
        hour: out.hour,
        minute: out.minute,
        second: out.second,
        millisecond: date.getUTCMilliseconds(),
    };
}

function tenantPeriodYearMonth(dateInput = new Date(), timezone = DEFAULT_TENANT_TIMEZONE) {
    const { year, month } = tenantDateParts(dateInput, timezone);
    return { year, month };
}

function localDateTimeToUtc(parts, timezone = DEFAULT_TENANT_TIMEZONE) {
    const zone = assertIanaTimezone(timezone);
    const target = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour || 0),
        Number(parts.minute || 0),
        Number(parts.second || 0),
        Number(parts.millisecond || 0),
    );
    let candidate = target;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const actual = tenantDateParts(new Date(candidate), zone);
        const represented = Date.UTC(
            actual.year,
            actual.month - 1,
            actual.day,
            actual.hour,
            actual.minute,
            actual.second,
            actual.millisecond,
        );
        const delta = target - represented;
        candidate += delta;
        if (delta === 0) break;
    }
    const verified = tenantDateParts(new Date(candidate), zone);
    const requested = {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour || 0),
        minute: Number(parts.minute || 0),
        second: Number(parts.second || 0),
    };
    if (
        verified.year !== requested.year ||
        verified.month !== requested.month ||
        verified.day !== requested.day ||
        verified.hour !== requested.hour ||
        verified.minute !== requested.minute ||
        verified.second !== requested.second
    ) {
        throw Object.assign(new Error('The requested local time does not exist in the tenant timezone.'), {
            status: 422,
            code: 'INVALID_TENANT_LOCAL_TIME',
        });
    }
    return new Date(candidate);
}

function parseDateOnly(dateOnly) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly || '').trim());
    if (!match) {
        throw Object.assign(new Error('Expected a date in YYYY-MM-DD format.'), {
            status: 400,
            code: 'INVALID_DATE_ONLY',
        });
    }
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function nextCalendarDate({ year, month, day }) {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function tenantDateOnlyToUtc(dateOnly, timezone = DEFAULT_TENANT_TIMEZONE) {
    return localDateTimeToUtc(parseDateOnly(dateOnly), timezone);
}

function tenantDateInputToUtc(value, timezone = DEFAULT_TENANT_TIMEZONE) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return tenantDateOnlyToUtc(value.trim(), timezone);
    }
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw Object.assign(new Error('Invalid date.'), { status: 400, code: 'INVALID_DATE' });
    }
    return date;
}

function tenantDayBounds(dateOnly, timezone = DEFAULT_TENANT_TIMEZONE) {
    const local = parseDateOnly(dateOnly);
    const start = localDateTimeToUtc(local, timezone);
    const nextStart = localDateTimeToUtc(nextCalendarDate(local), timezone);
    return { start, end: new Date(nextStart.getTime() - 1) };
}

function tenantMonthBounds(year, month, timezone = DEFAULT_TENANT_TIMEZONE) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
        throw Object.assign(new Error('Invalid tenant month.'), { status: 400, code: 'INVALID_PERIOD' });
    }
    const start = localDateTimeToUtc({ year: y, month: m, day: 1 }, timezone);
    const nextYear = m === 12 ? y + 1 : y;
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextStart = localDateTimeToUtc({ year: nextYear, month: nextMonth, day: 1 }, timezone);
    return { start, end: new Date(nextStart.getTime() - 1) };
}

function tenantDateKey(dateInput, timezone = DEFAULT_TENANT_TIMEZONE) {
    const { year, month, day } = tenantDateParts(dateInput, timezone);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatInTenantTimezone(dateInput, timezone = DEFAULT_TENANT_TIMEZONE, options = {}) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const { locale = 'en-GB', ...formatOptions } = options;
    return new Intl.DateTimeFormat(locale, {
        timeZone: assertIanaTimezone(timezone),
        ...formatOptions,
    }).format(date);
}

module.exports = {
    DEFAULT_TENANT_TIMEZONE,
    assertIanaTimezone,
    tenantDateParts,
    tenantPeriodYearMonth,
    localDateTimeToUtc,
    tenantDateOnlyToUtc,
    tenantDateInputToUtc,
    tenantDayBounds,
    tenantMonthBounds,
    tenantDateKey,
    formatInTenantTimezone,
};
