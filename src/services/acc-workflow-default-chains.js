'use strict';

/**
 * Default ACC workflow chains — seed/bootstrap only (P9/P20).
 * Runtime must resolve from published ACC workflows, not this file.
 */

const DEFAULT_MODULE_CHAINS = Object.freeze({
  BREAKAGE: Object.freeze([
    { stepOrder: 1, roleCode: 'DEPT_MANAGER', label: 'HOD Approval', statusKey: 'DEPT_APPROVED' },
    { stepOrder: 2, roleCode: 'COST_CONTROL', label: 'Cost Control Approval', statusKey: 'COST_CONTROL_APPROVED' },
    { stepOrder: 3, roleCode: 'FINANCE_MANAGER', label: 'Finance Approval', statusKey: 'FINANCE_APPROVED' },
    { stepOrder: 4, roleCode: 'GENERAL_MANAGER', label: 'GM Approval', statusKey: 'POSTED' },
  ]),
  TRANSFER: Object.freeze([
    { stepOrder: 1, roleCode: 'DEPT_MANAGER', label: 'Department approval', statusKey: 'PENDING_DEPT' },
    { stepOrder: 2, roleCode: 'FINANCE_MANAGER', label: 'Finance approval', statusKey: 'PENDING_FINANCE' },
  ]),
  GRN: Object.freeze([
    { stepOrder: 1, roleCode: 'COST_CONTROL', label: 'Cost Control review', statusKey: 'PENDING_APPROVAL', permissionCode: 'GRN_MANAGE' },
    { stepOrder: 2, roleCode: 'FINANCE_MANAGER', label: 'Finance post approval', statusKey: 'PENDING_FINANCE', permissionCode: 'GRN_MANAGE' },
  ]),
  GET_PASS: Object.freeze([
    { stepOrder: 1, roleCode: 'DEPT_MANAGER', label: 'Department approval', statusKey: 'PENDING_DEPT' },
    { stepOrder: 2, roleCode: 'COST_CONTROL', label: 'Cost Control verification', statusKey: 'PENDING_COST_CONTROL' },
    { stepOrder: 3, roleCode: 'FINANCE_MANAGER', label: 'Finance sign-off', statusKey: 'PENDING_FINANCE' },
    { stepOrder: 4, roleCode: 'GENERAL_MANAGER', label: 'General Manager approval', statusKey: 'PENDING_GM' },
    { stepOrder: 5, roleCode: 'SECURITY', label: 'Security clearance', statusKey: 'PENDING_SECURITY' },
  ]),
  STOCK_COUNT: Object.freeze([
    { stepOrder: 1, roleCode: 'COST_CONTROL', label: 'Cost Control certification', statusKey: 'PENDING_COST_CONTROL' },
    { stepOrder: 2, roleCode: 'DEPT_MANAGER', label: 'Department Manager approval', statusKey: 'PENDING_DEPT' },
    { stepOrder: 3, roleCode: 'FINANCE_MANAGER', label: 'Finance approval', statusKey: 'PENDING_FINANCE' },
    { stepOrder: 4, roleCode: 'GENERAL_MANAGER', label: 'General Manager approval', statusKey: 'PENDING_GM' },
  ]),
  STOCK_REPORT: Object.freeze([
    { stepOrder: 1, roleCode: 'FINANCE_MANAGER', label: 'Finance approval', statusKey: 'PENDING_APPROVAL' },
  ]),
});

function defaultStepsForModule(moduleKey) {
  const key = String(moduleKey || '').trim().toUpperCase();
  const chain = DEFAULT_MODULE_CHAINS[key];
  if (!chain) return [];
  return chain.map((step) => ({ ...step }));
}

function defaultRoleCodesForModule(moduleKey) {
  return defaultStepsForModule(moduleKey).map((s) => s.roleCode).filter(Boolean);
}

module.exports = {
  DEFAULT_MODULE_CHAINS,
  defaultStepsForModule,
  defaultRoleCodesForModule,
};
