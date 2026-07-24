'use strict';

/**
 * Scope Enforcement Middleware — Wave 7 (Security Layer)
 *
 * When ENABLE_SCOPE_ENFORCEMENT=true:
 *   - Resolves the authenticated user's scope from UrUserAssignment records.
 *   - Attaches req.scopedPrisma  — a scope-aware Prisma client.
 *   - Attaches req.scopeContext  — the resolved scope metadata.
 *
 * When ENABLE_SCOPE_ENFORCEMENT=false (DEFAULT):
 *   - req.scopedPrisma = null (no scope filtering)
 *   - req.scopeContext = null
 *   - Current behavior is COMPLETELY UNCHANGED.
 *
 * ── IMPORTANT ────────────────────────────────────────────────────────────────
 * This middleware is built and available, but NO existing route uses
 * req.scopedPrisma yet. Existing controllers continue using the global
 * `prisma` client directly. Route migration happens in Wave 8.
 *
 * ── AUTHORIZATION IS NOT CHANGED ─────────────────────────────────────────────
 * This middleware does NOT affect authorize.js or Legacy RBAC.
 * DENY/ALLOW decisions still come entirely from Legacy RBAC.
 * This middleware only decides WHICH DATA is visible, not WHETHER access is allowed.
 */

const { resolveUserScope, isUnrestricted } = require('../engines/scope-context.service');
const { createScopedPrisma } = require('../engines/scope-prisma.factory');

function isScopeEnforcementEnabled() {
    return process.env.ENABLE_SCOPE_ENFORCEMENT === 'true';
}

/**
 * Express middleware — attach scope context to the request.
 * Non-blocking: errors are caught and logged, never thrown to the caller.
 * If scope resolution fails, the request proceeds without scope (safe default).
 */
async function scopeEnforcementMiddleware(req, res, next) {
    // Always initialize to null — routes check for non-null before using.
    req.scopedPrisma = null;
    req.scopeContext = null;

    if (!isScopeEnforcementEnabled()) {
        return next();
    }

    // Only enforce scope for authenticated requests.
    const userId = req.user?.id;
    if (!userId) {
        return next();
    }

    try {
        const scopeContext = await resolveUserScope(userId);
        req.scopeContext = scopeContext;

        if (isUnrestricted(scopeContext)) {
            // User is unrestricted — scoped and base client are equivalent.
            // req.scopedPrisma stays null; routes that check for it should use base prisma.
            return next();
        }

        req.scopedPrisma = createScopedPrisma(scopeContext);

        console.debug(
            `[scope-enforcement] Applied scope for user=${userId}`,
            `| props=${scopeContext.propertyIds?.length ?? 'ALL'}`,
            `| depts=${scopeContext.departmentIds?.length ?? 'ALL'}`,
        );
    } catch (err) {
        // Fail open: if scope resolution errors, proceed without restriction.
        // This is safe because Legacy RBAC still controls authorization.
        console.error('[scope-enforcement] Scope resolution failed — proceeding without scope:', err.message);
    }

    return next();
}

/**
 * Helper for use INSIDE route handlers (Wave 8):
 * Returns req.scopedPrisma if available, or falls back to the global basePrisma.
 *
 * Usage in future migrated routes:
 *   const { PrismaClient } = require('@prisma/client');
 *   const basePrisma = new PrismaClient();
 *   const db = getScopedOrBase(req, basePrisma);
 *   const results = await db.movementDocument.findMany({ ... });
 */
function getScopedOrBase(req, basePrisma) {
    return req.scopedPrisma ?? basePrisma;
}

module.exports = {
    scopeEnforcementMiddleware,
    getScopedOrBase,
    isScopeEnforcementEnabled,
};
