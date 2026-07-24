'use strict';

/**
 * P26 — ACC scope runtime: ur_user_assignments authoritative (ZERO LEGACY).
 */

const { getRuntimeBoolean } = require('./acc-runtime-config.service');

function isAccScopeAssignmentsPrimary() {
  if (getRuntimeBoolean('accZeroLegacy')) return true;
  if (process.env.USE_NEW_POLICY_ENGINE === 'true') return true;
  if (process.env.USE_NEW_POLICY_ENGINE === 'false') return false;
  return getRuntimeBoolean('accHardCutover');
}

function getAccScopeRuntimeStatus() {
  return {
    assignmentsPrimary: isAccScopeAssignmentsPrimary(),
    accZeroLegacy: getRuntimeBoolean('accZeroLegacy'),
    accHardCutover: getRuntimeBoolean('accHardCutover'),
    runtimePhase: 'P26',
    legacyScopeFallbackRetired: true,
    rollback: {
      note: 'Oversight roles (P0-A) use ROLE_DEFAULT property-wide scope before ACC dept narrowing.',
    },
  };
}

module.exports = {
  isAccScopeAssignmentsPrimary,
  getAccScopeRuntimeStatus,
};
