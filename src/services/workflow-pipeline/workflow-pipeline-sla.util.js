'use strict';

const { SLA_RULES } = require('./workflow-pending.definitions');
const { toInclusiveUtcEndOfDay, toUtcStartOfDay } = require('../../utils/report-date-range.util');

const startOfToday = () => toUtcStartOfDay(new Date().toISOString().slice(0, 10));

const endOfToday = () => toInclusiveUtcEndOfDay(new Date().toISOString().slice(0, 10));

/**
 * @param {Date|string|null} date
 */
const hoursSince = (date) => {
    if (!date) return 0;
    const t = new Date(date).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.round((Date.now() - t) / 3600000));
};

/**
 * @param {object} opts
 * @param {number} opts.ageHours
 * @param {boolean} [opts.forceCritical]
 * @param {boolean} [opts.forceWarning]
 * @param {{ warningHours?: number, criticalHours?: number }} [opts.rule]
 */
const computeSla = ({ ageHours, forceCritical, forceWarning, rule }) => {
    if (forceCritical) {
        return { slaStatus: 'CRITICAL', overdue: true, escalationLevel: 2, priority: 'critical' };
    }
    if (forceWarning) {
        return { slaStatus: 'WARNING', overdue: false, escalationLevel: 1, priority: 'warning' };
    }
    const r = rule || SLA_RULES.DEFAULT;
    const warn = r.warningHours ?? 48;
    const crit = r.criticalHours ?? 96;
    if (ageHours >= crit) {
        return { slaStatus: 'CRITICAL', overdue: true, escalationLevel: 2, priority: 'critical' };
    }
    if (ageHours >= warn) {
        return { slaStatus: 'WARNING', overdue: false, escalationLevel: 1, priority: 'warning' };
    }
    return { slaStatus: 'OK', overdue: false, escalationLevel: 0, priority: 'info' };
};

const isExpectedReturnToday = (expectedReturnDate) => {
    if (!expectedReturnDate) return false;
    const d = new Date(expectedReturnDate);
    return d >= startOfToday() && d <= endOfToday();
};

const isOverdueReturn = (expectedReturnDate) => {
    if (!expectedReturnDate) return false;
    return new Date(expectedReturnDate) < new Date();
};

module.exports = {
    hoursSince,
    computeSla,
    isExpectedReturnToday,
    isOverdueReturn,
    startOfToday,
    endOfToday,
};
