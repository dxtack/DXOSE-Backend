/**
 * ShadowModeService
 * ─────────────────
 * Runs the new PermissionResolutionEngine in PARALLEL with Legacy RBAC.
 * The result of the new engine is NEVER used to make access decisions.
 * Its sole purpose is to detect and log mismatches so we can validate
 * the new engine before enabling it as the source of truth (Wave 8).
 *
 * Feature flags (both default to false — safe):
 *   ENABLE_UR_SHADOW_MODE=true  → enable parallel evaluation + mismatch logging
 *   USE_NEW_POLICY_ENGINE=true  → new engine becomes source of truth (Wave 8 only)
 *
 * Mismatch types:
 *   LEGACY_ALLOW_NEW_DENY  — Legacy says YES, New says NO.
 *                            Critical: fixing this avoids regressions at cutover.
 *   LEGACY_DENY_NEW_ALLOW  — Legacy says NO, New says YES.
 *                            Informational: new engine would grant more access.
 *
 * All mismatches are written to ur_audit_events (action = SHADOW_MISMATCH)
 * AND printed to stderr as structured JSON for easy log scraping.
 *
 * Shadow evaluation is ALWAYS fire-and-forget:
 *   • Errors in shadow mode NEVER propagate to the caller.
 *   • A slow DB NEVER delays the HTTP response.
 *   • The existing Legacy RBAC decision is NEVER changed.
 *
 * IMPORTANT — Wave 5 Status:
 *   USE_NEW_POLICY_ENGINE defaults to false and MUST NOT be enabled until
 *   Wave 8 (Final Cutover). Enabling it prematurely WILL break production.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const { AuditAction } = require('./ur-audit.logger');
const { resolveEffectivePermissions } = require('./permission-resolution.engine');
const { isAccEnforcePermissionsEnabled } = require('../acc-runtime/featureFlags');

const prisma = new PrismaClient();

// ─── Feature flag readers (read at call-time, not module load) ────────────────
// This ensures .env changes are respected without restart during development.

function isShadowModeEnabled() {
  return process.env.ENABLE_UR_SHADOW_MODE === 'true';
}

function isNewEngineEnabled() {
  return process.env.USE_NEW_POLICY_ENGINE === 'true';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the new engine in shadow mode and log any mismatch.
 * This function MUST be called fire-and-forget — never await it.
 *
 * @param {object}   req                - Express request (for context logging)
 * @param {string[]} resolvedPerms      - Canonical permission codes being checked
 * @param {boolean}  legacyDecision     - true = Legacy RBAC allowed, false = denied
 */
async function shadowEvaluate(req, resolvedPerms, legacyDecision) {
  if (!isShadowModeEnabled()) return;

  const userId = req?.user?.id;
  if (!userId) return;  // Cannot shadow-evaluate without a user ID

  let newDecision = false;

  try {
    const effective = await resolveEffectivePermissions(userId);
    // New engine ALLOWS if the user has ANY of the required permissions
    newDecision = resolvedPerms.some((p) => effective.effectiveCodes.includes(p));
  } catch (err) {
    // Resolution failure is non-fatal — log and exit
    _logShadowError('Resolution failed', { userId, resolvedPerms }, err);
    return;
  }

  // No mismatch — both agree
  if (legacyDecision === newDecision) return;

  // ── Mismatch detected ─────────────────────────────────────────────────────
  const mismatchType = legacyDecision
    ? 'LEGACY_ALLOW_NEW_DENY'
    : 'LEGACY_DENY_NEW_ALLOW';

  const context = _buildContext(req, resolvedPerms, legacyDecision, newDecision, mismatchType);

  // Log to stderr (structured JSON — easy to pipe to log aggregators)
  process.stderr.write(
    '[UR_SHADOW_MISMATCH] ' + JSON.stringify(context) + '\n'
  );

  // Persist to ur_audit_events (non-fatal if DB write fails)
  try {
    await prisma.urAuditEvent.create({
      data: {
        actorId:        userId,
        action:         AuditAction.SHADOW_MISMATCH,
        targetUserId:   userId,
        entityType:     'ShadowMode',
        newValue:       context,
      },
    });
  } catch (dbErr) {
    _logShadowError('DB write failed for mismatch', context, dbErr);
  }
}

/**
 * Read current feature flag state (used by validation scripts and health endpoints).
 *
 * @returns {{ shadowMode: boolean, newEngineEnabled: boolean }}
 */
function getFeatureFlagStatus() {
  return {
    shadowMode:       isShadowModeEnabled(),
    newEngineEnabled: isNewEngineEnabled(),
    accEnforcePermissions: isAccEnforcePermissionsEnabled(),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _buildContext(req, resolvedPerms, legacyDecision, newDecision, mismatchType) {
  const user = req?.user ?? {};
  return {
    mismatchType,
    userId:           user.id        ?? null,
    userRole:         user.role      ?? null,
    tenantId:         user.tenantId  ?? null,
    departmentId:     user.departmentId ?? null,
    permissionsChecked: resolvedPerms,
    legacyDecision,
    newDecision,
    route:            req?.originalUrl ?? null,
    method:           req?.method     ?? null,
    timestamp:        new Date().toISOString(),
  };
}

function _logShadowError(label, context, err) {
  process.stderr.write(
    `[UR_SHADOW_ERROR] ${label}: ${err?.message ?? err} | context: ${JSON.stringify(context)}\n`
  );
}

module.exports = { shadowEvaluate, getFeatureFlagStatus, isShadowModeEnabled, isNewEngineEnabled };
