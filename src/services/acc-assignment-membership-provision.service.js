'use strict';

/**
 * NOTE 05 — Provision TenantMember when ACC creates/updates runtime access.
 * Runtime truth: TenantMember drives session + property switcher (Option C).
 * 1 Assignment = 1 Property = 1 Membership (Option B).
 */

const { countActiveSeats, assertSingletonRoleAvailable } = require('../utils/tenantMemberActive');
const { connectRole, normalizeRole } = require('./rbac.service');
const { syncMembershipToAssignment, legacyTag, tenantMemberIdFromLegacyNotes } = require('./acc-membership-assignment-sync.service');
const auditLogger = require('../engines/ur-audit.logger');

const ASSIGNMENT_INCLUDE = {
    role: { select: { id: true, code: true, name: true } },
    user: { select: { id: true, email: true, firstName: true, lastName: true } },
    properties: {
        select: {
            id: true,
            propertyId: true,
            property: { select: { id: true, name: true, slug: true } },
        },
    },
    departments: {
        select: {
            id: true,
            departmentId: true,
            department: { select: { id: true, name: true, code: true } },
        },
    },
};

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

/**
 * Upsert TenantMember for one property and sync linked assignment (legacy tag).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.roleCode
 * @param {string} params.propertyId — branch or org-root tenant id
 * @param {string|null} [params.departmentId]
 * @param {string|null} [params.notes] — optional ACC notes (stored on assignment after sync)
 */
async function provisionMembershipForProperty(tx, {
    userId,
    roleCode,
    propertyId,
    departmentId = null,
    notes = null,
}) {
    const rc = normalizeRole(roleCode);
    if (!propertyId) {
        throw Object.assign(new Error('propertyId is required for membership provisioning.'), {
            statusCode: 400,
            code: 'PROPERTY_ID_REQUIRED',
        });
    }

    const tenant = await tx.tenant.findUnique({
        where: { id: propertyId },
        select: { id: true, maxUsers: true, isActive: true },
    });
    if (!tenant || !tenant.isActive) {
        throw Object.assign(new Error('Property not found or inactive.'), { statusCode: 400 });
    }

    const existingMembership = await tx.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId: propertyId, userId } },
        select: { isActive: true },
    });
    const willConsumeNewSeat = !existingMembership || !existingMembership.isActive;
    if (willConsumeNewSeat) {
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
        role: rc,
        excludeUserId: userId,
    });

    const departmentOnCreate = departmentId
        ? { department: { connect: { id: departmentId } } }
        : {};
    const departmentOnUpdate = departmentId
        ? { department: { connect: { id: departmentId } } }
        : { department: { disconnect: true } };

    await tx.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: propertyId, userId } },
        create: {
            tenant: { connect: { id: propertyId } },
            user: { connect: { id: userId } },
            role: connectRole(rc),
            isActive: true,
            ...departmentOnCreate,
        },
        update: {
            role: connectRole(rc),
            isActive: true,
            ...departmentOnUpdate,
        },
    });

    const membership = await tx.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId: propertyId, userId } },
        include: {
            role: true,
            user: { select: { id: true } },
            department: { select: { id: true } },
        },
    });

    const syncResult = await syncMembershipToAssignment(tx, membership);
    const assignmentId = syncResult.assignmentId;

    if (notes && assignmentId) {
        await tx.urUserAssignment.update({
            where: { id: assignmentId },
            data: { notes },
        });
    }

    await tx.user.update({
        where: { id: userId },
        data: { permissionVersion: { increment: 1 } },
    });

    return _loadAssignment(tx, assignmentId);
}

/**
 * True when another active assignment still needs this property/membership seat.
 * Prevents deactivating one role from locking the user out of sibling roles.
 */
async function _findSiblingActiveAssignment(tx, { userId, excludeAssignmentId, propertyId, memberId }) {
    const orConditions = [];
    if (memberId) {
        orConditions.push({ notes: { startsWith: `legacy:${memberId}` } });
    }
    if (propertyId) {
        orConditions.push({ properties: { some: { propertyId } } });
    }
    if (orConditions.length === 0) return null;

    return tx.urUserAssignment.findFirst({
        where: {
            userId,
            isActive: true,
            id: { not: excludeAssignmentId },
            OR: orConditions,
        },
        include: {
            role: { select: { id: true, code: true } },
            departments: { select: { departmentId: true } },
        },
        orderBy: { createdAt: 'asc' },
    });
}

