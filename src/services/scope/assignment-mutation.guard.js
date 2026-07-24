'use strict';

const prisma = require('../../config/database');
const { normalizeRole } = require('../rbac.service');
const { createScopeError } = require('../../utils/scopeError');

/**
 * Active urUserAssignment rows covering the requested property (tenant).
 * @param {string} userId
 * @param {string} tenantId
 */
async function loadActiveAssignmentsForProperty(userId, tenantId) {
    if (!userId || !tenantId) return [];
    const assignments = await prisma.urUserAssignment.findMany({
        where: { userId, isActive: true },
        include: { properties: { select: { propertyId: true } } },
    });
    return assignments.filter(
        (a) => a.properties.length === 0 || a.properties.some((p) => p.propertyId === tenantId),
    );
}

/**
 * Phase 1 — mutations require active ACC assignment for current property.
 * No role bypass (ORG_MANAGER / FINANCE must have assignment).
 * SUPER_ADMIN platform operations exempt.
 */
async function assertActiveAssignmentForMutation(user, tenantId, action = 'mutate') {
    if (!user?.id || !tenantId) {
        throw createScopeError('Authentication and tenant context required.', 403);
    }
    const role = normalizeRole(user.role);
    if (role === 'SUPER_ADMIN') return true;

    const relevant = await loadActiveAssignmentsForProperty(user.id, tenantId);
    if (!relevant.length) {
        throw createScopeError(
            `Action "${action}" denied: no active assignment for this property.`,
            403,
        );
    }
    return true;
}

async function hasActiveAssignmentForProperty(user, tenantId) {
    if (!user?.id || !tenantId) return false;
    if (normalizeRole(user.role) === 'SUPER_ADMIN') return true;
    const relevant = await loadActiveAssignmentsForProperty(user.id, tenantId);
    return relevant.length > 0;
}

module.exports = {
    loadActiveAssignmentsForProperty,
    assertActiveAssignmentForMutation,
    hasActiveAssignmentForProperty,
};
