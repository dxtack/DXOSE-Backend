'use strict';

/**
 * P25 — Advanced policy runtime enforcement on API responses.
 */

const { evaluateAdvancedPolicyEnforcement } = require('../engines/policy-evaluation.engine');
const { isAccEnforceAdvancedPoliciesEnabled } = require('../acc-runtime/featureFlags');

function _applyFieldRulesToObject(obj, rules, fieldKey) {
  if (!obj || typeof obj !== 'object') return obj;
  const rule = rules.find((r) => r.fieldKey === fieldKey);
  if (!rule) return obj[fieldKey];
  if (rule.accessLevel === 'HIDDEN') return undefined;
  return obj[fieldKey];
}

async function enforceFieldSecurityOnPayload({
  userId,
  tenantId,
  roleId,
  resourceCode,
  payload,
}) {
  if (!isAccEnforceAdvancedPoliciesEnabled()) return payload;
  if (!payload || !resourceCode) return payload;

  const evaluation = await evaluateAdvancedPolicyEnforcement({
    userId,
    tenantId,
    roleId,
    resourceCode,
    at: new Date(),
  });

  const rules = evaluation?.fieldRules ?? [];
  if (!rules.length) return payload;

  const clone = Array.isArray(payload) ? [...payload] : { ...payload };
  const fieldKeys = [...new Set(rules.map((r) => r.fieldKey).filter(Boolean))];

  if (Array.isArray(clone)) {
    return clone.map((row) => {
      const item = { ...row };
      for (const fk of fieldKeys) {
        const rule = rules.find((r) => r.fieldKey === fk);
        if (rule?.accessLevel === 'HIDDEN') delete item[fk];
        if (rule?.accessLevel === 'READ_ONLY' && item[fk] !== undefined) {
          item[`${fk}__readOnly`] = true;
        }
      }
      return item;
    });
  }

  for (const fk of fieldKeys) {
    const rule = rules.find((r) => r.fieldKey === fk);
    if (rule?.accessLevel === 'HIDDEN') delete clone[fk];
  }
  return clone;
}

async function assertScheduledAccessAllowed({ userId, tenantId, roleId }) {
  if (!isAccEnforceAdvancedPoliciesEnabled()) return;
  const evaluation = await evaluateAdvancedPolicyEnforcement({
    userId,
    tenantId,
    roleId,
    at: new Date(),
  });
  if (evaluation?.scheduledAccessDenied) {
    const err = new Error('Access denied outside scheduled access window.');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = {
  enforceFieldSecurityOnPayload,
  assertScheduledAccessAllowed,
};
