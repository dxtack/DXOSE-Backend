'use strict';

/**
 * FY 01 P2 — Operational history heuristic for assignment deletion governance.
 * Assignments are not referenced by operational documents; scope uses userId + property + time window.
 */

const prisma = require('../config/database');

const GOVERNANCE_AUDIT_ACTIONS = Object.freeze([
    'ASSIGNMENT_CREATED',
    'ASSIGNMENT_UPDATED',
    'ASSIGNMENT_DEACTIVATED',
    'ASSIGNMENT_REACTIVATED',
    'ASSIGNMENT_DELETED',
    'ASSIGNMENT_NOTES_UPDATED',
    'ASSIGNMENT_DEPARTMENTS_UPDATED',
    'SCOPE_PROPERTY_ADDED',
    'SCOPE_PROPERTY_REMOVED',
    'SCOPE_DEPARTMENT_ADDED',
    'SCOPE_DEPARTMENT_REMOVED',
    'OVERRIDE_GRANTED',
    'OVERRIDE_DENIED',
    'OVERRIDE_RESET',
]);

/**
 * @param {object} assignment — includes userId, createdAt, properties[]
 * @returns {Promise<{ hasHistory: boolean, total: number, breakdown: Record<string, number> }>}
 */
async function evaluateAssignmentOperationalHistory(assignment) {
    const userId = assignment.userId;
    const since = assignment.createdAt ?? new Date(0);
    const propertyIds = (assignment.properties ?? []).map((p) => p.propertyId ?? p.id).filter(Boolean);
    const tenantFilter = propertyIds.length > 0 ? { tenantId: { in: propertyIds } } : {};

    const userAtProperty = (fields) => ({
        createdAt: { gte: since },
        ...tenantFilter,
        OR: fields.map((field) => ({ [field]: userId })),
    });

    const [
        operationalUrAudit,
        auditLog,
        approvalSteps,
        approvalRequests,
        grn,
        transfers,
        movementDocs,
        getPasses,
        stockCounts,
        lostItems,
        ledger,
    ] = await Promise.all([
        prisma.urAuditEvent.count({
            where: {
                createdAt: { gte: since },
                targetUserId: userId,
                action: { notIn: [...GOVERNANCE_AUDIT_ACTIONS] },
            },
        }),
        propertyIds.length
            ? prisma.auditLog.count({
                where: {
                    changedBy: userId,
                    changedAt: { gte: since },
                    tenantId: { in: propertyIds },
                },
            })
            : Promise.resolve(0),
        prisma.approvalStep.count({
            where: {
                actedBy: userId,
                actedAt: { gte: since },
                ...(propertyIds.length ? { request: { tenantId: { in: propertyIds } } } : {}),
            },
        }),
        propertyIds.length
            ? prisma.approvalRequest.count({
                where: {
                    createdBy: userId,
                    createdAt: { gte: since },
                    tenantId: { in: propertyIds },
                },
            })
            : Promise.resolve(0),
        propertyIds.length
            ? prisma.grnImport.count({ where: userAtProperty(['importedBy', 'approvedBy', 'postedBy', 'rejectedBy', 'lastEditedBy']) })
            : Promise.resolve(0),
        propertyIds.length
            ? prisma.storeTransfer.count({ where: userAtProperty(['requestedBy', 'approvedBy', 'postedBy', 'receivedBy', 'rejectedBy']) })
            : Promise.resolve(0),
        propertyIds.length
            ? prisma.movementDocument.count({ where: userAtProperty(['createdBy']) })
            : Promise.resolve(0),
        propertyIds.length
            ? prisma.getPass.count({ where: userAtProperty(['createdBy', 'checkedOutBy', 'closedBy', 'deptApprovedBy', 'financeApprovedBy', 'gmApprovedBy', 'securityApprovedBy', 'receivedById']) })
            : Promise.resolve(0),
        propertyIds.length
            ? prisma.stockCountSession.count({ where: userAtProperty(['createdBy']) })
            : Promise.resolve(0),
        // Lost & Found register retired (Phase 3) — slot kept as 0 for breakdown shape
        Promise.resolve(0),
        propertyIds.length
            ? prisma.inventoryLedger.count({ where: userAtProperty(['createdBy']) })
            : Promise.resolve(0),
    ]);

    const breakdown = {
        operationalUrAudit,
        auditLog,
        approvalSteps,
        approvalRequests,
        grn,
        transfers,
        movementDocs,
        getPasses,
        stockCounts,
        lostItems,
        ledger,
    };

    const total = Object.values(breakdown).reduce((sum, n) => sum + n, 0);

    return {
        hasHistory: total > 0,
        total,
        breakdown,
    };
}

module.exports = {
    GOVERNANCE_AUDIT_ACTIONS,
    evaluateAssignmentOperationalHistory,
};
