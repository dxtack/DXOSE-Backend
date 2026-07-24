'use strict';

/**
 * ACC operational control — runtime permission enforcement for workflow steps.
 * Role names are identity/governance only; JWT permissions from ACC are authoritative.
 */

const { hasPermission } = require('../middleware/authorize');
const { normalizeRole } = require('../services/rbac.service');
const {
    resolveGetPassPermission,
    resolveBreakageLostPermission,
    resolveCountPermission,
    resolveTransferPermission,
} = require('./workflow-step-permissions');

const GET_PASS_STATUS_ROLE = Object.freeze({
    PENDING_DEPT: 'DEPT_MANAGER',
    PENDING_COST_CONTROL: 'COST_CONTROL',
    PENDING_FINANCE: 'FINANCE_MANAGER',
    PENDING_GM: 'GENERAL_MANAGER',
    PENDING_SECURITY: 'SECURITY',
});

function resolveGetPassStepRole(status, waitingForRole, options = {}) {
    if (options.stepRole) return normalizeRole(options.stepRole);
    const s = String(status || '').trim().toUpperCase();
    if (GET_PASS_STATUS_ROLE[s]) return GET_PASS_STATUS_ROLE[s];
    if (waitingForRole) return normalizeRole(waitingForRole);
    return null;
}

function requiredRoleCodeFromApprovalStep(step) {
    if (!step) return null;
    const direct = step.roleCode ?? step.requiredRole?.code ?? step.requiredRole;
    return direct ? normalizeRole(direct) : null;
}

function userMatchesStepRole(user, requiredRoleCode) {
    if (!requiredRoleCode) return false;
    return normalizeRole(user?.role) === normalizeRole(requiredRoleCode);
}

/** P10 — Workflow Builder step role gate (no ORG/SUPER bypass on wrong step). */
function assertStepRoleMatch(user, requiredRoleCode, message) {
    const required = normalizeRole(requiredRoleCode);
    if (!required) {
        const err = new Error(message || 'Approval step has no required role.');
        err.statusCode = 403;
        throw err;
    }
    if (userMatchesStepRole(user, required)) return;
    throw Object.assign(
        new Error(
            message || `Wrong workflow step. Required role: ${required}. Your role: ${normalizeRole(user?.role)}`,
        ),
        { statusCode: 403 },
    );
}

/** P10 — Dual gate: current step role AND User Rights permission. */
function assertDualGateApproval(user, requiredRoleCode, permissionCode, message) {
    assertStepRoleMatch(user, requiredRoleCode, message);
    assertUserHasPermission(user, permissionCode);
}

function userHasPermission(user, permissionCode) {
    if (!user || !permissionCode) return false;
    return hasPermission(user, permissionCode);
}

function assertUserHasPermission(user, permissionCode, message) {
    if (userHasPermission(user, permissionCode)) return;
    const err = new Error(message || `Access denied. Required permission: ${permissionCode}`);
    err.statusCode = 403;
    throw err;
}

function assertUserHasGetPassStepPermission(user, status, options = {}) {
    const s = String(status || '').trim().toUpperCase();
    const stepRole = resolveGetPassStepRole(status, options.waitingForRole, options);

    // Security gate exit: ACC/UR may grant EXIT (security) or FINAL (legacy / shared) — either is enough.
    if (s === 'PENDING_SECURITY') {
        if (stepRole) {
            assertStepRoleMatch(
                user,
                stepRole,
                `Unauthorized for this Get Pass step (requires ${stepRole}).`,
            );
        }
        const ok =
            userHasPermission(user, 'GET_PASS_APPROVE_EXIT') ||
            userHasPermission(user, 'GET_PASS_APPROVE_FINAL') ||
            (options.stepPermission && userHasPermission(user, options.stepPermission));
        if (ok) return;
        throw Object.assign(
            new Error(
                'Unauthorized for this Get Pass step (requires SECURITY + GET_PASS_APPROVE_EXIT or GET_PASS_APPROVE_FINAL).',
            ),
            { statusCode: 403 },
        );
    }

    const perm = options.stepPermission
        || resolveGetPassPermission(status, options.waitingForRole, options);
    if (stepRole) {
        assertDualGateApproval(user, stepRole, perm, `Unauthorized for this Get Pass step (requires ${stepRole} + ${perm}).`);
        return;
    }
    assertUserHasPermission(
        user,
        perm,
        `Unauthorized for this Get Pass step (requires ${perm}).`,
    );
}

function assertUserHasGrnManage(user, message) {
    assertUserHasPermission(user, 'GRN_MANAGE', message || 'GRN_MANAGE permission required.');
}

function assertUserHasCountStepPermission(user, status, requiredRoleCode) {
    const perm = resolveCountPermission(status);
    if (requiredRoleCode) {
        assertDualGateApproval(user, requiredRoleCode, perm, `Inventory count step requires ${requiredRoleCode} + ${perm}.`);
        return;
    }
    assertUserHasPermission(user, perm, `Inventory count step requires ${perm}.`);
}

function assertUserHasBreakageLostStepPermission(user, module, status, requiredRoleCode) {
    const perm = resolveBreakageLostPermission(module, status);
    if (requiredRoleCode) {
        assertDualGateApproval(user, requiredRoleCode, perm, `${module} workflow step requires ${requiredRoleCode} + ${perm}.`);
        return;
    }
    assertUserHasPermission(user, perm, `${module} workflow step requires ${perm}.`);
}

function assertUserHasTransferStepPermission(user, transferStatus, requiredRoleCode) {
    const perm = resolveTransferPermission(transferStatus);
    if (requiredRoleCode) {
        assertDualGateApproval(user, requiredRoleCode, perm, `Transfer step requires ${requiredRoleCode} + ${perm}.`);
        return;
    }
    assertUserHasPermission(user, perm, `Transfer step requires ${perm}.`);
}

module.exports = {
    userHasPermission,
    userMatchesStepRole,
    requiredRoleCodeFromApprovalStep,
    assertUserHasPermission,
    assertStepRoleMatch,
    assertDualGateApproval,
    assertUserHasGetPassStepPermission,
    assertUserHasGrnManage,
    assertUserHasCountStepPermission,
    assertUserHasBreakageLostStepPermission,
    assertUserHasTransferStepPermission,
    resolveGetPassStepRole,
    GET_PASS_STATUS_ROLE,
};
