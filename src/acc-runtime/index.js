'use strict';

/**
 * ACC Runtime Facade — Stages S1–S18.
 * S18 hard cutover: ACC primary by default; legacy emergency fallbacks retained.
 */

const { resolveSession } = require('./resolveSession');
const { resolvePermissionsForMembership, resolveAccPermissionsForMembership } = require('./resolvePermissions');
const { hasCapability } = require('./hasCapability');
const { resolveScope } = require('./resolveScope');
const roleCode = require('./roleCode');
const featureFlags = require('./featureFlags');
const {
  resolvePublishedWorkflowChain,
  moduleKeyForRequestType,
} = require('../engines/workflow-resolution.engine');
const { observeAdvancedPolicies } = require('../engines/policy-evaluation.engine');
const {
  getPermissionEnforcementStatus,
  evaluatePermissionResolution,
} = require('../services/acc-enforcement-pilot.service');
const {
  getWorkflowEnforcementStatus,
  evaluateWorkflowEnforcement,
  resolveWorkflowForDocument,
  resolveWorkflowChainForDocument,
  listAllModulesRuntimeReadPath,
} = require('../services/acc-workflow-runtime.service');
const {
  getPolicyEnforcementStatus,
  resolveAdvancedPolicyEvaluation,
} = require('../services/policy-enforcement-pilot.service');

module.exports = {
    resolveSession,
    resolvePermissionsForMembership,
    resolveAccPermissionsForMembership,
    hasCapability,
    resolveScope,
    resolvePublishedWorkflowChain,
    moduleKeyForRequestType,
    observeAdvancedPolicies,
    getPermissionEnforcementStatus,
    evaluatePermissionResolution,
    getWorkflowEnforcementStatus,
    evaluateWorkflowEnforcement,
    resolveWorkflowChainForDocument,
    resolveWorkflowForDocument,
    listAllModulesRuntimeReadPath,
    getPolicyEnforcementStatus,
    resolveAdvancedPolicyEvaluation,
    roleCode,
    ...roleCode,
    ...featureFlags,
};
