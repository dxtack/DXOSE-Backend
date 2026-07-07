'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getPassIsBlockerForPeriod } = require('../services/periodCloseGovernance.service');
const { resolvePostingPeriod, periodEndInstant, assignedPeriodKey } = require('./postingPeriod.util');

describe('postingPeriod.util', () => {
    it('resolvePostingPeriod returns YYYY-MM', () => {
        const r = resolvePostingPeriod(new Date('2026-03-15T12:00:00Z'));
        assert.match(r.assignedPostingPeriod, /^2026-/);
    });

    it('periodEndInstant is last day of month', () => {
        const end = periodEndInstant(2026, 3);
        assert.equal(end.getMonth(), 2);
        assert.equal(end.getDate(), 31);
    });

    it('assignedPeriodKey pads month', () => {
        assert.equal(assignedPeriodKey(2026, 3), '2026-03');
    });
});

describe('Get Pass D8 rules', () => {
    it('cross-month expected return is not a blocker for checkout month', () => {
        const gp = {
            status: 'OUT',
            checkedOutAt: new Date('2026-06-28'),
            expectedReturnDate: new Date('2026-07-05'),
        };
        assert.equal(getPassIsBlockerForPeriod(gp, 2026, 6), false);
    });

    it('overdue return in closing month is a blocker', () => {
        const gp = {
            status: 'OUT',
            checkedOutAt: new Date('2026-06-10'),
            expectedReturnDate: new Date('2026-06-20'),
        };
        assert.equal(getPassIsBlockerForPeriod(gp, 2026, 6), true);
    });
});
