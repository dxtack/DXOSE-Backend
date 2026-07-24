'use strict';

/**
 * ACC Big Bang S12/S16 — advanced policy evaluation.
 * S12 observe-only; S16 adds pilot enforcement with legacy fallback.
 */

const prisma = require('../config/database');
const { AuditAction } = require('./ur-audit.logger');
const {
  isAccPolicyObserveEnabled,
  isAccPolicyDriftSafeFallbackEnabled,
} = require('../acc-runtime/featureFlags');

const _isWithinDateRange = (at, from, to) => {
  if (from && at < from) return false;
  if (to && at > to) return false;
  return true;
};

const _matchesScheduleWindow = (rule, at) => {
  if (!rule.isActive) return false;
  if (!_isWithinDateRange(at, rule.effectiveFrom, rule.effectiveTo)) return false;
  if (rule.daysOfWeek?.length > 0) {
    const day = at.getUTCDay();
    if (!rule.daysOfWeek.includes(day)) return false;
  }
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  if (rule.startMinutes <= rule.endMinutes) {
    return minutes >= rule.startMinutes && minutes <= rule.endMinutes;
  }
  return minutes >= rule.startMinutes || minutes <= rule.endMinutes;
};

async function _loadFieldRules({ userId, roleId, tenantId, resourceCode }) {
  return prisma.accFieldSecurityRule.findMany({
    where: {
      isActive: true,
      resourceCode: resourceCode ?? undefined,
      OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
      AND: [
        {
          OR: [
            ...(userId ? [{ userId }] : []),
            ...(roleId ? [{ roleId }] : []),
            { userId: null, roleId: null },
          ],
        },
      ],
    },
    orderBy: [{ fieldKey: 'asc' }],
  });
}

async function _loadActiveExceptions(userId, at) {
  return prisma.accUserException.findMany({
    where: {
      userId,
      isActive: true,
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }],
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] }],
    },
    include: { permission: { select: { id: true, legacyCode: true } } },
  });
}

async function _loadScheduledAccess({ userId, roleId, tenantId }) {
  return prisma.accScheduledAccess.findMany({
    where: {
      isActive: true,
      OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
      AND: [
        {
          OR: [
            ...(userId ? [{ userId }] : []),
            ...(roleId ? [{ roleId }] : []),
            { userId: null, roleId: null },
          ],
        },
      ],
    },
  });
}

function buildLegacyPolicyBaseline() {
  return {
    enforced: false,
    legacyAuthoritative: true,
    source: 'legacy',
    accessAllowed: true,
    withinSchedule: true,
    defaultFieldAccess: 'FULL',
    fieldAccessByKey: {},
    fieldRuleCount: 0,
    activeExceptionCount: 0,
    scheduleCount: 0,
    policiesConfigured: false,
    legacyEquivalent: true,
  };
}

function _hasFieldRuleConflicts(rules) {
  const byKey = {};
  for (const rule of rules) {
    if (byKey[rule.fieldKey] && byKey[rule.fieldKey] !== rule.accessLevel) {
      return true;
    }
    byKey[rule.fieldKey] = rule.accessLevel;
  }
  return false;
}

function _isLegacyEquivalentOutcome(outcome, fieldKey = null) {
  if (!outcome.accessAllowed || !outcome.withinSchedule) return false;
  if (fieldKey) {
    const level = outcome.fieldAccessByKey[fieldKey];
    return !level || level === 'FULL';
  }
  return Object.values(outcome.fieldAccessByKey).every((level) => !level || level === 'FULL');
}

async function _buildPolicyDataSnapshot({
  userId,
  tenantId = null,
  roleId = null,
  resourceCode = null,
  fieldKey = null,
  at = new Date(),
}) {
  const fieldRules = await _loadFieldRules({ userId, roleId, tenantId, resourceCode });
  const userExceptions = userId ? await _loadActiveExceptions(userId, at) : [];
  const schedules = await _loadScheduledAccess({ userId, roleId, tenantId });
  const matchingSchedules = schedules.filter((s) => _matchesScheduleWindow(s, at));
  const withinSchedule = schedules.length === 0 || matchingSchedules.length > 0;
  const applicableFieldRules = fieldKey
    ? fieldRules.filter((r) => r.fieldKey === fieldKey)
    : fieldRules;

  return {
    at,
    userId,
    tenantId,
    roleId,
    resourceCode,
    fieldKey,
    fieldRules,
    userExceptions,
    schedules,
    matchingSchedules,
    withinSchedule,
    applicableFieldRules,
  };
}

function computeEnforcedPolicyOutcome(snapshot) {
  const fieldAccessByKey = {};
  for (const rule of snapshot.applicableFieldRules) {
    fieldAccessByKey[rule.fieldKey] = rule.accessLevel;
  }

  const fieldRuleCount = snapshot.applicableFieldRules.length;
  const activeExceptionCount = snapshot.userExceptions.length;
  const scheduleCount = snapshot.schedules.length;
  const policiesConfigured = fieldRuleCount + activeExceptionCount + scheduleCount > 0;
  const accessAllowed = snapshot.withinSchedule;

  return {
    enforced: policiesConfigured,
    legacyAuthoritative: !policiesConfigured,
    accessAllowed,
    withinSchedule: snapshot.withinSchedule,
    defaultFieldAccess:
      snapshot.fieldKey && fieldAccessByKey[snapshot.fieldKey]
        ? fieldAccessByKey[snapshot.fieldKey]
        : 'FULL',
    fieldAccessByKey,
    fieldRuleCount,
    activeExceptionCount,
    scheduleCount,
    policiesConfigured,
    fieldRules: snapshot.applicableFieldRules.map((r) => ({
      id: r.id,
      fieldKey: r.fieldKey,
      accessLevel: r.accessLevel,
      roleId: r.roleId,
      userId: r.userId,
    })),
    exceptions: snapshot.userExceptions.map((e) => ({
      id: e.id,
      exceptionType: e.exceptionType,
      permissionCode: e.permission?.legacyCode ?? null,
      resourceCode: e.resourceCode,
      fieldKey: e.fieldKey,
    })),
    schedules: snapshot.schedules.map((s) => ({
      id: s.id,
      label: s.label,
      activeNow: snapshot.matchingSchedules.some((m) => m.id === s.id),
    })),
  };
}

