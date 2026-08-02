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
 * True when the document's required-by deadline has passed (calendar instant).
 * @param {Date|string|null|undefined} requiredBy
 */
const isPastRequiredBy = (requiredBy) => {
    if (!requiredBy) return false;
    const t = new Date(requiredBy).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() > t;
};

/**
 * SLA waiting clock — never use document `updatedAt` (edits must not reset AGE).
 * Prefer current-step entry (previous step `actedAt`), else approval request start, else `createdAt`.
 *
 * @param {{ createdAt?: Date|string|null, approvalRequest?: { createdAt?: Date|string|null, currentStep?: number, steps?: Array<{ stepNumber?: number, actedAt?: Date|string|null }> } | null }} opts
 */
const resolveWorkflowPendingSince = ({ createdAt, approvalRequest } = {}) => {
    if (approvalRequest) {
        const currentStep = Number(approvalRequest.currentStep) || 0;
        const steps = Array.isArray(approvalRequest.steps) ? approvalRequest.steps : [];
        if (currentStep > 1) {
            const prev = steps.find((s) => Number(s.stepNumber) === currentStep - 1 && s.actedAt);
            if (prev?.actedAt) return prev.actedAt;
        }
        if (approvalRequest.createdAt) return approvalRequest.createdAt;
    }
    return createdAt || null;
};

/**
 * @param {object} opts
 * @param {number} opts.ageHours
 * @param {boolean} [opts.forceCritical]
 * @param {boolean} [opts.forceWarning]
 * @param {{ warningHours?: number, criticalHours?: number }} [opts.rule]
 * @param {Date|string|null} [opts.requiredBy]
 */
const computeSla = ({ ageHours, forceCritical, forceWarning, rule, requiredBy }) => {
    if (forceCritical || isPastRequiredBy(requiredBy)) {
        return { slaStatus: 'CRITICAL', overdue: true, escalationLevel: 2, priority: 'critical' };
    }
    if (forceWarning) {
        return { slaStatus: 'WARNING', overdue: false, escalationLevel: 1, priority: 'warning' };
    }
    const r = rule || SLA_RULES.DEFAULT;
    const warn = r.warningHours ?? 48;
    const crit = r.criticalHours ?? 72;
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
    isPastRequiredBy,
    resolveWorkflowPendingSince,
    isExpectedReturnToday,
    isOverdueReturn,
    startOfToday,
    endOfToday,
};
