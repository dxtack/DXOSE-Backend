'use strict';

/**
 * FY 01 P2 — Assignment lifecycle: deactivate, reactivate, delete (same row).
 */

const prisma = require('../config/database');
const { validateUuid } = require('../engines/assignment.validators');
const auditLogger = require('../engines/ur-audit.logger');
const { evaluateAssignmentOperationalHistory } = require('./assignment-operational-history.service');
const {
    ASSIGNMENT_INCLUDE,
    retireMembershipForAssignment,
    syncTenantMemberDepartmentFromAssignment,
} = require('./acc-assignment-membership-provision.service');
const {
    legacyTag,
    extractLegacyTag,
    tenantMemberIdFromLegacyNotes,
} = require('./acc-membership-assignment-sync.service');
const { countActiveSeats, assertSingletonRoleAvailable } = require('../utils/tenantMemberActive');
const { connectRole, normalizeRole } = require('./rbac.service');

const ORG_MANAGER_CODE = 'ORG_MANAGER';

function _departmentSnapshot(assignment) {
    if (!assignment.departments?.length) {
        return [{ id: null, name: 'All Departments' }];
    }
    return assignment.departments.map((d) => ({
        id:   d.departmentId,
        name: d.department?.name ?? d.departmentId,
    }));
}

function _lifecycleAuditContext(assignment, actorRoleCode) {
    const prop = assignment.properties?.[0]?.property ?? null;
    return {
        assignmentId: assignment.id,
        userId:         assignment.userId,
        userEmail:      assignment.user?.email ?? null,
        userName:       assignment.user
            ? `${assignment.user.firstName ?? ''} ${assignment.user.lastName ?? ''}`.trim()
            : null,
        roleId:         assignment.roleId,
        roleCode:       assignment.role?.code ?? null,
        roleName:       assignment.role?.name ?? null,
        propertyId:     prop?.id ?? null,
        propertyName:   prop?.name ?? (assignment.properties?.length === 0 ? 'All Properties' : null),
        departments:    _departmentSnapshot(assignment),
        actorRoleCode:  actorRoleCode ?? null,
    };
}

async function _loadAssignment(db, assignmentId) {
    const row = await db.urUserAssignment.findUnique({
        where: { id: assignmentId },
        include: ASSIGNMENT_INCLUDE,
    });
    if (!row) {
        throw Object.assign(new Error(`Assignment not found: ${assignmentId}`), { statusCode: 404 });
    }
    return row;
}

async function _assertNoDuplicateActiveAssignment(tx, assignment, propertyId) {
    const where = {
        userId: assignment.userId,
        roleId: assignment.roleId,
        isActive: true,
        id: { not: assignment.id },
    };
    if (propertyId) {
        where.properties = { some: { propertyId } };
    } else {
        where.properties = { none: {} };
    }
    const conflict = await tx.urUserAssignment.findFirst({ where, select: { id: true } });
    if (conflict) {
        throw Object.assign(
            new Error('An active assignment already exists for this user, role, and property.'),
            { statusCode: 409, code: 'DUPLICATE_ACTIVE_ASSIGNMENT' },
        );
    }
}

async function _resolvePropertyIdForAssignment(tx, assignment) {
    if (assignment.properties?.length === 1) {
        return assignment.properties[0].propertyId;
    }
    if (assignment.properties?.length === 0) {
        const memberId = tenantMemberIdFromLegacyNotes(assignment.notes);
        if (memberId) {
            const member = await tx.tenantMember.findUnique({
                where: { id: memberId },
                select: { tenantId: true },
            });
            if (member?.tenantId) return member.tenantId;
        }
        const roleCode = normalizeRole(assignment.role?.code);
        if (roleCode === ORG_MANAGER_CODE) {
            const orgMember = await tx.tenantMember.findFirst({
                where: {
                    userId: assignment.userId,
                    tenant: { parentId: null },
                },
                select: { tenantId: true },
                orderBy: { updatedAt: 'desc' },
            });
            return orgMember?.tenantId ?? null;
        }
    }
    return null;
}