/**
 * Deactivate TenantMember linked to an assignment (legacy tag or property match).
 *
 * Does NOT retire the membership when the user still has another active assignment
 * on the same property / membership. Never flips User.isActive — account disable
 * is a separate admin action (or only when every assignment is inactive, callers
 * may choose to deactivate the user separately).
 */
async function retireMembershipForAssignment(tx, assignment) {
    let memberId = null;
    let propertyId = null;

    memberId = tenantMemberIdFromLegacyNotes(assignment.notes);
    if (memberId) {
        const tagged = await tx.tenantMember.findUnique({
            where: { id: memberId },
            select: { id: true, tenantId: true, userId: true },
        });
        if (!tagged || tagged.userId !== assignment.userId) {
            memberId = null;
        } else {
            propertyId = tagged.tenantId ?? null;
        }
    }

    if (!memberId && assignment.properties?.length === 1) {
        propertyId = assignment.properties[0].propertyId;
        const member = await tx.tenantMember.findUnique({
            where: {
                tenantId_userId: {
                    tenantId: propertyId,
                    userId: assignment.userId,
                },
            },
            select: { id: true },
        });
        memberId = member?.id ?? null;
    }

    if (memberId && assignment.userId) {
        const sibling = await _findSiblingActiveAssignment(tx, {
            userId: assignment.userId,
            excludeAssignmentId: assignment.id,
            propertyId,
            memberId,
        });

        if (sibling) {
            // Keep the seat; realign membership role to the remaining active assignment.
            const siblingRoleCode = normalizeRole(sibling.role?.code);
            const primaryDept = sibling.departments?.[0]?.departmentId ?? null;
            const departmentUpdate = primaryDept
                ? { department: { connect: { id: primaryDept } }, canViewAllDepartments: false }
                : { department: { disconnect: true }, canViewAllDepartments: true };

            await tx.tenantMember.update({
                where: { id: memberId },
                data: {
                    isActive: true,
                    role: connectRole(siblingRoleCode),
                    ...departmentUpdate,
                },
            });
        } else {
            await tx.tenantMember.updateMany({
                where: { id: memberId, userId: assignment.userId },
                data: { isActive: false },
            });
        }
    }

    if (assignment.userId) {
        await tx.user.update({
            where: { id: assignment.userId },
            data: { permissionVersion: { increment: 1 } },
        });
    }
}

async function addDepartmentsToAssignment(tx, actorId, assignmentId, departmentIds) {
    if (!departmentIds?.length) return;
    for (const departmentId of departmentIds) {
        await tx.urAssignmentDepartment.upsert({
            where: {
                assignmentId_departmentId: { assignmentId, departmentId },
            },
            create: { assignmentId, departmentId },
            update: {},
        });
    }
}

/**
 * Keep TenantMember.departmentId aligned with assignment department junction (NOTE 05).
 * Only applies when assignment has exactly one property and an active membership exists.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} assignment — includes userId, properties[], departments[]
 */
async function syncTenantMemberDepartmentFromAssignment(tx, assignment) {
    if (!assignment?.userId || assignment.properties?.length !== 1) {
        return { synced: false, reason: 'not-single-property' };
    }

    const propertyId = assignment.properties[0].propertyId;
    const deptIds = (assignment.departments ?? []).map((d) => d.departmentId ?? d.id);

    const member = await tx.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId: propertyId, userId: assignment.userId } },
        select: { id: true, isActive: true },
    });
    if (!member?.isActive) {
        return { synced: false, reason: 'no-active-membership' };
    }

    if (deptIds.length === 0) {
        await tx.tenantMember.update({
            where: { id: member.id },
            data: {
                canViewAllDepartments: true,
                department: { disconnect: true },
            },
        });
    } else {
        await tx.tenantMember.update({
            where: { id: member.id },
            data: {
                canViewAllDepartments: false,
                department: { connect: { id: deptIds[0] } },
            },
        });
    }

    await tx.user.update({
        where: { id: assignment.userId },
        data: { permissionVersion: { increment: 1 } },
    });

    return { synced: true, memberId: member.id, departmentId: deptIds[0] ?? null };
}

module.exports = {
    legacyTag,
    provisionMembershipForProperty,
    retireMembershipForAssignment,
    addDepartmentsToAssignment,
    syncTenantMemberDepartmentFromAssignment,
    ASSIGNMENT_INCLUDE,
};
