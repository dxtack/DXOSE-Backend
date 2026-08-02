'use strict';

/**
 * Canonical awaiting status keys derived from approver role codes.
 * Keep in sync with DX-Frontend `status-key-from-role.util.ts`.
 *
 * GRN historically uses PENDING_APPROVAL for Cost Control — preserve that when module is GRN.
 */

const ROLE_STATUS_KEY_MAP = Object.freeze({
  DEPT_MANAGER: 'PENDING_DEPT',
  FINANCE_MANAGER: 'PENDING_FINANCE',
  COST_CONTROL: 'PENDING_COST_CONTROL',
  COST_CONTROLLER: 'PENDING_COST_CONTROL',
  GENERAL_MANAGER: 'PENDING_GM',
  SECURITY: 'PENDING_SECURITY',
  STOREKEEPER: 'PENDING_APPROVAL',
});

/**
 * @param {string | null | undefined} roleCode
 * @param {string | null | undefined} [moduleKey]
 * @returns {string | null}
 */
function statusKeyFromRoleCode(roleCode, moduleKey) {
  const code = String(roleCode || '')
    .trim()
    .toUpperCase();
  if (!code) return null;
  const module = String(moduleKey || '')
    .trim()
    .toUpperCase();
  if (module === 'GRN' && (code === 'COST_CONTROL' || code === 'COST_CONTROLLER')) {
    return 'PENDING_APPROVAL';
  }
  if (ROLE_STATUS_KEY_MAP[code]) return ROLE_STATUS_KEY_MAP[code];
  const slug = code.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return slug ? `PENDING_${slug}` : null;
}

/**
 * Derive statusKey from role when available so free-text client values cannot drift.
 * Falls back to an explicit statusKey for capability-only steps.
 * @param {{ statusKey?: string | null, roleCode?: string | null }} step
 * @param {string | null | undefined} [moduleKey]
 * @returns {string | null}
 */
function resolveStepStatusKey(step, moduleKey) {
  const fromRole = statusKeyFromRoleCode(step?.roleCode, moduleKey);
  if (fromRole) return fromRole;
  const explicit = String(step?.statusKey || '')
    .trim()
    .toUpperCase();
  return explicit || null;
}

module.exports = {
  ROLE_STATUS_KEY_MAP,
  statusKeyFromRoleCode,
  resolveStepStatusKey,
};
