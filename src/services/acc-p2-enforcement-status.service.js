'use strict';

/**
 * ACC P2 — Combined enforcement alignment status (read-only operator view).
 */

const { getPermissionEnforcementStatus } = require('./acc-enforcement-pilot.service');
const { getWorkflowEnforcementStatus } = require('./workflow-enforcement-pilot.service');
const { getPolicyEnforcementStatus } = require('./policy-enforcement-pilot.service');
const { getAssignmentCoverageReport } = require('./acc-p2-assignment-coverage.service');
const { getAuthorizeRoleInventory } = require('./acc-p2-route-migration.service');
const { isScopeEnforcementEnabled } = require('../middleware/scope-enforcement.middleware');
const { getFeatureFlagStatus: getShadowFlagStatus } = require('../engines/shadow-mode.service');
const { getAccFeatureFlagStatus } = require('../acc-runtime/featureFlags');

function getP2EnforcementAlignmentStatus({ tenantId = null, tenantSlug = null } = {}) {
    return {
        phase: 'P2-enforcement-alignment',
        permissions: getPermissionEnforcementStatus({ tenantId, tenantSlug }),
        workflows: getWorkflowEnforcementStatus({ tenantId, tenantSlug }),
        policies: getPolicyEnforcementStatus({ tenantId, tenantSlug }),
        scope: {
            enableScopeEnforcement: isScopeEnforcementEnabled(),
            useNewPolicyEngine: process.env.USE_NEW_POLICY_ENGINE === 'true',
            middlewareMounted: true,
            pilotNote: 'Scope middleware runs after authenticate when ENABLE_SCOPE_ENFORCEMENT=true.',
        },
        shadow: getShadowFlagStatus(),
        accFlags: getAccFeatureFlagStatus(),
        routeMigration: {
            summary: getAuthorizeRoleInventory().summary,
        },
        rollback: {
            scope: 'Set ENABLE_SCOPE_ENFORCEMENT=false (default)',
            permissions: 'Set ACC_HARD_CUTOVER=false or ACC_ENFORCE_PERMISSIONS=false',
            shadow: 'Set ENABLE_UR_SHADOW_MODE=false (default)',
        },
        knownLimitations: [
            'P2 prepares alignment — no full route cutover or legacy removal (P3).',
            'Settings role changes are blocked; initial role on create still provisions TenantMember.',
            'Drift-safe fallback remains ON by default until pilot verification.',
        ],
    };
}

module.exports = {
    getP2EnforcementAlignmentStatus,
};
