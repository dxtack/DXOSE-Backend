'use strict';

/**
 * Scope Context Service — Wave 7 (Security Layer)
 *
 * Resolves a user's effective property scope and department scope
 * from their active UrUserAssignment records.
 *
 * Rule: "No rows = All" (per approved Wave 3 architecture)
 *   - Assignment with no UrAssignmentProperty rows → covers ALL properties
 *   - Assignment with no UrAssignmentDepartment rows → covers ALL departments
 *
 * Resolution logic (union across all active assignments):
 *   - If ANY assignment covers all properties (no property rows) → user is unrestricted
 *   - Only if ALL assignments have specific properties → restrict to union
 *   - Same rule applies for departments
 *
 * Returns:
 *   { propertyIds: string[] | null, departmentIds: string[] | null }
 *
 *   null  = no restriction (user sees all)
 *   [...] = user restricted to this set of IDs
 *
 * This service is READ-ONLY. It never changes authorization decisions.
 * It only computes WHAT DATA the user is allowed to see.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Build a ScopeContext from a userId.
 * @param {string} userId
 * @returns {Promise<ScopeContext>}
 */
async function resolveUserScope(userId) {
    if (!userId) {
        return _unrestrictedContext('no userId provided');
    }

    let assignments;
    try {
        assignments = await prisma.urUserAssignment.findMany({
            where:   { userId, isActive: true },
            include: {
                properties:  { select: { propertyId: true } },
                departments: { select: { departmentId: true } },
            },
        });
    } catch (err) {
        console.error('[scope-context] Failed to resolve scope for user:', userId, err.message);
        return _unrestrictedContext('db error — fail open');
    }

    if (assignments.length === 0) {
        // User has no new-model assignments → fall through to legacy RBAC only.
        // Scope: unrestricted (legacy already controls access).
        return _unrestrictedContext('no active assignments');
    }

    // ── Property scope resolution ──────────────────────────────────────────
    let propertyUnrestricted = false;
    const propertyIds = new Set();

    for (const assignment of assignments) {
        if (assignment.properties.length === 0) {
            // This assignment covers ALL properties → user is unrestricted
            propertyUnrestricted = true;
            break;
        }
        assignment.properties.forEach((p) => propertyIds.add(p.propertyId));
    }

    // ── Department scope resolution ────────────────────────────────────────
    let departmentUnrestricted = false;
    const departmentIds = new Set();

    for (const assignment of assignments) {
        if (assignment.departments.length === 0) {
            // This assignment covers ALL departments → user is unrestricted
            departmentUnrestricted = true;
            break;
        }
        assignment.departments.forEach((d) => departmentIds.add(d.departmentId));
    }

    const context = {
        userId,
        propertyIds:   propertyUnrestricted ? null : [...propertyIds],
        departmentIds: departmentUnrestricted ? null : [...departmentIds],
        resolvedAt:    new Date().toISOString(),
        assignmentCount: assignments.length,
    };

    _logContext(context);
    return context;
}

/**
 * Returns an unrestricted context (legacy passthrough).
 * @param {string} reason — logged to debug output only
 */
function _unrestrictedContext(reason) {
    return {
        userId:          null,
        propertyIds:     null,
        departmentIds:   null,
        resolvedAt:      new Date().toISOString(),
        assignmentCount: 0,
        _reason:         reason,
    };
}

function _logContext(context) {
    const propSummary  = context.propertyIds   === null ? 'ALL' : context.propertyIds.length;
    const deptSummary  = context.departmentIds === null ? 'ALL' : context.departmentIds.length;
    console.debug(
        `[scope-context] user=${context.userId} | props=${propSummary} | depts=${deptSummary} | assignments=${context.assignmentCount}`,
    );
}

/**
 * Returns true if the context is fully unrestricted (no scope enforcement needed).
 */
function isUnrestricted(context) {
    return context.propertyIds === null && context.departmentIds === null;
}

/**
 * Build a scope context manually (for testing / validation scripts).
 */
function buildManualContext({ userId, propertyIds, departmentIds }) {
    return {
        userId,
        propertyIds:   propertyIds   ?? null,
        departmentIds: departmentIds ?? null,
        resolvedAt:    new Date().toISOString(),
        assignmentCount: 'manual',
    };
}

module.exports = { resolveUserScope, isUnrestricted, buildManualContext };
