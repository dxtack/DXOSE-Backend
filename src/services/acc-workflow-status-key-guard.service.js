'use strict';

/**
 * Shared ACC workflow statusKey guard — prevents terminal document statuses
 * from being used as intermediate (or awaiting) workflow step keys.
 */

/** Must not appear on non-final workflow steps (publish + runtime awaiting). */
const FORBIDDEN_INTERMEDIATE_STATUS_KEYS = Object.freeze(
    new Set(['POSTED', 'APPROVED', 'CLOSED', 'COMPLETED', 'FINALIZED', 'OUT']),
);

/** Additional keys that must never be used as awaiting status (GRN legacy guard). */
const FORBIDDEN_AWAITING_STATUS_KEYS = Object.freeze(
    new Set([...FORBIDDEN_INTERMEDIATE_STATUS_KEYS, 'REJECTED']),
);

/** Modules that apply chain statusKey directly as document awaiting status at runtime. */
const CHAIN_DRIVEN_AWAITING_STATUS_MODULES = Object.freeze(new Set(['GRN', 'GET_PASS']));

function normalizeSteps(steps) {
    return [...(steps || [])].sort(
        (a, b) => (a.stepOrder ?? a.stepNumber ?? 0) - (b.stepOrder ?? b.stepNumber ?? 0),
    );
}

function formatStepLabel(step, index) {
    return step.stepOrder ?? step.stepNumber ?? index + 1;
}

/**
 * Publish / draft save: terminal statusKey allowed only on the final step.
 * @returns {Array<{ stepOrder: number, statusKey: string }>}
 */
function findPublishStatusKeyViolations(steps) {
    const list = normalizeSteps(steps);
    const total = list.length;
    const violations = [];
    for (let i = 0; i < total; i++) {
        const step = list[i];
        const isFinal = i === total - 1;
        const key = String(step.statusKey || '').trim().toUpperCase();
        if (!key || isFinal) continue;
        if (FORBIDDEN_INTERMEDIATE_STATUS_KEYS.has(key)) {
            violations.push({ stepOrder: formatStepLabel(step, i), statusKey: key });
        }
    }
    return violations;
}

/**
 * Runtime (chain-driven modules): no awaiting step may use a terminal statusKey.
 * @returns {Array<{ stepOrder: number, statusKey: string }>}
 */
function findAwaitingStatusKeyViolations(steps) {
    const list = normalizeSteps(steps);
    const violations = [];
    for (let i = 0; i < list.length; i++) {
        const step = list[i];
        const key = String(step.statusKey || '').trim().toUpperCase();
        if (!key) continue;
        if (FORBIDDEN_AWAITING_STATUS_KEYS.has(key)) {
            violations.push({ stepOrder: formatStepLabel(step, i), statusKey: key });
        }
    }
    return violations;
}

function buildMisconfigError(violations, moduleKey, context) {
    const detail = violations.map((v) => `step ${v.stepOrder} statusKey "${v.statusKey}"`).join('; ');
    const prefix = moduleKey ? `Workflow ${moduleKey}` : 'Workflow';
    const err = new Error(
        `${prefix} misconfigured: ${detail} cannot be used before the final approval/posting action`,
    );
    err.statusCode = context === 'publish' ? 400 : 500;
    err.code = 'WORKFLOW_STATUS_KEY_MISCONFIG';
    return err;
}

/**
 * @param {object[]} steps
 * @param {{ moduleKey?: string, context?: 'publish'|'awaiting' }} [options]
 */
function validateWorkflowChainSteps(steps, options = {}) {
    const moduleKey = options.moduleKey ? String(options.moduleKey).trim().toUpperCase() : '';
    const context = options.context === 'awaiting' ? 'awaiting' : 'publish';
    const violations =
        context === 'awaiting'
            ? findAwaitingStatusKeyViolations(steps)
            : findPublishStatusKeyViolations(steps);
    if (violations.length > 0) {
        throw buildMisconfigError(violations, moduleKey, context);
    }
}

/**
 * Validate chain for a module at runtime (chain-driven status modules only).
 */
function validateWorkflowChainForRuntime(chainOrSteps, moduleKey) {
    const key = String(moduleKey || '').trim().toUpperCase();
    if (!CHAIN_DRIVEN_AWAITING_STATUS_MODULES.has(key)) return;
    const steps = Array.isArray(chainOrSteps) ? chainOrSteps : chainOrSteps?.steps;
    validateWorkflowChainSteps(steps, { moduleKey: key, context: 'awaiting' });
}

/**
 * Assert a single awaiting statusKey before applying to a document.
 * @param {string} statusKey
 * @param {{ moduleKey?: string, stepNumber?: number }} [options]
 * @returns {string} normalized key
 */
function assertAwaitingStatusKey(statusKey, options = {}) {
    const key = String(statusKey || '').trim().toUpperCase();
    if (!key) return key;
    if (FORBIDDEN_AWAITING_STATUS_KEYS.has(key)) {
        const moduleKey = options.moduleKey ? String(options.moduleKey).trim().toUpperCase() : '';
        const stepNo = options.stepNumber != null ? ` step ${options.stepNumber}` : '';
        const err = new Error(
            moduleKey
                ? `${moduleKey} workflow misconfigured:${stepNo} statusKey "${key}" cannot be used before final posting`
                : `Workflow misconfigured:${stepNo} statusKey "${key}" cannot be used before final posting`,
        );
        err.statusCode = 500;
        err.code = 'WORKFLOW_STATUS_KEY_MISCONFIG';
        throw err;
    }
    return key;
}

module.exports = {
    FORBIDDEN_INTERMEDIATE_STATUS_KEYS,
    FORBIDDEN_AWAITING_STATUS_KEYS,
    CHAIN_DRIVEN_AWAITING_STATUS_MODULES,
    normalizeSteps,
    findPublishStatusKeyViolations,
    findAwaitingStatusKeyViolations,
    validateWorkflowChainSteps,
    validateWorkflowChainForRuntime,
    assertAwaitingStatusKey,
};