async function reactivateMembershipForAssignment(tx, assignment) {
    const full = await _loadAssignment(tx, assignment.id);
    if (full.isActive) {
        return full;
    }

    const roleCode = normalizeRole(full.role.code);
    const propertyId = await _resolvePropertyIdForAssignment(tx, full);
    const deptIds = full.departments.map((d) => d.departmentId);
    const primaryDept = deptIds[0] ?? null;

    if (!propertyId && roleCode !== 'SUPER_ADMIN') {
        throw Object.assign(
            new Error('Cannot reactivate assignment without a linked property.'),
            { statusCode: 400, code: 'PROPERTY_REQUIRED_FOR_REACTIVATE' },
        );
    }

    await _assertNoDuplicateActiveAssignment(tx, full, propertyId);

    if (propertyId) {
        const tenant = await tx.tenant.findUnique({
            where: { id: propertyId },
            select: { id: true, maxUsers: true, isActive: true },
        });
        if (!tenant?.isActive) {
            throw Object.assign(new Error('Property not found or inactive.'), { statusCode: 400 });
        }

        const existingMembership = await tx.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId: propertyId, userId: full.userId } },
            select: { id: true, isActive: true },
        });
        if (!existingMembership?.isActive) {
            const activeMembersCount = await countActiveSeats(tx, propertyId);
            if (activeMembersCount >= tenant.maxUsers) {
                throw Object.assign(
                    new Error('Maximum user limit reached for this hotel.'),
                    { statusCode: 400, code: 'SEAT_LIMIT_REACHED' },
                );
            }
        }

        await assertSingletonRoleAvailable(tx, {
            tenantId: propertyId,
            role: roleCode,
            excludeUserId: full.userId,
        });

        const departmentOnCreate = primaryDept
            ? { department: { connect: { id: primaryDept } } }
            : {};
        const departmentOnUpdate = primaryDept
            ? { department: { connect: { id: primaryDept } }, canViewAllDepartments: false }
            : { department: { disconnect: true }, canViewAllDepartments: true };

        await tx.tenantMember.upsert({
            where: { tenantId_userId: { tenantId: propertyId, userId: full.userId } },
            create: {
                tenant: { connect: { id: propertyId } },
                user: { connect: { id: full.userId } },
                role: connectRole(roleCode),
                isActive: true,
                ...departmentOnCreate,
            },
            update: {
                role: connectRole(roleCode),
                isActive: true,
                ...departmentOnUpdate,
            },
        });

        const member = await tx.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId: propertyId, userId: full.userId } },
            select: { id: true },
        });

        const notesTag = extractLegacyTag(full.notes) || (member ? legacyTag(member.id) : full.notes);
        await tx.urUserAssignment.update({
            where: { id: full.id },
            data: { isActive: true, notes: notesTag },
        });
    } else {
        await tx.urUserAssignment.update({
            where: { id: full.id },
            data: { isActive: true },
        });
    }

    const reactivated = await _loadAssignment(tx, full.id);
    let permissionVersionAlreadyBumped = false;
    if (propertyId) {
        const syncResult = await syncTenantMemberDepartmentFromAssignment(tx, reactivated);
        permissionVersionAlreadyBumped = syncResult?.synced === true;
    }

    if (!permissionVersionAlreadyBumped) {
        await tx.user.update({
            where: { id: full.userId },
            data: { permissionVersion: { increment: 1 } },
        });
    }

    return _loadAssignment(tx, full.id);
}

/**
 * Deactivate assignment and linked TenantMember (same assignment row).
 * Membership is only retired when no sibling active assignment remains for that
 * property/seat. User.isActive is never flipped here.
 */
async function deactivateAssignmentWithMembership(actorId, assignmentId, options = {}) {
    validateUuid(actorId, 'actorId');
    validateUuid(assignmentId, 'assignmentId');

    const before = await _loadAssignment(prisma, assignmentId);
    if (!before.isActive) {
        return before;
    }

    // SF-007 — audit write participates in the same transaction as the state mutation,
    // so a committed deactivation can never exist without its audit record.
    return prisma.$transaction(async (tx) => {
        await retireMembershipForAssignment(tx, before);
        await tx.urUserAssignment.update({
            where: { id: assignmentId },
            data: { isActive: false },
        });
        await auditLogger.logAssignmentDeactivated(actorId, {
            ..._lifecycleAuditContext(before, options.actorRoleCode),
            isActive: false,
        }, tx);
        return _loadAssignment(tx, assignmentId);
    });
}

/**
 * Reactivate assignment on the same row and re-provision membership.
 */
async function reactivateAssignmentWithMembership(actorId, assignmentId, options = {}) {
    validateUuid(actorId, 'actorId');
    validateUuid(assignmentId, 'assignmentId');

    const before = await _loadAssignment(prisma, assignmentId);
    if (before.isActive) {
        return before;
    }

    // SF-007 — reactivation audit write is atomic with the state mutation.
    return prisma.$transaction(async (tx) => {
        const updated = await reactivateMembershipForAssignment(tx, before);
        await auditLogger.logAssignmentReactivated(actorId, {
            ..._lifecycleAuditContext(updated, options.actorRoleCode),
        }, tx);
        return updated;
    });
}

/**
 * Hard-delete assignment when no operational history exists.
 */
async function deleteAssignmentWithGovernance(actorId, assignmentId, options = {}) {
    validateUuid(actorId, 'actorId');
    validateUuid(assignmentId, 'assignmentId');

    const before = await _loadAssignment(prisma, assignmentId);
    const history = await evaluateAssignmentOperationalHistory(before);

    if (history.hasHistory) {
        throw Object.assign(
            new Error(
                'This assignment has operational history and cannot be deleted. Deactivate the assignment instead.',
            ),
            {
                statusCode: 409,
                code: 'ASSIGNMENT_HAS_HISTORY',
                history,
            },
        );
    }

    // SF-007 — deletion audit write is atomic with the row delete. The audit row must be
    // written BEFORE the assignment delete within the same tx to satisfy the FK (targetEntityId
    // references the assignment) only if enforced; order here writes audit first, then deletes.
    await prisma.$transaction(async (tx) => {
        await auditLogger.logAssignmentDeleted(actorId, {
            ..._lifecycleAuditContext(before, options.actorRoleCode),
        }, tx);
        if (before.isActive) {
            await retireMembershipForAssignment(tx, before);
        }
        await tx.urUserAssignment.delete({ where: { id: assignmentId } });
    });

    return { deleted: true, assignmentId };
}

module.exports = {
    deactivateAssignmentWithMembership,
    reactivateAssignmentWithMembership,
    deleteAssignmentWithGovernance,
    evaluateAssignmentOperationalHistory,
};
