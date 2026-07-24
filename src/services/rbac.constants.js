'use strict';

const { normalizeRole } = require('./rbac.service');

/** Roles that must not be assigned via hotel user UI or tenant user APIs (DB row retained). */
const DEPRECATED_ASSIGNABLE_ROLES = new Set(['ADMIN']);

/** Tenant operational super-user + org (not used for step bypass without matching permission). */
const WORKFLOW_ELEVATED_ROLES = new Set([
    'FINANCE_MANAGER',
    'ORG_MANAGER',
    'GENERAL_MANAGER',
    'COST_CONTROL',
    'SUPER_ADMIN',
]);

const isDeprecatedAssignableRole = (role) =>
    DEPRECATED_ASSIGNABLE_ROLES.has(normalizeRole(role));

const isWorkflowElevatedRole = (role) =>
    WORKFLOW_ELEVATED_ROLES.has(normalizeRole(role));

/** Org-level bypass for approval steps (not Finance / Dept functional roles). */
const WORKFLOW_ORG_BYPASS_ROLES = new Set(['ORG_MANAGER', 'SUPER_ADMIN']);

const canBypassWorkflowStep = (role) =>
    WORKFLOW_ORG_BYPASS_ROLES.has(normalizeRole(role));

const assertAssignableRole = (role) => {
    if (isDeprecatedAssignableRole(role)) {
        const err = new Error('ADMIN role is deprecated and cannot be assigned.');
        err.statusCode = 403;
        err.code = 'ROLE_DEPRECATED';
        throw err;
    }
};

module.exports = {
    DEPRECATED_ASSIGNABLE_ROLES,
    WORKFLOW_ELEVATED_ROLES,
    WORKFLOW_ORG_BYPASS_ROLES,
    isDeprecatedAssignableRole,
    isWorkflowElevatedRole,
    canBypassWorkflowStep,
    assertAssignableRole,
};
