'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    assertIanaTimezone,
    tenantDateParts,
    tenantPeriodYearMonth,
    tenantDayBounds,
    tenantMonthBounds,
    localDateTimeToUtc,
} = require('./tenant-calendar.util');

test('Riyadh month boundary assigns 21:00Z to the new hotel month', () => {
    const instant = new Date('2026-07-31T21:00:00.000Z');
    assert.deepEqual(tenantPeriodYearMonth(instant, 'Asia/Riyadh'), { year: 2026, month: 8 });
    assert.deepEqual(
        tenantDateParts(instant, 'Asia/Riyadh'),
        { year: 2026, month: 8, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
    );
});

test('Riyadh year boundary uses the hotel-local year', () => {
    assert.deepEqual(
        tenantPeriodYearMonth(new Date('2026-12-31T21:00:00.000Z'), 'Asia/Riyadh'),
        { year: 2027, month: 1 },
    );
});

test('Riyadh month and day bounds are converted to UTC instants', () => {
    const july = tenantMonthBounds(2026, 7, 'Asia/Riyadh');
    assert.equal(july.start.toISOString(), '2026-06-30T21:00:00.000Z');
    assert.equal(july.end.toISOString(), '2026-07-31T20:59:59.999Z');

    const day = tenantDayBounds('2026-07-31', 'Asia/Riyadh');
    assert.equal(day.start.toISOString(), '2026-07-30T21:00:00.000Z');
    assert.equal(day.end.toISOString(), '2026-07-31T20:59:59.999Z');
});

test('IANA conversion handles DST offsets and rejects nonexistent local times', () => {
    assert.equal(
        localDateTimeToUtc({ year: 2026, month: 7, day: 1 }, 'Europe/London').toISOString(),
        '2026-06-30T23:00:00.000Z',
    );
    assert.throws(
        () => localDateTimeToUtc({ year: 2026, month: 3, day: 29, hour: 1, minute: 30 }, 'Europe/London'),
        (error) => error.code === 'INVALID_TENANT_LOCAL_TIME',
    );
});

test('invalid IANA timezone is rejected', () => {
    assert.throws(() => assertIanaTimezone('Mars/Olympus'), (error) => error.code === 'INVALID_TENANT_TIMEZONE');
});
