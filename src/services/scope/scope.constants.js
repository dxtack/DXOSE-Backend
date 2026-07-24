'use strict';

/** Governance: docs/governance/rbac-target-matrix/11_MODULE_SCOPE_BASIS.csv */
const SCOPE_MODULE = Object.freeze({
    BREAKAGE: 'breakage',
    LOST: 'lost',
    TRANSFER: 'transfer',
    GET_PASS: 'get_pass',
    LEDGER: 'ledger',
    STOCK: 'stock',
    REPORTS: 'reports',
    INVENTORY_COUNT: 'inventory_count',
    GRN: 'grn',
    MOVEMENT: 'movement',
    ISSUE: 'issue',
    DASHBOARD: 'dashboard',
});

const SCOPE_PROFILE = Object.freeze({
    TENANT_WIDE: 'TENANT_WIDE',
    DEPARTMENT: 'DEPARTMENT',
    LOCATIONS: 'LOCATIONS',
    GET_PASS_GATE: 'GET_PASS_GATE',
});

const SCOPE_SOURCE = Object.freeze({
    ORG_BYPASS: 'ORG_BYPASS',
    GOVERNANCE_BYPASS: 'GOVERNANCE_BYPASS',
    CUSTOM_OVERRIDE: 'CUSTOM_OVERRIDE',
    LOCATION_ASSIGNMENT: 'LOCATION_ASSIGNMENT',
    DEPARTMENT: 'DEPARTMENT',
    UR_ASSIGNMENT: 'UR_ASSIGNMENT',
    /** FY P0-A — property-wide data for oversight roles within active hotel tenantId. */
    ROLE_DEFAULT: 'ROLE_DEFAULT',
});

const REASON = Object.freeze({
    SCOPE_NO_VISIBLE_RECORDS: 'SCOPE_NO_VISIBLE_RECORDS',
});

module.exports = {
    SCOPE_MODULE,
    SCOPE_PROFILE,
    SCOPE_SOURCE,
    REASON,
};
