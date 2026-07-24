'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    reportPostingPeriodWhere,
} = require('./report-posting-period.util');

function matchesCondition(value, condition) {
    if (condition === null) return value == null;
    if (condition instanceof Date) return new Date(value).getTime() === condition.getTime();
    if (typeof condition !== 'object') return value === condition;
    const time = new Date(value).getTime();
    if (condition.gte && time < condition.gte.getTime()) return false;
    if (condition.gt && time <= condition.gt.getTime()) return false;
    if (condition.lte && time > condition.lte.getTime()) return false;
    if (condition.lt && time >= condition.lt.getTime()) return false;
    return true;
}

function matchesWhere(record, where) {
    if (where.OR) return where.OR.some((branch) => matchesWhere(record, branch));
    return Object.entries(where).every(([field, condition]) =>
        matchesCondition(record[field], condition),
    );
}

test('whole-month report classifies by assignedPostingPeriod, not createdAt', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-31T23:59:59.999Z');
    const where = reportPostingPeriodWhere(start, end);

    assert.equal(
        matchesWhere(
            {
                assignedPostingPeriod: '2026-01',
                postingDate: new Date('2026-01-31T10:00:00.000Z'),
                createdAt: new Date('2026-02-01T10:00:00.000Z'),
            },
            where,
        ),
        true,
    );
    assert.equal(
        matchesWhere(
            {
                assignedPostingPeriod: '2026-02',
                postingDate: new Date('2026-02-01T10:00:00.000Z'),
                createdAt: new Date('2026-01-31T10:00:00.000Z'),
            },
            where,
        ),
        false,
    );
});

test('custom report range classifies by postingDate, not createdAt', () => {
    const start = new Date('2026-01-10T00:00:00.000Z');
    const end = new Date('2026-01-20T23:59:59.999Z');
    const where = reportPostingPeriodWhere(start, end);

    assert.equal(
        matchesWhere(
            {
                assignedPostingPeriod: '2026-01',
                postingDate: new Date('2026-01-15T09:00:00.000Z'),
                createdAt: new Date('2026-02-15T09:00:00.000Z'),
            },
            where,
        ),
        true,
    );
    assert.equal(
        matchesWhere(
            {
                assignedPostingPeriod: '2026-02',
                postingDate: new Date('2026-02-15T09:00:00.000Z'),
                createdAt: new Date('2026-01-15T09:00:00.000Z'),
            },
            where,
        ),
        false,
    );
});

test('createdAt remains an explicit fallback only for unclassified legacy rows', () => {
    const start = new Date('2026-01-10T00:00:00.000Z');
    const end = new Date('2026-01-20T23:59:59.999Z');
    const where = reportPostingPeriodWhere(start, end);

    assert.equal(
        matchesWhere(
            {
                assignedPostingPeriod: null,
                postingDate: null,
                createdAt: new Date('2026-01-15T09:00:00.000Z'),
            },
            where,
        ),
        true,
    );
});

test('breakage-style legacy fields never gate on documentDate: null (required column)', () => {
    const start = new Date('2026-07-01T00:00:00.000Z');
    const end = new Date('2026-07-24T20:59:59.999Z');
    const where = reportPostingPeriodWhere(start, end, {
        legacyDateFields: ['postedAt', 'documentDate'],
    });

    assert.ok(Array.isArray(where.OR));
    for (const branch of where.OR) {
        assert.notEqual(
            branch.documentDate,
            null,
            'documentDate is required on MovementDocument; null gates break Prisma',
        );
    }

    assert.equal(
        matchesWhere(
            {
                assignedPostingPeriod: null,
                postingDate: null,
                postedAt: null,
                documentDate: new Date('2026-07-10T12:00:00.000Z'),
            },
            where,
        ),
        true,
    );
});
