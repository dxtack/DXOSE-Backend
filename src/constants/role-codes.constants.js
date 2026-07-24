'use strict';

/**
 * Canonical role codes as strings — source of truth for Role.code (String since S4B).
 * Single source of truth for validators, rbac, ACC workflow step references, and seed data.
 */

const SYSTEM_ROLE_DEFINITIONS = Object.freeze([
    { code: 'SUPER_ADMIN', name: 'Super Administrator' },
    { code: 'ORG_MANAGER', name: 'Organization Manager' },
    { code: 'ADMIN', name: 'Administrator' },
    { code: 'STOREKEEPER', name: 'Storekeeper' },
    { code: 'DEPT_MANAGER', name: 'Department Manager' },
    { code: 'COST_CONTROL', name: 'Cost Control' },
    { code: 'FINANCE_MANAGER', name: 'Finance Manager' },
    { code: 'AUDITOR', name: 'Auditor' },
    { code: 'SECURITY', name: 'Security' },
    { code: 'GENERAL_MANAGER', name: 'General Manager' },
]);

const SYSTEM_ROLE_CODES = Object.freeze(SYSTEM_ROLE_DEFINITIONS.map((r) => r.code));

const SYSTEM_ROLE_CODE_SET = new Set(SYSTEM_ROLE_CODES);

/** Hotel user create/update APIs — excludes SUPER_ADMIN and deprecated ADMIN. */
const ASSIGNABLE_ROLE_CODES = Object.freeze(
    SYSTEM_ROLE_CODES.filter((code) => code !== 'SUPER_ADMIN' && code !== 'ADMIN'),
);

const ASSIGNABLE_ROLE_CODE_SET = new Set(ASSIGNABLE_ROLE_CODES);

/** ACC system-protected roles (permissions immutable via UI). */
const PROTECTED_ROLE_CODES = Object.freeze(['SUPER_ADMIN', 'ORG_MANAGER']);

const PROTECTED_ROLE_CODE_SET = new Set(PROTECTED_ROLE_CODES);

/**
 * Roles hidden from hotel operational ACC (Roles/Users/Assignments pickers).
 * DB rows and runtime permissions unchanged — platform-only visibility for SUPER_ADMIN.
 */
const ACC_OPERATIONAL_EXCLUDED_ROLE_CODES = Object.freeze(['ADMIN', 'SUPER_ADMIN']);

const ACC_OPERATIONAL_EXCLUDED_ROLE_CODE_SET = new Set(ACC_OPERATIONAL_EXCLUDED_ROLE_CODES);

/** Legacy alias → canonical code (matches rbac.service normalizeRole). */
const ROLE_CODE_ALIASES = Object.freeze({
    SECURITY_MANAGER: 'SECURITY',
});

/**
 * Normalize any role input to an uppercase canonical code string.
 * @param {unknown} value
 * @returns {string}
 */
const toRoleCodeString = (value = '') => {
    const normalized = String(value).toUpperCase();
    return ROLE_CODE_ALIASES[normalized] || normalized;
};

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isKnownRoleCode = (value) => SYSTEM_ROLE_CODE_SET.has(toRoleCodeString(value));

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isAssignableRoleCode = (value) => ASSIGNABLE_ROLE_CODE_SET.has(toRoleCodeString(value));

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isAccOperationalExcludedRoleCode = (value) =>
    ACC_OPERATIONAL_EXCLUDED_ROLE_CODE_SET.has(toRoleCodeString(value));

module.exports = {
    SYSTEM_ROLE_DEFINITIONS,
    SYSTEM_ROLE_CODES,
    SYSTEM_ROLE_CODE_SET,
    ASSIGNABLE_ROLE_CODES,
    ASSIGNABLE_ROLE_CODE_SET,
    PROTECTED_ROLE_CODES,
    PROTECTED_ROLE_CODE_SET,
    ACC_OPERATIONAL_EXCLUDED_ROLE_CODES,
    ACC_OPERATIONAL_EXCLUDED_ROLE_CODE_SET,
    ROLE_CODE_ALIASES,
    toRoleCodeString,
    isKnownRoleCode,
    isAssignableRoleCode,
    isAccOperationalExcludedRoleCode,
};
