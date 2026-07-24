'use strict';

/**
 * P1 #24 — Stock Count granular permissions (unbundle of STOCK_COUNT_MANAGE).
 * Legacy STOCK_COUNT_MANAGE remains a compatibility synonym for all granular ops.
 */

const STOCK_COUNT_CREATE = 'STOCK_COUNT_CREATE';
const STOCK_COUNT_EXECUTE = 'STOCK_COUNT_EXECUTE';
const STOCK_COUNT_CANCEL = 'STOCK_COUNT_CANCEL';
const STOCK_COUNT_RECOUNT = 'STOCK_COUNT_RECOUNT';
const STOCK_COUNT_SUBMIT = 'STOCK_COUNT_SUBMIT';
const STOCK_COUNT_MANAGE = 'STOCK_COUNT_MANAGE';
const STOCK_COUNT_VIEW = 'STOCK_COUNT_VIEW';
const APPROVE_INVENTORY_COUNT = 'APPROVE_INVENTORY_COUNT';

const STOCK_COUNT_GRANULAR = Object.freeze([
  STOCK_COUNT_CREATE,
  STOCK_COUNT_EXECUTE,
  STOCK_COUNT_CANCEL,
  STOCK_COUNT_RECOUNT,
  STOCK_COUNT_SUBMIT,
]);

/** Equivalent replacement set for any former STOCK_COUNT_MANAGE grant. */
const STOCK_COUNT_MANAGE_EQUIVALENT = STOCK_COUNT_GRANULAR;

function expandsStockCountPermission(userPermissions, requestedPermission) {
  const perms = Array.isArray(userPermissions) ? userPermissions : [];
  if (!requestedPermission) return false;
  if (perms.includes(requestedPermission)) return true;

  // Legacy bundle satisfies any granular stock-count op.
  if (STOCK_COUNT_GRANULAR.includes(requestedPermission) && perms.includes(STOCK_COUNT_MANAGE)) {
    return true;
  }

  // Any granular grant satisfies a legacy STOCK_COUNT_MANAGE check.
  if (requestedPermission === STOCK_COUNT_MANAGE) {
    return STOCK_COUNT_GRANULAR.some((code) => perms.includes(code));
  }

  return false;
}

module.exports = {
  STOCK_COUNT_CREATE,
  STOCK_COUNT_EXECUTE,
  STOCK_COUNT_CANCEL,
  STOCK_COUNT_RECOUNT,
  STOCK_COUNT_SUBMIT,
  STOCK_COUNT_MANAGE,
  STOCK_COUNT_VIEW,
  APPROVE_INVENTORY_COUNT,
  STOCK_COUNT_GRANULAR,
  STOCK_COUNT_MANAGE_EQUIVALENT,
  expandsStockCountPermission,
};
