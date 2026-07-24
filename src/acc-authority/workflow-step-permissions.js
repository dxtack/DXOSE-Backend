'use strict';

/**
 * Phase D — workflow pipeline step gates mapped to ACC permission codes.
 * Collectors derive `waitingForPermission`; runtime "mine" uses JWT permissions.
 */

const { PERMISSION_MAP } = require('./catalog.constitution');

const PERMISSION_LABELS = Object.freeze(
    PERMISSION_MAP.reduce((acc, entry) => {
        acc[entry.legacyCode] = entry.name;
        return acc;
    }, {}),
);

const STEP_PERMISSION_TRANSFER = Object.freeze({
    PENDING_DEPT: 'TRANSFER_APPROVE',
    PENDING_FINANCE: 'TRANSFER_APPROVE',
});

const STEP_PERMISSION_GET_PASS = Object.freeze({
    PENDING_DEPT: 'GET_PASS_APPROVE',
    PENDING_COST_CONTROL: 'GET_PASS_APPROVE',
    PENDING_FINANCE: 'GET_PASS_APPROVE',
    PENDING_GM: 'GET_PASS_APPROVE_FINAL',
    // Gate exit clearance — Security UR typically grants EXIT (FINAL is GM). Accept both at runtime.
    PENDING_SECURITY: 'GET_PASS_APPROVE_EXIT',
});

const COUNT_STATUS_PERMISSION = Object.freeze({
    DRAFT: 'STOCK_COUNT_CREATE',
    COUNTING: 'STOCK_COUNT_EXECUTE',
    RECOUNTING: 'STOCK_COUNT_EXECUTE',
    REVEAL_REVIEW: 'STOCK_COUNT_SUBMIT',
    PENDING_COST_CONTROL: 'APPROVE_INVENTORY_COUNT',
    PENDING_DEPT: 'APPROVE_INVENTORY_COUNT',
    PENDING_FINANCE: 'APPROVE_INVENTORY_COUNT',
    PENDING_GM: 'APPROVE_INVENTORY_COUNT',
    PENDING_APPROVAL: 'APPROVE_INVENTORY_COUNT',
    FINANCE_APPROVED: 'APPROVE_INVENTORY_COUNT',
});

const TRANSFER_LEGACY_STATUSES = Object.freeze([
    'SUBMITTED',
    'PENDING_FINAL',
    'APPROVED',
    'IN_TRANSIT',
]);

const GET_PASS_RETURN_STATUSES = Object.freeze([
    'RECEIVED_AT_DESTINATION',
    'RETURNING',
    'RETURN_RECEIVED_AT_GATE',
    'PARTIALLY_RETURNED',
]);

function permissionLabel(code) {
    if (!code) return null;
    return PERMISSION_LABELS[code] || code;
}

function resolveBreakageLostPermission(module, status) {
    if (status === 'DRAFT') {
        return module === 'LOST' ? 'LOST_CREATE' : 'BREAKAGE_CREATE';
    }
    return module === 'LOST' ? 'APPROVE_LOST' : 'APPROVE_BREAKAGE';
}

function resolveGetPassPermission(status, waitingForRole, options = {}) {
    if (STEP_PERMISSION_GET_PASS[status]) {
        return STEP_PERMISSION_GET_PASS[status];
    }
    if (status === 'APPROVED') {
        return 'GET_PASS_APPROVE_EXIT';
    }
    if (status === 'OUT' || status === 'PARTIALLY_RETURNED') {
        return 'GET_PASS_APPROVE_RETURN';
    }
    if (GET_PASS_RETURN_STATUSES.includes(status)) {
        return options.isInternalTransfer ? 'GET_PASS_CONFIRM_DESTINATION' : 'GET_PASS_APPROVE_RETURN';
    }
    if (waitingForRole === 'STOREKEEPER') {
        return 'GET_PASS_APPROVE_EXIT';
    }
    if (waitingForRole === 'SECURITY') {
        return 'GET_PASS_APPROVE_RETURN';
    }
    return 'GET_PASS_VIEW';
}

function resolveTransferPermission(status) {
    if (STEP_PERMISSION_TRANSFER[status]) {
        return STEP_PERMISSION_TRANSFER[status];
    }
    if (
        TRANSFER_LEGACY_STATUSES.includes(status) ||
        status === 'RECEIVED' ||
        status === 'CLOSED' ||
        status === 'POSTED'
    ) {
        return 'TRANSFER_VIEW';
    }
    return 'TRANSFER_APPROVE';
}

function resolveCountPermission(status) {
    return COUNT_STATUS_PERMISSION[status] || 'STOCK_COUNT_EXECUTE';
}

/**
 * @returns {{ waitingForPermission: string|null, waitingForPermissionsAny: string[]|null }}
 */
function resolveWaitingPermission({ module, status, waitingForRole, isInternalTransfer }) {
    if (waitingForRole === 'RECEIVER') {
        if (module === 'TRANSFER') {
            return { waitingForPermission: 'TRANSFER_VIEW', waitingForPermissionsAny: null };
        }
        return {
            waitingForPermission: null,
            waitingForPermissionsAny: ['GET_PASS_CONFIRM_DESTINATION', 'GET_PASS_APPROVE'],
        };
    }

    let permission = null;
    switch (module) {
        case 'TRANSFER':
            permission = resolveTransferPermission(status);
            break;
        case 'GRN':
            permission = 'GRN_MANAGE';
            break;
        case 'INVENTORY_COUNT':
            permission = resolveCountPermission(status);
            break;
        case 'BREAKAGE':
        case 'LOST':
            permission = resolveBreakageLostPermission(module, status);
            break;
        case 'GET_PASS':
            // Security exit: tenants may grant EXIT and/or FINAL — accept either for "mine".
            if (status === 'PENDING_SECURITY') {
                return {
                    waitingForPermission: 'GET_PASS_APPROVE_EXIT',
                    waitingForPermissionsAny: ['GET_PASS_APPROVE_EXIT', 'GET_PASS_APPROVE_FINAL'],
                };
            }
            permission = resolveGetPassPermission(status, waitingForRole, { isInternalTransfer });
            break;
        default:
            permission = null;
            break;
    }

    return { waitingForPermission: permission, waitingForPermissionsAny: null };
}

function itemMatchesWaitingFilter(filterToken, item) {
    const token = String(filterToken || '').toUpperCase();
    if (!token) return true;
    if (token === String(item.waitingForRole || '').toUpperCase()) return true;
    if (token === String(item.waitingForPermission || '').toUpperCase()) return true;
    if (
        Array.isArray(item.waitingForPermissionsAny) &&
        item.waitingForPermissionsAny.some((p) => String(p).toUpperCase() === token)
    ) {
        return true;
    }
    return false;
}

module.exports = {
    permissionLabel,
    resolveWaitingPermission,
    itemMatchesWaitingFilter,
    resolveGetPassPermission,
    resolveBreakageLostPermission,
    resolveCountPermission,
    resolveTransferPermission,
    STEP_PERMISSION_GET_PASS,
    COUNT_STATUS_PERMISSION,
    PERMISSION_LABELS,
};