/**
 * S16 — evaluate advanced policies for pilot enforcement (does not change JWT permissions).
 */
async function evaluateAdvancedPolicyEnforcement({
  userId,
  tenantId = null,
  tenantSlug = null,
  roleId = null,
  resourceCode = null,
  fieldKey = null,
  at = new Date(),
}) {
  const legacy = buildLegacyPolicyBaseline();

  try {
    const snapshot = await _buildPolicyDataSnapshot({
      userId,
      tenantId,
      roleId,
      resourceCode,
      fieldKey,
      at,
    });
    const outcome = computeEnforcedPolicyOutcome(snapshot);

    if (!outcome.policiesConfigured) {
      return {
        ...legacy,
        at: at.toISOString(),
        userId,
        tenantId,
        tenantSlug,
        roleId,
        resourceCode,
        fieldKey,
        source: 'legacy-no-policies',
      };
    }

    if (_hasFieldRuleConflicts(snapshot.applicableFieldRules)) {
      process.stderr.write(
        `[ACC_POLICY_ENFORCE_DRIFT] tenantSlug=${tenantSlug ?? 'unknown'} reason=FIELD_RULE_CONFLICT resourceCode=${resourceCode ?? 'null'}\n`,
      );
      if (isAccPolicyDriftSafeFallbackEnabled()) {
        return {
          ...legacy,
          at: at.toISOString(),
          userId,
          tenantId,
          tenantSlug,
          roleId,
          resourceCode,
          fieldKey,
          source: 'legacy-drift-fallback',
          drift: true,
          driftReason: 'FIELD_RULE_CONFLICT',
        };
      }
    }

    if (!_isLegacyEquivalentOutcome(outcome, fieldKey) || !outcome.accessAllowed) {
      return {
        ...outcome,
        at: at.toISOString(),
        userId,
        tenantId,
        tenantSlug,
        roleId,
        resourceCode,
        fieldKey,
        source: 'acc',
        drift: false,
        legacyEquivalent: false,
      };
    }

    return {
      ...outcome,
      at: at.toISOString(),
      userId,
      tenantId,
      tenantSlug,
      roleId,
      resourceCode,
      fieldKey,
      source: 'acc',
      drift: false,
      legacyEquivalent: true,
    };
  } catch (err) {
    process.stderr.write(
      `[ACC_POLICY_ENFORCE_FALLBACK] tenantSlug=${tenantSlug ?? 'unknown'} reason=${err?.message ?? err}\n`,
    );
    return {
      ...legacy,
      at: at.toISOString(),
      userId,
      tenantId,
      tenantSlug,
      roleId,
      resourceCode,
      fieldKey,
      source: 'legacy-fallback',
      error: err?.message ?? String(err),
    };
  }
}

/**
 * Observe advanced policies for a user context. No enforcement (S12).
 */
async function observeAdvancedPolicies({
  userId,
  tenantId = null,
  roleId = null,
  resourceCode = null,
  fieldKey = null,
  at = new Date(),
  actorId = null,
}) {
  if (!isAccPolicyObserveEnabled()) {
    return {
      observed: false,
      enforcementEnabled: false,
      legacyAuthoritative: true,
    };
  }

  const snapshot = await _buildPolicyDataSnapshot({
    userId,
    tenantId,
    roleId,
    resourceCode,
    fieldKey,
    at,
  });
  const outcome = computeEnforcedPolicyOutcome(snapshot);

  const observation = {
    observed: true,
    enforcementEnabled: false,
    legacyAuthoritative: true,
    at: at.toISOString(),
    userId,
    tenantId,
    roleId,
    resourceCode,
    fieldKey,
    fieldRuleCount: outcome.fieldRuleCount,
    activeExceptionCount: outcome.activeExceptionCount,
    scheduleCount: outcome.scheduleCount,
    withinSchedule: outcome.withinSchedule,
    fieldRules: outcome.fieldRules,
    exceptions: outcome.exceptions,
  };

  if (actorId) {
    try {
      await prisma.urAuditEvent.create({
        data: {
          actorId,
          action: AuditAction.POLICY_OBSERVATION,
          targetUserId: userId,
          entityType: 'AccAdvancedPolicy',
          newValue: observation,
        },
      });
    } catch (err) {
      process.stderr.write(`[acc-policy-observe] audit failed: ${err?.message ?? err}\n`);
    }
  }

  process.stderr.write(`[ACC_POLICY_OBSERVATION] ${JSON.stringify({
    userId,
    resourceCode,
    fieldRuleCount: observation.fieldRuleCount,
    activeExceptionCount: observation.activeExceptionCount,
    withinSchedule: observation.withinSchedule,
  })}\n`);

  return observation;
}

module.exports = {
  observeAdvancedPolicies,
  evaluateAdvancedPolicyEnforcement,
  buildLegacyPolicyBaseline,
  computeEnforcedPolicyOutcome,
  _matchesScheduleWindow,
  _buildPolicyDataSnapshot,
  _isLegacyEquivalentOutcome,
};
