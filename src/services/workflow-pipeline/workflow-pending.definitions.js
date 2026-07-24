'use strict';

/**
 * Single source of truth for "open workflow" predicates (dashboard, pipeline, notifications).
 */

const PIPELINE_MODULES = Object.freeze([
    'TRANSFER',
    'GRN',
    'INVENTORY_COUNT',
    'BREAKAGE',
    'LOST',
    'GET_PASS',
]);

/** Store transfers awaiting approval (finance-controlled posting workflow). */
const TRANSFER_OPEN_STATUSES = Object.freeze(['PENDING_DEPT', 'PENDING_FINANCE']);

/** Legacy logistics statuses — surfaced for pipeline cleanup until migrated. */
const TRANSFER_LEGACY_OPEN_STATUSES = Object.freeze([
    'SUBMITTED',
    'PENDING_FINAL',
    'APPROVED',
    'IN_TRANSIT',
]);

const TRANSFER_PIPELINE_STATUSES = Object.freeze([
    ...TRANSFER_OPEN_STATUSES,
    ...TRANSFER_LEGACY_OPEN_STATUSES,
]);

const TRANSFER_APPROVAL_STATUSES = Object.freeze(['PENDING_DEPT', 'PENDING_FINANCE']);

/** Open GRN workflow items only — drafts stay on GRN list until submitted. */
const GRN_OPEN_STATUSES = Object.freeze([
    'VALIDATED',
    'PENDING_APPROVAL',
    'PENDING_FINANCE',
]);

const INVENTORY_COUNT_ACTIVE_STATUSES = Object.freeze([
    'DRAFT',
    'COUNTING',
    'REVEAL_REVIEW',
    'RECOUNTING',
    'PENDING_COST_CONTROL',
    'PENDING_DEPT',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_APPROVAL',
    'DEPT_APPROVED',
    'COST_CONTROL_APPROVED',
    'FINANCE_APPROVED',
]);

const BREAKAGE_PENDING_DOC_STATUSES = Object.freeze([
    'DRAFT',
    'PENDING_DEPT',
    'PENDING_APPROVAL',
    'DEPT_APPROVED',
    'COST_CONTROL_APPROVED',
    'FINANCE_APPROVED',
]);

const GET_PASS_APPROVAL_STATUSES = Object.freeze([
    'PENDING_DEPT',
    'PENDING_COST_CONTROL',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_SECURITY',
]);

const GET_PASS_OUT_STATUSES = Object.freeze(['OUT', 'PARTIALLY_RETURNED']);

const GET_PASS_DISPATCH_STATUSES = Object.freeze(['APPROVED']);

const ROLE_DISPLAY = Object.freeze({
    STOREKEEPER: 'Storekeeper',
    DEPT_MANAGER: 'Department Manager',
    COST_CONTROL: 'Cost Control',
    FINANCE_MANAGER: 'Finance',
    GENERAL_MANAGER: 'General Manager',
    SECURITY: 'Security',
    ADMIN: 'Administrator',
    ORG_MANAGER: 'Organization Manager',
    // Historical waitingForRole values only — RECEIVER role is retired (P1 #22).
    RECEIVER: 'Storekeeper',
});

/** SLA thresholds in hours (warning / critical). */
const SLA_RULES = Object.freeze({
    TRANSFER_LEGACY: { warningHours: 24, criticalHours: 48 },
    GET_PASS_OVERDUE: { criticalHours: 0 },
    GET_PASS_DUE_TODAY: { warningHours: 0 },
    GRN_PENDING: { warningHours: 48, criticalHours: 120 },
    COUNT_PENDING_APPROVAL: { warningHours: 48, criticalHours: 120 },
    BREAKAGE_PENDING: { warningHours: 72, criticalHours: 168 },
    DEFAULT: { warningHours: 48, criticalHours: 96 },
});

module.exports = {
    PIPELINE_MODULES,
    TRANSFER_OPEN_STATUSES,
    TRANSFER_LEGACY_OPEN_STATUSES,
    TRANSFER_PIPELINE_STATUSES,
    TRANSFER_APPROVAL_STATUSES,
    GRN_OPEN_STATUSES,
    INVENTORY_COUNT_ACTIVE_STATUSES,
    BREAKAGE_PENDING_DOC_STATUSES,
    GET_PASS_APPROVAL_STATUSES,
    GET_PASS_OUT_STATUSES,
    GET_PASS_DISPATCH_STATUSES,
    ROLE_DISPLAY,
    SLA_RULES,
};
