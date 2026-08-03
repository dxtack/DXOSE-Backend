'use strict';

/**
 * ACC operational control — runtime permission enforcement for workflow steps.
 * Role names are identity/governance only; JWT permissions from ACC are authoritative.
 */

const { hasPermission } = require('../middleware/authorize');
const { normalizeRole } = require('../services/rbac.service');
const { canBypassWorkflowStep } = require('../services/rbac.constants');
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

/**
 * Manager Override — ORG_MANAGER / SUPER_ADMIN may act on any pending step role.
 * Permission (ACC) remains dual-gated separately. Opt out with allowGovernanceBypass: false
 * (e.g. Get Pass security exit).
 */
function canBypassWorkflowStepRole(user, options = {}) {
    if (options.allowGovernanceBypass === false) return false;
    return canBypassWorkflowStep(user?.role);
}

/** True when the actor is overriding a step that is not their native role. */
function isActingAsWorkflowOverride(user, requiredRoleCode, options = {}) {
    if (!requiredRoleCode) return false;
    if (userMatchesStepRole(user, requiredRoleCode)) return false;
    return canBypassWorkflowStepRole(user, options);
}

/** Audit / history fields when Manager Override is used. */
function buildWorkflowOverrideAuditFields(user, requiredRoleCode, options = {}) {
    if (!isActingAsWorkflowOverride(user, requiredRoleCode, options)) return null;
    const overrideRole = normalizeRole(user?.role);
    const overriddenStepRole = normalizeRole(requiredRoleCode);
    return {
        isOverride: true,
        overrideRole,
        overriddenStepRole,
        overrideNote: `via Manager Override (Step: ${overriddenStepRole})`,
    };
}

function withWorkflowOverrideAudit(afterValue, user, requiredRoleCode, options = {}) {
    const meta = buildWorkflowOverrideAuditFields(user, requiredRoleCode, options);
    if (!meta) return afterValue || {};
    return { ...(afterValue && typeof afterValue === 'object' ? afterValue : {}), ...meta };
}

function appendWorkflowOverrideComment(comment, user, requiredRoleCode, options = {}) {
    const meta = buildWorkflowOverrideAuditFields(user, requiredRoleCode, options);
    if (!meta) return comment || null;
    const base = String(comment || '').trim();
    const tag = `Manager Override (${meta.overrideRole} acting on ${meta.overriddenStepRole} step)`;
    return base ? `${base} — ${tag}` : tag;
}

/** P10 — Workflow Builder step role gate (+ Manager Override for ORG/SUPER). */
function assertStepRoleMatch(user, requiredRoleCode, message, options = {}) {
    const required = normalizeRole(requiredRoleCode);
    if (!required) {
        const err = new Error(message || 'Approval step has no required role.');
        err.statusCode = 403;
        throw err;
    }
    if (userMatchesStepRole(user, required)) return;
    if (canBypassWorkflowStepRole(user, options)) return;
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
    // No Manager Override on the physical security clearance step.
    if (s === 'PENDING_SECURITY') {
        if (stepRole) {
            assertStepRoleMatch(
                user,
                stepRole,
                `Unauthorized for this Get Pass step (requires ${stepRole}).`,
                { allowGovernanceBypass: false },
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

/**
 * Physical gate/security actions on the Get Pass return side (destination receipt,
 * return exit scan, return arrival inspection). Regular operational users must hold
 * the literal SECURITY role. ORG_MANAGER / SUPER_ADMIN may act on these steps via
 * Manager Override (business decision: security personnel are not always available
 * on-site) — callers MUST log the resulting isOverride/overrideRole/overriddenStepRole
 * fields via buildWorkflowOverrideAuditFields/withWorkflowOverrideAudit so the audit
 * trail distinguishes an override from an actual physical security sign-off.
 * The Get Pass EXIT gate (PENDING_SECURITY, assertUserHasGetPassStepPermission) is a
 * separate, still non-overridable checkpoint — this relaxation does not apply there.
 */
function assertUserHasGetPassGateOperationPermission(user, status, options = {}) {
    const requiredRole = options.stepRole || 'SECURITY';
    assertStepRoleMatch(
        user,
        requiredRole,
        `Unauthorized for this Get Pass gate action (requires ${requiredRole}).`,
    );
    const perm = options.stepPermission
        || resolveGetPassPermission(status, options.waitingForRole, options);
    assertUserHasPermission(
        user,
        perm,
        `Unauthorized for this Get Pass gate action (requires ${perm}).`,
    );
}

function assertUserHasGrnManage(user, message) {
    assertUserHasPermission(user, 'GRN_MANAGE', message || 'GRN_MANAGE permission required.');
}

function assertUserHasCountStepPermission(user, status, requiredRoleCode, options = {}) {
    const perm = options.stepPermission || resolveCountPermission(status);
    if (requiredRoleCode) {
        assertDualGateApproval(user, requiredRoleCode, perm, `Inventory count step requires ${requiredRoleCode} + ${perm}.`);
        return;
    }
    assertUserHasPermission(user, perm, `Inventory count step requires ${perm}.`);
}

function assertUserHasBreakageLostStepPermission(user, module, status, requiredRoleCode, options = {}) {
    const perm = options.stepPermission || resolveBreakageLostPermission(module, status);
    if (requiredRoleCode) {
        assertDualGateApproval(user, requiredRoleCode, perm, `${module} workflow step requires ${requiredRoleCode} + ${perm}.`);
        return;
    }
    assertUserHasPermission(user, perm, `${module} workflow step requires ${perm}.`);
}

/**
 * Dual-gate transfer approval.
 * Prefer ACC step permissionCode (from permissionId / capabilityCode) when provided;
 * fall back to status map only when the step has no ACC permission configured.
 */
function assertUserHasTransferStepPermission(user, transferStatus, requiredRoleCode, options = {}) {
    const perm = options.stepPermission || resolveTransferPermission(transferStatus);
    if (requiredRoleCode) {
        assertDualGateApproval(user, requiredRoleCode, perm, `Transfer step requires ${requiredRoleCode} + ${perm}.`);
        return;
    }
    assertUserHasPermission(user, perm, `Transfer step requires ${perm}.`);
}

module.exports = {
    userHasPermission,
    userMatchesStepRole,
    canBypassWorkflowStepRole,
    isActingAsWorkflowOverride,
    buildWorkflowOverrideAuditFields,
    withWorkflowOverrideAudit,
    appendWorkflowOverrideComment,
    requiredRoleCodeFromApprovalStep,
    assertUserHasPermission,
    assertStepRoleMatch,
    assertDualGateApproval,
    assertUserHasGetPassStepPermission,
    assertUserHasGetPassGateOperationPermission,
    assertUserHasGrnManage,
    assertUserHasCountStepPermission,
    assertUserHasBreakageLostStepPermission,
    assertUserHasTransferStepPermission,
    resolveGetPassStepRole,
    GET_PASS_STATUS_ROLE,
};
